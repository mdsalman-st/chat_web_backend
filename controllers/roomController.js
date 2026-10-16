import Room from '../models/Room.js';
import Message from '../models/Message.js';

const WORDS = ['GHOST', 'ALPHA', 'DELTA', 'NOVA', 'RAVEN', 'PHOENIX', 'CYPHER', 'TITAN', 'SHADOW', 'ZENITH'];

function generateCode() {
  const w = WORDS[Math.floor(Math.random() * WORDS.length)];
  const n = Math.floor(10 + Math.random() * 89);
  return `${w}-${n}`;
}

async function uniqueCode() {
  for (let i = 0; i < 20; i++) {
    const code = generateCode();
    const exists = await Room.findOne({ code });
    if (!exists) return code;
  }
  return `ROOM-${Date.now().toString(36).toUpperCase()}`;
}

/* --------------------------------------------------------------------------
   POST /api/rooms — create new room
   -------------------------------------------------------------------------- */
export async function createRoom(req, res) {
  try {
    const { name } = req.body;
    const code = await uniqueCode();

    const room = await Room.create({
      code,
      name: (name || '').trim(),
      createdBy: req.user._id,
      members: [req.user._id],
    });

    // Welcome system message
    await Message.create({
      room: room._id,
      sender: req.user._id,
      senderName: 'System',
      text: `Room ${code} created. Share this code to invite others.`,
      type: 'system',
    });

    res.status(201).json({ success: true, room });
  } catch (err) {
    console.error('createRoom error:', err);
    res.status(500).json({ error: 'Failed to create room' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/rooms/join — join room by code
   -------------------------------------------------------------------------- */
export async function joinRoom(req, res) {
  try {
    const { code } = req.body;
    if (!code) return res.status(400).json({ error: 'Room code required' });

    const room = await Room.findOne({ code: code.toUpperCase().trim() });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    if (!room.members.includes(req.user._id)) {
      room.members.push(req.user._id);
      await room.save();

      // System message about join
      await Message.create({
        room: room._id,
        sender: req.user._id,
        senderName: 'System',
        text: `${req.user.name} joined the room.`,
        type: 'system',
      });
    }

    res.json({ success: true, room });
  } catch (err) {
    console.error('joinRoom error:', err);
    res.status(500).json({ error: 'Failed to join room' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/rooms — list my rooms
   -------------------------------------------------------------------------- */
export async function getMyRooms(req, res) {
  try {
    const rooms = await Room.find({ members: req.user._id }).sort({ updatedAt: -1 });

    const enriched = await Promise.all(
      rooms.map(async (r) => {
        const count = await Message.countDocuments({ room: r._id });
        return { ...r.toObject(), messageCount: count };
      })
    );

    res.json({ success: true, count: enriched.length, rooms: enriched });
  } catch (err) {
    console.error('getMyRooms error:', err);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/rooms/:id — room details
   -------------------------------------------------------------------------- */
export async function getRoom(req, res) {
  try {
    const room = await Room.findOne({ _id: req.params.id, members: req.user._id });
    if (!room) return res.status(404).json({ error: 'Room not found or not a member' });
    res.json({ success: true, room });
  } catch (err) {
    console.error('getRoom error:', err);
    res.status(500).json({ error: 'Failed to fetch room' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/rooms/:id/messages — message history
   -------------------------------------------------------------------------- */
export async function getMessages(req, res) {
  try {
    const { limit = 50, before } = req.query;

    const room = await Room.findOne({ _id: req.params.id, members: req.user._id });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const query = { room: room._id };
    if (before) query.createdAt = { $lt: new Date(before) };

    const messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit));

    res.json({ success: true, messages: messages.reverse() });
  } catch (err) {
    console.error('getMessages error:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/rooms/:id/messages — REST fallback (if socket not used)
   -------------------------------------------------------------------------- */
export async function sendMessage(req, res) {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message required' });

    const room = await Room.findOne({ _id: req.params.id, members: req.user._id });
    if (!room) return res.status(404).json({ error: 'Room not found' });

    const msg = await Message.create({
      room: room._id,
      sender: req.user._id,
      senderName: req.user.name,
      text: text.trim(),
      type: 'text',
    });

    room.lastMessage = {
      text: msg.text,
      at: msg.createdAt,
      sender: req.user.name,
    };
    await room.save();

    res.status(201).json({ success: true, message: msg });
  } catch (err) {
    console.error('sendMessage error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
}

/* --------------------------------------------------------------------------
   DELETE /api/rooms/:id — delete room (owner only)
   -------------------------------------------------------------------------- */
export async function deleteRoom(req, res) {
  try {
    const room = await Room.findOne({ _id: req.params.id, createdBy: req.user._id });
    if (!room) return res.status(404).json({ error: 'Room not found or not owner' });

    await Message.deleteMany({ room: room._id });
    await Room.findByIdAndDelete(room._id);

    res.json({ success: true, message: 'Room deleted' });
  } catch (err) {
    console.error('deleteRoom error:', err);
    res.status(500).json({ error: 'Failed to delete room' });
  }
}
