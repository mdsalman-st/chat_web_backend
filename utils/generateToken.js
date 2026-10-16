import jwt from 'jsonwebtoken';

export function generateToken(userId) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET missing');

  return jwt.sign({ id: userId }, secret, { expiresIn: '7d' });
}

export function verifyToken(token) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET missing');

  return jwt.verify(token, secret);
}