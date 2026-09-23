const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

exports.getOrgUsers = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ 
      where: { id: req.user.userId },
      include: { ownedOrganizations: { include: { users: true } } }
    });
    
    if (!user.ownedOrganizations.length) return res.json({ users: [] });

    // Aggregate users across all owned orgs
    const userMap = new Map();
    user.ownedOrganizations.forEach(org => {
      org.users.forEach(u => {
        if (!userMap.has(u.id)) {
          userMap.set(u.id, { id: u.id, name: u.name, email: u.email, role: u.role });
        }
      });
    });

    res.json({ users: Array.from(userMap.values()) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.addOrgUser = async (req, res) => {
  try {
    const adminUser = await prisma.user.findUnique({ 
      where: { id: req.user.userId },
      include: { ownedOrganizations: true } 
    });
    if (!adminUser.ownedOrganizations.length) {
      return res.status(400).json({ error: 'You do not own an organization' });
    }

    const { email } = req.body;
    const targetUser = await prisma.user.findUnique({ where: { email } });
    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Add to the first owned organization for backward compatibility in this old admin panel
    await prisma.organization.update({
      where: { id: adminUser.ownedOrganizations[0].id },
      data: { users: { connect: { id: targetUser.id } } }
    });

    res.status(201).json({ message: 'User added to organization successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeOrgUser = async (req, res) => {
  try {
    const adminUser = await prisma.user.findUnique({ 
      where: { id: req.user.userId },
      include: { ownedOrganizations: true }
    });
    if (!adminUser.ownedOrganizations.length) {
      return res.status(400).json({ error: 'You do not own an organization' });
    }

    const { id } = req.params;
    
    // Disconnect from the first owned organization
    await prisma.organization.update({
      where: { id: adminUser.ownedOrganizations[0].id },
      data: { users: { disconnect: { id } } }
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

