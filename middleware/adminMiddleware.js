/**
 * Admin Authorization Middleware
 * Role-based access control for admin endpoints
 */

export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Forbidden: Insufficient permissions',
        required: allowedRoles,
        current: req.user.role
      });
    }

    next();
  };
}

export const adminOnly = authorize('admin', 'super_admin', 'superadmin', 'subject_admin');
export const superAdminOnly = authorize('super_admin', 'superadmin', 'admin');
export const teacherOrAdmin = authorize('teacher', 'admin', 'super_admin', 'superadmin');
export const studentOrAdmin = authorize('student', 'admin', 'super_admin', 'superadmin');
