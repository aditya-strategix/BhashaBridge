const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAnalytics = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    let analytics = await prisma.meetingAnalytics.findUnique({ where: { meetingId: meeting.id } });
    
    if (!analytics) {
      // Calculate simple analytics on the fly if not exists
      const participants = await prisma.participant.count({ where: { meetingId: meeting.id } });
      const messages = await prisma.chatMessage.findMany({ where: { meetingId: meeting.id } });
      const languagesUsed = [...new Set(messages.map(m => m.originalLanguage))];
      
      const totalDurationSeconds = meeting.endTime && meeting.startTime 
        ? Math.round((new Date(meeting.endTime) - new Date(meeting.startTime)) / 1000) 
        : 0;

      analytics = await prisma.meetingAnalytics.create({
        data: {
          meetingId: meeting.id,
          totalParticipants: participants,
          totalDurationSeconds,
          languagesUsed,
          participantDurations: {}
        }
      });
    }

    res.json({ analytics });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.generateReport = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId }, include: { analytics: true } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    if (!meeting.analytics) {
        return res.status(400).json({ error: 'Analytics not generated yet' });
    }

    const report = await prisma.meetingReport.create({
      data: {
        meetingId: meeting.id,
        analyticsId: meeting.analytics.id,
        reportData: { summary: "Meeting Report generated.", details: meeting.analytics },
        format: "json"
      }
    });

    res.status(201).json({ report });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getReport = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const report = await prisma.meetingReport.findFirst({
        where: { meetingId: meeting.id },
        orderBy: { generatedAt: 'desc' }
    });

    if (!report) return res.status(404).json({ error: 'Report not found' });

    res.json({ report });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

