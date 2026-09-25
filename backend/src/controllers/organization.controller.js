const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const crypto = require('crypto');
const { sendOrganizationInvitation } = require('../services/email.service');

const generateOrgCode = () => `BB-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
const generateToken = () => crypto.randomBytes(32).toString('hex');

exports.createOrganization = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Organization name is required' });

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + crypto.randomBytes(2).toString('hex');
    const accessCode = generateOrgCode();

    const organization = await prisma.organization.create({
      data: {
        name,
        description,
        slug,
        accessCode,
        ownerId: req.user.userId,
        users: {
          connect: { id: req.user.userId }
        }
      }
    });

    res.status(201).json({ organization });
  } catch (error) {
    console.error('Create org error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getMyOrganizations = async (req, res) => {
  try {
    const organizations = await prisma.organization.findMany({
      where: {
        users: { some: { id: req.user.userId } }
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        users: { select: { id: true, name: true, email: true } },
        coHosts: { select: { id: true, name: true, email: true } },
        invitations: { 
          where: { status: 'PENDING' },
          select: { id: true, email: true, createdAt: true }
        }
      }
    });
    res.json({ organizations });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.regenerateCode = async (req, res) => {
  try {
    const { id } = req.params;
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only the host can regenerate the code' });

    const newCode = generateOrgCode();
    const updatedOrg = await prisma.organization.update({
      where: { id },
      data: { accessCode: newCode }
    });

    res.json({ accessCode: updatedOrg.accessCode });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.inviteMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { emails } = req.body; // Array of emails
    if (!emails || !Array.isArray(emails)) return res.status(400).json({ error: 'Emails array is required' });

    const org = await prisma.organization.findUnique({ 
      where: { id },
      include: { owner: true, users: true }
    });

    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only the host can invite members' });

    const frontendUrl = process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3001';
    
    const results = [];

    for (const email of emails) {
      // Check if already a member
      const isMember = org.users.some(u => u.email === email);
      if (isMember) {
        return res.status(400).json({ error: `${email} is already a member.` });
      }

      // Check for pending invitation
      const existingInvite = await prisma.organizationInvitation.findFirst({
        where: { email, organizationId: id, status: 'PENDING' }
      });

      if (existingInvite) {
        return res.status(400).json({ error: `Invitation already sent to ${email}.` });
      }

      const token = generateToken();
      const invite = await prisma.organizationInvitation.create({
        data: {
          email,
          organizationId: id,
          token,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
        }
      });

      const inviteLink = `${frontendUrl}/invite/${token}`;
      try {
        await sendOrganizationInvitation(email, org.name, org.owner.name, org.accessCode, inviteLink);
      } catch (emailErr) {
        console.warn('Email send failed (non-fatal):', emailErr.message);
      }

      // Push real-time notification if the invited user is online
      if (global.io) {
        // Find the user by email to get their userId for the socket room
        const invitedUser = await prisma.user.findUnique({ where: { email } });
        if (invitedUser) {
          global.io.to(`user:${invitedUser.id}`).emit('notification:invite', {
            token: invite.token,
            organizationId: org.id,
            organizationName: org.name,
            invitedBy: org.owner.name,
            createdAt: invite.createdAt
          });
        }
      }

      results.push({ email, status: 'invited' });
    }

    res.json({ results });
  } catch (error) {
    console.error('Invite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};


exports.getInvitation = async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await prisma.organizationInvitation.findUnique({
      where: { token },
      include: { organization: { select: { name: true, accessCode: true, owner: { select: { name: true } } } } }
    });

    if (!invite) return res.status(404).json({ error: 'Invitation not found' });
    if (invite.status !== 'PENDING') return res.status(400).json({ error: 'Invitation is no longer valid' });
    if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invitation has expired' });

    res.json({ invitation: invite });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.acceptInvitation = async (req, res) => {
  try {
    const { token } = req.params;
    // Note: This route requires authentication (req.user must exist)
    const invite = await prisma.organizationInvitation.findUnique({ where: { token } });

    if (!invite) return res.status(404).json({ error: 'Invitation not found' });
    if (invite.status !== 'PENDING') return res.status(400).json({ error: 'Invitation is no longer valid' });
    if (invite.expiresAt < new Date()) return res.status(400).json({ error: 'Invitation has expired' });
    
    // Ensure the logged in user's email matches the invitation
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (user.email !== invite.email) {
      return res.status(403).json({ error: 'This invitation was sent to a different email address' });
    }

    // Add user to org and update invite
    await prisma.$transaction([
      prisma.organization.update({
        where: { id: invite.organizationId },
        data: { users: { connect: { id: user.id } } }
      }),
      prisma.organizationInvitation.update({
        where: { id: invite.id },
        data: { status: 'ACCEPTED' }
      })
    ]);

    res.json({ message: 'Successfully joined the organization' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.deleteOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const org = await prisma.organization.findUnique({
      where: { id },
      include: { users: { select: { id: true } } }
    });

    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only the host can delete the organization' });

    // Push real-time notification to every member BEFORE deletion
    if (global.io) {
      org.users.forEach(u => {
        if (u.id !== req.user.userId) { // skip the host themselves
          global.io.to(`user:${u.id}`).emit('notification:org_deleted', {
            organizationId: id,
            organizationName: org.name
          });
        }
      });
    }

    // Delete all invitations, disconnect all users, then delete the org
    await prisma.$transaction([
      prisma.organizationInvitation.deleteMany({ where: { organizationId: id } }),
      prisma.organization.update({ where: { id }, data: { users: { set: [] } } }),
    ]);

    await prisma.organization.delete({ where: { id } });

    res.json({ message: 'Organization deleted successfully' });
  } catch (error) {
    console.error('deleteOrganization error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.leaveOrganization = async (req, res) => {
  try {
    const { id } = req.params;
    const org = await prisma.organization.findUnique({ where: { id } });
    
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId === req.user.userId) return res.status(400).json({ error: 'Owner cannot leave organization' });

    await prisma.organization.update({
      where: { id },
      data: { users: { disconnect: { id: req.user.userId } } }
    });
    res.json({ message: 'Successfully left the organization' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeMember = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const org = await prisma.organization.findUnique({ where: { id } });
    
    if (!org) return res.status(404).json({ error: 'Organization not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only the owner can remove members' });
    if (userId === req.user.userId) return res.status(400).json({ error: 'Cannot remove yourself' });

    await prisma.organization.update({
      where: { id },
      data: { users: { disconnect: { id: userId } } }
    });
    res.json({ message: 'Member removed successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
};
exports.getMyInvitations = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const invitations = await prisma.organizationInvitation.findMany({
      where: {
        email: user.email,
        status: 'PENDING',
        expiresAt: { gt: new Date() }
      },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            accessCode: true,
            owner: { select: { name: true, email: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ invitations });
  } catch (error) {
    console.error('getMyInvitations error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.declineInvitation = async (req, res) => {
  try {
    const { token } = req.params;
    const invite = await prisma.organizationInvitation.findUnique({ where: { token } });

    if (!invite) return res.status(404).json({ error: 'Invitation not found' });
    if (invite.status !== 'PENDING') return res.status(400).json({ error: 'Invitation is no longer valid' });

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (user.email !== invite.email) {
      return res.status(403).json({ error: 'This invitation was not sent to you' });
    }

    await prisma.organizationInvitation.update({
      where: { id: invite.id },
      data: { status: 'CANCELLED' }
    });

    res.json({ message: 'Invitation declined' });
  } catch (error) {
    console.error('declineInvitation error:', error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.addCoHost = async (req, res) => {
  try {
    const { id } = req.params; // org id
    const { userId } = req.body;
    const org = await prisma.organization.findUnique({ where: { id }, include: { coHosts: true } });
    if (!org) return res.status(404).json({ error: 'Org not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only owner can manage co-hosts' });
    
    await prisma.organization.update({
      where: { id },
      data: { coHosts: { connect: { id: userId } } }
    });
    res.json({ message: 'Co-Host added successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.removeCoHost = async (req, res) => {
  try {
    const { id, userId } = req.params;
    const org = await prisma.organization.findUnique({ where: { id } });
    if (!org) return res.status(404).json({ error: 'Org not found' });
    if (org.ownerId !== req.user.userId) return res.status(403).json({ error: 'Only owner can manage co-hosts' });
    
    await prisma.organization.update({
      where: { id },
      data: { coHosts: { disconnect: { id: userId } } }
    });
    res.json({ message: 'Co-Host removed successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

