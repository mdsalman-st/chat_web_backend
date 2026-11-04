/**
 * Middleware to restrict Admins to only upload papers for their assigned subject.
 * Super Admin bypasses this check.
 */
export const requireSubjectAccess = (req, res, next) => {
  // Agar user super_admin hai, toh usko koi rok nahi sakta
  if (req.user.role === 'super_admin' || req.user.role === 'superadmin') {
    return next();
  }

  // Agar user normal admin hai
  if (req.user.role === 'admin' || req.user.role === 'subject_admin') {
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

    return next(); // Sab theek hai, aage badho
  }

  // Agar koi aur role hai (student, employee, etc.)
  return res.status(403).json({ message: 'Aapko iski permission nahi hai.' });
};