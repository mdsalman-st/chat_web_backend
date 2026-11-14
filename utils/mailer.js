/**
 * ============================================================================
 * MAILER UTILITY — Nexus OTP & Notification Delivery
 * ============================================================================
 */

export async function sendOtpEmail(toEmail, otp, type = 'password_reset') {
  const titles = {
    'password_reset': 'Your Password Reset OTP',
    'email_change': 'Verify Your New Email Address',
    'admin_password_change': 'Security Alert: Password Change Request'
  };

  const subject = titles[type] || 'Your Nexus Verification Code';

  console.log(`\n=================================================`);
  console.log(`🔐 [NEXUS OTP SERVICE]`);
  console.log(`📩 To: ${toEmail}`);
  console.log(`🔑 OTP Code: ${otp}`);
  console.log(`⏳ Valid for: 10 Minutes`);
  console.log(`🎯 Purpose: ${subject}`);
  console.log(`=================================================\n`);

  // If SMTP environment variables are configured, attempt delivery
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;

  if (smtpUser && smtpPass) {
    try {
      // Optional dynamic import of nodemailer if user configures SMTP
      const nodemailer = await import('nodemailer');
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      await transporter.sendMail({
        from: `"Nexus Education" <${smtpUser}>`,
        to: toEmail,
        subject: `[Nexus] ${subject}: ${otp}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 25px; border-radius: 12px; background: #05070d; color: #f8fafc; border: 1px solid #1e293b;">
            <div style="text-align: center; margin-bottom: 20px;">
              <h2 style="color: #22d3ee; margin: 0;">⚡ Nexus Education</h2>
              <p style="color: #94a3b8; font-size: 13px;">Adaptive AI Exam Preparation</p>
            </div>
            <p style="font-size: 15px; color: #cbd5e1;">Hello,</p>
            <p style="font-size: 14px; color: #94a3b8; line-height: 1.5;">You requested a verification code for <strong>${subject}</strong>. Enter the OTP below to complete the verification:</p>
            <div style="text-align: center; margin: 30px 0;">
              <span style="display: inline-block; font-size: 32px; font-weight: 900; letter-spacing: 8px; color: #22d3ee; background: rgba(34, 211, 238, 0.1); padding: 12px 24px; border-radius: 10px; border: 1px solid rgba(34, 211, 238, 0.3);">${otp}</span>
            </div>
            <p style="font-size: 12px; color: #64748b; text-align: center;">This OTP is valid for 10 minutes. If you did not request this, please ignore this email or contact support.</p>
          </div>
        `
      });
      return { sent: true, method: 'smtp' };
    } catch (err) {
      console.warn('⚠️ SMTP send error, fell back to console log:', err.message);
      return { sent: false, method: 'console', otp };
    }
  }

  // Without SMTP keys, returns safe delivery confirmation
  return { sent: true, method: 'mock', otp };
}
