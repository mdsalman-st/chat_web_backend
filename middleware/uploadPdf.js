import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Upload folder path set karna (backend/uploads/papers)
const UPLOAD_DIR = path.resolve('uploads/papers');

// Agar folder exist nahi karta, toh create karo
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Storage engine configure karna
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Unique filename: timestamp + random hex + .pdf
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  },
});

// File filter: Sirf PDF allow karna
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Sirf PDF files allowed hain!'), false);
  }
};

// Multer instance export karna
// .single('pdf') ka matlab frontend se field ka naam 'pdf' hona chahiye
export const uploadPdf = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // Max 20 MB limit
  },
}).single('pdf');