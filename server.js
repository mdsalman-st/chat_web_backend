import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';

import { connectDB } from './config/db.js';
import { initChatSocket } from './sockets/chatSocket.js';
import healthRoute from './routes/health.js';
import authRoute from './routes/auth.js';
import taskRoute from './routes/tasks.js';
import noteRoute from './routes/notes.js';
import roomRoute from './routes/rooms.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------- Middleware ---------- */
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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

/* ---------- Routes ---------- */
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
      rooms: '/api/rooms',
    },
  });
});

app.use('/api/health', healthRoute);
app.use('/api/auth', authRoute);
app.use('/api/tasks', taskRoute);
app.use('/api/notes', noteRoute);
app.use('/api/rooms', roomRoute);

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

  // HTTP server + Socket.io
  const httpServer = http.createServer(app);
  initChatSocket(httpServer);

  httpServer.listen(PORT, () => {
    console.log('\n═══════════════════════════════════════════');
    console.log(`  ✅ Server:   http://localhost:${PORT}`);
    console.log(`  📡 Health:   http://localhost:${PORT}/api/health`);
    console.log(`  🔐 Auth:     http://localhost:${PORT}/api/auth`);
    console.log(`  📋 Tasks:    http://localhost:${PORT}/api/tasks`);
    console.log(`  📝 Notes:    http://localhost:${PORT}/api/notes`);
    console.log(`  💬 Rooms:    http://localhost:${PORT}/api/rooms`);
    console.log(`  🔌 Socket:   ws://localhost:${PORT}`);
    console.log('═══════════════════════════════════════════\n');
  });
}

start().catch((err) => {
  console.error('❌ Failed to start:', err);
  process.exit(1);
});