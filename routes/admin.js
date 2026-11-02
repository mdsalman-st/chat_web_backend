import express from 'express';
import { getUsers, promoteToAdmin } from '../controllers/adminController.js';
// Agar tumhare paas protect middleware hai toh isko import karo (jo check karta hai login hai ya nahi)
import { protect } from '../middleware/authMiddleware.js'; 

const router = express.Router();

// ==========================================
// USER MANAGEMENT ROUTES (Plan B)
// ==========================================

// 1. Saare students ki list laane ke liye
router.get('/users', protect, getUsers);

// 2. Kisi student ko Admin banane ke liye
router.put('/users/:userId/promote', protect, promoteToAdmin);

// ==========================================
// (Optional) Baaki Admin Routes Yahan Add Kar Sakte Ho
// ==========================================
// Jaise: router.post('/papers/ingest', protect, ingestPaper);
// Note: Tumhare testController me pehle se admin routes hain, 
// agar wo routes/tests.js me hain toh unhe yahan move karne ki zaroorat nahi hai.

export default router;