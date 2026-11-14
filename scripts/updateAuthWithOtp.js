import fs from 'fs';

const controllerPath = 'd:/nexus/backend/controllers/authController.js';
let controller = fs.readFileSync(controllerPath, 'utf8');

// 1. Add mailer and PlatformConfig import
if (!controller.includes('sendOtpEmail')) {
  controller = `import { sendOtpEmail } from '../utils/mailer.js';\nimport PlatformConfig from '../models/PlatformConfig.js';\n` + controller;
}

// 2. Add controller functions
const newFunctions = `
/* --------------------------------------------------------------------------
   POST /api/auth/forgot-password (Public)
   -------------------------------------------------------------------------- */
export async function forgotPassword(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+resetOtp +resetOtpExpiry');
    if (!user) {
      // Don't reveal user existence, return polite success
      return res.json({ success: true, message: 'If this email is registered, a 6-digit OTP has been sent.' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOtp = otp;
    user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    const mailResult = await sendOtpEmail(user.email, otp, 'password_reset');

    res.json({
      success: true,
      message: 'A 6-digit verification OTP has been sent to your email.',
      ...(process.env.NODE_ENV !== 'production' || mailResult.method === 'mock' ? { devOtp: otp } : {})
    });
  } catch (err) {
    console.error('forgotPassword error:', err);
    res.status(500).json({ error: 'Failed to process password reset request' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/auth/reset-password (Public)
   -------------------------------------------------------------------------- */
export async function resetPassword(req, res) {
  try {
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'Email, OTP, and new password are required' });
    }

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        error: 'Password must be 8+ chars with at least 1 Uppercase, 1 Lowercase, 1 Number & 1 Special character (@$!%*?&#)'
      });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+resetOtp +resetOtpExpiry +passwordHash +salt');
    if (!user || !user.resetOtp || !user.resetOtpExpiry) {
      return res.status(400).json({ error: 'Invalid or expired OTP request. Please request a new OTP.' });
    }

    if (new Date() > user.resetOtpExpiry) {
      return res.status(400).json({ error: 'OTP has expired. Please request a fresh OTP.' });
    }

    if (user.resetOtp !== otp.trim()) {
      return res.status(400).json({ error: 'Incorrect OTP entered. Please check and try again.' });
    }

    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(newPassword + PEPPER, salt);

    user.passwordHash = passwordHash;
    user.salt = salt;
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    user.loginAttempts = 0;
    user.lockUntil = null;
    await user.save();

    res.json({
      success: true,
      message: 'Your password has been reset successfully! You can now sign in.'
    });
  } catch (err) {
    console.error('resetPassword error:', err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/auth/request-email-change (Protected)
   -------------------------------------------------------------------------- */
export async function requestEmailChange(req, res) {
  try {
    const { newEmail } = req.body;
    if (!newEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      return res.status(400).json({ error: 'Valid new email address is required' });
    }

    const formatted = newEmail.toLowerCase().trim();
    if (formatted === req.user.email) {
      return res.status(400).json({ error: 'New email must be different from current email' });
    }

    const existing = await User.findOne({ email: formatted });
    if (existing) {
      return res.status(400).json({ error: 'This email is already registered with another account' });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const user = await User.findById(req.user._id).select('+resetOtp +resetOtpExpiry +pendingEmail');
    user.pendingEmail = formatted;
    user.resetOtp = otp;
    user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const mailResult = await sendOtpEmail(formatted, otp, 'email_change');

    res.json({
      success: true,
      message: 'Verification OTP sent to ' + formatted,
      ...(process.env.NODE_ENV !== 'production' || mailResult.method === 'mock' ? { devOtp: otp } : {})
    });
  } catch (err) {
    console.error('requestEmailChange error:', err);
    res.status(500).json({ error: 'Failed to request email change' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/auth/verify-email-change (Protected)
   -------------------------------------------------------------------------- */
export async function verifyEmailChange(req, res) {
  try {
    const { otp } = req.body;
    if (!otp) return res.status(400).json({ error: 'OTP is required' });

    const user = await User.findById(req.user._id).select('+resetOtp +resetOtpExpiry +pendingEmail');
    if (!user || !user.pendingEmail || !user.resetOtp) {
      return res.status(400).json({ error: 'No pending email change request found' });
    }

    if (new Date() > user.resetOtpExpiry) {
      return res.status(400).json({ error: 'OTP has expired. Please request a new one.' });
    }

    if (user.resetOtp !== otp.trim()) {
      return res.status(400).json({ error: 'Incorrect OTP' });
    }

    const oldEmail = user.email;
    user.email = user.pendingEmail;
    user.pendingEmail = null;
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    await user.save();

    res.json({
      success: true,
      message: 'Email address updated successfully from ' + oldEmail + ' to ' + user.email,
      email: user.email
    });
  } catch (err) {
    console.error('verifyEmailChange error:', err);
    res.status(500).json({ error: 'Failed to verify email change' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/auth/request-password-otp (Protected - Sub Admin / Super Admin)
   -------------------------------------------------------------------------- */
export async function requestPasswordOtp(req, res) {
  try {
    const user = await User.findById(req.user._id).select('+resetOtp +resetOtpExpiry');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetOtp = otp;
    user.resetOtpExpiry = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const mailResult = await sendOtpEmail(user.email, otp, 'admin_password_change');

    res.json({
      success: true,
      message: 'Verification OTP sent to ' + user.email,
      ...(process.env.NODE_ENV !== 'production' || mailResult.method === 'mock' ? { devOtp: otp } : {})
    });
  } catch (err) {
    console.error('requestPasswordOtp error:', err);
    res.status(500).json({ error: 'Failed to send password reset OTP' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/auth/verify-password-otp (Protected - Sub Admin / Super Admin)
   -------------------------------------------------------------------------- */
export async function verifyPasswordOtp(req, res) {
  try {
    const { otp, newPassword } = req.body;
    if (!otp || !newPassword) return res.status(400).json({ error: 'OTP and new password are required' });

    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({
        error: 'Password must be 8+ chars with at least 1 Uppercase, 1 Lowercase, 1 Number & 1 Special character'
      });
    }

    const user = await User.findById(req.user._id).select('+resetOtp +resetOtpExpiry +passwordHash +salt');
    if (!user || !user.resetOtp) {
      return res.status(400).json({ error: 'No active password change OTP found' });
    }

    if (new Date() > user.resetOtpExpiry) {
      return res.status(400).json({ error: 'OTP expired. Please request a new one.' });
    }

    if (user.resetOtp !== otp.trim()) {
      return res.status(400).json({ error: 'Incorrect OTP' });
    }

    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(newPassword + PEPPER, salt);

    user.passwordHash = passwordHash;
    user.salt = salt;
    user.resetOtp = null;
    user.resetOtpExpiry = null;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully with OTP verification!'
    });
  } catch (err) {
    console.error('verifyPasswordOtp error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/auth/platform-config (Public)
   -------------------------------------------------------------------------- */
export async function getPlatformConfig(req, res) {
  try {
    let cfg = await PlatformConfig.findOne({ key: 'default_platform_config' });
    if (!cfg) {
      cfg = await PlatformConfig.create({ key: 'default_platform_config' });
    }
    res.json({ success: true, config: cfg });
  } catch (err) {
    console.error('getPlatformConfig error:', err);
    res.status(500).json({ error: 'Failed to get platform configuration' });
  }
}

/* --------------------------------------------------------------------------
   PUT /api/auth/platform-config (Protected - Admin only)
   -------------------------------------------------------------------------- */
export async function updatePlatformConfig(req, res) {
  try {
    if (req.user.role !== 'super_admin' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Super Admin only' });
    }

    const { socialLinks, supportEmail, supportPhone, announcement } = req.body;
    let cfg = await PlatformConfig.findOne({ key: 'default_platform_config' });
    if (!cfg) {
      cfg = new PlatformConfig({ key: 'default_platform_config' });
    }

    if (socialLinks) {
      cfg.socialLinks = { ...cfg.socialLinks, ...socialLinks };
    }
    if (supportEmail) cfg.supportEmail = supportEmail.trim();
    if (supportPhone) cfg.supportPhone = supportPhone.trim();
    if (announcement !== undefined) cfg.announcement = announcement;

    await cfg.save();
    res.json({ success: true, message: 'Platform settings saved successfully', config: cfg });
  } catch (err) {
    console.error('updatePlatformConfig error:', err);
    res.status(500).json({ error: 'Failed to update platform configuration' });
  }
}
`;

