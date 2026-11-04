import express from 'express';
import fs from 'fs';
import path from 'path';
import OfficialPaper from '../models/OfficialPaper.js';
import { uploadPdf } from '../middleware/uploadPdf.js';
import { extractTextFromPdf } from '../services/pdfTextExtractor.js';
import { v2 as cloudinary } from 'cloudinary';
import { protect } from '../middleware/authMiddleware.js'; 

const router = express.Router();

const superAdminOnly = (req, res, next) => {
  if (
    req.user.role !== 'super_admin' && 
    req.user.role !== 'superadmin' && 
    !(req.user.role === 'admin' && !req.user.assignedSubject)
  ) {
    return res.status(403).json({ message: 'Access Denied. Sirf Super Admin hi ye kaam kar sakta hai.' });
  }
  next();
};

// ⬇️ 1. UPLOAD (No subject restrictions)
router.post('/upload', protect, superAdminOnly, uploadPdf, async (req, res) => {
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
      status: 'ingested',
      ingestedBy: req.user._id, 
    });

    // AI Text Extraction (handles both Cloudinary URL and local path)
    extractTextFromPdf(req.file.path)
      .then(async (text) => {
        newPaper.extractedText = text;
        await newPaper.save();
      })
      .catch(err => console.error(`[Text Extraction Failed]`, err));

    res.status(201).json({ message: 'Super Admin: Paper upload ho gaya!', paper: newPaper });

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
});

// ⬇️ 2. GET (Saare papers)
router.get('/', protect, superAdminOnly, async (req, res) => {
  try {
    const papers = await OfficialPaper.find()
      .populate('ingestedBy', 'name email role')
      .sort({ createdAt: -1 });
    res.json({ papers });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ⬇️ 3. DELETE (Kisi ka bhi)
router.delete('/:id', protect, superAdminOnly, async (req, res) => {
  try {
    const paper = await OfficialPaper.findById(req.params.id);
    if (!paper) return res.status(404).json({ message: 'Paper nahi mila.' });

    if (paper.fileUrl) {
      if (paper.fileUrl.startsWith('http')) {
        const parts = paper.fileUrl.split('/');
        const lastPart = parts.pop();
        const publicId = `nexus_papers/${lastPart.split('.')[0]}`;
        await cloudinary.uploader.destroy(publicId, { resource_type: 'raw' }).catch(() => {});
      } else {
        const localPath = path.resolve('.' + paper.fileUrl);
        fs.unlink(localPath, () => {});
      }
    }

    await paper.deleteOne();
    res.json({ message: 'Super Admin: Paper delete ho gaya!' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
