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
    let nextDueMileage: number | null = null;
    let lastServiceMileage: number | null = null;

    if (rule.mileage_interval) {
      if (vehicle.current_mileage > 0) {
        // Assume all previous services were performed on schedule.
        // Calculate the most recent interval boundary at or below current mileage.
        lastServiceMileage =
          Math.floor(vehicle.current_mileage / rule.mileage_interval) *
          rule.mileage_interval;
        nextDueMileage = lastServiceMileage + rule.mileage_interval;
      } else {
        // Brand-new vehicle (0 miles) — first service at the interval
        nextDueMileage = rule.mileage_interval;
      }
    }

    // Time-based: when adding a vehicle we don't know when services were
    // last performed, only mileage.  Use now + month_interval so the
    // vehicle doesn't start with time-based overdues.
    let nextDueDate: string | null = null;
    if (rule.month_interval) {
      const d = new Date(now);
      d.setMonth(d.getMonth() + rule.month_interval);
      nextDueDate = d.toISOString().split('T')[0];
    }

    const schedId = uuidv4();
    db.prepare(`
      INSERT INTO vehicle_schedules 
        (id, vehicle_id, service_definition_id, mileage_interval, month_interval, is_combined, next_due_mileage, next_due_date, status, source, source_notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'ok', ?, ?)
    `).run(
      schedId, vehicle.id, rule.service_definition_id,
      rule.mileage_interval, rule.month_interval,
      rule.is_combined, nextDueMileage, nextDueDate,
      (rule as any).source || (rule as any).rule_source || null, (rule as any).notes || (rule as any).rule_notes || null
    );

    // ── Create assumed service-history record ───────────────────
    // When a vehicle is added with mileage > 0, we assume the owner
    // kept up with the schedule.  Insert ONE history record at the
    // most recent interval milestone so the dashboard shows a non-empty
    // service history and the "last service" baseline is recorded.
    if (lastServiceMileage !== null && lastServiceMileage > 0) {
      db.prepare(`
        INSERT INTO service_history
          (id, vehicle_id, vehicle_schedule_id, service_definition_id, completed_date, mileage_at_service, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(),
        vehicle.id,
        schedId,
        rule.service_definition_id,
        now.toISOString().split('T')[0],
        lastServiceMileage,
        `Assumed on-schedule service at ${lastServiceMileage.toLocaleString()} mi (auto-generated)`
      );
    }
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

  // ── Phase 1: Advance schedules past current mileage ───────────
  // When mileage has been updated past the next_due_mileage, assume
  // services were performed on schedule and advance to the next
  // interval boundary.  This prevents false overdues when users
  // update mileage in large jumps.
  for (const schedule of schedules) {
    if (
      schedule.mileage_interval &&
      schedule.mileage_interval > 0 &&
      schedule.next_due_mileage !== null &&
      vehicle.current_mileage >= schedule.next_due_mileage
    ) {
      const interval = schedule.mileage_interval;
      const lastServiceMileage =
        Math.floor(vehicle.current_mileage / interval) * interval;
      const newNextDueMileage = lastServiceMileage + interval;

      // Only advance if the schedule actually needs to move forward
      if (newNextDueMileage > schedule.next_due_mileage) {
        const updateParts = ['next_due_mileage = ?', "updated_at = datetime('now')"];
        const updateVals: any[] = [newNextDueMileage];

        // Also reset time-based due date so it doesn't trigger false overdue
        if (schedule.month_interval) {
          const d = new Date(now);
          d.setMonth(d.getMonth() + schedule.month_interval);
          updateParts.push('next_due_date = ?');
          updateVals.push(d.toISOString().split('T')[0]);
        }

        updateVals.push(schedule.id);
        db.prepare(
          `UPDATE vehicle_schedules SET ${updateParts.join(', ')} WHERE id = ?`
        ).run(...updateVals);

        // Create assumed service-history record at the latest interval
        // milestone (avoid duplicates)
        if (lastServiceMileage > 0) {
          const existing = db.prepare(`
            SELECT id FROM service_history
            WHERE vehicle_schedule_id = ? AND mileage_at_service = ?
          `).get(schedule.id, lastServiceMileage);

          if (!existing) {
            db.prepare(`
              INSERT INTO service_history
                (id, vehicle_id, vehicle_schedule_id, service_definition_id,
                 completed_date, mileage_at_service, notes)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `).run(
              uuidv4(),
              vehicle.id,
              schedule.id,
              schedule.service_definition_id,
              now.toISOString().split('T')[0],
              lastServiceMileage,
              `Assumed on-schedule service at ${lastServiceMileage.toLocaleString()} mi (auto-generated)`
            );
          }
        }

        // Update local object so Phase 2 status evaluation uses new values
        schedule.next_due_mileage = newNextDueMileage;
        if (schedule.month_interval) {
          const d = new Date(now);
          d.setMonth(d.getMonth() + schedule.month_interval);
          schedule.next_due_date = d.toISOString().split('T')[0];
        }
      }
    }
  }

  // ── Phase 2: Evaluate status ──────────────────────────────────
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
