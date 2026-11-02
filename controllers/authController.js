import bcrypt from 'bcryptjs';
import User from '../models/user.js';
import { generateToken } from '../utils/generateToken.js';

const PEPPER = process.env.JWT_SECRET + '_pepper_nexus';
const BCRYPT_ROUNDS = 12;

/* --------------------------------------------------------------------------
   VALIDATION HELPERS
   -------------------------------------------------------------------------- */

// NAYA: Strong Password Checker
const isStrongPassword = (password) => {
  const regex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#])[A-Za-z\d@$!%*?&#]{8,}$/;
  return regex.test(password);
};

function validateSignup({ name, email, phone, password }) {
  if (!name || name.trim().length < 2) return 'Name must be at least 2 characters';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email';
  if (!phone || !/^[6-9]\d{9}$/.test(phone)) return 'Invalid phone (10 digits, starting 6-9)';
  
  // NAYA: Apply Strong Password Check
  if (!password || !isStrongPassword(password)) {
    return 'Password must be 8+ chars with at least 1 Uppercase, 1 Lowercase, 1 Number & 1 Special character (@$!%*?&#)';
  }
  return null;
}

/* --------------------------------------------------------------------------
   POST /api/auth/signup
   -------------------------------------------------------------------------- */
export async function signup(req, res) {
  try {
    const { name, email, phone, password, role, roleDetails, username, secretCode } = req.body;

    const error = validateSignup({ name, email, phone, password });
    if (error) return res.status(400).json({ error });

    const existing = await User.findOne({ email: email.toLowerCase() });
    
    // NAYA FIX: User Enumeration Protection
    if (existing) {
      return res.status(200).json({ 
        success: true, 
        message: 'If this email is not registered, you will receive a verification link.' 
      });
    }

    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    const passwordHash = await bcrypt.hash(password + PEPPER, salt);

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      passwordHash,
      salt,
      role: role || 'student',
      username: username ? username.toLowerCase().trim() : undefined,
      secretCode: secretCode || undefined,
      roleDetails: roleDetails || {},
    });

    const token = generateToken(user._id);

    res.status(201).json({
      success: true,
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Signup error:', err);
    if (err.code === 11000) {
      return res.status(409).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: 'Signup failed' });
  }
}

/* --------------------------------------------------------------------------
   POST /api/auth/login (WITH ACCOUNT LOCKOUT)
   -------------------------------------------------------------------------- */
export async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Select +loginAttempts +lockUntil to check lock status
    const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash +salt +loginAttempts +lockUntil');
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // NAYA FIX: Check if Account is Locked
    if (user.lockUntil && user.lockUntil > Date.now()) {
      const minutesLeft = Math.ceil((user.lockUntil - Date.now()) / 60000);
      return res.status(423).json({ 
        error: `Account locked due to multiple failed attempts. Try again in ${minutesLeft} minutes.` 
      });
    }

    // Check Password
    const isValid = await bcrypt.compare(password + PEPPER, user.passwordHash);
    
    if (!isValid) {
      // NAYA FIX: Increment Failed Attempts
      user.loginAttempts = (user.loginAttempts || 0) + 1;
      
      if (user.loginAttempts >= 5) {
        // Lock account for 15 minutes
        user.lockUntil = new Date(Date.now() + 15 * 60 * 1000); 
        user.loginAttempts = 0; // reset counter
        await user.save();
        return res.status(423).json({ 
          error: 'Too many failed attempts. Account locked for 15 minutes.' 
        });
      }
      
      await user.save();
      return res.status(401).json({ 
        error: `Invalid credentials. ${5 - user.loginAttempts} attempts remaining.` 
      });
    }

    // NAYA FIX: Successful Login - Reset attempts & unlock
    user.loginAttempts = 0;
    user.lockUntil = null;
    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      token,
      user: user.toJSON(),
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/auth/me
   -------------------------------------------------------------------------- */
export async function getMe(req, res) {
  res.json({
    success: true,
    user: req.user.toJSON(),
  });
}

/* --------------------------------------------------------------------------
   PUT /api/auth/details — update role-specific details
   -------------------------------------------------------------------------- */
export async function updateDetails(req, res) {
  try {
    const { roleDetails } = req.body;
    
    if (!roleDetails || typeof roleDetails !== 'object') {
      return res.status(400).json({ error: 'roleDetails object required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { roleDetails } },
      { new: true, runValidators: true }
    );

    res.json({ success: true, user: user.toJSON() });
  } catch (err) {
    console.error('updateDetails error:', err);
    res.status(500).json({ error: 'Failed to update details' });
  }
}

/* --------------------------------------------------------------------------
   PUT /api/auth/credentials — update username + secret code
   -------------------------------------------------------------------------- */
export async function updateCredentials(req, res) {
  try {
    const { username, secretCode } = req.body;

    if (!username || username.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }
    if (!secretCode || secretCode.length < 3) {
      return res.status(400).json({ error: 'Secret code must be at least 3 characters' });
    }

    // Check username unique (except current user)
    const taken = await User.findOne({ username: username.toLowerCase() });
    
    if (taken && taken._id.toString() !== req.user._id.toString()) {
      return res.status(409).json({ error: 'Username already taken' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      {
        $set: {
          username: username.toLowerCase().trim(),
          secretCode: secretCode.trim().toLowerCase(),
        },
      },
      { new: true }
    );

    res.json({ success: true, user: user.toJSON() });
  } catch (err) {
    console.error('updateCredentials error:', err);
    res.status(500).json({ error: 'Failed to update credentials' });
  }
}

/* --------------------------------------------------------------------------
   GET /api/auth/check-username/:username — availability check
   -------------------------------------------------------------------------- */
export async function checkUsername(req, res) {
  try {
    const { username } = req.params;
    
    if (!username || username.length < 3) {
      return res.status(400).json({ error: 'Username too short' });
    }

    const exists = await User.findOne({ username: username.toLowerCase() });
    res.json({ success: true, available: !exists });
    
  } catch (err) {
    console.error('checkUsername error:', err);
    res.status(500).json({ error: 'Check failed' });
  }
}

/* --------------------------------------------------------------------------
   PUT /api/auth/profile — Admin Profile Update (NAYA FEATURE)
   -------------------------------------------------------------------------- */
export async function updateProfile(req, res) {
  try {
    const { name, password } = req.body;
    
    // Select password fields to allow updating them
    const user = await User.findById(req.user._id).select('+passwordHash +salt');

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // 1. Update Name
    if (name) {
      user.name = name.trim();
    }

    // 2. Update Password (with strong check & pepper)
    if (password) {
      if (!isStrongPassword(password)) {
        return res.status(400).json({ 
          error: 'Password must be 8+ chars with at least 1 Uppercase, 1 Lowercase, 1 Number & 1 Special character' 
        });
      }
      
      const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
      const passwordHash = await bcrypt.hash(password + PEPPER, salt);
      
      user.passwordHash = passwordHash;
      user.salt = salt; 
    }

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      user: user.toJSON()
    });
    
  } catch (err) {
    console.error('updateProfile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
}