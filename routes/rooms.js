import express from 'express';
import {
  createRoom,
  joinRoom,
  getMyRooms,
  getRoom,
  getMessages,
  sendMessage,
  deleteRoom,
} from '../controllers/roomController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All routes need authentication
router.use(protect);

router.post('/', createRoom);
router.post('/join', joinRoom);
router.get('/', getMyRooms);
router.get('/:id', getRoom);
router.get('/:id/messages', getMessages);
router.post('/:id/messages', sendMessage);
router.delete('/:id', deleteRoom);

export default router;