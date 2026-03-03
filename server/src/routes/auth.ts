import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, execute } from '../database';
import { RegisterSchema, LoginSchema, UpdateProfileSchema, User } from '../types';
import { AuthRequest, authMiddleware, generateToken, AUTH_COOKIE_NAME, AUTH_COOKIE_OPTIONS } from '../middleware/auth';
import { updateVehicleStatuses } from '../services/scheduleEngine';

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

    const existing = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const id = uuidv4();

    await execute(
      `INSERT INTO users (id, email, password_hash, first_name, last_name)
       VALUES ($1, $2, $3, $4, $5)`,
      [id, email, passwordHash, firstName || null, lastName || null]
    );

    const token = generateToken(id, false);

    // Set HttpOnly cookie (survives proxy redirects)
    res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);

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
    const user = await queryOne<User>('SELECT * FROM users WHERE email = $1', [email]);

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

    // Set HttpOnly cookie (survives proxy redirects)
    res.cookie(AUTH_COOKIE_NAME, token, AUTH_COOKIE_OPTIONS);

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
router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await queryOne<User>('SELECT * FROM users WHERE id = $1', [req.userId]);
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
router.put('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const parsed = UpdateProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten().fieldErrors });
      return;
    }

    const { firstName, lastName, emailNotifications, reminderLeadMiles, reminderLeadDays } = parsed.data;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (firstName !== undefined) { updates.push(`first_name = $${paramIdx++}`); values.push(firstName); }
    if (lastName !== undefined) { updates.push(`last_name = $${paramIdx++}`); values.push(lastName); }
    if (emailNotifications !== undefined) { updates.push(`email_notifications = $${paramIdx++}`); values.push(emailNotifications ? 1 : 0); }
    if (reminderLeadMiles !== undefined) { updates.push(`reminder_lead_miles = $${paramIdx++}`); values.push(reminderLeadMiles); }
    if (reminderLeadDays !== undefined) { updates.push(`reminder_lead_days = $${paramIdx++}`); values.push(reminderLeadDays); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    updates.push('updated_at = NOW()');
    values.push(req.userId);

    await execute(`UPDATE users SET ${updates.join(', ')} WHERE id = $${paramIdx}`, values);

    // Re-evaluate all vehicle statuses when reminder thresholds change
    if (reminderLeadMiles !== undefined || reminderLeadDays !== undefined) {
      const vehicles = await queryAll<{ id: string }>('SELECT id FROM vehicles WHERE user_id = $1', [req.userId]);
      for (const v of vehicles) {
        await updateVehicleStatuses(v.id);
      }
    }

    res.json({ message: 'Profile updated' });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Password Reset Request (simplified — logs token) ───
router.post('/password-reset', async (req: AuthRequest, res: Response) => {
  try {
    const { email } = req.body;
    const user = await queryOne<User>('SELECT id FROM users WHERE email = $1', [email]);

    // Always respond success to prevent email enumeration
    if (user) {
      const resetToken = uuidv4();
      console.log(`[Password Reset] Token for ${email}: ${resetToken}`);
    }

    res.json({ message: 'If the email exists, a reset link has been sent.' });
  } catch (err) {
    console.error('Password reset error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── Logout (clear auth cookie) ─────────────────────────
router.post('/logout', (_req, res: Response) => {
  res.clearCookie(AUTH_COOKIE_NAME, { path: '/' });
  res.json({ message: 'Logged out' });
});

export default router;
