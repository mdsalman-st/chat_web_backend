import { Server } from 'socket.io';
import { verifyToken } from '../utils/generateToken.js';
import User from '../models/user.js';
import Room from '../models/Room.js';
import Message from '../models/Message.js';

export function initChatSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: '*', credentials: true },
  });

  /* --------------------------------------------------------------------------
     AUTH MIDDLEWARE — socket connection se pehle JWT verify
     -------------------------------------------------------------------------- */
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('No token provided'));

      const decoded = verifyToken(token);
      const user = await User.findById(decoded.id);
      if (!user) return next(new Error('User not found'));

      socket.user = user;
      next();
    } catch (err) {
      next(new Error('Auth failed'));
    }
  });

  /* --------------------------------------------------------------------------
     CONNECTION
     -------------------------------------------------------------------------- */
  io.on('connection', (socket) => {
    console.log(`🔌 Connected: ${socket.user.name} (${socket.id})`);

    /* ---- Join a room ---- */
    socket.on('room:join', async ({ roomId }, cb) => {
      try {
        const room = await Room.findOne({ _id: roomId, members: socket.user._id });
        if (!room) return cb && cb({ error: 'Not a member' });

        socket.join(roomId);
        console.log(`👥 ${socket.user.name} joined room ${room.code}`);
        cb && cb({ success: true });
      } catch (err) {
        console.error('room:join error:', err);
        cb && cb({ error: 'Join failed' });
      }
    });

    /* ---- Leave a room ---- */
    socket.on('room:leave', ({ roomId }) => {
      socket.leave(roomId);
      console.log(`👋 ${socket.user.name} left room ${roomId}`);
    });

    /* ---- Send message ---- */
    socket.on('message:send', async ({ roomId, text }, cb) => {
      try {
        if (!text || !text.trim()) return cb && cb({ error: 'Empty message' });

        const room = await Room.findOne({ _id: roomId, members: socket.user._id });
        if (!room) return cb && cb({ error: 'Room not found' });

        const msg = await Message.create({
          room: room._id,
          sender: socket.user._id,
          senderName: socket.user.name,
          text: text.trim(),
          type: 'text',
        });

        room.lastMessage = {
          text: msg.text,
          at: msg.createdAt,
          sender: socket.user.name,
        };
        await room.save();

        const payload = {
          _id: msg._id,
          room: room._id,
          sender: {
            _id: socket.user._id,
            name: socket.user.name,
          },
          senderName: socket.user.name,
          text: msg.text,
          type: msg.type,
          createdAt: msg.createdAt,
        };

        // Send to everyone in room (including sender)
        io.to(roomId).emit('message:new', payload);
        cb && cb({ success: true, message: payload });
      } catch (err) {
        console.error('message:send error:', err);
        cb && cb({ error: 'Send failed' });
      }
    });

    /* ---- Typing indicators ---- */
    socket.on('typing:start', ({ roomId }) => {
      socket.to(roomId).emit('typing:start', {
        userId: socket.user._id,
        name: socket.user.name,
      });
    });

    socket.on('typing:stop', ({ roomId }) => {
      socket.to(roomId).emit('typing:stop', {
        userId: socket.user._id,
      });
    });

    /* ---- Disconnect ---- */
    socket.on('disconnect', () => {
      console.log(`❌ Disconnected: ${socket.user.name}`);
    });
  });

  return io;
}