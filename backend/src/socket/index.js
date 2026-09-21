const { Server } = require('socket.io');
const { translate } = require('@vitalets/google-translate-api');
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

    // Join meeting room
    socket.on('meeting:join', async ({ meetingId, userId, peerId, language }) => {
      socket.join(meetingId);
      // save details to socket for quick access later
      socket.userLanguage = language || 'en';
      socket.userId = userId;
      socket.meetingId = meetingId;
      
      socket.to(meetingId).emit('participant:joined', { userId, peerId, socketId: socket.id });
      console.log(`User ${userId} joined meeting ${meetingId}`);

      try {
        const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
        if (meeting) {
          const participant = await prisma.participant.findUnique({
            where: { userId_meetingId: { userId, meetingId: meeting.id } }
          });
          if (participant) {
            const session = await prisma.participantSession.create({
              data: { participantId: participant.id }
            });
            socket.sessionId = session.id;
          }
        }
      } catch (err) {
        console.error('Failed to log attendance session', err);
      }
    });

    // Handle chat messages
    socket.on('chat:message', async (data) => {
      const { meetingId, senderId, text, language } = data;
      
      // Emit original message to everyone immediately
      io.to(meetingId).emit('chat:message', data);

      try {
        // Broadcast translated message by iterating over sockets in room
        const clients = await io.in(meetingId).fetchSockets();
        const targetLanguages = new Set();
        clients.forEach(c => {
          if (c.userLanguage && c.userLanguage !== language) {
            targetLanguages.add(c.userLanguage);
          }
        });

        const translations = {};
        for (let targetLang of targetLanguages) {
          try {
            const res = await translate(text, { to: targetLang });
            translations[targetLang] = res.text;
          } catch (err) {
            console.error(`Translation failed for ${targetLang}`, err);
          }
        }

        io.to(meetingId).emit('chat:translated', { messageId: data.id, translations });
      } catch (error) {
        console.error('Translation error:', error);
      }
    });

    // Handle WebRTC signaling
    socket.on('audio:signal', (data) => {
      io.to(data.targetSocketId).emit('audio:signal', {
        signal: data.signal,
        callerId: socket.id,
      });
    });

    // Handle captions
    socket.on('caption:text', async (data) => {
      const { meetingId, speakerId, text, language } = data;
      // Broadcast live caption
      io.to(meetingId).emit('caption:text', data);
      
      try {
        const clients = await io.in(meetingId).fetchSockets();
        const targetLanguages = new Set();
        clients.forEach(c => {
          if (c.userLanguage && c.userLanguage !== language) {
            targetLanguages.add(c.userLanguage);
          }
        });

        const translations = {};
        for (let targetLang of targetLanguages) {
          try {
            const res = await translate(text, { to: targetLang });
            translations[targetLang] = res.text;
          } catch (err) {
            console.error(`Caption Translation failed for ${targetLang}`, err);
          }
        }

        io.to(meetingId).emit('caption:translated', { text, speakerId, translations });
      } catch (error) {
        console.error('Caption translation error:', error);
      }
    });

    socket.on('disconnect', async () => {
      console.log(`User disconnected: ${socket.id}`);
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
