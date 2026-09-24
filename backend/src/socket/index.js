const { Server } = require('socket.io');
const translate = require('google-translate-api-x');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function setupSocket(server) {
  const io = new Server(server, {
    cors: {
      origin: '*', // For development
      methods: ['GET', 'POST'],
    },
  });

  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    // Allow users to join their personal notification room
    socket.on('user:register', ({ userId }) => {
      if (userId) {
        socket.join(`user:${userId}`);
        socket.userId = userId;
        console.log(`User ${userId} registered for notifications`);
      }
    });

    // Join meeting room
    socket.on('meeting:join', async ({ meetingId, userId, peerId, language }) => {
      try {
        const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
        if (!meeting) return;
        if (meeting.state === 'COMPLETED') {
          socket.disconnect(true);
          return;
        }

        const participant = await prisma.participant.findUnique({
          where: { userId_meetingId: { userId, meetingId: meeting.id } },
          include: { user: true }
        });
        if (!participant) return;

        socket.userLanguage = language || 'en';
        socket.userId = userId;
        socket.meetingId = meetingId;
        socket.dbMeetingId = meeting.id;
        socket.join(`user_${userId}`);

        if (participant.status === 'WAITING') {
          // Tell hosts someone is waiting
          socket.to(meetingId).emit('waiting:request', { userId, name: participant.user?.name || 'User' });
        } else if (participant.status === 'ADMITTED') {
          socket.join(meetingId);
          socket.to(meetingId).emit('participant:joined', { 
            userId, 
            peerId, 
            socketId: socket.id,
            name: participant.user?.name,
            role: participant.role 
          });
          console.log(`User ${userId} joined meeting ${meetingId}`);
          
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
      // Must verify caller is HOST or COHOST
      try {
        const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
        const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: socket.userId, meetingId: meeting.id } } });
        
        if (caller && (caller.role === 'HOST' || caller.role === 'COHOST')) {
          await prisma.participant.update({
            where: { userId_meetingId: { userId: targetUserId, meetingId: meeting.id } },
            data: { status: 'ADMITTED' }
          });
          io.to(meetingId).emit('waiting:admitted', { userId: targetUserId });
          io.to(`user_${targetUserId}`).emit('waiting:admitted', { userId: targetUserId });
        }
      } catch (err) {
        console.error('Socket admit error', err);
      }
    });

    socket.on('meeting:reject', async ({ meetingId, targetUserId }) => {
      try {
        const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
        const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: socket.userId, meetingId: meeting.id } } });
        
        if (caller && (caller.role === 'HOST' || caller.role === 'COHOST')) {
          await prisma.participant.update({
            where: { userId_meetingId: { userId: targetUserId, meetingId: meeting.id } },
            data: { status: 'REJECTED' }
          });
          io.to(meetingId).emit('waiting:rejected', { userId: targetUserId });
          io.to(`user_${targetUserId}`).emit('waiting:rejected', { userId: targetUserId });
        }
      } catch (err) {
        console.error('Socket reject error', err);
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
      // Broadcast live caption
      io.to(meetingId).emit('caption:text', data);
        if (socket.dbMeetingId) {
          prisma.caption.create({
            data: { meetingId: socket.dbMeetingId, speakerId, originalText: text, originalLanguage: language }
          }).catch(err => console.error("DB caption save error:", err));
        }
        try {
          const clients = await io.in(meetingId).fetchSockets();
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
          io.to(meetingId).emit('caption:translated', { text, sourceLanguage: language, speakerId, senderSocketId: socket.id, translations });
      } catch (error) {
        console.error('Caption translation error:', error);
      }
    });

    socket.on('user:update_settings', (settings) => { socket.userSettings = settings; });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.id}`);
      if (socket.meetingId) {
        socket.to(socket.meetingId).emit('participant:left', { socketId: socket.id, userId: socket.userId });
      }

      if (socket.sessionId) {
        try {
          await prisma.participantSession.update({
            where: { id: socket.sessionId },
            data: { leftAt: new Date() }
          });
        } catch (err) {
          console.error('Failed to log leave time', err);
        }
      }
    });
  });

  return io;
}

module.exports = setupSocket;
