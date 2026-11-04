/**
 * Middleware to restrict Admins to only upload papers for their assigned subject.
 * Super Admin & Unrestricted Platform Admins bypass this check.
 */
export const requireSubjectAccess = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // 1. Super Admin ya General Admin (jiska assignedSubject set nahi hai, full platform access)
  if (
    req.user.role === 'super_admin' || 
    req.user.role === 'superadmin' || 
    (req.user.role === 'admin' && !req.user.assignedSubject)
  ) {
    return next();
  }

  // 2. Agar user subject_admin hai ya restricted admin jiska assignedSubject specified hai
  if (req.user.role === 'subject_admin' || (req.user.role === 'admin' && req.user.assignedSubject)) {
    const adminSubject = req.user.assignedSubject; // e.g., 'mathematics'
    const uploadSubject = req.body.subjectCode;    // e.g., 'mathematics'

    if (!adminSubject) {
      return res.status(403).json({ 
        message: 'Aapko koi subject assign nahi kiya gaya hai. Super Admin se contact karein.' 
      });
    }

    if (!uploadSubject || adminSubject.toLowerCase().trim() !== uploadSubject.toLowerCase().trim()) {
      return res.status(403).json({ 
        message: `Access Denied. Aap sirf apne assigned subject (${adminSubject}) ke papers upload kar sakte hain.` 
      });
    }

    return next(); // Subject match ho gaya, aage badho
  }

  // 3. Agar koi aur role hai (student, employee, etc.)
  return res.status(403).json({ message: 'Aapko iski permission nahi hai.' });
};
