const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getOrgUsers = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user.organizationId) return res.json({ users: [] });

    const users = await prisma.user.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true, email: true, role: true }});
    res.json({ users });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.addOrgUser = async (req, res) => {
  try {
    const adminUser = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!adminUser.organizationId) {
      return res.status(400).json({ error: 'You do not belong to an organization' });
    }

    const { email } = req.body;
    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.user.update({
      where: { email },
      data: { organizationId: adminUser.organizationId }
    });

    res.status(201).json({ message: 'User added to organization successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeOrgUser = async (req, res) => {
  try {
    const adminUser = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!adminUser.organizationId) {
      return res.status(400).json({ error: 'You do not belong to an organization' });
    }

    const { id } = req.params;
    
    // Verify user belongs to same org
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser || targetUser.organizationId !== adminUser.organizationId) {
      return res.status(403).json({ error: 'User not in your organization' });
    }

    await prisma.user.update({
      where: { id },
      data: { organizationId: null, role: 'PARTICIPANT' }
    });

    res.json({ message: 'User removed from organization successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.changeUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    await prisma.user.update({
        where: { id },
        data: { role }
    });
    res.json({ message: 'User role updated' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getSystemHealth = async (req, res) => {
  const activeMeetings = await prisma.meeting.count({ where: { state: 'ONGOING' } });
  res.json({ status: 'Healthy', activeMeetings, uptime: process.uptime() });
};

