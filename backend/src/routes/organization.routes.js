const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const orgController = require('../controllers/organization.controller');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Public route to view invite details
router.get('/invite/:token', orgController.getInvitation);

// Authenticated routes
router.use(authMiddleware);

router.post('/', orgController.createOrganization);
router.get('/my', orgController.getMyOrganizations);
router.get('/my-invites', orgController.getMyInvitations);
router.post('/:id/regenerate-code', orgController.regenerateCode);
router.post('/:id/invite', orgController.inviteMembers);
router.post('/invite/:token/accept', orgController.acceptInvitation);
router.post('/invite/:token/decline', orgController.declineInvitation);
router.delete('/:id/leave', orgController.leaveOrganization);
router.delete('/:id/members/:userId', orgController.removeMember);
router.delete('/:id', orgController.deleteOrganization);

module.exports = router;
