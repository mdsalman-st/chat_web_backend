import express from 'express';
import fs from 'fs';
import path from 'path';
import OfficialPaper from '../models/OfficialPaper.js';
import { uploadPdf } from '../middleware/uploadPdf.js';
import { requireSubjectAccess } from '../middleware/requireSubjectAccess.js';
import { extractTextFromPdf } from '../services/pdfTextExtractor.js';
import { v2 as cloudinary } from 'cloudinary';

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
        boardCode, classLevel, subjectCode, subjectName, 
        year, examPhase, medium, setCode 
      } = req.body;

      if (!boardCode || !classLevel || !subjectCode || !subjectName || !year || !examPhase) {
        if (req.file.path && req.file.path.startsWith('http')) {
          await cloudinary.uploader.destroy(req.file.filename, { resource_type: 'raw' }).catch(() => {});
        } else if (req.file.path) {
          fs.unlink(req.file.path, () => {});
        }
        return res.status(400).json({ message: 'Board, Class, Subject, Year, aur Exam Phase zaroori hain.' });
      }

      const fileUrl = (req.file.path && (req.file.path.startsWith('http://') || req.file.path.startsWith('https://')))
        ? req.file.path
        : `/uploads/papers/${req.file.filename}`;

      const newPaper = await OfficialPaper.create({
        boardCode,
        classLevel,
        subjectCode,
        subjectName,
        medium: medium || 'Hindi',
        year: Number(year),
        examPhase,
        setCode: setCode || null,
        fileUrl,
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
        status: 'ingested',
        ingestedBy: req.user._id, 
      });

      // Background mein text extract karo (handles both URL and local path)
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
      if (req.file) {
        if (req.file.path && req.file.path.startsWith('http')) {
          await cloudinary.uploader.destroy(req.file.filename, { resource_type: 'raw' }).catch(() => {});
        } else if (req.file.path) {
          fs.unlink(req.file.path, () => {});
        }
      }
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
        if (paper.fileUrl.startsWith('http')) {
          const parts = paper.fileUrl.split('/');
          const lastPart = parts.pop();
          const publicId = `nexus_papers/${lastPart.split('.')[0]}`;
          await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }).catch(() => {});
        } else {
          const filePath = path.resolve('.' + paper.fileUrl);
          fs.unlink(filePath, (err) => {
            if (err) console.error('File delete error:', err);
          });
        }
      }

      await paper.deleteOne();
      res.json({ message: 'Paper delete ho gaya!' });
    } catch (error) {
      res.status(500).json({ message: error.message });
    }
  }
);

export default router;
