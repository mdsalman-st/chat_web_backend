import express from 'express';
import {
  getTasks,
  createTask,
  getTask,
  updateTask,
  toggleTask,
  deleteTask,
  getTaskStats,
} from '../controllers/taskController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All task routes require authentication
router.use(protect);

router.get('/stats', getTaskStats);
router.get('/', getTasks);
router.post('/', createTask);
router.get('/:id', getTask);
router.put('/:id', updateTask);
router.patch('/:id/toggle', toggleTask);
router.delete('/:id', deleteTask);

export default router;