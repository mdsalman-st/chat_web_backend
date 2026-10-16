import express from 'express';
import mongoose from 'mongoose';

const router = express.Router();

router.get('/', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStatus = ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown';

  res.json({
    status: 'ok',
    service: 'nexus-backend',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + 's',
    database: {
      status: dbStatus,
      name: mongoose.connection.name || null,
    },
  });
});

export default router;