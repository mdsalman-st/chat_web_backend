import express from 'express';
import fs from 'fs';
import path from 'path';
import OfficialPaper from '../models/OfficialPaper.js';
import { uploadPdf } from '../middleware/uploadPdf.js';
import { requireSubjectAccess } from '../middleware/requireSubjectAccess.js';
import { extractTextFromPdf } from '../services/pdfTextExtractor.js';
import { parseTextToQuestions } from '../services/pdfParserService.js'; // 👈 NAYA IMPORT
import { v2 as cloudinary } from 'cloudinary';

import { protect } from '../middleware/authMiddleware.js'; 
import { adminOnly } from '../middleware/adminMiddleware.js'; 

const router = express.Router();

router.post(
  '/upload', 
  protect,
  adminOnly,
  uploadPdf,
  requireSubjectAccess,
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'Kripya PDF file upload karein (field name: pdf)' });
      }

      const { boardCode, classLevel, subjectCode, subjectName, year, examPhase, medium, setCode } = req.body;

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
        status: 'processing', // Status abhi processing rakhenge
        ingestedBy: req.user._id, 
      });

      // Background mein text extract karo aur AI se questions banao
      extractTextFromPdf(req.file.path)
        .then(async (text) => {
          newPaper.extractedText = text;
          await newPaper.save();

          if (text && text.length > 50) {
            // 👇 AI ko bhejo text parse karne ke liye 👇
            const parsedQuestions = await parseTextToQuestions(text, subjectName, boardCode, classLevel);
            
            if (parsedQuestions.length > 0) {
              newPaper.questions = parsedQuestions;
              newPaper.totalQuestions = parsedQuestions.length;
              newPaper.totalMarks = parsedQuestions.reduce((sum, q) => sum + (q.marks || 1), 0);
              newPaper.status = 'ingested';
            } else {
              newPaper.status = 'failed'; // AI fail ho gaya
            }
            await newPaper.save();
          }
        })
        .catch(async (err) => {
          console.error(`[Text Extraction Failed]`, err);
          newPaper.status = 'failed';
          await newPaper.save();
        });

      res.status(201).json({
        message: 'Paper upload ho gaya! AI background mein questions extract kar raha hai.',
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

router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const papers = await OfficialPaper.find({ ingestedBy: req.user._id }).sort({ createdAt: -1 });
    res.json({ papers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const paper = await OfficialPaper.findOne({ _id: req.params.id, ingestedBy: req.user._id });
    if (!paper) return res.status(404).json({ message: 'Paper nahi mila ya aap ise delete nahi kar sakte.' });

    if (paper.fileUrl) {
      if (paper.fileUrl.startsWith('http')) {
        const parts = paper.fileUrl.split('/');
        const lastPart = parts.pop();
        const publicId = `nexus_papers/${lastPart.split('.')[0]}`;
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }).catch(() => {});
      } else {
        const filePath = path.resolve('.' + paper.fileUrl);
        fs.unlink(filePath, () => {});
      }
    }

    await paper.deleteOne();
    res.json({ message: 'Paper delete ho gaya!' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;