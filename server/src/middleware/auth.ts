import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';

export interface AuthRequest extends Request {
  userId?: string;
  isAdmin?: boolean;
}

export function generateToken(userId: string, isAdmin: boolean): string {
  return jwt.sign({ userId, isAdmin }, JWT_SECRET, { expiresIn: '7d' });
}

export function verifyToken(token: string): { userId: string; isAdmin: boolean } {
  return jwt.verify(token, JWT_SECRET) as { userId: string; isAdmin: boolean };
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
    const token = header.split(' ')[1];
    const decoded = verifyToken(token);
    req.userId = decoded.userId;
    req.isAdmin = decoded.isAdmin;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!req.isAdmin) {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
