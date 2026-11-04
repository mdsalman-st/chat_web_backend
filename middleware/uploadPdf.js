import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { v2 as cloudinary } from 'cloudinary';
import { CloudinaryStorage } from 'multer-storage-cloudinary';

dotenv.config();

// Local upload folder path (backend/uploads/papers)
const UPLOAD_DIR = path.resolve('uploads/papers');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// File filter: Only PDF allow
const fileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Sirf PDF files allowed hain!'), false);
  }
};

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
    cb(null, uniqueName);
  },
});

let storage = diskStorage;

// If Cloudinary credentials exist, configure CloudinaryStorage
if (
  process.env.CLOUDINARY_CLOUD_NAME &&
  process.env.CLOUDINARY_API_KEY &&
  process.env.CLOUDINARY_API_SECRET
) {
  try {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });

    storage = new CloudinaryStorage({
      cloudinary: cloudinary,
      params: {
        folder: 'nexus_papers',
        resource_type: 'raw',
        format: async () => 'pdf',
        public_id: (req, file) => {
          const nameWithoutExt = path.parse(file.originalname).name.replace(/[^a-zA-Z0-9_-]/g, '_');
          return `${Date.now()}-${nameWithoutExt}`;
        },
      },
    });
  } catch (err) {
    console.warn('⚠️ CloudinaryStorage initialization fallback to diskStorage:', err.message);
    storage = diskStorage;
  }
}

export const uploadPdf = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // Max 20 MB limit
  },
}).single('pdf');
