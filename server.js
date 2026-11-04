import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import helmet from 'helmet'; 
import rateLimit from 'express-rate-limit'; 
import mongoSanitize from 'express-mongo-sanitize'; 

import { connectDB } from './config/db.js';
import healthRoute from './routes/health.js';
import authRoute from './routes/auth.js';
import taskRoute from './routes/tasks.js';
import noteRoute from './routes/notes.js';
import testRoute from './routes/tests.js';
import subjectiveRoute from './routes/subjective.js';
import paperRoute from './routes/paper.js';
import adminRoute from './routes/admin.js'; 

// 👇 YAHAN NAYE ROUTES IMPORT KIYE HAIN 👇
import adminPaperRoutes from './routes/adminPaperRoutes.js';
import superAdminPaperRoutes from './routes/superAdminPaperRoutes.js';
import adminExtrasRoutes from './routes/adminExtras.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------- 0. CRITICAL SECURITY FIXES ---------- */
// 1. Trust Proxy: Render/Heroku ke liye zaroori hai, warna Rate Limit kaam nahi karega
app.set('trust proxy', 1);

// 2. Hide Express signature: Hacker ko na pata chale ki backend Express/Node hai
app.disable('x-powered-by');


/* ---------- 1. SECURITY HEADERS (Helmet) ---------- */
app.use(helmet());

/* ---------- 2. CORS (Strict Whitelist - SECURE) ---------- */
const ALLOWED_ORIGINS = [
  'https://chat-web.alimdrahul01.workers.dev',
  'https://chatweb-olive-theta.vercel.app',
  'https://chat-osj33xvvq-majid-d224.vercel.app', // 👈 Naya Vercel URL yahan add kiya
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Postman/Mobile
    
    // Strict check: Sirf list mein maujood URL hi allow hoga
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);

    // Block unknown origins (No server crash, clean 403)
    console.warn(`⚠️ CORS blocked for origin: ${origin}`);
    const corsError = new Error('CORS Policy: This origin is not allowed');
    corsError.status = 403;
    return callback(corsError);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* ---------- 3. BODY PARSERS & SANITIZATION ---------- */
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
// PRO FIX: Prevent NoSQL Injection
app.use(mongoSanitize()); 

/* ---------- 4. RATE LIMITING (Anti-Brute Force) ---------- */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again after 15 minutes' }
});
// Apply rate limit to all requests (especially auth routes)
app.use('/api', limiter);

// Stricter limit for login/signup
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // Only 10 login attempts per 15 mins
  message: { error: 'Too many login attempts. Please try again later.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);

/* ---------- Request logger ---------- */
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
      console.log(`${req.method} ${req.originalUrl} → ${res.statusCode} (${Date.now() - start}ms)`);
    });
    next();
  });
}

/* ---------- Root ---------- */
app.get('/', (req, res) => {
  res.json({
    name: 'Nexus Backend',
    status: 'running',
    version: '1.0.0',
    endpoints: { /* ... */ },
  });
});

/* ---------- Routes ---------- */
app.use('/api/health', healthRoute);
app.use('/api/auth', authRoute);
app.use('/api/tasks', taskRoute);
app.use('/api/notes', noteRoute);
app.use('/api/tests', testRoute);
app.use('/api/subjective', subjectiveRoute);

// 👇 YAHAN NAYE ROUTES ADD KIYE HAIN 👇
app.use('/api/admin/papers', adminPaperRoutes);
app.use('/api/superadmin/papers', superAdminPaperRoutes);
// 👆 YAHAN TAK 👆

// Purane routes waise hi hain
app.use('/api/admin', paperRoute);
app.use('/api/admin', adminRoute);
app.use('/api/admin', adminExtrasRoutes); 
app.use('/api/student', paperRoute);

/* ---------- 404 ---------- */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

/* ---------- Error handler ---------- */
app.use((err, req, res, next) => {
  // CORS rejections ko "Server error" mat bolo — ye expected hain
  if (err.status === 403 && err.message.includes('CORS')) {
    return res.status(403).json({ error: err.message });
  }

  console.error('❌ Server error:', err);
  // Don't leak stack traces in production
  const msg = process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  res.status(err.status || 500).json({ error: msg });
});

/* ---------- Boot ---------- */
async function start() {
  console.log('\n🚀 Starting Nexus Backend...\n');
  await connectDB();
  const httpServer = http.createServer(app);

  httpServer.listen(PORT, () => {
    console.log(`\n✅ Server running on port ${PORT}\n`);
  });
}

start().catch((err) => {
  console.error('❌ Failed to start:', err);
  process.exit(1);
});