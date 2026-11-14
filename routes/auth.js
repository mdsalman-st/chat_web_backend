import express from 'express';
import rateLimit from 'express-rate-limit'; // <-- NAYA
import {
  signup,
  login,
  getMe,
  updateDetails,
  updateCredentials,
  updateProfile,
  forgotPassword,
  resetPassword,
  requestEmailChange,
  verifyEmailChange,
  requestPasswordOtp,
  verifyPasswordOtp,
  getPlatformConfig,
  updatePlatformConfig,
 
  checkUsername,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// ==========================================
// 1. STRICT RATE LIMITING (Sirf Auth Routes Ke Liye)
// ==========================================
const strictAuthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 requests per IP
  message: { error: 'Too many attempts. Please try again after 15 minutes.' },
  standardHeaders: true, 
  legacyHeaders: false,
});

// ==========================================
// 2. INPUT SANITIZATION MIDDLEWARE (XSS & NoSQL Injection se bachne ke liye)
// ==========================================
const sanitizeInput = (req, res, next) => {
  // Agar body me data hai, toh usko clean karo
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        // Remove any HTML tags (<script>, <img>, etc.)
        req.body[key] = req.body[key].replace(/<[^>]*>?/gm, '').trim();
      }
    }
  }
  next();
};

// ==========================================
// 3. ROUTES (With Security Layers)
// ==========================================

// Public Routes (Strictly Limited & Sanitized)
router.post('/signup', strictAuthLimiter, sanitizeInput, signup);
router.post('/login', strictAuthLimiter, sanitizeInput, login);
router.get('/check-username/:username', strictAuthLimiter, sanitizeInput, checkUsername);

// Protected Routes (Requires Login Token)
router.get('/me', protect, getMe);
router.put('/details', protect, sanitizeInput, updateDetails);
router.put('/credentials', protect, sanitizeInput, updateCredentials);

// Admin Profile Update Route
router.put('/profile', protect, sanitizeInput, updateProfile); 


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

export default router;