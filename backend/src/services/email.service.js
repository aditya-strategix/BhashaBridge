const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendOrganizationInvitation = async (email, orgName, hostName, orgCode, inviteLink) => {
  try {
    const data = await resend.emails.send({
      from: 'BhashaBridge <bhashabridge@aditya-kumar.in>',
      to: email,
      subject: `You have been invited to join ${orgName} on BhashaBridge`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h1 style="color: #3b82f6; text-align: center;">BhashaBridge</h1>
          <h2 style="color: #1e293b; text-align: center;">You're invited to join:</h2>
          <h3 style="color: #0f172a; text-align: center; background: #f1f5f9; padding: 10px; border-radius: 4px;">${orgName}</h3>
          
          <p style="color: #334155; text-align: center; font-size: 16px;">
            <strong>${hostName}</strong> has invited you to join this organization.
          </p>
          
          <div style="margin: 30px 0; padding: 20px; background-color: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 4px;">
            <p style="margin: 0; color: #64748b; font-size: 14px;">Organization Code:</p>
            <p style="margin: 5px 0 0; color: #1e293b; font-size: 20px; font-weight: bold; letter-spacing: 2px;">${orgCode}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteLink}" style="background-color: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Click here to join
            </a>
          </div>
          
          <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 40px;">
            If you did not expect this invitation, you can safely ignore this email.
            <br><br>
            &mdash; The BhashaBridge Team
          </p>
        </div>
      `
    });
    return { success: true, data };
  } catch (error) {
    console.error('Error sending invitation email:', error);
    return { success: false, error };
  }
};

const sendPasswordResetOtp = async (email, otp, userName) => {
  try {
    const data = await resend.emails.send({
      from: 'BhashaBridge <bhashabridge@aditya-kumar.in>',
      to: email,
      subject: `${otp} is your BhashaBridge Verification Code`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #FDFBF7; border: 3px solid #0A0A0A; box-shadow: 8px 8px 0 #0A0A0A;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 24px;">
            <div style="width: 14px; height: 14px; background: #FF3311; display: inline-block;"></div>
            <h1 style="color: #0A0A0A; font-family: Georgia, serif; font-style: italic; font-size: 26px; margin: 0; display: inline-block; vertical-align: middle;">BhashaBridge</h1>
          </div>
          
          <h2 style="color: #0A0A0A; font-size: 20px; font-weight: 700; margin: 0 0 12px;">Password Reset Verification</h2>
          <p style="color: #4A4A4A; font-size: 15px; line-height: 1.6; margin: 0 0 20px;">
            Hello ${userName || 'there'},<br>
            We received a request to reset the password for your BhashaBridge account. Please use the verification code below:
          </p>
          
          <div style="background: #F7F5F0; border: 2px solid #0A0A0A; padding: 24px; text-align: center; margin: 24px 0; box-shadow: 4px 4px 0 #0022FF;">
            <p style="margin: 0 0 8px; color: #5A5A5A; font-size: 12px; font-family: monospace; text-transform: uppercase; letter-spacing: 1.5px;">Verification Code (OTP)</p>
            <div style="font-family: monospace; font-size: 38px; font-weight: 800; letter-spacing: 10px; color: #0022FF;">
              ${otp}
            </div>
            <p style="margin: 10px 0 0; color: #777; font-size: 13px; font-family: monospace;">Valid for 10 minutes</p>
          </div>
          
          <p style="color: #666; font-size: 13px; line-height: 1.5; margin: 24px 0 0;">
            Never share this OTP with anyone. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
          </p>
          
          <hr style="border: none; border-top: 1px solid #DDD; margin: 28px 0 16px;">
          <p style="color: #999; font-size: 12px; margin: 0; font-family: monospace;">
            &mdash; The BhashaBridge Team
          </p>
        </div>
      `
    });
    return { success: true, data };
  } catch (error) {
    console.error('Error sending password reset OTP email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendOrganizationInvitation,
  sendPasswordResetOtp
};

