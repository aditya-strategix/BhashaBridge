const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const prisma = require('../prisma');
const { withDbRetry } = require('../prisma');
const { sendPasswordResetOtp } = require('../services/email.service');
const otpService = require('../services/otp.service');

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev';

exports.register = async (req, res) => {
  try {
    const { name, email, password, preferredLanguage } = req.body;
    
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'User already exists' });

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        passwordHash,
        preferredLanguage: preferredLanguage || 'en',
      }
    });

    res.status(201).json({ message: 'User registered successfully', userId: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(400).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) return res.status(400).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { userId: user.id, role: user.role, language: user.preferredLanguage },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, language: user.preferredLanguage, avatar: user.avatar } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { name, preferredLanguage, avatar } = req.body;
    
    const user = await prisma.user.update({
      where: { id: req.user.userId },
      data: { 
        ...(name && { name }),
        ...(preferredLanguage && { preferredLanguage }),
        ...(avatar !== undefined && { avatar })
      }
    });

    const token = jwt.sign(
      { userId: user.id, role: user.role, language: user.preferredLanguage },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user.id, name: user.name, email: user.email, language: user.preferredLanguage, avatar: user.avatar } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.forgotPasswordSendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid email address.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(404).json({ error: 'No account found with this email address.' });
    }

    const rateLimit = await otpService.checkRateLimit(normalizedEmail);
    if (!rateLimit.allowed) {
      return res.status(429).json({
        error: `Please wait ${rateLimit.remainingSeconds}s before requesting another code.`,
        retryAfter: rateLimit.remainingSeconds
      });
    }

    const otp = otpService.generateOtp();
    await otpService.saveOtp(normalizedEmail, otp);

    // Send email via Resend
    const emailResult = await sendPasswordResetOtp(normalizedEmail, otp, user.name);
    if (!emailResult.success) {
      console.warn(`[OTP] Resend email send failed for ${normalizedEmail}. Console fallback OTP: ${otp}`);
    }

    console.log(`[OTP Sent] Password reset OTP generated for ${normalizedEmail}: ${otp}`);

    res.json({
      message: 'A 6-digit verification code has been sent to your email.',
      email: normalizedEmail
    });
  } catch (error) {
    console.error('forgotPasswordSendOtp error:', error);
    res.status(500).json({ error: 'Server error while sending verification code.' });
  }
};

exports.forgotPasswordVerifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ error: 'Email and verification code are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const result = await otpService.verifyOtp(normalizedEmail, otp);
    if (!result.valid) {
      return res.status(400).json({ error: result.error });
    }

    // Issue a short-lived reset token (valid for 10 minutes)
    const resetToken = jwt.sign(
      { email: normalizedEmail, purpose: 'password_reset' },
      JWT_SECRET,
      { expiresIn: '10m' }
    );

    res.json({
      message: 'Code verified successfully.',
      resetToken,
      email: normalizedEmail
    });
  } catch (error) {
    console.error('forgotPasswordVerifyOtp error:', error);
    res.status(500).json({ error: 'Server error while verifying code.' });
  }
};

exports.forgotPasswordReset = async (req, res) => {
  try {
    const { email, otp, resetToken, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    let targetEmail = null;

    if (resetToken) {
      try {
        const decoded = jwt.verify(resetToken, JWT_SECRET);
        if (decoded.purpose !== 'password_reset' || !decoded.email) {
          return res.status(400).json({ error: 'Invalid reset session. Please request a new code.' });
        }
        targetEmail = decoded.email;
      } catch (err) {
        return res.status(400).json({ error: 'Reset session has expired. Please request a new code.' });
      }
    } else if (email && otp) {
      const normalizedEmail = email.trim().toLowerCase();
      const verifyResult = await otpService.verifyOtp(normalizedEmail, otp);
      if (!verifyResult.valid) {
        return res.status(400).json({ error: verifyResult.error });
      }
      targetEmail = normalizedEmail;
    } else {
      return res.status(400).json({ error: 'Verification code or reset token is required.' });
    }

    const user = await prisma.user.findUnique({ where: { email: targetEmail } });
    if (!user) {
      return res.status(404).json({ error: 'User account not found.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash }
    });

    res.json({
      message: 'Your password has been reset successfully! You can now log in.'
    });
  } catch (error) {
    console.error('forgotPasswordReset error:', error);
    res.status(500).json({ error: 'Server error while resetting password.' });
  }
};
