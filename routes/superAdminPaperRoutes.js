import express from 'express';
import OfficialPaper from '../models/OfficialPaper.js';
import { uploadPdf } from '../middleware/uploadPdf.js';
import { extractTextFromPdf } from '../services/pdfTextExtractor.js';
import { v2 as cloudinary } from 'cloudinary';

import { protect } from '../middleware/authMiddleware.js'; 

const router = express.Router();

const superAdminOnly = (req, res, next) => {
  if (req.user.role !== 'super_admin' && req.user.role !== 'superadmin') {
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

    const { title, boardCode, classLevel, subjectCode, subjectName, year, examPhase, medium, setCode } = req.body;

    if (!boardCode || !classLevel || !subjectCode || !subjectName || !year || !examPhase) {
      await cloudinary.uploader.destroy(req.file.filename, { resource_type: 'raw' });
      return res.status(400).json({ message: 'Board, Class, Subject, Year, aur Exam Phase zaroori hain.' });
    }

    const newPaper = await OfficialPaper.create({
      boardCode, classLevel, subjectCode, subjectName,
      medium: medium || 'Hindi',
      year: Number(year), examPhase, setCode: setCode || null,
      fileUrl: req.file.path, // Cloudinary URL
      originalName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      status: 'ingested',
      ingestedBy: req.user._id, 
    });

    // AI Text Extraction from Cloudinary URL
    fetch(req.file.path)
      .then(res => res.arrayBuffer())
      .then(buffer => extractTextFromPdf(Buffer.from(buffer)))
      .then(async (text) => {
        newPaper.extractedText = text;
        await newPaper.save();
      })
      .catch(err => console.error(`[Text Extraction Failed]`, err));

    res.status(201).json({ message: 'Super Admin: Paper upload ho gaya!', paper: newPaper });

  } catch (error) {
    if (req.file) await cloudinary.uploader.destroy(req.file.filename, { resource_type: 'raw' });
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

    const publicId = paper.fileUrl.split('/').pop().split('.')[0]; 
    await cloudinary.uploader.destroy(`nexus_papers/${publicId}`, { resource_type: 'raw' });

    await paper.deleteOne();
    res.json({ message: 'Super Admin: Paper delete ho gaya!' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;