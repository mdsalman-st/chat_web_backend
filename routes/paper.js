export function adminOnly(req, res, next) {
  try {
    const allowedRoles = ['super_admin', 'admin', 'subject_admin'];
    
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    
    next();
  } catch (err) {
    res.status(500).json({ error: 'Middleware error' });
  }
}