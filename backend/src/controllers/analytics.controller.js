const prisma = require('../prisma');
const { withDbRetry } = require('../prisma');

// Resolve a meeting by canonical link, DB id, or organization access code
// (case-insensitively), mirroring the join flow. Without this, report links
// built from an org code or uppercase code returned 404.
const resolveMeeting = async (identifier) => {
  const clean = String(identifier || '').trim();
  if (!clean) return null;

  let meeting = await prisma.meeting.findFirst({
    where: {
      OR: [
        { meetingLink: clean },
        { meetingLink: { equals: clean, mode: 'insensitive' } },
        { id: clean }
      ]
    }
  });
  if (meeting) return meeting;

  const org = await prisma.organization.findFirst({
    where: {
      OR: [
        { accessCode: clean },
        { accessCode: { equals: clean, mode: 'insensitive' } }
      ]
    }
  });
  if (!org) return null;

  meeting = await prisma.meeting.findFirst({
    where: { organizationId: org.id },
    orderBy: { createdAt: 'desc' }
  });
  return meeting;
};

const computeMergedDurationSeconds = async (meeting) => {
  const allSessions = await prisma.participantSession.findMany({
    where: { participant: { meetingId: meeting.id } }
  });

  if (allSessions.length === 0) {
    return meeting.endTime && meeting.startTime
      ? Math.max(0, Math.round((new Date(meeting.endTime) - new Date(meeting.startTime)) / 1000))
      : 0;
  }

  const intervals = allSessions.map(s => ({
    start: new Date(s.joinedAt).getTime(),
    end: s.leftAt ? new Date(s.leftAt).getTime() : new Date(meeting.endTime || Date.now()).getTime()
  })).sort((a, b) => a.start - b.start);

  const merged = [];
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
  return Math.max(0, Math.round(activeTimeMs / 1000));
};

const ensureMeetingAnalytics = async (meeting, { recalculateExisting = false } = {}) => {
  const existing = await prisma.meetingAnalytics.findUnique({ where: { meetingId: meeting.id } });
  if (existing) {
    if (recalculateExisting) {
      const totalDurationSeconds = await computeMergedDurationSeconds(meeting);
      if (totalDurationSeconds > 0 && totalDurationSeconds !== existing.totalDurationSeconds) {
        return prisma.meetingAnalytics.update({
          where: { id: existing.id },
          data: { totalDurationSeconds }
        });
      }
    }
    return existing;
  }

  const [participants, messages, captions, totalDurationSeconds] = await Promise.all([
    prisma.participant.count({ where: { meetingId: meeting.id, status: 'ADMITTED' } }),
    prisma.chatMessage.findMany({ where: { meetingId: meeting.id }, select: { originalLanguage: true } }),
    prisma.caption.findMany({ where: { meetingId: meeting.id }, select: { originalLanguage: true } }),
    computeMergedDurationSeconds(meeting)
  ]);

  const languagesUsed = [...new Set([
    ...messages.map(m => m.originalLanguage).filter(Boolean),
    ...captions.map(c => c.originalLanguage).filter(Boolean)
  ])];

  try {
    return await prisma.meetingAnalytics.upsert({
      where: { meetingId: meeting.id },
      create: {
        meetingId: meeting.id,
        totalParticipants: participants,
        totalDurationSeconds,
        languagesUsed,
        participantDurations: {}
      },
      update: {}
    });
  } catch (err) {
    if (err.code === 'P2002') {
      return prisma.meetingAnalytics.findUnique({ where: { meetingId: meeting.id } });
    }
    throw err;
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await resolveMeeting(meetingId);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const analytics = await ensureMeetingAnalytics(meeting, { recalculateExisting: true });
    res.json({ analytics });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.generateReport = async (req, res) => {
  try {
    const { meetingId } = req.params;
    const meeting = await resolveMeeting(meetingId);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    const analytics = await ensureMeetingAnalytics(meeting);

    const report = await prisma.meetingReport.create({
      data: {
        meetingId: meeting.id,
        analyticsId: analytics.id,
        reportData: { summary: "Meeting Report generated.", details: analytics },
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
    const meeting = await resolveMeeting(meetingId);
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    let report = await prisma.meetingReport.findFirst({
      where: { meetingId: meeting.id },
      orderBy: { generatedAt: 'desc' }
    });

    if (!report) {
      const analytics = await ensureMeetingAnalytics(meeting, { recalculateExisting: true });
      try {
        report = await prisma.meetingReport.create({
          data: {
            meetingId: meeting.id,
            analyticsId: analytics.id,
            reportData: { summary: "Meeting Report generated on-demand.", details: analytics },
            format: "json"
          }
        });
      } catch (err) {
        if (err.code === 'P2002') {
          report = await prisma.meetingReport.findFirst({
            where: { meetingId: meeting.id },
            orderBy: { generatedAt: 'desc' }
          });
        } else {
          throw err;
        }
      }
    }

    return res.json({ report });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};
