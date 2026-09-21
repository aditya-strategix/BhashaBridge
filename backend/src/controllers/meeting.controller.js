const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

exports.createMeeting = async (req, res) => {
  try {
    const { title } = req.body;
    const meetingLink = crypto.randomBytes(4).toString('hex');
    
    const meeting = await prisma.meeting.create({
      data: {
        title,
        meetingLink,
        hostId: req.user.userId,
      }
    });

    res.status(201).json({ meeting });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getMeetings = async (req, res) => {
  try {
    const meetings = await prisma.meeting.findMany({
      where: {
        OR: [
          { hostId: req.user.userId },
          { participants: { some: { userId: req.user.userId } } }
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
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    await prisma.participant.upsert({
      where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } },
      update: { joinTime: new Date() },
      create: {
        userId: req.user.userId,
        meetingId: meeting.id,
        role: meeting.hostId === req.user.userId ? 'HOST' : 'PARTICIPANT'
      }
    });

    res.json({ meeting });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

