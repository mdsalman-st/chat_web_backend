import express from 'express';
import {
  getNotes,
  createNote,
  getNote,
  updateNote,
  togglePin,
  deleteNote,
  getNoteStats,
} from '../controllers/noteController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/stats', getNoteStats);
router.get('/', getNotes);
router.post('/', createNote);
router.get('/:id', getNote);
router.put('/:id', updateNote);
router.patch('/:id/pin', togglePin);
router.delete('/:id', deleteNote);

export default router;