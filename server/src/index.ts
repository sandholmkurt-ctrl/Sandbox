import express from 'express';
import cors from 'cors';
import cron from 'node-cron';
import { initializeDatabase } from './database';
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

// ─── Middleware ──────────────────────────────────────────
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }));
app.use(express.json());

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

// ─── Cron Jobs ──────────────────────────────────────────
// Run every day at 6:00 AM — update statuses and send notifications
cron.schedule('0 6 * * *', () => {
  console.log('[Cron] Running daily maintenance status check...');
  updateAllVehicleStatuses();
  generateNotifications();
  console.log('[Cron] Daily check complete.');
});

// ─── Start Server ───────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`API docs: http://localhost:${PORT}/api/health`);
});

export default app;
