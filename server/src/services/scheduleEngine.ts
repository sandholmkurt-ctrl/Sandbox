import { v4 as uuidv4 } from 'uuid';
import db from '../database';
import { Vehicle, ScheduleRule, VehicleSchedule } from '../types';

/**
 * Generate a maintenance schedule for a newly-added vehicle.
 * Matches schedule_rules by make/model/year/engine/drive_type and
 * creates vehicle_schedules entries with computed next-due values.
 */
export function generateScheduleForVehicle(vehicleId: string): void {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId) as Vehicle | undefined;
  if (!vehicle) return;

  // Find matching rules — most specific first (highest priority wins)
  const rules = db.prepare(`
    SELECT sr.*, sd.name, sr.source as rule_source, sr.notes as rule_notes
    FROM schedule_rules sr
    JOIN service_definitions sd ON sd.id = sr.service_definition_id AND sd.is_active = 1
    WHERE
      (sr.make IS NULL OR LOWER(sr.make) = LOWER(?))
      AND (sr.model IS NULL OR LOWER(sr.model) = LOWER(?))
      AND (sr.year_min IS NULL OR sr.year_min <= ?)
      AND (sr.year_max IS NULL OR sr.year_max >= ?)
      AND (sr.engine IS NULL OR LOWER(sr.engine) = LOWER(?))
      AND (sr.drive_type IS NULL OR LOWER(sr.drive_type) = LOWER(?))
    ORDER BY sr.priority DESC
  `).all(
    vehicle.make, vehicle.model, vehicle.year, vehicle.year,
    vehicle.engine || '', vehicle.drive_type || ''
  ) as (ScheduleRule & { name: string })[];

  // Deduplicate by service_definition_id (keep highest priority)
  const seen = new Set<string>();
  const uniqueRules = rules.filter(r => {
    if (seen.has(r.service_definition_id)) return false;
    seen.add(r.service_definition_id);
    return true;
  });

  const now = new Date();

  for (const rule of uniqueRules) {
    const nextDueMileage = rule.mileage_interval
      ? vehicle.current_mileage + rule.mileage_interval
      : null;

    let nextDueDate: string | null = null;
    if (rule.month_interval) {
      const d = new Date(now);
      d.setMonth(d.getMonth() + rule.month_interval);
      nextDueDate = d.toISOString().split('T')[0];
    }

    const id = uuidv4();
    db.prepare(`
      INSERT INTO vehicle_schedules 
        (id, vehicle_id, service_definition_id, mileage_interval, month_interval, is_combined, next_due_mileage, next_due_date, status, source, source_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)
    `).run(
      id, vehicle.id, rule.service_definition_id,
      rule.mileage_interval, rule.month_interval,
      rule.is_combined, nextDueMileage, nextDueDate,
      (rule as any).rule_source || null, (rule as any).rule_notes || null
    );
  }

  // Run status evaluation
  updateVehicleStatuses(vehicleId);
}

/**
 * Re-evaluate the status of all schedule items for a vehicle
 * based on the current mileage and date.
 */
export function updateVehicleStatuses(vehicleId: string): void {
  const vehicle = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(vehicleId) as Vehicle | undefined;
  if (!vehicle) return;

  // Get user settings for lead distances
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(vehicle.user_id) as any;
  const leadMiles = user?.reminder_lead_miles ?? 500;
  const leadDays = user?.reminder_lead_days ?? 30;

  const schedules = db.prepare(
    'SELECT * FROM vehicle_schedules WHERE vehicle_id = ?'
  ).all(vehicle.id) as VehicleSchedule[];

  const now = new Date();
  const leadDate = new Date(now);
  leadDate.setDate(leadDate.getDate() + leadDays);

  for (const schedule of schedules) {
    let status: 'ok' | 'upcoming' | 'overdue' = 'ok';

    // Check mileage-based status
    if (schedule.next_due_mileage !== null) {
      if (vehicle.current_mileage >= schedule.next_due_mileage) {
        status = 'overdue';
      } else if (vehicle.current_mileage >= schedule.next_due_mileage - leadMiles) {
        status = 'upcoming';
      }
    }

    // Check time-based status (if combined, overdue wins)
    if (schedule.next_due_date !== null) {
      const dueDate = new Date(schedule.next_due_date);
      if (now >= dueDate) {
        status = 'overdue';
      } else if (leadDate >= dueDate && status !== 'overdue') {
        status = 'upcoming';
      }
    }

    // For combined intervals: overdue if EITHER condition is met
    // For non-combined: only overdue if BOTH are met
    if (!schedule.is_combined && schedule.next_due_mileage !== null && schedule.next_due_date !== null) {
      const mileageOverdue = vehicle.current_mileage >= schedule.next_due_mileage;
      const dateOverdue = now >= new Date(schedule.next_due_date);
      if (!mileageOverdue && !dateOverdue) {
        const mileageUpcoming = vehicle.current_mileage >= schedule.next_due_mileage - leadMiles;
        const dateUpcoming = leadDate >= new Date(schedule.next_due_date);
        status = (mileageUpcoming || dateUpcoming) ? 'upcoming' : 'ok';
      } else {
        status = (mileageOverdue || dateOverdue) ? 'overdue' : 'upcoming';
      }
    }

    if (status !== schedule.status) {
      db.prepare(
        "UPDATE vehicle_schedules SET status = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(status, schedule.id);
    }
  }
}

/**
 * Run status checks for ALL vehicles in the system.
 * Called periodically by the cron job.
 */
export function updateAllVehicleStatuses(): void {
  const vehicles = db.prepare('SELECT id FROM vehicles').all() as { id: string }[];
  for (const v of vehicles) {
    updateVehicleStatuses(v.id);
  }
}
