import User from '../models/user.js';

// 1. Saare students ki list laane ke liye
export async function getUsers(req, res) {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    // Sirf students ko fetch karo, admin ko nahi
    const users = await User.find({ role: 'student' })
      .select('name email role createdAt')
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json({ success: true, users });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// 2. Kisi student ko Admin banane ke liye
export async function promoteToAdmin(req, res) {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    const { userId } = req.params;
    
    // Role update karo
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { role: 'admin' } },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: 'User not found' });

    res.json({ success: true, message: `${user.name} is now an Admin!` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}