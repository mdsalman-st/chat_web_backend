import express from 'express';
import {
  signup,
  login,
  getMe,
  updateDetails,
  updateCredentials,
  checkUsername,
} from '../controllers/authController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.post('/signup', signup);
router.post('/login', login);
router.get('/me', protect, getMe);
router.put('/details', protect, updateDetails);
router.put('/credentials', protect, updateCredentials);
router.get('/check-username/:username', checkUsername);

export default router;