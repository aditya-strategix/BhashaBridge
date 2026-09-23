const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const meetingController = require('../controllers/meeting.controller');

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

router.use(authMiddleware);

router.post('/', meetingController.createMeeting);
router.get('/', meetingController.getMeetings);
router.post('/join/:link', meetingController.joinMeeting);
router.post('/:link/end', meetingController.endMeeting);
router.delete('/:id', meetingController.deleteMeeting);
router.post('/:link/admit', meetingController.admitParticipant);
router.post('/:link/reject', meetingController.rejectParticipant);
router.post('/:link/cohost', meetingController.assignCoHost);
router.delete('/:link/cohost/:userId', meetingController.removeCoHost);
router.get('/:link/transcript', meetingController.getTranscript);

module.exports = router;
