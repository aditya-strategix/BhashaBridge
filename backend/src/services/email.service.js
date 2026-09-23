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

module.exports = {
  sendOrganizationInvitation
};

