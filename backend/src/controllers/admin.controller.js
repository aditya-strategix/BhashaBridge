const prisma = require('../prisma');
const { withDbRetry } = require('../prisma');

exports.getOrgUsers = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ 
      where: { id: req.user.userId },
      include: { ownedOrganizations: { include: { users: true } } }
    });
    
    if (!user || !user.ownedOrganizations || !user.ownedOrganizations.length) {
      return res.json({ users: [] });
    }

    // Aggregate users across all owned orgs
    const userMap = new Map();
    user.ownedOrganizations.forEach(org => {
      (org.users || []).forEach(u => {
        if (!userMap.has(u.id)) {
          userMap.set(u.id, { id: u.id, name: u.name, email: u.email, role: u.role });
        }
      });
    });

    res.json({ users: Array.from(userMap.values()) });
  } catch (error) {
    console.error('getOrgUsers error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.addOrgUser = async (req, res) => {
  try {
    const adminUser = await prisma.user.findUnique({ 
      where: { id: req.user.userId },
      include: { ownedOrganizations: true } 
    });
    if (!adminUser || !adminUser.ownedOrganizations || !adminUser.ownedOrganizations.length) {
      return res.status(400).json({ error: 'You do not own an organization' });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

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
    console.error('addOrgUser error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeOrgUser = async (req, res) => {
  try {
    const adminUser = await prisma.user.findUnique({ 
      where: { id: req.user.userId },
      include: { ownedOrganizations: true }
    });
    if (!adminUser || !adminUser.ownedOrganizations || !adminUser.ownedOrganizations.length) {
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
    console.error('removeOrgUser error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.changeUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;
    
    const validRoles = ['HOST', 'PARTICIPANT', 'ORG_ADMIN', 'PLATFORM_ADMIN'];
    if (!role || !validRoles.includes(role)) {
      return res.status(400).json({ error: 'Invalid user role specified' });
    }

    await prisma.user.update({
      where: { id },
      data: { role }
    });
    res.json({ message: 'User role updated' });
  } catch (error) {
    console.error('changeUserRole error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getSystemHealth = async (req, res) => {
  try {
    const activeMeetings = await prisma.meeting.count({ where: { state: 'ONGOING' } });
    res.json({ status: 'Healthy', activeMeetings, uptime: process.uptime() });
  } catch (error) {
    console.error('getSystemHealth error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};
