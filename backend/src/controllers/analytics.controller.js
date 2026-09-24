const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getAnalytics = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: meetingId } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    let analytics = await prisma.meetingAnalytics.findUnique({ where: { meetingId: meeting.id } });
    
    if (analytics) {
      const allSessions = await prisma.participantSession.findMany({ where: { participant: { meetingId: meeting.id } } });
      if (allSessions.length > 0) {
        const intervals = allSessions.map(s => {
          const start = new Date(s.joinedAt).getTime();
          const end = s.leftAt ? new Date(s.leftAt).getTime() : new Date(meeting.endTime || Date.now()).getTime();
          return { start, end };
        }).sort((a, b) => a.start - b.start);

        let merged = [];
        let current = intervals[0];
        for (let i = 1; i < intervals.length; i++) {
          if (intervals[i].start <= current.end) {
            current.end = Math.max(current.end, intervals[i].end);
          } else {
            merged.push(current);
            current = intervals[i];
          }
        }
        merged.push(current);

        const activeTimeMs = merged.reduce((acc, inv) => acc + (inv.end - inv.start), 0);
        const totalDurationSeconds = Math.max(0, Math.round(activeTimeMs / 1000));
        analytics = await prisma.meetingAnalytics.update({ where: { id: analytics.id }, data: { totalDurationSeconds } });
      }
    }
    
    if (!analytics) {
      // Calculate simple analytics on the fly if not exists
      const participants = await prisma.participant.count({ where: { meetingId: meeting.id } });
      const messages = await prisma.chatMessage.findMany({ where: { meetingId: meeting.id } });
      const languagesUsed = [...new Set(messages.map(m => m.originalLanguage))];
      
      const allSessions = await prisma.participantSession.findMany({
        where: { participant: { meetingId: meeting.id } }
      });
      
      let totalDurationSeconds = 0;
      if (allSessions.length > 0) {
        const intervals = allSessions.map(s => {
          const start = new Date(s.joinedAt).getTime();
          const end = s.leftAt ? new Date(s.leftAt).getTime() : new Date(meeting.endTime || Date.now()).getTime();
          return { start, end };
        }).sort((a, b) => a.start - b.start);

        let merged = [];
        let current = intervals[0];
        for (let i = 1; i < intervals.length; i++) {
          if (intervals[i].start <= current.end) {
            current.end = Math.max(current.end, intervals[i].end);
          } else {
            merged.push(current);
            current = intervals[i];
          }
        }
        merged.push(current);

        const activeTimeMs = merged.reduce((acc, inv) => acc + (inv.end - inv.start), 0);
        totalDurationSeconds = Math.max(0, Math.round(activeTimeMs / 1000));
      } else {
        totalDurationSeconds = meeting.endTime && meeting.startTime 
          ? Math.round((new Date(meeting.endTime) - new Date(meeting.startTime)) / 1000) 
          : 0;
      }

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

    // Refresh analytics to get the latest duration
    let analytics = await prisma.meetingAnalytics.findUnique({ where: { meetingId: meeting.id } });
    if (analytics) {
      const allSessions = await prisma.participantSession.findMany({ where: { participant: { meetingId: meeting.id } } });
      if (allSessions.length > 0) {
        const intervals = allSessions.map(s => {
          const start = new Date(s.joinedAt).getTime();
          const end = s.leftAt ? new Date(s.leftAt).getTime() : new Date(meeting.endTime || Date.now()).getTime();
          return { start, end };
        }).sort((a, b) => a.start - b.start);
        let merged = [];
        let current = intervals[0];
        for (let i = 1; i < intervals.length; i++) {
          if (intervals[i].start <= current.end) current.end = Math.max(current.end, intervals[i].end);
          else { merged.push(current); current = intervals[i]; }
        }
        merged.push(current);
        const activeTimeMs = merged.reduce((acc, inv) => acc + (inv.end - inv.start), 0);
        const totalDurationSeconds = Math.max(0, Math.round(activeTimeMs / 1000));
        analytics = await prisma.meetingAnalytics.update({ where: { id: analytics.id }, data: { totalDurationSeconds } });
      }
      if (report.reportData && report.reportData.details) {
        report.reportData.details.totalDurationSeconds = analytics.totalDurationSeconds;
      }
    }

    res.json({ report });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

