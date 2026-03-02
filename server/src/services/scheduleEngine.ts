import { v4 as uuidv4 } from 'uuid';
import { queryOne, queryAll, execute } from '../database';
import { Vehicle, ScheduleRule, VehicleSchedule } from '../types';

/**
 * Generate a maintenance schedule for a newly-added vehicle.
 * Matches schedule_rules by make/model/year/engine/drive_type and
 * creates vehicle_schedules entries with computed next-due values.
 */
export async function generateScheduleForVehicle(vehicleId: string): Promise<void> {
  const vehicle = await queryOne<Vehicle>('SELECT * FROM vehicles WHERE id = $1', [vehicleId]);
  if (!vehicle) return;

  // Find matching rules — most specific first (highest priority wins)
  const rules = await queryAll<ScheduleRule & { name: string; rule_source: string; rule_notes: string }>(`
    SELECT sr.*, sd.name, sr.source as rule_source, sr.notes as rule_notes
    FROM schedule_rules sr
    JOIN service_definitions sd ON sd.id = sr.service_definition_id AND sd.is_active = 1
    WHERE
      (sr.make IS NULL OR LOWER(sr.make) = LOWER($1))
      AND (sr.model IS NULL OR LOWER(sr.model) = LOWER($2))
      AND (sr.year_min IS NULL OR sr.year_min <= $3)
      AND (sr.year_max IS NULL OR sr.year_max >= $4)
      AND (sr.engine IS NULL OR LOWER(sr.engine) = LOWER($5))
      AND (sr.drive_type IS NULL OR LOWER(sr.drive_type) = LOWER($6))
    ORDER BY sr.priority DESC
  `, [
    vehicle.make, vehicle.model, vehicle.year, vehicle.year,
    vehicle.engine || '', vehicle.drive_type || ''
  ]);

  // Deduplicate by service_definition_id (keep highest priority)
  const seen = new Set<string>();
  const uniqueRules = rules.filter(r => {
    if (seen.has(r.service_definition_id)) return false;
    seen.add(r.service_definition_id);
    return true;
  });

  // Skip services that already have a vehicle_schedule entry (safe for re-runs)
  const existing = await queryAll<{ service_definition_id: string }>(
    'SELECT service_definition_id FROM vehicle_schedules WHERE vehicle_id = $1',
    [vehicleId]
  );
  const existingIds = new Set(existing.map(e => e.service_definition_id));
  const newRules = uniqueRules.filter(r => !existingIds.has(r.service_definition_id));

  const now = new Date();

  for (const rule of newRules) {
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
    await execute(`
      INSERT INTO vehicle_schedules 
        (id, vehicle_id, service_definition_id, mileage_interval, month_interval, is_combined, next_due_mileage, next_due_date, status, source, source_notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ok', $9, $10)
    `, [
      schedId, vehicle.id, rule.service_definition_id,
      rule.mileage_interval, rule.month_interval,
      rule.is_combined, nextDueMileage, nextDueDate,
      (rule as any).source || (rule as any).rule_source || null,
      (rule as any).notes || (rule as any).rule_notes || null
    ]);

    // ── Create assumed service-history record ───────────────────
    // When a vehicle is added with mileage > 0, we assume the owner
    // kept up with the schedule.  Insert ONE history record at the
    // most recent interval milestone so the dashboard shows a non-empty
    // service history and the "last service" baseline is recorded.
    if (lastServiceMileage !== null && lastServiceMileage > 0) {
      await execute(`
        INSERT INTO service_history
          (id, vehicle_id, vehicle_schedule_id, service_definition_id, completed_date, mileage_at_service, notes)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        uuidv4(),
        vehicle.id,
        schedId,
        rule.service_definition_id,
        now.toISOString().split('T')[0],
        lastServiceMileage,
        `Assumed on-schedule service at ${lastServiceMileage.toLocaleString()} mi (auto-generated)`
      ]);
    }
  }

  // Run status evaluation
  await updateVehicleStatuses(vehicleId);
}

/**
 * Re-evaluate the status of all schedule items for a vehicle
 * based on the current mileage and date.
 */
export async function updateVehicleStatuses(vehicleId: string): Promise<void> {
  const vehicle = await queryOne<Vehicle>('SELECT * FROM vehicles WHERE id = $1', [vehicleId]);
  if (!vehicle) return;

  // Get user settings for lead distances
  const user = await queryOne<any>('SELECT * FROM users WHERE id = $1', [vehicle.user_id]);
  const leadMiles = user?.reminder_lead_miles ?? 500;
  const leadDays = user?.reminder_lead_days ?? 30;

  const schedules = await queryAll<VehicleSchedule>(
    'SELECT * FROM vehicle_schedules WHERE vehicle_id = $1',
    [vehicle.id]
  );

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
      await execute(
        "UPDATE vehicle_schedules SET status = $1, updated_at = NOW() WHERE id = $2",
        [status, schedule.id]
      );
    }
  }
}

/**
 * Run status checks for ALL vehicles in the system.
 * Called periodically by the cron job.
 */
export async function updateAllVehicleStatuses(): Promise<void> {
  const vehicles = await queryAll<{ id: string }>('SELECT id FROM vehicles');
  for (const v of vehicles) {
    await updateVehicleStatuses(v.id);
  }
}
