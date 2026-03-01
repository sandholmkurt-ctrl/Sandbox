import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import fs from 'fs';
import cron from 'node-cron';
import db, { DB_PATH, initializeDatabase } from './database';
import authRoutes from './routes/auth';
import vehicleRoutes from './routes/vehicles';
import mileageRoutes from './routes/mileage';
import serviceRoutes from './routes/services';
import notificationRoutes from './routes/notifications';
import dashboardRoutes from './routes/dashboard';
import vinRoutes from './routes/vin';
import adminRoutes from './routes/admin';
import { updateAllVehicleStatuses } from './services/scheduleEngine';
import { generateNotifications } from './services/notificationService';

const app = express();
const PORT = process.env.PORT || 3001;

// ─── CORS ────────────────────────────────────────────────
// Custom CORS handling.  When a corporate proxy (Zscaler / SiteMinder)
// 307-redirects a request cross-origin and back, the browser may send
// Origin: null or strip the Origin header entirely.  The cors() package
// with `origin: true` + `credentials: true` would then produce the
// INVALID combination `Access-Control-Allow-Origin: *` plus
// `Access-Control-Allow-Credentials: true`, causing the browser to
// block the response.  We fix this with manual CORS headers.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    // Known origin – reflect it and allow credentials (cookies)
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    // No origin (same-origin request, or origin stripped by proxy).
    // Use '*' WITHOUT credentials — valid CORS, and same-origin
    // requests don't need credentials headers anyway.
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Expose-Headers', 'Set-Cookie');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  next();
});

app.use(express.json());
app.use(cookieParser());

// ─── Token Tunnel / Method Override ──────────────────────
// When a corporate proxy 307-redirects a GET request and strips the
// Authorization header, the client falls back to re-sending the request
// as a POST with { _authToken, _method: 'GET' } in the body.  The 307
// preserves the POST body, so the token survives.  This middleware
// extracts the token into the Authorization header and restores the
// original HTTP method BEFORE Express's router matches routes.
app.use('/api', (req, res, next) => {
  if (
    req.method === 'POST' &&
    req.body?._authToken &&
    req.body?._method &&
    !req.headers.authorization
  ) {
    req.headers.authorization = `Bearer ${req.body._authToken}`;
    req.method = String(req.body._method).toUpperCase();
    const { _authToken, _method, ...cleanBody } = req.body;
    req.body = cleanBody;
  }
  next();
});

// ─── Request Logger (production) ─────────────────────────
app.use((req, _res, next) => {
  if (req.path.startsWith('/api/')) {
    console.log(`[API] ${req.method} ${req.path}`);
  }
  next();
});

// ─── Initialize Database ────────────────────────────────
initializeDatabase();

// ─── Routes ─────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/vehicles', mileageRoutes);
app.use('/api/vehicles', serviceRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/vin', vinRoutes);
app.use('/api/admin', adminRoutes);

// ─── Health Check ───────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Debug / Diagnostics (no auth) ──────────────────────
app.get('/api/debug', (_req, res) => {
  const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
  const indexHtml = path.join(clientDist, 'index.html');
  let dbCheck: any = { ok: false };
  try {
    const userCount = (db.prepare('SELECT COUNT(*) as c FROM users').get() as any).c;
    const vehicleCount = (db.prepare('SELECT COUNT(*) as c FROM vehicles').get() as any).c;
    const ruleCount = (db.prepare('SELECT COUNT(*) as c FROM schedule_rules').get() as any).c;
    const svcDefCount = (db.prepare('SELECT COUNT(*) as c FROM service_definitions').get() as any).c;
    dbCheck = { ok: true, users: userCount, vehicles: vehicleCount, rules: ruleCount, serviceDefinitions: svcDefCount };
  } catch (e: any) {
    dbCheck = { ok: false, error: e.message };
  }
  res.json({
    env: {
      NODE_ENV: process.env.NODE_ENV,
      SERVER_ROOT: process.env.SERVER_ROOT,
      PORT: process.env.PORT,
      cwd: process.cwd(),
      __dirname,
    },
    paths: {
      dbPath: DB_PATH,
      dbExists: fs.existsSync(DB_PATH),
      clientDist,
      clientDistExists: fs.existsSync(clientDist),
      indexHtml,
      indexHtmlExists: fs.existsSync(indexHtml),
      clientAssets: fs.existsSync(clientDist) ? fs.readdirSync(clientDist) : [],
    },
    database: dbCheck,
    timestamp: new Date().toISOString(),
  });
});

// ─── Cron Jobs ──────────────────────────────────────────
// Run every day at 6:00 AM — update statuses and send notifications
cron.schedule('0 6 * * *', () => {
  console.log('[Cron] Running daily maintenance status check...');
  updateAllVehicleStatuses();
  generateNotifications();
  console.log('[Cron] Daily check complete.');
});

// ─── Serve React client in production ────────────────────
const clientDist = path.resolve(__dirname, '..', '..', 'client', 'dist');
console.log(`[Boot] clientDist resolved to: ${clientDist}`);
console.log(`[Boot] clientDist exists: ${fs.existsSync(clientDist)}`);
console.log(`[Boot] index.html exists: ${fs.existsSync(path.join(clientDist, 'index.html'))}`);
console.log(`[Boot] DB path: ${DB_PATH}`);
console.log(`[Boot] DB exists: ${fs.existsSync(DB_PATH)}`);

app.use(express.static(clientDist));

// SPA fallback — only for non-API routes
app.get('*', (req, res) => {
  // Never serve HTML for API routes — return proper 404 instead
  if (req.path.startsWith('/api/')) {
    res.status(404).json({ error: `API endpoint not found: ${req.method} ${req.path}` });
    return;
  }
  const indexPath = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(500).send(`SPA index.html not found at ${indexPath}`);
  }
});

// ─── Start Server ───────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API docs: http://localhost:${PORT}/api/health`);
  console.log(`Serving client from ${clientDist}`);
});

export default app;
