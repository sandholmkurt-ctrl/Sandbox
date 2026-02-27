import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { RegisterSchema, LoginSchema, UpdateProfileSchema, User } from '../types';
import { AuthRequest, authMiddleware, generateToken } from '../middleware/auth';

const router = Router();

// ─── Register ───────────────────────────────────────────
router.post('/register', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { email, password, firstName, lastName } = parsed.data;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = uuidv4();

    db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, email, passwordHash, firstName || null, lastName || null);

    const token = generateToken(id, false);

    res.status(201).json({
      token,
      user: { id, email, firstName: firstName || null, lastName: lastName || null, isAdmin: false },
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Login ──────────────────────────────────────────────
router.post('/login', async (req: AuthRequest, res: Response) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { email, password } = parsed.data;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;

    if (!user) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      res.status(401).json({ error: 'Invalid email or password' });
      return;
    }

    const token = generateToken(user.id, !!user.is_admin);

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
        isAdmin: !!user.is_admin,
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Get Profile ────────────────────────────────────────
router.get('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId) as User | undefined;
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isAdmin: !!user.is_admin,
      emailNotifications: !!user.email_notifications,
      reminderLeadMiles: user.reminder_lead_miles,
      reminderLeadDays: user.reminder_lead_days,
      createdAt: user.created_at,
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Update Profile ─────────────────────────────────────
router.put('/me', authMiddleware, (req: AuthRequest, res: Response) => {
  try {
    const parsed = UpdateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { firstName, lastName, emailNotifications, reminderLeadMiles, reminderLeadDays } = parsed.data;

    const updates: string[] = [];
    const values: any[] = [];

    if (firstName !== undefined) { updates.push('first_name = ?'); values.push(firstName); }
    if (lastName !== undefined) { updates.push('last_name = ?'); values.push(lastName); }
    if (emailNotifications !== undefined) { updates.push('email_notifications = ?'); values.push(emailNotifications ? 1 : 0); }
    if (reminderLeadMiles !== undefined) { updates.push('reminder_lead_miles = ?'); values.push(reminderLeadMiles); }
    if (reminderLeadDays !== undefined) { updates.push('reminder_lead_days = ?'); values.push(reminderLeadDays); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push("updated_at = datetime('now')");
    values.push(req.userId);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Password Reset Request (simplified — logs token) ───
router.post('/password-reset', (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get(email) as User | undefined;

    // Always respond success to prevent email enumeration
    if (user) {
      const resetToken = uuidv4();
      console.log(`[Password Reset] Token for ${email}: ${resetToken}`);
      // In production: store token with expiry and send email
    }

    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
