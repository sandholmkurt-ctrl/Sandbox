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

/** Cookie options for the auth token */
export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

export const AUTH_COOKIE_NAME = 'auth_token';

/**
 * Extract the JWT token from the request.
 * Checks (in order): Authorization header → auth_token cookie.
 * This dual approach ensures auth works even when corporate proxies
 * (e.g., Zscaler/SiteMinder) strip Authorization headers during 307 redirects.
 */
function extractToken(req: Request): string | null {
  // 1. Check Authorization header (standard approach)
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    return header.split(' ')[1];
  }

  // 2. Fallback: check HttpOnly cookie (survives proxy redirects)
  const cookieToken = req.cookies?.[AUTH_COOKIE_NAME];
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  try {
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
