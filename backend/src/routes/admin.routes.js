const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const adminController = require('../controllers/admin.controller');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

router.use(authMiddleware);

// Middleware to check if user is ORG_ADMIN or PLATFORM_ADMIN
const rbacMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};

router.get('/org/users', rbacMiddleware(['ORG_ADMIN', 'PLATFORM_ADMIN']), adminController.getOrgUsers);
router.post('/org/users', rbacMiddleware(['ORG_ADMIN', 'PLATFORM_ADMIN']), adminController.addOrgUser);
router.delete('/org/users/:id', rbacMiddleware(['ORG_ADMIN', 'PLATFORM_ADMIN']), adminController.removeOrgUser);
router.patch('/org/users/:id/role', rbacMiddleware(['ORG_ADMIN', 'PLATFORM_ADMIN']), adminController.changeUserRole);

router.get('/platform/health', rbacMiddleware(['PLATFORM_ADMIN']), adminController.getSystemHealth);

module.exports = router;

