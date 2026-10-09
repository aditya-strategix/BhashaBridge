const prisma = require('../prisma');
const { withDbRetry } = require('../prisma');
const crypto = require('crypto');
const generateMeetingCode = (orgAccessCode) => {
  const letters = 'abcdefghjkmnpqrstuvwxyz';
  const randLetters = (n) => Array.from({ length: n }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
  if (orgAccessCode) {
    return `${orgAccessCode.toLowerCase()}-${randLetters(3)}-${randLetters(3)}`;
  }
  return `bha-${randLetters(4)}-${randLetters(3)}`;
};

const AIService = require('../services/ai.service');
const { sendMeetingInvitation } = require('../services/email.service');

const { createClient } = require('redis');

let redisClient = null;
const initRedis = async () => {
  if (redisClient) return redisClient;
  if (!process.env.VALKEY_URL) return null;
  try {
    const client = createClient({ url: process.env.VALKEY_URL });
    client.on('error', (err) => console.log('Valkey Client Error:', err.message));
    await client.connect();
    redisClient = client;
    console.log('Connected to Valkey successfully!');
    return client;
  } catch (err) {
    console.error("Failed to connect to Valkey:", err.message);
    return null;
  }
};



const resolveMeetingEntity = async (link, includeOrg = true) => {
  const cleanLink = (link || '').trim();
  if (!cleanLink) return null;
  const include = includeOrg ? { organization: { include: { coHosts: true } } } : undefined;
  let meeting = await withDbRetry(p => p.meeting.findFirst({
    where: {
      OR: [
        { meetingLink: cleanLink },
        { meetingLink: { equals: cleanLink, mode: 'insensitive' } },
        { id: cleanLink }
      ]
    },
    include
  }));
  if (!meeting) {
    const org = await withDbRetry(p => p.organization.findFirst({
      where: {
        OR: [
          { accessCode: cleanLink },
          { accessCode: { equals: cleanLink, mode: 'insensitive' } }
        ]
      }
    }));
    if (org) {
      meeting = await withDbRetry(p => p.meeting.findFirst({
        where: { organizationId: org.id },
        orderBy: { createdAt: 'desc' },
        include
      }));
    }
  }
  return meeting;
};

exports.createMeeting = async (req, res) => {
  try {
    const { title, startTime, state, organizationId } = req.body;

    // Check if org belongs to user (only if organizationId is non-empty)
    let orgData = {};
    let orgAccessCode = null;
    if (organizationId && typeof organizationId === 'string' && organizationId.trim()) {
      const trimmedOrgId = organizationId.trim();
      const org = await withDbRetry(p => p.organization.findFirst({
        where: { id: trimmedOrgId, users: { some: { id: req.user.userId } } },
        include: { coHosts: true }
      }));
      if (!org) return res.status(403).json({ error: 'Not a member of this organization' });

      const isCoHost = org.coHosts.some(c => c.id === req.user.userId);
      if (org.ownerId !== req.user.userId && !isCoHost) {
        return res.status(403).json({ error: 'Only Organization Hosts and Co-Hosts can create organization meetings' });
      }

      orgData = { organizationId: org.id };
      orgAccessCode = org.accessCode;
    }

    // Generate unique meeting code
    let meetingLink = generateMeetingCode(orgAccessCode);
    let isUnique = false;
    let attempts = 0;
    while (!isUnique && attempts < 5) {
      attempts++;
      const existing = await withDbRetry(p => p.meeting.findUnique({ where: { meetingLink } }));
      if (!existing) {
        isUnique = true;
      } else {
        meetingLink = generateMeetingCode(orgAccessCode);
      }
    }

    let parsedStartTime = new Date();
    if (startTime) {
      parsedStartTime = new Date(startTime);
      if (isNaN(parsedStartTime.getTime())) {
        return res.status(400).json({ error: 'Invalid start time format' });
      }
    }

    const meeting = await withDbRetry(p => p.meeting.create({
      data: {
        title: title || 'Untitled Meeting',
        meetingLink,
        hostId: req.user.userId,
        startTime: parsedStartTime,
        state: state || 'ONGOING',
        ...orgData
      }
    }));

    if (global.io) {
      global.io.emit('dashboard:refresh');
      if (meeting && meeting.meetingLink) {
        global.io.to(meeting.meetingLink).emit('meeting:refresh');
      }
    }
    if (global.sseEmit) {
      global.sseEmit('dashboard:refresh');
    }

    res.status(201).json({ meeting });
  } catch (error) {
    console.error('createMeeting error:', error);
    res.status(500).json({ error: error.message || 'Server error' });
  }
};

exports.getSummary = async (req, res) => {
  try {
    const { link } = req.params;
    const cleanLink = (link || '').trim();
    let meeting = await prisma.meeting.findFirst({ where: { OR: [{ meetingLink: cleanLink }, { meetingLink: cleanLink.toLowerCase() }] } });
    if (!meeting) {
      const org = await prisma.organization.findFirst({ where: { OR: [{ accessCode: cleanLink }, { accessCode: cleanLink.toUpperCase() }] } });
      if (org) {
        meeting = await prisma.meeting.findFirst({
          where: { organizationId: org.id },
          orderBy: { createdAt: 'desc' }
        });
      }
    }

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.state === 'CANCELLED') return res.status(403).json({ error: 'This meeting was cancelled.' });
    if (meeting.state !== 'COMPLETED') return res.status(403).json({ error: 'This meeting is still ongoing. The summary will be available once the host ends the session.' });

    
      let isOrgAdmin = false;
      if (meeting.organizationId) {
        const org = await prisma.organization.findUnique({
          where: { id: meeting.organizationId },
          include: { coHosts: true }
        });
        if (org && (org.ownerId === req.user.userId || org.coHosts.some(c => c.id === req.user.userId))) {
          isOrgAdmin = true;
        }
      }

      const isHost = meeting.hostId === req.user.userId || isOrgAdmin;
      const participant = await prisma.participant.findUnique({
        where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } }
      });

      if (!isHost && !participant) {
      return res.status(403).json({ error: 'You are not authorized to view this summary' });
    }

    // Fetch transcript
    const captions = await prisma.caption.findMany({
      where: { meetingId: meeting.id },
      include: { speaker: { select: { name: true } } },
      orderBy: { timestamp: 'asc' }
    });

    if (captions.length === 0) {
      return res.json({ summary: "No transcript recorded for this meeting." });
    }

    // Combine transcript into plain text
      const transcriptText = captions.map(c => `[${new Date(c.timestamp).toLocaleTimeString()}] ${c.speaker.name}: ${c.originalText}`).join('\n');

      const targetLang = req.query.lang || req.user.language || req.user.preferredLanguage || 'en';
      
      // 1. Permanent Cache Check (PostgreSQL) for COMPLETED meetings
      if (meeting.state === 'COMPLETED' && meeting.summaryCache) {
        let cachedJson = {};
        try {
          cachedJson = typeof meeting.summaryCache === 'string' ? JSON.parse(meeting.summaryCache) : meeting.summaryCache;
        } catch(e) {}
        
        if (cachedJson && cachedJson[targetLang]) {
          console.log(`Served summary for meeting ${meeting.id} from PostgreSQL Permanent Cache!`);
          return res.json({ summary: cachedJson[targetLang] });
        }
      }

      // 2. TTL Cache Check (Valkey) for ONGOING meetings
      const cacheKey = `summary:${meeting.id}:${targetLang}`;
      const cache = await initRedis();

      if (cache && meeting.state !== 'COMPLETED') {
        const cachedSummary = await cache.get(cacheKey);
        if (cachedSummary) {
          console.log(`Served summary for meeting ${meeting.id} from Valkey TTL Cache!`);
          return res.json({ summary: cachedSummary });
        }
      }

      // Generate new summary via Gemini
      const summary = await AIService.summarizeTranscript(transcriptText, targetLang);

      // Save to appropriate Cache
      if (meeting.state === 'COMPLETED') {
        // Save to PostgreSQL permanently
        let cachedJson = {};
        if (meeting.summaryCache) {
          try { cachedJson = typeof meeting.summaryCache === 'string' ? JSON.parse(meeting.summaryCache) : meeting.summaryCache; } catch(e) {}
        }
        cachedJson[targetLang] = summary;
        await prisma.meeting.update({
          where: { id: meeting.id },
          data: { summaryCache: cachedJson }
        });
        console.log(`Saved summary to PostgreSQL Permanent Cache.`);
      } else if (cache) {
        // Save to Valkey with 5-minute TTL
        const ttl = 300;
        await cache.setEx(cacheKey, ttl, summary);
        console.log(`Saved summary to Valkey Cache with ${ttl}s TTL.`);
      }

      res.json({ summary });
  } catch (error) {
    console.error('Summary error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
};


exports.getMeetings = async (req, res) => {
  try {
    const userId = req.user.userId;
    const meetings = await withDbRetry(p => p.meeting.findMany({
      where: {
        NOT: {
          hiddenForUserIds: {
            has: userId
          }
        },
        OR: [
          // 1. Host sees all their meetings (SCHEDULED, ONGOING, COMPLETED, CANCELLED)
          { hostId: userId },

          // 2. Participants who were actually admitted see it (SCHEDULED, ONGOING, COMPLETED)
          { participants: { some: { userId: userId, status: 'ADMITTED' } } },

          // 3. Organization members ONLY see active meetings (SCHEDULED or ONGOING).
          // Once a meeting ends, it is removed from upcoming and NOT placed in history
          // for users who never attended!
          {
            organization: { users: { some: { id: userId } } },
            state: { in: ['SCHEDULED', 'ONGOING'] }
          }
        ]
      },
      include: { 
        host: { select: { name: true } },
        participants: { 
          include: { 
            user: { select: { name: true, email: true } },
            sessions: true
          } 
        },
        analytics: true,
        reports: true
      },
      orderBy: { createdAt: 'desc' }
    }));
    res.json({ meetings });
  } catch (error) {
    console.error('getMeetings error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.joinMeeting = async (req, res) => {
  try {
    const { link } = req.params;
    const cleanLink = (link || '').trim();

    let meeting = await withDbRetry(p => p.meeting.findFirst({
      where: {
        OR: [
          { meetingLink: cleanLink },
          { meetingLink: { equals: cleanLink, mode: 'insensitive' } },
          { id: cleanLink }
        ]
      }
    }));
    
    // Fallback: If not found, check if this is an organization access code
    if (!meeting) {
      const org = await withDbRetry(p => p.organization.findFirst({
        where: {
          OR: [
            { accessCode: cleanLink },
            { accessCode: { equals: cleanLink, mode: 'insensitive' } }
          ]
        }
      }));
      if (org) {
        meeting = await withDbRetry(p => p.meeting.findFirst({
          where: { organizationId: org.id, state: { in: ['ONGOING', 'SCHEDULED'] } },
          orderBy: { createdAt: 'desc' }
        }));
      }
    }

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.state === 'COMPLETED') return res.status(403).json({ error: 'This meeting has already ended.' });
    if (meeting.state === 'CANCELLED') return res.status(403).json({ error: 'This meeting has been cancelled.' });

    let isOrgCoHost = false;
    let isOrgAdmin = false;
    if (meeting.organizationId) {
      const org = await withDbRetry(p => p.organization.findFirst({
        where: { id: meeting.organizationId, users: { some: { id: req.user.userId } } },
        include: { coHosts: { select: { id: true } } }
      }));
      if (!org) return res.status(403).json({ error: 'You are not a member of this organization.' });
      if (org.coHosts.some(c => c.id === req.user.userId) || org.ownerId === req.user.userId) {
        isOrgCoHost = true;
        isOrgAdmin = true;
      }
    }

    const isHost = meeting.hostId === req.user.userId || isOrgAdmin;

    // If SCHEDULED and host or org admin is joining, flip to ONGOING
    if (isHost && meeting.state === 'SCHEDULED') {
      await withDbRetry(p => p.meeting.update({
        where: { id: meeting.id },
        data: { state: 'ONGOING', startTime: new Date() }
      }));
      meeting.state = 'ONGOING';
      meeting.startTime = new Date();
      if (global.io) {
        global.io.emit('dashboard:refresh');
        if (meeting.meetingLink) global.io.to(meeting.meetingLink).emit('meeting:refresh');
      }
      if (global.sseEmit) global.sseEmit('dashboard:refresh');
    }

    let participant = await withDbRetry(p => p.participant.findUnique({
      where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } }
    }));

    const isCoHost = isOrgCoHost || (participant && participant.role === 'COHOST');
    
    // Default: if you are host or cohost, you bypass waiting room.
    let finalStatus;
    if (!participant) {
      finalStatus = (isHost || isCoHost) ? 'ADMITTED' : 'WAITING';
      participant = await withDbRetry(p => p.participant.create({
        data: {
          userId: req.user.userId,
          meetingId: meeting.id,
          role: isHost ? 'HOST' : (isOrgCoHost ? 'COHOST' : 'PARTICIPANT'),
          status: finalStatus
        }
      }));
    } else {
      // If Host or CoHost, bypass lobby with ADMITTED.
      // If participant was already ADMITTED by host, preserve ADMITTED for reconnects.
      // If participant previously LEFT or was WAITING/REJECTED, they MUST be placed in WAITING room!
      finalStatus = (isHost || isCoHost) ? 'ADMITTED' : (participant.status === 'ADMITTED' ? 'ADMITTED' : 'WAITING');
      const updatedRole = isHost ? 'HOST' : (isOrgCoHost ? 'COHOST' : participant.role);
      participant = await withDbRetry(p => p.participant.update({
        where: { id: participant.id },
        data: { joinTime: new Date(), status: finalStatus, role: updatedRole }
      }));
    }

    let waitingUsers = [];
    if (participant.status === 'ADMITTED' && (participant.role === 'HOST' || participant.role === 'COHOST')) {
      const waitingDb = await withDbRetry(p => p.participant.findMany({
        where: { meetingId: meeting.id, status: 'WAITING' },
        include: { user: { select: { id: true, name: true, avatar: true } } }
      }));

      const connectedWaitingUserIds = new Set();
      if (global.io) {
        try {
          const socketsInLink = await global.io.in(meeting.meetingLink).fetchSockets();
          const socketsInId = await global.io.in(meeting.id).fetchSockets();
          const socketsInClean = (cleanLink && cleanLink !== meeting.meetingLink) ? await global.io.in(cleanLink).fetchSockets() : [];
          const allSockets = [...socketsInLink, ...socketsInId, ...socketsInClean];
          for (const s of allSockets) {
            if (s.isWaiting && s.userId) {
              connectedWaitingUserIds.add(s.userId);
            }
          }
        } catch (e) {
          console.warn('Error fetching waiting sockets:', e.message);
        }
      }

      const activeWaiting = [];
      for (const p of waitingDb) {
        if (!connectedWaitingUserIds.has(p.userId)) {
          // Prune ghost waiting record from DB
          await withDbRetry(db => db.participant.update({
            where: { id: p.id },
            data: { status: 'LEFT', leaveTime: new Date() }
          })).catch(() => {});
        } else {
          activeWaiting.push({ userId: p.user.id, name: p.user.name, avatar: p.user.avatar });
        }
      }
      waitingUsers = activeWaiting;
    }
    res.json({ meeting, participantStatus: participant.status, participantRole: participant.role, waitingUsers });
  } catch (error) {
    console.error('joinMeeting error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.endMeeting = async (req, res) => {
  try {
    const { link } = req.params;
    const cleanLink = (link || '').trim();

    let meeting = await withDbRetry(p => p.meeting.findFirst({
      where: {
        OR: [
          { meetingLink: cleanLink },
          { meetingLink: { equals: cleanLink, mode: 'insensitive' } },
          { id: cleanLink }
        ]
      }
    }));
    
    // Fallback: Check if link is an organization access code
    if (!meeting) {
      const org = await withDbRetry(p => p.organization.findFirst({
        where: {
          OR: [
            { accessCode: cleanLink },
            { accessCode: { equals: cleanLink, mode: 'insensitive' } }
          ]
        }
      }));
      if (org) {
        meeting = await withDbRetry(p => p.meeting.findFirst({
          where: { organizationId: org.id, state: { in: ['ONGOING', 'SCHEDULED'] } },
          orderBy: { createdAt: 'desc' }
        }));
      }
    }

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    
    let isOrgAdmin = false;
    if (meeting.organizationId) {
      const org = await withDbRetry(p => p.organization.findUnique({
        where: { id: meeting.organizationId },
        include: { coHosts: true }
      }));
      if (org && (org.ownerId === req.user.userId || org.coHosts.some(c => c.id === req.user.userId))) {
        isOrgAdmin = true;
      }
    }

    const participant = await withDbRetry(p => p.participant.findUnique({
      where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } }
    }));
    const isMeetingCoHost = participant && (participant.role === 'HOST' || participant.role === 'COHOST');

    if (meeting.hostId !== req.user.userId && !isOrgAdmin && !isMeetingCoHost) {
      return res.status(403).json({ error: 'Only the host or org admins/co-hosts can end the meeting' });
    }

    const updated = await withDbRetry(p => p.meeting.update({
      where: { id: meeting.id },
      data: { 
        state: 'COMPLETED',
        endTime: new Date(),
        startTime: meeting.startTime || meeting.createdAt
      }
    }));

    if (global.io) {
      if (meeting.meetingLink) global.io.to(meeting.meetingLink).emit('meeting:ended');
      if (cleanLink && cleanLink !== meeting.meetingLink) global.io.to(cleanLink).emit('meeting:ended');
      if (meeting.id) global.io.to(meeting.id).emit('meeting:ended');
      global.io.emit('dashboard:refresh');
      if (meeting.meetingLink) global.io.to(meeting.meetingLink).emit('meeting:refresh');
    }
    if (global.sseEmit) {
      global.sseEmit('dashboard:refresh');
    }

    res.json({ meeting: updated });
  } catch (error) {
    console.error('endMeeting error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.leaveWaitingRoom = async (req, res) => {
  try {
    const { link } = req.params;
    const cleanLink = (link || '').trim();

    let meeting = await withDbRetry(p => p.meeting.findFirst({
      where: {
        OR: [
          { meetingLink: cleanLink },
          { meetingLink: { equals: cleanLink, mode: 'insensitive' } },
          { id: cleanLink }
        ]
      }
    }));

    if (!meeting) {
      const org = await withDbRetry(p => p.organization.findFirst({
        where: {
          OR: [
            { accessCode: cleanLink },
            { accessCode: { equals: cleanLink, mode: 'insensitive' } }
          ]
        }
      }));
      if (org) {
        meeting = await withDbRetry(p => p.meeting.findFirst({
          where: { organizationId: org.id, state: { in: ['ONGOING', 'SCHEDULED'] } },
          orderBy: { createdAt: 'desc' }
        }));
      }
    }

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    // Mark participant as LEFT
    await withDbRetry(p => p.participant.updateMany({
      where: {
        userId: req.user.userId,
        meetingId: meeting.id,
        status: 'WAITING'
      },
      data: { status: 'LEFT', leaveTime: new Date() }
    }));

    if (global.io) {
      const payload = { userId: req.user.userId };
      if (meeting.meetingLink) {
        global.io.to(meeting.meetingLink).emit('waiting:left', payload);
        global.io.to(meeting.meetingLink).emit('meeting:refresh');
      }
      if (cleanLink && cleanLink !== meeting.meetingLink) {
        global.io.to(cleanLink).emit('waiting:left', payload);
        global.io.to(cleanLink).emit('meeting:refresh');
      }
      if (meeting.id) {
        global.io.to(meeting.id).emit('waiting:left', payload);
        global.io.to(meeting.id).emit('meeting:refresh');
      }
      global.io.emit('dashboard:refresh');
    }
    if (global.sseEmit) global.sseEmit('dashboard:refresh');

    res.json({ success: true, message: 'Left waiting room' });
  } catch (error) {
    console.error('leaveWaitingRoom error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteMeeting = async (req, res) => {
    try {
      const { id } = req.params;
      const meeting = await withDbRetry(p => p.meeting.findUnique({
        where: { id },
        include: { organization: { include: { coHosts: true } } }
      }));
      
      if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

      let isOrgAdmin = false;
      if (meeting.organization) {
        if (meeting.organization.ownerId === req.user.userId || meeting.organization.coHosts.some(c => c.id === req.user.userId)) {
          isOrgAdmin = true;
        }
      }
      const isHost = meeting.hostId === req.user.userId || isOrgAdmin;

      const updateData = {
        hiddenForUserIds: {
          push: req.user.userId
        }
      };

      // If host deletes a SCHEDULED meeting, mark it CANCELLED
      if (isHost && meeting.state === 'SCHEDULED') {
        updateData.state = 'CANCELLED';
      }

      await withDbRetry(p => p.meeting.update({
        where: { id },
        data: updateData
      }));

      if (global.io) {
        global.io.emit('dashboard:refresh');
        if (meeting.meetingLink) {
          global.io.to(meeting.meetingLink).emit('meeting:ended');
          global.io.to(meeting.meetingLink).emit('meeting:refresh');
        }
        if (meeting.id) {
          global.io.to(meeting.id).emit('meeting:ended');
          global.io.to(meeting.id).emit('meeting:refresh');
        }
      }
      if (global.sseEmit) global.sseEmit('dashboard:refresh');

      res.json({ message: isHost && meeting.state === 'SCHEDULED' ? 'Scheduled meeting cancelled' : 'Meeting removed from your history' });
    } catch (error) {
      console.error('deleteMeeting error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  };

exports.admitParticipant = async (req, res) => {
  try {
    const { link } = req.params;
    const { userId } = req.body;
    const cleanLink = (link || '').trim();
    let meeting = await withDbRetry(p => p.meeting.findFirst({
      where: {
        OR: [
          { meetingLink: cleanLink },
          { meetingLink: { equals: cleanLink, mode: 'insensitive' } },
          { id: cleanLink }
        ]
      },
      include: { organization: { include: { coHosts: true } } }
    }));
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    let isOrgAdmin = false;
    if (meeting.organization) {
      if (meeting.organization.ownerId === req.user.userId || meeting.organization.coHosts.some(c => c.id === req.user.userId)) {
        isOrgAdmin = true;
      }
    }

    const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } } });
    const isHost = meeting.hostId === req.user.userId || isOrgAdmin || (caller && caller.role === 'HOST');
    const isCoHost = caller && caller.role === 'COHOST';

    if (!isHost && !isCoHost) {
      return res.status(403).json({ error: 'Not authorized to admit participants' });
    }

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { status: 'ADMITTED' }
    });

    if (global.io) {
      global.io.to(`user_${userId}`).emit('waiting:admitted', { userId });
      global.io.to(meeting.id).emit('meeting:refresh');
      global.io.emit('dashboard:refresh');
    }
    if (global.sseEmit) global.sseEmit('dashboard:refresh');

    res.json({ participant });
  } catch (error) {
    console.error('admitParticipant error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.rejectParticipant = async (req, res) => {
  try {
    const { link } = req.params;
    const { userId } = req.body;
    const cleanLink = (link || '').trim();
    let meeting = await withDbRetry(p => p.meeting.findFirst({
      where: {
        OR: [
          { meetingLink: cleanLink },
          { meetingLink: { equals: cleanLink, mode: 'insensitive' } },
          { id: cleanLink }
        ]
      },
      include: { organization: { include: { coHosts: true } } }
    }));
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    
    let isOrgAdmin = false;
    if (meeting.organization) {
      if (meeting.organization.ownerId === req.user.userId || meeting.organization.coHosts.some(c => c.id === req.user.userId)) {
        isOrgAdmin = true;
      }
    }

    const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } } });
    const isHost = meeting.hostId === req.user.userId || isOrgAdmin || (caller && caller.role === 'HOST');
    const isCoHost = caller && caller.role === 'COHOST';

    if (!isHost && !isCoHost) return res.status(403).json({ error: 'Not authorized' });

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { status: 'REJECTED' }
    });

    if (global.io) {
      global.io.to(`user_${userId}`).emit('waiting:rejected', { userId });
      global.io.to(meeting.id).emit('meeting:refresh');
      global.io.emit('dashboard:refresh');
    }
    if (global.sseEmit) global.sseEmit('dashboard:refresh');

    res.json({ participant });
  } catch (error) {
    console.error('rejectParticipant error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.assignCoHost = async (req, res) => {
  try {
    const { link } = req.params;
    const { userId } = req.body;
    const meeting = await resolveMeetingEntity(link, true);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    let isOrgAdmin = false;
    if (meeting.organization) {
      if (meeting.organization.ownerId === req.user.userId || meeting.organization.coHosts.some(c => c.id === req.user.userId)) {
        isOrgAdmin = true;
      }
    }

    if (meeting.hostId !== req.user.userId && !isOrgAdmin) {
      return res.status(403).json({ error: 'Only main Host or Org Admins can assign Co-hosts' });
    }

    const participant = await withDbRetry(p => p.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { role: 'COHOST' }
    }));
    
    // Live meeting update via Socket.IO
    if (global.io) {
      const payload = { userId, role: 'COHOST' };
      global.io.to(meeting.id).emit('participant:promoted', payload);
      if (meeting.meetingLink) global.io.to(meeting.meetingLink).emit('participant:promoted', payload);
      global.io.to(meeting.id).emit('meeting:refresh');
      global.io.emit('dashboard:refresh');
    }
    // Dashboard update via SSE
    if (global.sseEmit) global.sseEmit('dashboard:refresh');

    res.json({ participant });
  } catch (error) {
    console.error('assignCoHost error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeCoHost = async (req, res) => {
  try {
    const { link, userId } = req.params;
    const meeting = await resolveMeetingEntity(link, true);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    let isOrgAdmin = false;
    if (meeting.organization) {
      if (meeting.organization.ownerId === req.user.userId || meeting.organization.coHosts.some(c => c.id === req.user.userId)) {
        isOrgAdmin = true;
      }
    }

    if (meeting.hostId !== req.user.userId && !isOrgAdmin) {
      return res.status(403).json({ error: 'Only main Host or Org Admins can remove Co-hosts' });
    }

    // Check if the user is a permanent org co-host
    const isPermanent = meeting.organization && meeting.organization.coHosts.some(c => c.id === userId);
    if (isPermanent) {
      return res.status(403).json({ error: 'Cannot demote a permanent Organization Co-Host.' });
    }

    const participant = await withDbRetry(p => p.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { role: 'PARTICIPANT' }
    }));
    
    // Live meeting update via Socket.IO
    if (global.io) {
      const payload = { userId, role: 'PARTICIPANT' };
      global.io.to(meeting.id).emit('participant:promoted', payload);
      if (meeting.meetingLink) global.io.to(meeting.meetingLink).emit('participant:promoted', payload);
      global.io.to(meeting.id).emit('meeting:refresh');
      global.io.emit('dashboard:refresh');
    }
    // Dashboard update via SSE
    if (global.sseEmit) global.sseEmit('dashboard:refresh');

    res.json({ participant });
  } catch (error) {
    console.error('removeCoHost error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getTranscript = async (req, res) => {
  try {
    const { link } = req.params;
    const meeting = await resolveMeetingEntity(link, true);

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.state === 'CANCELLED') return res.status(403).json({ error: 'This meeting was cancelled.' });
    if (meeting.state !== 'COMPLETED') return res.status(403).json({ error: 'This meeting is still ongoing. The transcript will be available once the host ends the session.' });

    let isOrgAdmin = false;
    if (meeting.organizationId) {
      const org = meeting.organization || await withDbRetry(p => p.organization.findUnique({
        where: { id: meeting.organizationId },
        include: { coHosts: true }
      }));
      if (org && (org.ownerId === req.user.userId || org.coHosts.some(c => c.id === req.user.userId))) {
        isOrgAdmin = true;
      }
    }

    const isHost = meeting.hostId === req.user.userId || isOrgAdmin;
    const participant = await withDbRetry(p => p.participant.findUnique({
      where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } }
    }));

    if (!isHost && !participant) {
      return res.status(403).json({ error: 'You are not authorized to view this transcript' });
    }

    const captions = await withDbRetry(p => p.caption.findMany({
      where: { meetingId: meeting.id },
      include: {
        speaker: { select: { name: true, email: true } }
      },
      orderBy: { timestamp: 'asc' }
    }));

    res.json({ transcript: captions });
  } catch (error) {
    console.error('Transcript error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeParticipant = async (req, res) => {
  try {
    const { link, userId } = req.params;
    const meeting = await resolveMeetingEntity(link, true);
    
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    let isOrgAdmin = false;
    if (meeting.organization) {
      if (meeting.organization.ownerId === req.user.userId || meeting.organization.coHosts.some(c => c.id === req.user.userId)) {
        isOrgAdmin = true;
      }
    }

    const requesterParticipant = await withDbRetry(p => p.participant.findFirst({
      where: { meetingId: meeting.id, userId: req.user.userId }
    }));

    const isMainHost = meeting.hostId === req.user.userId || isOrgAdmin;
    const isHost = isMainHost || (requesterParticipant && requesterParticipant.role === 'HOST');
    const isCoHost = requesterParticipant && requesterParticipant.role === 'COHOST';

    if (!isHost && !isCoHost) {
      return res.status(403).json({ error: 'Not authorized to remove participants' });
    }

    const targetParticipant = await withDbRetry(p => p.participant.findFirst({
      where: { meetingId: meeting.id, userId: userId }
    }));

    if (!targetParticipant) return res.status(404).json({ error: 'Participant not found' });

    // Cannot remove the meeting host
    if (targetParticipant.userId === meeting.hostId) {
      return res.status(403).json({ error: 'Cannot remove the meeting host' });
    }

    // Co-host can only remove participants
    if (!isHost && isCoHost && targetParticipant.role !== 'PARTICIPANT') {
      return res.status(403).json({ error: 'Co-hosts can only remove Participants' });
    }

    await withDbRetry(p => p.participant.update({
      where: { id: targetParticipant.id },
      data: { status: 'REJECTED' }
    }));

    // Live meeting update via Socket.IO
    if (global.io) {
      global.io.to(meeting.id).emit('participant:removed', { userId });
      if (meeting.meetingLink) global.io.to(meeting.meetingLink).emit('participant:removed', { userId });
      global.io.to(`user_${userId}`).emit('participant:removed', { userId });
      global.io.to(`user:${userId}`).emit('participant:removed', { userId });
      global.io.to(meeting.id).emit('meeting:refresh');
      global.io.emit('dashboard:refresh');
    }
    // Dashboard update via SSE
    if (global.sseEmit) global.sseEmit('dashboard:refresh');

    res.json({ message: 'Participant removed' });
  } catch (error) {
    console.error('removeParticipant error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getParticipants = async (req, res) => {
  try {
    const { link } = req.params;
    const meeting = await resolveMeetingEntity(link, false);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const participants = await withDbRetry(p => p.participant.findMany({
      where: { meetingId: meeting.id, status: 'ADMITTED' },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    }));

    const mapped = participants.map(p => ({
      userId: p.userId,
      role: p.role,
      name: p.user?.name || 'User',
      avatar: p.user?.avatar
    }));

    res.json(mapped);
  } catch (error) {
    console.error('getParticipants error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.sendEmailInvite = async (req, res) => {
  try {
    const { link } = req.params;
    const { email, emails } = req.body;
    
    // Support single email or array / comma-separated string
    let recipientList = [];
    if (Array.isArray(emails)) {
      recipientList = emails;
    } else if (typeof emails === 'string') {
      recipientList = emails.split(',').map(e => e.trim()).filter(Boolean);
    } else if (typeof email === 'string') {
      recipientList = email.split(',').map(e => e.trim()).filter(Boolean);
    }

    if (recipientList.length === 0) {
      return res.status(400).json({ error: 'Please provide at least one valid recipient email address' });
    }

    // Email regex validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = recipientList.filter(e => !emailRegex.test(e));
    if (invalidEmails.length > 0) {
      return res.status(400).json({ error: `Invalid email address format: ${invalidEmails.join(', ')}` });
    }

    const meeting = await resolveMeetingEntity(link, true);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (meeting.state === 'COMPLETED' || meeting.state === 'CANCELLED') {
      return res.status(400).json({ error: 'Cannot send invites for meetings that have already ended or been cancelled' });
    }

    let isOrgAdmin = false;
    if (meeting.organization) {
      if (meeting.organization.ownerId === req.user.userId || meeting.organization.coHosts.some(c => c.id === req.user.userId)) {
        isOrgAdmin = true;
      }
    }

    const caller = await withDbRetry(p => p.participant.findUnique({
      where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } }
    }));

    const isHost = meeting.hostId === req.user.userId || isOrgAdmin || (caller && caller.role === 'HOST');
    const isCoHost = caller && caller.role === 'COHOST';

    if (!isHost && !isCoHost) {
      return res.status(403).json({ error: 'Only the meeting host or co-hosts can send email invitations' });
    }

    const hostUser = await withDbRetry(p => p.user.findUnique({
      where: { id: req.user.userId },
      select: { name: true, email: true }
    }));
    const hostName = hostUser?.name || 'A BhashaBridge User';

    const frontendBaseUrl = process.env.FRONTEND_URL || (req.headers.origin || 'http://localhost:3000');
    const joinUrl = `${frontendBaseUrl}/meeting/${meeting.meetingLink}`;

    const results = await Promise.all(
      recipientList.map(recipientEmail =>
        sendMeetingInvitation({
          recipientEmail,
          meetingTitle: meeting.title,
          hostName,
          meetingLink: meeting.meetingLink,
          scheduledTime: meeting.startTime,
          joinUrl
        })
      )
    );

    const sentCount = results.filter(r => r.success).length;
    res.json({
      success: true,
      message: `Invitation email sent to ${sentCount} recipient(s)`,
      count: sentCount
    });
  } catch (error) {
    console.error('sendEmailInvite error:', error);
    res.status(500).json({ error: 'Failed to send invitation email' });
  }
};
