import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { Vehicle, VehicleSchedule, User } from '../types';

/**
 * Check all vehicles and generate notifications for upcoming/overdue services.
 * This should be called periodically (e.g., daily via cron).
 */
export function generateNotifications(): void {
  const vehicles = db.prepare(`
    SELECT v.*, u.email, u.email_notifications, u.first_name
    FROM vehicles v
    JOIN users u ON u.id = v.user_id
    WHERE v.reminders_enabled = 1
  `).all() as (Vehicle & { email: string; email_notifications: number; first_name: string | null })[];

  for (const vehicle of vehicles) {
    const schedules = db.prepare(`
      SELECT vs.*, sd.name as service_name
      FROM vehicle_schedules vs
      JOIN service_definitions sd ON sd.id = vs.service_definition_id
      WHERE vs.vehicle_id = ? AND vs.status IN ('upcoming', 'overdue')
    `).all(vehicle.id) as (VehicleSchedule & { service_name: string })[];

    for (const schedule of schedules) {
      // Check if we already sent a notification for this schedule in its current state
      const existing = db.prepare(`
        SELECT id FROM notifications
        WHERE vehicle_schedule_id = ? AND type = ?
        AND created_at > datetime('now', '-7 days')
      `).get(schedule.id, schedule.status);

      if (existing) continue;

      const vehicleLabel = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
      const type = schedule.status as 'upcoming' | 'overdue';

      let title: string;
      let message: string;

      if (type === 'overdue') {
        title = `Overdue: ${schedule.service_name}`;
        message = `${schedule.service_name} is overdue on your ${vehicleLabel}.` +
          (schedule.next_due_mileage ? ` Was due at ${schedule.next_due_mileage.toLocaleString()} miles.` : '') +
          (schedule.next_due_date ? ` Was due on ${schedule.next_due_date}.` : '');
      } else {
        title = `Upcoming: ${schedule.service_name}`;
        message = `${schedule.service_name} is coming due on your ${vehicleLabel}.` +
          (schedule.next_due_mileage ? ` Due at ${schedule.next_due_mileage.toLocaleString()} miles.` : '') +
          (schedule.next_due_date ? ` Due on ${schedule.next_due_date}.` : '');
      }

      const id = uuidv4();
      db.prepare(`
        INSERT INTO notifications (id, user_id, vehicle_id, vehicle_schedule_id, type, title, message)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(id, vehicle.user_id, vehicle.id, schedule.id, type, title, message);

      // In production: send email if email_notifications is enabled
      if (vehicle.email_notifications) {
        console.log(`[Email] Would send to ${vehicle.email}: ${title} — ${message}`);
        db.prepare('UPDATE notifications SET email_sent = 1 WHERE id = ?').run(id);
      }
    }
  }
}
