import express from 'express';
import { protect } from '../middleware/authMiddleware.js'; // Ensure path is correct
import { 
  getAdminStats, 
  getUsers, 
  promoteToAdmin, 
  revokeAdmin,
  addNewBoard,
  getFlaggedQuestions,
  resolveFlag
} from '../controllers/adminController.js';

const router = express.Router();

// ==========================================
// ALL ROUTES PROTECTED BY AUTH MIDDLEWARE
// ==========================================
router.use(protect);

// 1. Stats & Dashboard
router.get('/stats', getAdminStats);

// 2. User Management
router.get('/users', getUsers);
router.put('/users/:userId/promote', promoteToAdmin);
router.put('/users/:userId/revoke', revokeAdmin);

// 3. Board Management
router.post('/boards', addNewBoard);

// 4. Flags Management
router.get('/flags', getFlaggedQuestions);
router.post('/flags/:flagId/resolve', resolveFlag);

export default router;