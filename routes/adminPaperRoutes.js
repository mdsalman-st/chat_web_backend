import express from 'express';
import fs from 'fs';
import path from 'path';
import OfficialPaper from '../models/OfficialPaper.js';
import { uploadPdf } from '../middleware/uploadPdf.js';
import { requireSubjectAccess } from '../middleware/requireSubjectAccess.js';
import { extractTextFromPdf } from '../services/pdfTextExtractor.js';

// 👇 YAHAN HUMNE TUMHARE MIDDLEWARE IMPORT KIYE HAIN 👇
// (Agar tumhari file mein function ka naam 'protect' ya 'adminOnly' ke alawa kuch aur hai, toh sirf naam change kar lena)
import { protect } from '../middleware/authMiddleware.js'; 
import { adminOnly } from '../middleware/adminMiddleware.js'; 

const router = express.Router();

// ⬇️ 1. PDF UPLOAD ROUTE
router.post(
  '/upload', 
  protect,           // 👈 Login check
  adminOnly,         // 👈 Admin check
  uploadPdf,         // 👈 File upload
  requireSubjectAccess, // 👈 Subject check
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Kripya PDF file upload karein (field name: pdf)' });
      }

      const { 
        title, boardCode, classLevel, subjectCode, subjectName, 
        year, examPhase, medium, setCode 
      } = req.body;

      if (!boardCode || !classLevel || !subjectCode || !subjectName || !year || !examPhase) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({ message: 'Board, Class, Subject, Year, aur Exam Phase zaroori hain.' });
      }

      const newPaper = await OfficialPaper.create({
        boardCode,
        classLevel,
        subjectCode,
        subjectName,
        medium: medium || 'Hindi',
        year: Number(year),
        examPhase,
        setCode: setCode || null,
        fileUrl: `/uploads/papers/${req.file.filename}`,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        status: 'ingested',
        ingestedBy: req.user._id, 
      });

      // Background mein text extract karo
      extractTextFromPdf(req.file.path)
        .then(async (text) => {
          newPaper.extractedText = text;
          await newPaper.save();
        })
        .catch(async (err) => {
          console.error(`[Text Extraction Failed]`, err);
        });

      res.status(201).json({
        message: 'Paper upload ho gaya! AI ke liye text extract ho raha hai.',
        paper: newPaper
      });

    } catch (error) {
      if (req.file) fs.unlink(req.file.path, () => {});
      res.status(500).json({ message: error.message });
    }
  }
);

// ⬇️ 2. GET ROUTE (Admin apne upload kiye hue papers dekhe)
router.get(
  '/', 
  protect, 
  adminOnly, 
  async (req, res) => {
    try {
      const papers = await OfficialPaper.find({ ingestedBy: req.user._id }).sort({ createdAt: -1 });
      res.json({ papers });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

// ⬇️ 3. DELETE ROUTE (Admin apna paper delete kar sake)
router.delete(
  '/:id', 
  protect, 
  adminOnly, 
  async (req, res) => {
    try {
      const paper = await OfficialPaper.findOne({ 
        _id: req.params.id, 
        ingestedBy: req.user._id
      });

      if (!paper) {
        return res.status(404).json({ message: 'Paper nahi mila ya aap ise delete nahi kar sakte.' });
      }

      if (paper.fileUrl) {
        const filePath = path.resolve('.' + paper.fileUrl);
        fs.unlink(filePath, (err) => {
          if (err) console.error('File delete error:', err);
        });
      }

      await paper.deleteOne();
      res.json({ message: 'Paper delete ho gaya!' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

export default router;