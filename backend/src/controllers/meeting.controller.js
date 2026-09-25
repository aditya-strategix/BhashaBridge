const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');

exports.createMeeting = async (req, res) => {
  try {
    const { title, startTime, state, organizationId } = req.body;
    let meetingLink = crypto.randomBytes(4).toString('hex');
    
    // Check if org belongs to user
    let orgData = {};
    if (organizationId) {
      const org = await prisma.organization.findFirst({
        where: { id: organizationId, users: { some: { id: req.user.userId } } }
      });
      if (!org) return res.status(403).json({ error: 'Not a member of this organization' });
      orgData = { organizationId };
      if (org.accessCode) {
        meetingLink = `${org.accessCode}-${crypto.randomBytes(2).toString('hex')}`;
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

    // If SCHEDULED and host is joining, flip to ONGOING
    if (meeting.hostId === req.user.userId && meeting.state === 'SCHEDULED') {
      await prisma.meeting.update({
        where: { id: meeting.id },
        data: { state: 'ONGOING', startTime: new Date() }
      });
      meeting.state = 'ONGOING';
      meeting.startTime = new Date();
    }

    let isOrgCoHost = false;
    if (meeting.organizationId) {
      const org = await prisma.organization.findFirst({
        where: { id: meeting.organizationId, users: { some: { id: req.user.userId } } },
        include: { coHosts: { select: { id: true } } }
      });
      if (!org) return res.status(403).json({ error: 'You are not a member of this organization.' });
      if (org.coHosts.some(c => c.id === req.user.userId)) isOrgCoHost = true;
    }

    let participant = await prisma.participant.findUnique({
      where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } }
    });

    const isHost = meeting.hostId === req.user.userId;
    const isCoHost = isOrgCoHost || (participant && participant.role === 'COHOST');
    
    // Default: if you are host or cohost, you bypass waiting room.
    const newStatus = (isHost || isCoHost) ? 'ADMITTED' : 'WAITING';

    if (!participant) {
      participant = await prisma.participant.create({
        data: {
          userId: req.user.userId,
          meetingId: meeting.id,
          role: isHost ? 'HOST' : (isOrgCoHost ? 'COHOST' : 'PARTICIPANT'),
          status: newStatus
        }
      });
    } else {
      const updatedRole = isHost ? 'HOST' : (isOrgCoHost ? 'COHOST' : participant.role);
      participant = await prisma.participant.update({
        where: { id: participant.id },
        data: { joinTime: new Date(), status: newStatus, role: updatedRole }
      });
    }

    res.json({ meeting, participantStatus: participant.status, participantRole: participant.role });
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
    if (meeting.hostId !== req.user.userId) return res.status(403).json({ error: 'Only the host can end the meeting' });

    const updated = await prisma.meeting.update({
      where: { id: meeting.id },
      data: { 
        state: 'COMPLETED',
        endTime: new Date(),
        startTime: meeting.startTime || meeting.createdAt
      }
    });

    res.json({ meeting: updated });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};
exports.deleteMeeting = async (req, res) => {
  try {
    const { id } = req.params;
    const meeting = await prisma.meeting.findUnique({ where: { id } });
    
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });
    if (meeting.hostId !== req.user.userId) return res.status(403).json({ error: 'Only the host can delete the meeting' });

    // Delete all dependent records first
    await prisma.$transaction([
      prisma.participantSession.deleteMany({ where: { participant: { meetingId: id } } }),
      prisma.participant.deleteMany({ where: { meetingId: id } }),
      prisma.chatMessage.deleteMany({ where: { meetingId: id } }),
      prisma.caption.deleteMany({ where: { meetingId: id } }),
      prisma.meetingAnalytics.deleteMany({ where: { meetingId: id } }),
      prisma.meetingReport.deleteMany({ where: { meetingId: id } }),
      prisma.meeting.delete({ where: { id } })
    ]);

    res.json({ message: 'Meeting deleted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.admitParticipant = async (req, res) => {
  try {
    const { link } = req.params;
    const { userId } = req.body;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    if (!meeting) return res.status(404).json({ error: 'Meeting not found' });

    // Verify caller is Host or Cohost
    const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } } });
    if (!caller || (caller.role !== 'HOST' && caller.role !== 'COHOST')) {
      return res.status(403).json({ error: 'Not authorized to admit participants' });
    }

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { status: 'ADMITTED' }
    });

    res.json({ participant });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.rejectParticipant = async (req, res) => {
  try {
    const { link } = req.params;
    const { userId } = req.body;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    
    const caller = await prisma.participant.findUnique({ where: { userId_meetingId: { userId: req.user.userId, meetingId: meeting.id } } });
    if (!caller || (caller.role !== 'HOST' && caller.role !== 'COHOST')) return res.status(403).json({ error: 'Not authorized' });

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { status: 'REJECTED' }
    });

    res.json({ participant });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.assignCoHost = async (req, res) => {
  try {
    const { link } = req.params;
    const { userId } = req.body;
    const meeting = await prisma.meeting.findUnique({ where: { meetingLink: link } });
    if (meeting.hostId !== req.user.userId) return res.status(403).json({ error: 'Only main Host can assign Co-hosts' });

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { role: 'COHOST' }
    });
    
    if (global.io) global.io.to(link).emit('participant:promoted', { userId, role: 'COHOST' });
    res.json({ participant });
  } catch (error) {
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
    if (meeting.hostId !== req.user.userId) return res.status(403).json({ error: 'Only main Host can remove Co-hosts' });

    // Check if the user is a permanent org co-host
    const isPermanent = meeting.organization.coHosts.some(c => c.id === userId);
    if (isPermanent) {
      return res.status(403).json({ error: 'Cannot demote a permanent Organization Co-Host.' });
    }

    const participant = await prisma.participant.update({
      where: { userId_meetingId: { userId, meetingId: meeting.id } },
      data: { role: 'PARTICIPANT' }
    });
    
    if (global.io) global.io.to(link).emit('participant:promoted', { userId, role: 'PARTICIPANT' });
    res.json({ participant });
  } catch (error) {
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

    // Ensure the user is a participant or host
    const isHost = meeting.hostId === req.user.userId;
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
