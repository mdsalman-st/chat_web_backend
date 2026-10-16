import Task from '../models/task.js';

/* --------------------------------------------------------------------------
   GET /api/tasks
   List all tasks for logged-in user
   Query params: ?filter=all|active|done
   -------------------------------------------------------------------------- */
export async function getTasks(req, res) {
  try {
    const { filter = 'all', search = '' } = req.query;

    const query = { user: req.user._id };

    if (filter === 'active') query.completed = false;
    if (filter === 'done')   query.completed = true;

    if (search && search.trim()) {
      const rx = new RegExp(search.trim(), 'i');
      query.$or = [{ title: rx }, { description: rx }, { roleValue: rx }];
    }

    const tasks = await Task.find(query).sort({ completed: 1, createdAt: -1 });
    res.json({ success: true, count: tasks.length, tasks });
  } catch (err) {
    console.error('getTasks error:', err);
    res.status(500).json({ error: 'Failed to fetch tasks' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/tasks
   Create new task
   -------------------------------------------------------------------------- */
export async function createTask(req, res) {
  try {
    const { title, description, priority, dueDate, roleValue } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const task = await Task.create({
      user: req.user._id,
      title: title.trim(),
      description: (description || '').trim(),
      priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
      dueDate: dueDate || '',
      roleValue: (roleValue || '').trim(),
    });

    res.status(201).json({ success: true, task });
  } catch (err) {
    console.error('createTask error:', err);
    res.status(500).json({ error: 'Failed to create task' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tasks/:id
   -------------------------------------------------------------------------- */
export async function getTask(req, res) {
  try {
    const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true, task });
  } catch (err) {
    console.error('getTask error:', err);
    res.status(500).json({ error: 'Failed to fetch task' });
  }
}

/* --------------------------------------------------------------------------
   PUT /api/tasks/:id
   Update task
   -------------------------------------------------------------------------- */
export async function updateTask(req, res) {
  try {
    const { title, description, priority, dueDate, roleValue } = req.body;

    const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    if (title !== undefined) task.title = title.trim();
    if (description !== undefined) task.description = (description || '').trim();
    if (priority !== undefined && ['low', 'medium', 'high'].includes(priority)) {
      task.priority = priority;
    }
    if (dueDate !== undefined) task.dueDate = dueDate;
    if (roleValue !== undefined) task.roleValue = (roleValue || '').trim();

    await task.save();
    res.json({ success: true, task });
  } catch (err) {
    console.error('updateTask error:', err);
    res.status(500).json({ error: 'Failed to update task' });
  }
}

/* --------------------------------------------------------------------------
   PATCH /api/tasks/:id/toggle
   Toggle completed
   -------------------------------------------------------------------------- */
export async function toggleTask(req, res) {
  try {
    const task = await Task.findOne({ _id: req.params.id, user: req.user._id });
    if (!task) return res.status(404).json({ error: 'Task not found' });

    task.completed = !task.completed;
    task.completedAt = task.completed ? new Date() : null;
    await task.save();

    res.json({ success: true, task });
  } catch (err) {
    console.error('toggleTask error:', err);
    res.status(500).json({ error: 'Failed to toggle task' });
  }
}

/* --------------------------------------------------------------------------
   DELETE /api/tasks/:id
   -------------------------------------------------------------------------- */
export async function deleteTask(req, res) {
  try {
    const task = await Task.findOneAndDelete({ _id: req.params.id, user: req.user._id });
    if (!task) return res.status(404).json({ error: 'Task not found' });
    res.json({ success: true, message: 'Task deleted' });
  } catch (err) {
    console.error('deleteTask error:', err);
    res.status(500).json({ error: 'Failed to delete task' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/tasks/stats
   Task stats for dashboard/analytics
   -------------------------------------------------------------------------- */
export async function getTaskStats(req, res) {
  try {
    const userId = req.user._id;

    const [total, done, overdue] = await Promise.all([
      Task.countDocuments({ user: userId }),
      Task.countDocuments({ user: userId, completed: true }),
      Task.countDocuments({
        user: userId,
        completed: false,
        dueDate: { $lt: new Date().toISOString().split('T')[0], $ne: '' },
      }),
    ]);

    res.json({
      success: true,
      stats: {
        total,
        done,
        pending: total - done,
        overdue,
      },
    });
  } catch (err) {
    console.error('getTaskStats error:', err);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
}