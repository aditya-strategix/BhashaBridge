const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const aiClient = require('../clients/ai.client');
const sfuClient = require('../clients/sfu.client');
const prisma = require('../prisma');
const { withDbRetry } = require('../prisma');
const avro = require('../avro');

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

  // Optional-but-authoritative identity: real clients send their JWT in the
  // handshake. Once verified, privileged actions and joins use this identity
  // instead of client-supplied userId/role fields.
  io.use((socket, next) => {
    const raw = socket.handshake.auth?.token
      || socket.handshake.query?.token
      || (socket.handshake.headers?.authorization || '').replace(/^Bearer\s+/i, '');
    if (raw) {
      try {
        socket.authUser = jwt.verify(raw, process.env.JWT_SECRET || 'fallback_secret_for_dev');
      } catch (_) {
        socket.authUser = null;
      }
    }
    next();
  });

  async function getAuthorizedRole(socket, meeting) {
    const uid = socket?.authUser?.userId;
    if (!uid || !meeting) return null;
    if (meeting.hostId === uid) return 'HOST';
    const org = meeting.organization;
    if (org && (org.ownerId === uid || (org.coHosts || []).some((c) => c.id === uid))) {
      return 'COHOST';
    }
    const participant = await withDbRetry(p => p.participant.findUnique({
      where: { userId_meetingId: { userId: uid, meetingId: meeting.id } },
      select: { role: true, status: true }
    })).catch(() => null);
    if (participant && participant.status === 'ADMITTED' && (participant.role === 'HOST' || participant.role === 'COHOST')) {
      return participant.role;
    }
    return null;
  }

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
    socket.on('user:register', ({ userId } = {}) => {
      const effectiveUserId = socket.authUser?.userId || userId;
      if (effectiveUserId) {
        socket.join(`user:${effectiveUserId}`);
        socket.join(`user_${effectiveUserId}`);
        socket.userId = effectiveUserId;
        console.log(`User ${effectiveUserId} registered for notifications`);
      }
    });

    // Join meeting room
    socket.on('meeting:join', async (payload = {}) => {
      try {
        const { meetingId, peerId, language, isAudioOn, isVideoOn } = payload;
        // A verified token always wins over a client-supplied userId.
        const userId = socket.authUser?.userId || payload.userId;
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
        socket.userLanguage = language || participant.user?.preferredLanguage || participant.user?.language || 'en';
        socket.userId = userId;
        socket.userName = participant.user?.name;
        socket.meetingId = meeting.meetingLink;
        socket.dbMeetingId = meeting.id;
        socket.cleanLink = cleanLink;
        socket.isAudioOn = isAudioOn !== undefined ? isAudioOn : true;
        socket.isVideoOn = isVideoOn !== undefined ? isVideoOn : true;
        socket.userSettings = {
          language: socket.userLanguage,
          captionLang: socket.userLanguage,
          ttsLang: socket.userLanguage,
          captionEnabled: true,
          ttsEnabled: true
        };

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

        if (participant.status === 'WAITING') {
          socket.isWaiting = true;
          // Tell hosts someone is waiting (strictly emit once to meeting.id)
          const waitPayload = { userId, name: participant.user?.name || 'User', avatar: participant.user?.avatar };
          io.to(meeting.id).emit('waiting:request', waitPayload);
        } else if (participant.status === 'ADMITTED') {
          socket.isWaiting = false;
          // Admitted participants are the only ones allowed in the live room;
          // waiting/rejected users stay in their personal notification room.
          socket.join(meeting.meetingLink);
          socket.join(meeting.id);
          if (cleanLink && cleanLink !== meeting.meetingLink && cleanLink !== meeting.id) {
            socket.join(cleanLink);
          }
          const effectiveRole = participant.userId === meeting.hostId ? 'HOST' : (participant.role === 'HOST' ? 'COHOST' : participant.role);
          const joinedPayload = { 
            userId, 
            peerId, 
            socketId: socket.id,
            name: participant.user?.name,
            role: effectiveRole,
            avatar: participant.user?.avatar,
            isAudioOn: socket.isAudioOn,
            isVideoOn: socket.isVideoOn
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

    socket.on('meeting:admit', async ({ meetingId, targetUserId } = {}) => {
      try {
        if (!socket.authUser?.userId) return;
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

    socket.on('meeting:reject', async ({ meetingId, targetUserId } = {}) => {
      try {
        if (!socket.authUser?.userId) return;
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

    socket.on('meeting:remove_participant', async ({ meetingId, targetUserId } = {}) => {
      try {
        if (!socket.authUser?.userId) return;
        const meeting = await resolveMeeting(meetingId);
        if (!meeting) return;
        if (meeting.state === 'COMPLETED' || meeting.state === 'CANCELLED') return;

        const callerRole = await getAuthorizedRole(socket, meeting);
        if (!callerRole) return;

        const caller = await prisma.participant.findUnique({
          where: { userId_meetingId: { userId: socket.authUser.userId, meetingId: meeting.id } }
        });
        const isHost = callerRole === 'HOST' || (caller && caller.role === 'HOST');
        const isCoHost = caller && caller.role === 'COHOST';

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

        // Make the removed participant actually leave the live rooms so they
        // stop receiving chat/captions/media-consumer updates.
        const targetSockets = await io.in(meeting.id).fetchSockets();
        for (const s of targetSockets) {
          if (s.userId !== targetUserId) continue;
          try {
            s.leave(meeting.id);
            s.leave(meeting.meetingLink);
            if (s.cleanLink) s.leave(s.cleanLink);
          } catch (_) {}
          s.emit('participant:removed', { userId: targetUserId });
          s.disconnect(true);
        }

        // Broadcast to every alias so no room keeps a stale tile.
        for (const roomId of new Set([meetingId, meeting.id, meeting.meetingLink].filter(Boolean))) {
          io.to(roomId).emit('participant:removed', { userId: targetUserId });
          io.to(roomId).emit('meeting:refresh');
        }
        io.emit('dashboard:refresh');
        if (global.sseEmit) global.sseEmit('dashboard:refresh');
      } catch (err) {
        console.error('Socket remove participant error', err);
      }
    });

    socket.on('meeting:end', async ({ meetingId } = {}) => {
      try {
        // Only a verified host / org admin / co-host may end a meeting.
        if (!socket.authUser?.userId) return;
        const meeting = await resolveMeeting(meetingId || socket.dbMeetingId || socket.meetingId);
        if (!meeting) return;

        const role = await getAuthorizedRole(socket, meeting);
        if (!role) {
          console.warn(`[Socket] Unauthorized meeting:end attempt by ${socket.authUser.userId}`);
          return;
        }

        const caller = await withDbRetry(p => p.user.findUnique({
          where: { id: socket.authUser.userId },
          select: { name: true }
        }));
        const finalEndedBy = {
          name: caller?.name || socket.userName || (role === 'HOST' ? 'Host' : 'Co-host'),
          role,
          userId: socket.authUser.userId
        };

        let currentCache = {};
        if (meeting.summaryCache) {
          try {
            currentCache = typeof meeting.summaryCache === 'string'
              ? JSON.parse(meeting.summaryCache)
              : meeting.summaryCache;
          } catch (_) {}
        }
        currentCache._endedBy = finalEndedBy;

        await withDbRetry(p => p.meeting.update({
          where: { id: meeting.id },
          data: {
            state: 'COMPLETED',
            endTime: new Date(),
            startTime: meeting.startTime || meeting.createdAt,
            summaryCache: currentCache
          }
        }));

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

        // Release SFU room routers and media resources (best-effort; the SFU
        // may not be deployed in every environment).
        const sfuRoomIds = new Set(
          [meetingId, meeting?.meetingLink, meeting?.id].filter(Boolean).map(String)
        );
        for (const roomId of sfuRoomIds) {
          sfuClient.closeRoom(roomId).catch(() => {});
        }
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
    socket.on('chat:message', async (data = {}) => {
      if (socket.isWaiting || !data.text || !String(data.text).trim()) return;
      // Verified identity / canonical room win over client-supplied fields.
      const senderId = socket.authUser?.userId || data.senderId;
      const meetingId = socket.dbMeetingId || socket.meetingId || data.meetingId;
      const text = String(data.text).trim();
      const language = data.language;
      if (!senderId || !meetingId) return;
      const payload = { ...data, meetingId, senderId, text };

      // Emit original message to everyone immediately
      io.to(meetingId).emit('chat:message', payload);
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
          let translations = {};
          if (targetLanguages.size > 0) {
            try {
              translations = await aiClient.translate(text, language, Array.from(targetLanguages));
            } catch (err) {
              console.error("[IndicTrans2 Chat] Translation Error:", err.message);
            }
          }
          io.to(meetingId).emit('chat:translated', { messageId: data.id, translations, sourceLanguage: language });
      } catch (error) {
        console.error('Translation error:', error);
      }
    });

    // Handle WebRTC signaling
    socket.on('meeting:status_update', ({ isAudioOn, isVideoOn, isScreenSharing }) => {
      socket.isAudioOn = isAudioOn !== undefined ? isAudioOn : socket.isAudioOn;
      socket.isVideoOn = isVideoOn !== undefined ? isVideoOn : socket.isVideoOn;
      socket.isScreenSharing = isScreenSharing !== undefined ? isScreenSharing : socket.isScreenSharing;
      if (socket.meetingId) {
        socket.to(socket.meetingId).emit('participant:status_update', {
          socketId: socket.id,
          userId: socket.userId,
          isAudioOn,
          isVideoOn,
          isScreenSharing: socket.isScreenSharing
        });
      }
    });

    socket.on('meeting:force_mute_all', async () => {
      if (!socket.meetingId || !socket.authUser?.userId) return;
      const meeting = await resolveMeeting(socket.dbMeetingId || socket.meetingId);
      const role = await getAuthorizedRole(socket, meeting);
      if (role) {
        socket.to(socket.meetingId).emit('participant:force_mute_received', { muterRole: role });
      }
    });

    socket.on('meeting:force_video_off_all', async () => {
      if (!socket.meetingId || !socket.authUser?.userId) return;
      const meeting = await resolveMeeting(socket.dbMeetingId || socket.meetingId);
      const role = await getAuthorizedRole(socket, meeting);
      if (role) {
        socket.to(socket.meetingId).emit('participant:force_video_off_received', { muterRole: role });
      }
    });

    socket.on('meeting:lock_hardware', async ({ type, locked } = {}) => {
      if (!socket.meetingId || !socket.authUser?.userId) return;
      const meeting = await resolveMeeting(socket.dbMeetingId || socket.meetingId);
      const role = await getAuthorizedRole(socket, meeting);
      if (role) {
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
        userId: data.userId,
        avatar: data.avatar,
        isAudioOn: data.isAudioOn,
        isVideoOn: data.isVideoOn,
        isScreenSharing: data.isScreenSharing
      });
    });

    // Handle captions
    socket.on('caption:text', async (data = {}) => {
      if (socket.isWaiting || !data.text || !String(data.text).trim()) return;
      // Verified identity / canonical room win over client-supplied fields.
      const speakerId = socket.authUser?.userId || data.speakerId;
      const meetingId = socket.dbMeetingId || socket.meetingId || data.meetingId;
      const text = String(data.text);
      const language = data.language;
      if (!speakerId || !meetingId) return;
      const cleanText = text.trim();
      const lower = cleanText.toLowerCase();
      if (cleanText.startsWith('[') || lower.includes('audio stream') || lower.includes('stream chunk') || lower.includes('875 bytes') || lower.includes('ऑडियो स्ट्रीम')) {
        return;
      }

      const now = Date.now();
      const normCaption = cleanText.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();
      if (socket.lastCaption && socket.lastCaption.norm === normCaption && (now - socket.lastCaption.time < 8000)) {
        return;
      }
      socket.lastCaption = { text: cleanText, norm: normCaption, time: now };

      const targetRoom = socket.dbMeetingId || meetingId;

      // Broadcast live caption once to canonical room
      console.log(`[CAPTION:TEXT] targetRoom: ${targetRoom}, speakerId: ${speakerId}, text: "${cleanText}"`);
      io.to(targetRoom).emit('caption:text', { ...data, speakerId, meetingId: targetRoom, text: cleanText });
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
            const clientLang = s.language || c.userLanguage || 'en';
            const effCaptionLang = (s.captionLang && s.captionLang !== 'original') ? s.captionLang : clientLang;
            const effTtsLang = (s.ttsLang && s.ttsLang !== 'original') ? s.ttsLang : clientLang;

            if ((s.captionEnabled ?? true) && effCaptionLang && effCaptionLang !== language) {
              targetLanguages.add(effCaptionLang);
            }
            if ((s.ttsEnabled ?? true) && effTtsLang && effTtsLang !== language) {
              targetLanguages.add(effTtsLang);
            }
          });
          console.log(`[CAPTION:TRANSLATING] clientsInRoom: ${clients.length}, targetLanguages:`, Array.from(targetLanguages));
          let translations = {};
          if (targetLanguages.size > 0) {
            try {
              translations = await aiClient.translate(text, language, Array.from(targetLanguages));
            } catch (err) {
              console.warn("[IndicTrans2 Caption] Translation error, falling back to original:", err.message);
              for (let targetLang of targetLanguages) {
                translations[targetLang] = text;
              }
            }
          }
          const captionId = `cap_${speakerId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const captionPayload = { id: captionId, text, sourceLanguage: language, speakerId, speakerName: socket.userName || data.speakerName || 'Speaker', senderSocketId: socket.id, translations };
          console.log(`[CAPTION:EMITTING] Emitting caption:translated to ${targetRoom}:`, captionPayload.id);
          io.to(targetRoom).emit('caption:translated', captionPayload);

          // Pillar 3: Apache Avro Binary Serialization
          try {
            if (avro && avro.registry && avro.registry.hasSchema('TranslatedCaptionEvent')) {
              const avroEvent = {
                eventId: captionId,
                originalEventId: `orig_${captionId}`,
                meetingId: String(targetRoom),
                speakerId: String(speakerId),
                translations: translations,
                processingLatencyMs: Date.now() - now,
                timestamp: Date.now()
              };
              const avroBuffer = avro.registry.serialize('TranslatedCaptionEvent', avroEvent);
              io.to(targetRoom).emit('caption:translated:avro', avroBuffer);
            }
          } catch (avroErr) {
            console.warn('[Socket Avro] Caption serialization error:', avroErr.message);
          }
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
