'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Mail, KeyRound, CheckCircle2, ArrowLeft, RefreshCw, Lock } from 'lucide-react';
import api from '../../../services/api';
import styles from '../auth.module.css';

export default function ForgotPassword() {
  const router = useRouter();

  // Steps: 'EMAIL' | 'OTP' | 'PASSWORD' | 'SUCCESS'
  const [step, setStep] = useState('EMAIL');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Resend OTP countdown timer
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // Step 1: Send OTP
  const handleSendOtp = async (e) => {
    e?.preventDefault();
    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await api.post('/auth/forgot-password/send-otp', {
        email: email.trim()
      });
      setSuccessMsg(res.data.message || 'Verification code sent to your email.');
      setStep('OTP');
      setCountdown(60);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send verification code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Resend OTP handler
  const handleResendOtp = async () => {
    if (countdown > 0 || isLoading) return;
    await handleSendOtp();
  };

  // Step 2: Verify OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) {
      setError('Please enter the 6-digit verification code.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await api.post('/auth/forgot-password/verify-otp', {
        email: email.trim(),
        otp: otp.trim()
      });
      setResetToken(res.data.resetToken);
      setSuccessMsg('Code verified! Please create your new password.');
      setStep('PASSWORD');
    } catch (err) {
      setError(err.response?.data?.error || 'Invalid or expired code. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Step 3: Set New Password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please re-enter.');
      return;
    }

    setIsLoading(true);

    try {
      const res = await api.post('/auth/forgot-password/reset', {
        resetToken,
        email: email.trim(),
        otp: otp.trim(),
        newPassword
      });
      setSuccessMsg(res.data.message || 'Password reset successfully.');
      setStep('SUCCESS');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to reset password. Please start over.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={styles.editorialAuthContainer}>
      <div className={styles.editorialAuthWrapper}>
        <h1 className={styles.sharpTitle}>Recovery</h1>
        <div className={styles.thickRule}></div>

        {error && <div className={styles.editorialError}>{error}</div>}
        {successMsg && step !== 'SUCCESS' && (
          <div className={styles.editorialSuccess}>{successMsg}</div>
        )}

        {/* STEP 1: ENTER EMAIL */}
        {step === 'EMAIL' && (
          <form onSubmit={handleSendOtp} className={styles.editorialForm}>
            <p className={styles.editorialInstruction}>
              Enter the email address associated with your BhashaBridge account. We will send you a 6-digit verification code.
            </p>
            <div className={styles.formGroup}>
              <label className={styles.editorialLabel}>Registered Email</label>
              <input
                type="email"
                className={styles.editorialInput}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null); }}
                placeholder="you@example.com"
                required
                autoFocus
              />
            </div>
            <button type="submit" className={styles.editorialBtn} disabled={isLoading}>
              {isLoading ? 'Sending Code...' : 'Send Verification Code'}
            </button>
          </form>
        )}

        {/* STEP 2: ENTER OTP */}
        {step === 'OTP' && (
          <form onSubmit={handleVerifyOtp} className={styles.editorialForm}>
            <div className={styles.editorialInfoBox}>
              <div>Verification code sent to: <strong>{email}</strong></div>
              <button
                type="button"
                onClick={() => { setStep('EMAIL'); setError(null); setSuccessMsg(null); }}
                className={styles.editorialLink}
                style={{ display: 'inline-block', marginTop: '0.5rem', fontSize: '0.75rem', textDecoration: 'underline' }}
              >
                &larr; Change email address
              </button>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.editorialLabel}>6-Digit Verification Code (OTP)</label>
              <input
                type="text"
                className={styles.editorialInput}
                value={otp}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setOtp(val);
                  setError(null);
                }}
                placeholder="123456"
                maxLength={6}
                required
                autoFocus
                style={{ letterSpacing: '0.3em', fontWeight: 700 }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className={styles.editorialLabel} style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                Didn&apos;t receive code?
              </span>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={countdown > 0 || isLoading}
                className={styles.editorialLink}
                style={{
                  fontSize: '0.75rem',
                  cursor: countdown > 0 ? 'default' : 'pointer',
                  opacity: countdown > 0 ? 0.5 : 1
                }}
              >
                {countdown > 0 ? `Resend code (${countdown}s)` : 'Resend code'}
              </button>
            </div>

            <button type="submit" className={styles.editorialBtn} disabled={isLoading || otp.length < 6}>
              {isLoading ? 'Verifying...' : 'Verify Code'}
            </button>
          </form>
        )}

        {/* STEP 3: CREATE NEW PASSWORD */}
        {step === 'PASSWORD' && (
          <form onSubmit={handleResetPassword} className={styles.editorialForm}>
            <p className={styles.editorialInstruction}>
              Identity verified. Choose a strong new password for your account.
            </p>

            <div className={styles.formGroup}>
              <label className={styles.editorialLabel}>New Password</label>
              <input
                type="password"
                className={styles.editorialInput}
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setError(null); }}
                placeholder="At least 6 characters"
                required
                autoFocus
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.editorialLabel}>Confirm New Password</label>
              <input
                type="password"
                className={styles.editorialInput}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                placeholder="Repeat new password"
                required
              />
            </div>

            <button type="submit" className={styles.editorialBtn} disabled={isLoading}>
              {isLoading ? 'Updating Password...' : 'Save New Password'}
            </button>
          </form>
        )}

        {/* STEP 4: SUCCESS */}
        {step === 'SUCCESS' && (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ width: 64, height: 64, background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem', borderRadius: '50%' }}>
              <CheckCircle2 size={36} />
            </div>
            <h2 className={styles.sharpTitle} style={{ fontSize: '2.5rem', margin: '0 0 1rem' }}>
              Restored
            </h2>
            <p className={styles.editorialInstruction} style={{ textAlign: 'center', marginBottom: '2rem' }}>
              Your password has been updated successfully. You can now log in using your new credentials.
            </p>
            <button
              onClick={() => router.push('/login')}
              className={styles.editorialBtn}
              style={{ width: '100%', display: 'block', textDecoration: 'none' }}
            >
              Enter System &rarr;
            </button>
          </div>
        )}

        <div className={styles.thinRule}></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Link href="/login" className={styles.editorialLink} style={{ textAlign: 'left', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
            &larr; Back to Login
          </Link>
          <Link href="/register" className={styles.editorialLink}>
            Register New Account
          </Link>
        </div>
      </div>
    </div>
  );
}

