import jwt from 'jsonwebtoken';

export function generateToken(userId) {
  // Professional standard: 30 days session validity (no frequent logouts)
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
