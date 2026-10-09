const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const meetingController = require('../controllers/meeting.controller');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader ? authHeader.split(' ')[1] : (req.query?.token || req.body?.token);
  if (!token) return res.status(401).json({ error: 'No token provided' });
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
router.post('/:link/leave-waiting', meetingController.leaveWaitingRoom);
router.delete('/:id', meetingController.deleteMeeting);
router.post('/:link/admit', meetingController.admitParticipant);
router.post('/:link/reject', meetingController.rejectParticipant);
router.post('/:link/cohost', meetingController.assignCoHost);
router.delete('/:link/cohost/:userId', meetingController.removeCoHost);
router.get('/:link/transcript', meetingController.getTranscript);
router.get('/:link/summary', meetingController.getSummary);

router.delete('/:link/participant/:userId', meetingController.removeParticipant);
router.get('/:link/participants', meetingController.getParticipants);
router.post('/:link/invite', meetingController.sendEmailInvite);

module.exports = router;
