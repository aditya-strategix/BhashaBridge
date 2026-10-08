const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
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



exports.createMeeting = async (req, res) => {
  try {
    const { title, startTime, state, organizationId } = req.body;
    let meetingLink = generateMeetingCode();
    

    // Check if org belongs to user
    let orgData = {};
    if (organizationId) {
      const org = await prisma.organization.findFirst({
        where: { id: organizationId, users: { some: { id: req.user.userId } } },
        include: { coHosts: true }
      });
      if (!org) return res.status(403).json({ error: 'Not a member of this organization' });
      
      const isCoHost = org.coHosts.some(c => c.id === req.user.userId);
      if (org.ownerId !== req.user.userId && !isCoHost) {
        return res.status(403).json({ error: 'Only Organization Hosts and Co-Hosts can create organization meetings' });
      }

      orgData = { organizationId };
      if (org.accessCode) {
        meetingLink = generateMeetingCode(org.accessCode);
      }
    }


    let parsedStartTime = new Date();
    if (startTime) {
      parsedStartTime = new Date(startTime);
      if (isNaN(parsedStartTime.getTime())) {
        return res.status(400).json({ error: 'Invalid start time format' });
      }
    }

    const meeting = await prisma.meeting.create({
      data: {
        title,
        meetingLink,
        hostId: req.user.userId,
        startTime: parsedStartTime,
        state: state || 'ONGOING',
        ...orgData
      }
    });

    if (global.io) global.io.emit('dashboard:refresh'); if(typeof meeting !== 'undefined' && meeting && meeting.meetingLink) global.io.to(meeting.meetingLink).emit('meeting:refresh'); if(global.sseEmit) global.sseEmit('dashboard:refresh');
    res.status(201).json({ meeting });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
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
    const meetings = await prisma.meeting.findMany({
      where: {
          NOT: {
            hiddenForUserIds: {
              has: req.user.userId
            }
          },
          OR: [
            { hostId: req.user.userId },
            { participants: { some: { userId: req.user.userId } } },
            { organization: { users: { some: { id: req.user.userId } } } }
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
    });
    res.json({ meetings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.joinMeeting = async (req, res) => {
  try {
    const { link } = req.params;
    let meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    
    // Fallback: If not found, check if this is an organization access code
    if (!meeting) {
      const org = await prisma.organization.findUnique({ where: { accessCode: link } });
      if (org) {
        meeting = await prisma.meeting.findFirst({
          where: { organizationId: org.id, state: { in: ['ONGOING', 'SCHEDULED'] } },
          orderBy: { createdAt: 'desc' }
        });
      }
    }

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.state === 'COMPLETED') return res.status(403).json({ error: 'This meeting has already ended.' });
    if (meeting.state === 'CANCELLED') return res.status(403).json({ error: 'This meeting has been cancelled.' });

    let isOrgCoHost = false;
    let isOrgAdmin = false;
    if (meeting.organizationId) {
      const org = await prisma.organization.findFirst({
        where: { id: meeting.organizationId, users: { some: { id: req.user.userId } } },
        include: { coHosts: { select: { id: true } } }
      });
      if (!org) return res.status(403).json({ error: 'You are not a member of this organization.' });
      if (org.coHosts.some(c => c.id === req.user.userId) || org.ownerId === req.user.userId) {
        isOrgCoHost = true;
        isOrgAdmin = true;
      }
    }

    const isHost = meeting.hostId === req.user.userId || isOrgAdmin;

    // If SCHEDULED and host or org admin is joining, flip to ONGOING
    if (isHost && meeting.state === 'SCHEDULED') {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { state: 'ONGOING', startTime: new Date() }
      });
      meeting.state = 'ONGOING';
      meeting.startTime = new Date();
      if (global.io) {
        global.io.emit('dashboard:refresh');
        if (meeting.meetingLink) global.io.to(meeting.meetingLink).emit('meeting:refresh');
      }
      if (global.sseEmit) global.sseEmit('dashboard:refresh');
    }

    let participant = await prisma.participant.findUnique({
      where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } }
    });

    const isCoHost = isOrgCoHost || (participant && participant.role === 'COHOST');
    
    // Default: if you are host or cohost, you bypass waiting room.
    let finalStatus;
      if (!participant) {
        finalStatus = (isHost || isCoHost) ? 'ADMITTED' : 'WAITING';
        participant = await prisma.participant.create({
          data: {
            userId: req.user.userId,
            meetingId: meeting.id,
            role: isHost ? 'HOST' : (isOrgCoHost ? 'COHOST' : 'PARTICIPANT'),
            status: finalStatus
          }
        });
      } else {
        // If they already exist, keep their status unless they were upgraded to Host/CoHost
        finalStatus = (isHost || isCoHost) ? 'ADMITTED' : participant.status;
        const updatedRole = isHost ? 'HOST' : (isOrgCoHost ? 'COHOST' : participant.role);
        participant = await prisma.participant.update({
          where: { id: participant.id },
          data: { joinTime: new Date(), status: finalStatus, role: updatedRole }
        });
      }

    let waitingUsers = [];
      if (participant.status === 'ADMITTED' && (participant.role === 'HOST' || participant.role === 'COHOST')) {
        const waitingDb = await prisma.participant.findMany({
          where: { meetingId: meeting.id, status: 'WAITING' },
          include: { user: { select: { id: true, name: true, avatar: true } } }
        });
        waitingUsers = waitingDb.map(p => ({ userId: p.user.id, name: p.user.name, avatar: p.user.avatar }));
      }
      res.json({ meeting, participantStatus: participant.status, participantRole: participant.role, waitingUsers });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.endMeeting = async (req, res) => {
  try {
    const { link } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    
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

      if (meeting.hostId !== req.user.userId && !isOrgAdmin) {
        return res.status(403).json({ error: 'Only the host or org admins can end the meeting' });
      }


    const updated = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { 
        state: 'COMPLETED',
        endTime: new Date(),
        startTime: meeting.startTime || meeting.createdAt
      }
    });

    if (global.io) global.io.to(link).emit('meeting:ended');
      if (global.io) global.io.emit('dashboard:refresh'); if(typeof meeting !== 'undefined' && meeting && meeting.meetingLink) global.io.to(meeting.meetingLink).emit('meeting:refresh'); if(global.sseEmit) global.sseEmit('dashboard:refresh');
      res.json({ meeting: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};
exports.deleteMeeting = async (req, res) => {
    try {
      const { id } = req.params;
      const meeting = await prisma.meeting.findUnique({
        where: { id },
        include: { organization: { include: { coHosts: true } } }
      });
      
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

      await prisma.meeting.update({
        where: { id },
        data: updateData
      });

      if (global.io) {
        global.io.emit('dashboard:refresh');
        if (meeting.meetingLink) {
          global.io.to(meeting.meetingLink).emit('meeting:ended');
          global.io.to(meeting.meetingLink).emit('meeting:refresh');
        }
      }
      if (global.sseEmit) global.sseEmit('dashboard:refresh');

      res.json({ message: isHost && meeting.state === 'SCHEDULED' ? 'Scheduled meeting cancelled' : 'Meeting removed from your history' });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Server error' });
    }
  };

exports.admitParticipant = async (req, res) => {
  try {
    const { link } = req.params;
    const { userId } = req.body;
    const meeting = await prisma.meeting.findUnique({
      where: { meetingLink: link },
      include: { organization: { include: { coHosts: true } } }
    });
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
      global.io.to(link).emit('waiting:admitted', { userId });
      global.io.to(`user_`).emit('waiting:admitted', { userId });
      global.io.to(link).emit('meeting:refresh');
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
    const meeting = await prisma.meeting.findUnique({
      where: { meetingLink: link },
      include: { organization: { include: { coHosts: true } } }
    });
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
      global.io.to(link).emit('waiting:rejected', { userId });
      global.io.to(`user_`).emit('waiting:rejected', { userId });
      global.io.to(link).emit('meeting:refresh');
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
    const meeting = await prisma.meeting.findUnique({ 
      where: { meetingLink: link },
      include: { organization: { include: { coHosts: true } } }
    });
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

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { role: 'COHOST' }
    });
    
    // Live meeting update via Socket.IO
    if (global.io) {
      global.io.to(link).emit('participant:promoted', { userId, role: 'COHOST' });
      global.io.to(link).emit('meeting:refresh');
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
    const meeting = await prisma.meeting.findUnique({ 
      where: { meetingLink: link },
      include: { organization: { include: { coHosts: true } } }
    });
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

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { role: 'PARTICIPANT' }
    });
    
    // Live meeting update via Socket.IO
    if (global.io) {
      global.io.to(link).emit('participant:promoted', { userId, role: 'PARTICIPANT' });
      global.io.to(link).emit('meeting:refresh');
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
    let meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    
    // Check if it's an org access code
    if (!meeting) {
      const org = await prisma.organization.findUnique({ where: { accessCode: link } });
      if (org) {
        meeting = await prisma.meeting.findFirst({
          where: { organizationId: org.id },
          orderBy: { createdAt: 'desc' }
        });
      }
    }

    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.state === 'CANCELLED') return res.status(403).json({ error: 'This meeting was cancelled.' });
    if (meeting.state !== 'COMPLETED') return res.status(403).json({ error: 'This meeting is still ongoing. The transcript will be available once the host ends the session.' });

    
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
      return res.status(403).json({ error: 'You are not authorized to view this transcript' });
    }

    const captions = await prisma.caption.findMany({
      where: { meetingId: meeting.id },
      include: {
        speaker: { select: { name: true, email: true } }
      },
      orderBy: { timestamp: 'asc' }
    });

    res.json({ transcript: captions });
  } catch (error) {
    console.error('Transcript error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};






exports.removeParticipant = async (req, res) => {
  try {
    const { link, userId } = req.params;
    const meeting = await prisma.meeting.findUnique({
      where: { meetingLink: link },
      include: { organization: { include: { coHosts: true } } }
    });
    
    if (!meeting) return res.status(404).json({error: 'Meeting not found'});

    let isOrgAdmin = false;
    if (meeting.organization) {
      if (meeting.organization.ownerId === req.user.userId || meeting.organization.coHosts.some(c => c.id === req.user.userId)) {
        isOrgAdmin = true;
      }
    }

    const requesterParticipant = await prisma.participant.findFirst({
      where: { meetingId: meeting.id, userId: req.user.userId }
    });

    const isMainHost = meeting.hostId === req.user.userId || isOrgAdmin;
    const isHost = isMainHost || (requesterParticipant && requesterParticipant.role === 'HOST');
    const isCoHost = requesterParticipant && requesterParticipant.role === 'COHOST';

    if (!isHost && !isCoHost) {
      return res.status(403).json({ error: 'Not authorized to remove participants' });
    }

    const targetParticipant = await prisma.participant.findFirst({
      where: { meetingId: meeting.id, userId: userId }
    });

    if (!targetParticipant) return res.status(404).json({ error: 'Participant not found' });

    // Cannot remove the meeting host
    if (targetParticipant.userId === meeting.hostId) {
      return res.status(403).json({ error: 'Cannot remove the meeting host' });
    }

    // Co-host can only remove participants
    if (!isHost && isCoHost && targetParticipant.role !== 'PARTICIPANT') {
      return res.status(403).json({ error: 'Co-hosts can only remove Participants' });
    }

    await prisma.participant.update({
      where: { id: targetParticipant.id },
      data: { status: 'REJECTED' }
    });

    // Live meeting update via Socket.IO
    if (global.io) {
      global.io.to(meeting.meetingLink).emit('participant:removed', { userId });
      global.io.to(meeting.meetingLink).emit('meeting:refresh');
      global.io.emit('dashboard:refresh');
    }
    // Dashboard update via SSE
    if (global.sseEmit) global.sseEmit('dashboard:refresh');

    res.json({ message: 'Participant removed' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getParticipants = async (req, res) => {
  try {
    const { link } = req.params;
    const meeting = await prisma.meeting.findUnique({
      where: { meetingLink: link }
    });
    if (!meeting) return res.status(404).json({error: 'Meeting not found'});

    const participants = await prisma.participant.findMany({
      where: { meetingId: meeting.id, status: 'ADMITTED' },
      include: { user: { select: { id: true, name: true, avatar: true } } }
    });

    const mapped = participants.map(p => ({
      userId: p.userId,
      role: p.role,
      name: p.user.name,
      avatar: p.user.avatar
    }));

    res.json(mapped);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};
