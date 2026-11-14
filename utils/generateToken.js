import jwt from 'jsonwebtoken';

export function generateToken(userId) {
  // Permanent Session: Token tab tak expire nahi hoga jab tak user khud Logout na kare
  return jwt.sign({ id: userId }, process.env.JWT_SECRET);
}

export function verifyToken(token) {
  return jwt.verify(token, process.env.JWT_SECRET);
}
