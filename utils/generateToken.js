import jwt from 'jsonwebtoken';

export function generateToken(userId) {
  // Token ab 7 din me expire ho jayega (Security Fix)
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}