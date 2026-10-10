const { Server } = require('socket.io');
const translate = require('google-translate-api-x');
const prisma = require('../prisma');
const { withDbRetry } = require('../prisma');

function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: '*', // For development
      methods: ['GET', 'POST'],
    },
    // Standard Heartbeat mechanism to detect client disconnects promptly
    pingInterval: 10000, // Ping every 10 seconds
    pingTimeout: 5000,   // Disconnect if no pong within 5 seconds
  });

  async function resolveMeeting(identifier) {
    if (!identifier) return null;
    const clean = String(identifier).trim();
    let meeting = await withDbRetry(p => p.meeting.findFirst({
      where: {
        OR: [
          { meetingLink: clean },
          { meetingLink: { equals: clean, mode: 'insensitive' } },
          { id: clean }
        ]
      },
      include: { organization: { include: { coHosts: true } } }
    }));
    if (!meeting) {
      const org = await withDbRetry(p => p.organization.findFirst({
        where: {
          OR: [
            { accessCode: clean },
            { accessCode: { equals: clean, mode: 'insensitive' } },
            { id: clean }
          ]
        }
      }));
      if (org) {
        meeting = await withDbRetry(p => p.meeting.findFirst({
          where: { organizationId: org.id, state: { in: ['ONGOING', 'SCHEDULED'] } },
          include: { organization: { include: { coHosts: true } } },
          orderBy: { createdAt: 'desc' }
        }));
      }
    }
    return meeting;
  }

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Allow users to join their personal notification room
    socket.on('user:register', ({ userId }) => {
      if (userId) {
        socket.join(`user:${userId}`);
        socket.join(`user_${userId}`);
        socket.userId = userId;
        console.log(`User ${userId} registered for notifications`);
      }
    });

    // Join meeting room
    socket.on('meeting:join', async ({ meetingId, userId, peerId, language }) => {
      try {
        const meeting = await resolveMeeting(meetingId);
        if (!meeting) return;
        if (meeting.state === 'COMPLETED' || meeting.state === 'CANCELLED') {
          socket.disconnect(true);
          return;
        }

        const participant = await withDbRetry(p => p.participant.findUnique({
          where: { userId_meetingId: { userId, meetingId: meeting.id } },
          include: { user: true }
        }));
        if (!participant) return;

        const cleanLink = (meetingId || '').trim();
        socket.userLanguage = language || 'en';
        socket.userId = userId;
        socket.userName = participant.user?.name;
        socket.meetingId = meeting.meetingLink;
        socket.dbMeetingId = meeting.id;
        socket.cleanLink = cleanLink;

        // Evict and disconnect any stale zombie sockets for this user in this meeting
        try {
          const socketsInRoom = await io.in(meeting.id).fetchSockets();
          for (const s of socketsInRoom) {
            if (s.userId === userId && s.id !== socket.id) {
              console.log(`[Socket] Evicting stale zombie socket ${s.id} for user ${userId} in meeting ${meeting.id}`);
              s.leave(meeting.id);
              s.leave(meeting.meetingLink);
              if (cleanLink) s.leave(cleanLink);
              socket.to(meeting.id).emit('participant:left', { socketId: s.id, userId });
              s.disconnect(true);
            }
          }
        } catch (evictErr) {
          console.warn('[Socket] Stale socket eviction warning:', evictErr.message);
        }

        socket.join(`user_${userId}`);
        socket.join(`user:${userId}`);
        socket.join(meeting.meetingLink);
        socket.join(meeting.id);
        if (cleanLink && cleanLink !== meeting.meetingLink && cleanLink !== meeting.id) {
          socket.join(cleanLink);
        }

        if (participant.status === 'WAITING') {
          socket.isWaiting = true;
          // Tell hosts someone is waiting (strictly emit once to meeting.id)
          const waitPayload = { userId, name: participant.user?.name || 'User', avatar: participant.user?.avatar };
          io.to(meeting.id).emit('waiting:request', waitPayload);
        } else if (participant.status === 'ADMITTED') {
          socket.isWaiting = false;
          const effectiveRole = participant.userId === meeting.hostId ? 'HOST' : (participant.role === 'HOST' ? 'COHOST' : participant.role);
          const joinedPayload = { 
            userId, 
            peerId, 
            socketId: socket.id,
            name: participant.user?.name,
            role: effectiveRole,
            avatar: participant.user?.avatar 
          };
          socket.to(meeting.id).emit('participant:joined', joinedPayload);
          console.log(`User ${userId} joined meeting ${meeting.meetingLink}`);
          
          // If a host/co-host joins, send them the list of anyone currently waiting in the lobby
          if (participant.role === 'HOST' || participant.role === 'COHOST') {
            const waitingUsers = await withDbRetry(p => p.participant.findMany({
              where: { meetingId: meeting.id, status: 'WAITING' },
              include: { user: true }
            }));
            const socketsInId = await io.in(meeting.id).fetchSockets();
            const connectedWaitingUserIds = new Set(
              socketsInId.filter(s => s.isWaiting && s.userId).map(s => s.userId)
            );

            for (const w of waitingUsers) {
              if (connectedWaitingUserIds.has(w.userId)) {
                socket.emit('waiting:request', { userId: w.userId, name: w.user?.name || 'User', avatar: w.user?.avatar });
              } else {
                console.log('Pruning offline waiting user from lobby:', w.userId);
                await withDbRetry(p => p.participant.update({
                  where: { id: w.id },
                  data: { status: 'LEFT', leaveTime: new Date() }
                })).catch(() => {});
              }
            }
          }
          
          const session = await prisma.participantSession.create({
            data: { participantId: participant.id }
          });
          socket.sessionId = session.id;
        }
      } catch (err) {
        console.error('Socket join error', err);
      }
    });

    socket.on('meeting:admit', async ({ meetingId, targetUserId }) => {
      try {
        const meeting = await resolveMeeting(meetingId);
        if (!meeting) return;
        const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: socket.userId, meetingId: meeting.id } } });
        const isHost = meeting.hostId === socket.userId || (caller && caller.role === 'HOST');
        const isCoHost = caller && caller.role === 'COHOST';
        
        if (isHost || isCoHost) {
          await prisma.participant.update({
            where: { userId_meetingId: { userId: targetUserId, meetingId: meeting.id } },
            data: { status: 'ADMITTED' }
          });
          io.to(`user_${targetUserId}`).emit('waiting:admitted', { userId: targetUserId });
          io.to(meeting.id).emit('meeting:refresh');
          io.emit('dashboard:refresh');
          if (global.sseEmit) global.sseEmit('dashboard:refresh');
        }
      } catch (err) {
        console.error('Socket admit error', err);
      }
    });

    socket.on('meeting:reject', async ({ meetingId, targetUserId }) => {
      try {
        const meeting = await resolveMeeting(meetingId);
        if (!meeting) return;
        const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: socket.userId, meetingId: meeting.id } } });
        const isHost = meeting.hostId === socket.userId || (caller && caller.role === 'HOST');
        const isCoHost = caller && caller.role === 'COHOST';
        
        if (isHost || isCoHost) {
          await prisma.participant.update({
            where: { userId_meetingId: { userId: targetUserId, meetingId: meeting.id } },
            data: { status: 'REJECTED' }
          });
          io.to(`user_${targetUserId}`).emit('waiting:rejected', { userId: targetUserId });
          io.to(meeting.id).emit('meeting:refresh');
          io.emit('dashboard:refresh');
          if (global.sseEmit) global.sseEmit('dashboard:refresh');
        }
      } catch (err) {
        console.error('Socket reject error', err);
      }
    });

    socket.on('meeting:remove_participant', async ({ meetingId, targetUserId }) => {
      try {
        const meeting = await prisma.meeting.findUnique({ 
          where: { meetingLink: meetingId },
          include: { organization: { include: { coHosts: true } } }
        });
        if (!meeting) return;

        let isOrgAdmin = false;
        if (meeting.organization) {
          if (meeting.organization.ownerId === socket.userId || meeting.organization.coHosts.some(c => c.id === socket.userId)) {
            isOrgAdmin = true;
          }
        }

        const caller = await prisma.participant.findUnique({
          where: { userId_meetingId: { userId: socket.userId, meetingId: meeting.id } }
        });

        const isHost = meeting.hostId === socket.userId || isOrgAdmin || (caller && caller.role === 'HOST');
        const isCoHost = caller && caller.role === 'COHOST';

        if (!isHost && !isCoHost) return;

        const target = await prisma.participant.findUnique({
          where: { userId_meetingId: { userId: targetUserId, meetingId: meeting.id } }
        });

        if (!target) return;
        if (target.userId === meeting.hostId) return;
        if (!isHost && isCoHost && target.role !== 'PARTICIPANT') return;

        await prisma.participant.update({
          where: { id: target.id },
          data: { status: 'REJECTED' }
        });

        io.to(meetingId).emit('participant:removed', { userId: targetUserId });
        io.to(meetingId).emit('meeting:refresh');
        io.emit('dashboard:refresh');
        if (global.sseEmit) global.sseEmit('dashboard:refresh');
      } catch (err) {
        console.error('Socket remove participant error', err);
      }
    });

    socket.on('meeting:end', async ({ meetingId, endedBy }) => {
      try {
        const meeting = await resolveMeeting(meetingId);
        let finalEndedBy = endedBy;
        if (!finalEndedBy && socket.userId) {
          const u = await withDbRetry(p => p.user.findUnique({
            where: { id: socket.userId },
            select: { name: true }
          }));
          const isHost = meeting && meeting.hostId === socket.userId;
          finalEndedBy = {
            name: u?.name || socket.userName || (isHost ? 'Host' : 'Co-host'),
            role: isHost ? 'HOST' : 'COHOST',
            userId: socket.userId
          };
        }
        const payload = { endedBy: finalEndedBy };
        io.to(meetingId).emit('meeting:ended', payload);
        if (meeting?.meetingLink && meeting.meetingLink !== meetingId) {
          io.to(meeting.meetingLink).emit('meeting:ended', payload);
        }
        if (meeting?.id && meeting.id !== meetingId) {
          io.to(meeting.id).emit('meeting:ended', payload);
        }
        io.to(meetingId).emit('meeting:refresh');
        io.emit('dashboard:refresh');
        if (global.sseEmit) global.sseEmit('dashboard:refresh');
      } catch (err) {
        console.error('Socket meeting:end error', err);
      }
    });

    socket.on('waiting:leave', async ({ meetingId, userId }) => {
      try {
        const targetUserId = userId || socket.userId;
        let targetMeetingId = socket.dbMeetingId;
        if (!targetMeetingId && meetingId) {
          const m = await resolveMeeting(meetingId);
          if (m) targetMeetingId = m.id;
        }
        if (targetUserId && targetMeetingId) {
          await withDbRetry(p => p.participant.updateMany({
            where: { userId: targetUserId, meetingId: targetMeetingId, status: 'WAITING' },
            data: { status: 'LEFT', leaveTime: new Date() }
          }));
        }
        socket.isWaiting = false;
        if (targetMeetingId) {
          socket.leave(targetMeetingId);
          if (socket.meetingId) socket.leave(socket.meetingId);
          if (socket.cleanLink) socket.leave(socket.cleanLink);
          io.to(targetMeetingId).emit('waiting:left', { userId: targetUserId });
          io.to(targetMeetingId).emit('meeting:refresh');
        }
        io.emit('dashboard:refresh');
        if (global.sseEmit) global.sseEmit('dashboard:refresh');
        socket.disconnect(true);
      } catch (err) {
        console.error('Socket waiting:leave error', err);
      }
    });

    // Handle chat messages
    socket.on('chat:message', async (data) => {
      const { meetingId, senderId, text, language } = data;
      
      // Emit original message to everyone immediately
      io.to(meetingId).emit('chat:message', data);
        if (socket.dbMeetingId) {
          prisma.chatMessage.create({
            data: { meetingId: socket.dbMeetingId, senderId, originalText: text, originalLanguage: language }
          }).catch(err => console.error("DB chat save error:", err));
        }
        try {
          const clients = await io.in(meetingId).fetchSockets();
          const targetLanguages = new Set();
          clients.forEach(c => {
            const s = c.userSettings || {};
            if ((s.chatEnabled ?? true) && s.chatLang && s.chatLang !== 'original') {
              targetLanguages.add(s.chatLang);
            }
          });
          const translations = {};
          for (let targetLang of targetLanguages) {
            try {
              const res = await translate(text, { to: targetLang, client: 'gtx' }).catch(async (e) => {
                console.error("Google API failed, falling back to MyMemory...");
                const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${language}|${targetLang}`;
                const fallbackRes = await fetch(fallbackUrl);
                const fallbackData = await fallbackRes.json();
                if (fallbackData?.responseData?.translatedText) {
                  return { text: fallbackData.responseData.translatedText };
                }
                throw e;
              });
              translations[targetLang] = res.text;
            } catch (err) { console.error("Translation Error:", err.message); }
          }
          io.to(meetingId).emit('chat:translated', { messageId: data.id, translations, sourceLanguage: language });
      } catch (error) {
        console.error('Translation error:', error);
      }
    });

    // Handle WebRTC signaling
    socket.on('meeting:status_update', ({ isAudioOn, isVideoOn }) => {
      if (socket.meetingId) {
        socket.to(socket.meetingId).emit('participant:status_update', { socketId: socket.id, isAudioOn, isVideoOn });
      }
    });

    socket.on('meeting:force_mute_all', async ({ role }) => {
      if (socket.meetingId && (role === 'HOST' || role === 'COHOST')) {
        socket.to(socket.meetingId).emit('participant:force_mute_received', { muterRole: role });
      }
    });

    socket.on('meeting:force_video_off_all', async ({ role }) => {
      if (socket.meetingId && (role === 'HOST' || role === 'COHOST')) {
        socket.to(socket.meetingId).emit('participant:force_video_off_received', { muterRole: role });
      }
    });

    socket.on('meeting:lock_hardware', async ({ role, type, locked }) => {
      console.log('BACKEND RECEIVED lock_hardware', { role, type, locked, meetingId: socket.meetingId });
      if (socket.meetingId && (role === 'HOST' || role === 'COHOST')) {
        socket.to(socket.meetingId).emit('participant:hardware_locked', { muterRole: role, type, locked });
        console.log('BACKEND EMITTED hardware_locked to', socket.meetingId);
      }
    });

    socket.on('audio:signal', (data) => {
      io.to(data.targetSocketId).emit('audio:signal', {
        signal: data.signal,
        callerId: socket.id,
        name: data.name,
        role: data.role,
        userId: data.userId
      });
    });

    // Handle captions
    socket.on('caption:text', async (data) => {
      const { meetingId, speakerId, text, language } = data;
      if (!text || !text.trim()) return;
      const cleanText = text.trim();

      const now = Date.now();
      if (socket.lastCaption && socket.lastCaption.text.toLowerCase() === cleanText.toLowerCase() && (now - socket.lastCaption.time < 3000)) {
        return;
      }
      socket.lastCaption = { text: cleanText, time: now };

      const targetRoom = socket.dbMeetingId || meetingId;

      // Broadcast live caption once to canonical room
      console.log(`[CAPTION:TEXT] targetRoom: ${targetRoom}, speakerId: ${speakerId}, text: "${cleanText}"`);
      io.to(targetRoom).emit('caption:text', { ...data, text: cleanText });
        if (socket.dbMeetingId) {
          prisma.caption.create({
            data: { meetingId: socket.dbMeetingId, speakerId, originalText: cleanText, originalLanguage: language }
          }).catch(err => console.error("DB caption save error:", err));
        }
        try {
          const clients = await io.in(targetRoom).fetchSockets();
          const targetLanguages = new Set();
          clients.forEach(c => {
            const s = c.userSettings || {};
            if ((s.captionEnabled ?? true) && s.captionLang && s.captionLang !== 'original') {
              targetLanguages.add(s.captionLang);
            }
            if ((s.ttsEnabled ?? true) && s.ttsLang && s.ttsLang !== 'original') {
              targetLanguages.add(s.ttsLang);
            }
          });
          console.log(`[CAPTION:TRANSLATING] clientsInRoom: ${clients.length}, targetLanguages:`, Array.from(targetLanguages));
          const translations = {};
          for (let targetLang of targetLanguages) {
            try {
              const translatePromise = (async () => {
                try {
                  return await translate(text, { to: targetLang, client: 'gtx' });
                } catch (e) {
                  console.warn("Google API failed, falling back to MyMemory...");
                  const fallbackUrl = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${language}|${targetLang}`;
                  const fallbackRes = await fetch(fallbackUrl, { signal: AbortSignal.timeout(3000) });
                  const fallbackData = await fallbackRes.json();
                  if (fallbackData?.responseData?.translatedText) {
                    return { text: fallbackData.responseData.translatedText };
                  }
                  throw e;
                }
              })();

              const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Translation timeout')), 4000));
              const res = await Promise.race([translatePromise, timeoutPromise]);
              translations[targetLang] = res.text;
            } catch (err) {
              console.warn("Translation fallback for", targetLang, ":", err.message);
              translations[targetLang] = text;
            }
          }
          const captionId = `cap_${speakerId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const captionPayload = { id: captionId, text, sourceLanguage: language, speakerId, senderSocketId: socket.id, translations };
          console.log(`[CAPTION:EMITTING] Emitting caption:translated to ${targetRoom}:`, captionPayload.id);
          io.to(targetRoom).emit('caption:translated', captionPayload);
      } catch (error) {
        console.error('Caption translation error:', error);
      }
    });

    socket.on('user:update_settings', (settings) => { socket.userSettings = settings; });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.id} (user: ${socket.userId}, waiting: ${socket.isWaiting})`);
      const targetRoom = socket.dbMeetingId || socket.meetingId;
      if (targetRoom) {
        socket.to(targetRoom).emit('participant:left', { socketId: socket.id, userId: socket.userId });
      }

      // If waiting user disconnects from lobby, mark status as LEFT and notify host
      if (socket.userId && socket.dbMeetingId && socket.isWaiting) {
        try {
          await withDbRetry(p => p.participant.updateMany({
            where: { userId: socket.userId, meetingId: socket.dbMeetingId, status: 'WAITING' },
            data: { status: 'LEFT', leaveTime: new Date() }
          }));
          io.to(socket.dbMeetingId).emit('waiting:left', { userId: socket.userId });
          io.to(socket.dbMeetingId).emit('meeting:refresh');
          io.emit('dashboard:refresh');
          if (global.sseEmit) global.sseEmit('dashboard:refresh');
        } catch (err) {
          console.error('Failed to update waiting participant on disconnect', err);
        }
      }

      if (socket.sessionId) {
        try {
          await withDbRetry(p => p.participantSession.update({
            where: { id: socket.sessionId },
            data: { leftAt: new Date() }
          }));
        } catch (err) {
          console.error('Failed to log leave time', err);
        }
      }
    });
  });

  return io;
}

module.exports = setupSocket;
