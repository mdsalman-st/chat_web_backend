import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';

import { connectDB } from './config/db.js';
import healthRoute from './routes/health.js';
import authRoute from './routes/auth.js';
import taskRoute from './routes/tasks.js';
import noteRoute from './routes/notes.js';
import testRoute from './routes/tests.js';
import subjectiveRoute from './routes/subjective.js';
import paperRoute from './routes/paper.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------- CORS ---------- */
const ALLOWED_ORIGINS = [
  'https://chat-web.alimdrahul01.workers.dev',
  'http://localhost:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps, curl, Postman)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    // Fallback: allow all (dev-friendly)
    return callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* ---------- Body parsers ---------- */
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      tasks: '/api/tasks',
      notes: '/api/notes',
      tests: '/api/tests',
      subjective: '/api/subjective',
      admin: '/api/admin',
      student: '/api/student',
    },
  });
});

/* ---------- Routes ---------- */
app.use('/api/health', healthRoute);
app.use('/api/auth', authRoute);
app.use('/api/tasks', taskRoute);
app.use('/api/notes', noteRoute);
app.use('/api/tests', testRoute);
app.use('/api/subjective', subjectiveRoute);
app.use('/api/admin', paperRoute);
app.use('/api/student', paperRoute);

/* ---------- 404 ---------- */
app.use((req, res) => {
  res.status(404).json({ error: 'Not found', path: req.originalUrl });
});

/* ---------- Error handler ---------- */
app.use((err, req, res, next) => {
  console.error('❌ Server error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
});

/* ---------- Boot ---------- */
async function start() {
  console.log('\n🚀 Starting Nexus Backend...\n');

  await connectDB();

  const httpServer = http.createServer(app);

  httpServer.listen(PORT, () => {
    console.log('\n═══════════════════════════════════════════');
    console.log(`  ✅ Server:   http://localhost:${PORT}`);
    console.log(`  📡 Health:   http://localhost:${PORT}/api/health`);
    console.log(`  🔐 Auth:     http://localhost:${PORT}/api/auth`);
    console.log(`  📋 Tasks:    http://localhost:${PORT}/api/tasks`);
    console.log(`  📝 Notes:    http://localhost:${PORT}/api/notes`);
    console.log(`  🎓 Tests:    http://localhost:${PORT}/api/tests`);
    console.log(`  📄 Subjective: http://localhost:${PORT}/api/subjective`);
    console.log(`  🛡️  Admin:     http://localhost:${PORT}/api/admin`);
    console.log(`  🎒 Student:   http://localhost:${PORT}/api/student`);
    console.log('═══════════════════════════════════════════\n');
  });
}

start().catch((err) => {
  console.error('❌ Failed to start:', err);
  process.exit(1);
});