if (!controller.includes('forgotPassword')) {
  controller += '\n' + newFunctions;
  fs.writeFileSync(controllerPath, controller, 'utf8');
  console.log('authController.js updated with OTP and PlatformConfig logic!');
}

// 3. Update routes/auth.js
const routePath = 'd:/nexus/backend/routes/auth.js';
let route = fs.readFileSync(routePath, 'utf8');

const routeImports = `  forgotPassword,
  resetPassword,
  requestEmailChange,
  verifyEmailChange,
  requestPasswordOtp,
  verifyPasswordOtp,
  getPlatformConfig,
  updatePlatformConfig,
`;

if (!route.includes('forgotPassword')) {
  route = route.replace('updateProfile,', 'updateProfile,\n' + routeImports);
  
  const newRoutes = `
// Public Password Reset & Config Routes
router.post('/forgot-password', strictAuthLimiter, sanitizeInput, forgotPassword);
router.post('/reset-password', strictAuthLimiter, sanitizeInput, resetPassword);
router.get('/platform-config', getPlatformConfig);

// Protected Email & Password Change with OTP
router.post('/request-email-change', protect, strictAuthLimiter, sanitizeInput, requestEmailChange);
router.post('/verify-email-change', protect, strictAuthLimiter, sanitizeInput, verifyEmailChange);
router.post('/request-password-otp', protect, strictAuthLimiter, sanitizeInput, requestPasswordOtp);
router.post('/verify-password-otp', protect, strictAuthLimiter, sanitizeInput, verifyPasswordOtp);
router.put('/platform-config', protect, sanitizeInput, updatePlatformConfig);
`;

  route = route.replace('export default router;', newRoutes + '\nexport default router;');
  fs.writeFileSync(routePath, route, 'utf8');
  console.log('routes/auth.js updated with new OTP routes!');
}
