const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const analyticsController = require('../controllers/analytics.controller');

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

router.get('/:meetingId', analyticsController.getAnalytics);
router.post('/:meetingId/report', analyticsController.generateReport);
router.get('/:meetingId/report', analyticsController.getReport);

module.exports = router;

