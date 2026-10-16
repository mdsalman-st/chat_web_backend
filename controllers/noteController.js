import Note from '../models/note.js';

/* GET /api/notes */
export async function getNotes(req, res) {
  try {
    const { color = 'all', search = '' } = req.query;

    const query = { user: req.user._id };
    if (color !== 'all') query.color = color;

    if (search && search.trim()) {
      const rx = new RegExp(search.trim(), 'i');
      query.$or = [{ title: rx }, { content: rx }, { roleTag: rx }];
    }

    const notes = await Note.find(query).sort({ pinned: -1, updatedAt: -1 });
    res.json({ success: true, count: notes.length, notes });
  } catch (err) {
    console.error('getNotes error:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
}

/* POST /api/notes */
export async function createNote(req, res) {
  try {
    const { title, content, color, roleTag, pinned } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const note = await Note.create({
      user: req.user._id,
      title: title.trim(),
      content: (content || '').trim(),
      color: color || 'yellow',
      roleTag: (roleTag || '').trim(),
      pinned: Boolean(pinned),
    });

    res.status(201).json({ success: true, note });
  } catch (err) {
    console.error('createNote error:', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
}

/* GET /api/notes/:id */
export async function getNote(req, res) {
  try {
    const note = await Note.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json({ success: true, note });
  } catch (err) {
    console.error('getNote error:', err);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
}

/* PUT /api/notes/:id */
export async function updateNote(req, res) {
  try {
    const { title, content, color, roleTag } = req.body;

    const note = await Note.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found' });

    if (title !== undefined) note.title = title.trim();
    if (content !== undefined) note.content = (content || '').trim();
    if (color !== undefined) note.color = color;
    if (roleTag !== undefined) note.roleTag = (roleTag || '').trim();

    await note.save();
    res.json({ success: true, note });
  } catch (err) {
    console.error('updateNote error:', err);
    res.status(500).json({ error: 'Failed to update note' });
  }
}

/* PATCH /api/notes/:id/pin */
export async function togglePin(req, res) {
  try {
    const note = await Note.findOne({ _id: req.params.id, user: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found' });

    note.pinned = !note.pinned;
    await note.save();

    res.json({ success: true, note });
  } catch (err) {
    console.error('togglePin error:', err);
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
}

/* DELETE /api/notes/:id */
export async function deleteNote(req, res) {
  try {
    const note = await Note.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!note) return res.status(404).json({ error: 'Note not found' });
    res.json({ success: true, message: 'Note deleted' });
  } catch (err) {
    console.error('deleteNote error:', err);
    res.status(500).json({ error: 'Failed to delete note' });
  }
}

/* GET /api/notes/stats */
export async function getNoteStats(req, res) {
  try {
    const userId = req.user._id;

    const [total, pinned, week] = await Promise.all([
      Note.countDocuments({ user: userId }),
      Note.countDocuments({ user: userId, pinned: true }),
      Note.countDocuments({
        user: userId,
        createdAt: { $gte: new Date(Date.now() - 7 * 86400000) },
      }),
    ]);

    const colorAgg = await Note.aggregate([
      { $match: { user: userId } },
      { $group: { _id: '$color', count: { $sum: 1 } } },
    ]);

    const colors = {};
    colorAgg.forEach((c) => { colors[c._id] = c.count; });

    res.json({
      success: true,
      stats: { total, pinned, week, colors },
    });
  } catch (err) {
    console.error('getNoteStats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}