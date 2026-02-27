import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DB_DIR, 'vehicle_maintenance.db');

if (!fs.existsSync(DB_DIR)) {
  fs.mkdirSync(DB_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeDatabase(): void {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      is_admin INTEGER DEFAULT 0,
      email_notifications INTEGER DEFAULT 1,
      reminder_lead_miles INTEGER DEFAULT 500,
      reminder_lead_days INTEGER DEFAULT 30,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Vehicles table
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      vin TEXT,
      year INTEGER NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      engine TEXT,
      trim_level TEXT,
      drive_type TEXT,
      current_mileage INTEGER DEFAULT 0,
      reminders_enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Mileage history table
    CREATE TABLE IF NOT EXISTS mileage_entries (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      mileage INTEGER NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now')),
      notes TEXT,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE
    );

    -- Service definitions (master list of service types)
    CREATE TABLE IF NOT EXISTS service_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    );

    -- Maintenance schedule rules (OEM-based)
    CREATE TABLE IF NOT EXISTS schedule_rules (
      id TEXT PRIMARY KEY,
      service_definition_id TEXT NOT NULL,
      year_min INTEGER,
      year_max INTEGER,
      make TEXT,
      model TEXT,
      engine TEXT,
      drive_type TEXT,
      mileage_interval INTEGER,
      month_interval INTEGER,
      is_combined INTEGER DEFAULT 1,
      priority INTEGER DEFAULT 0,
      source TEXT,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (service_definition_id) REFERENCES service_definitions(id) ON DELETE CASCADE
    );

    -- Vehicle-specific maintenance schedule (generated per vehicle)
    CREATE TABLE IF NOT EXISTS vehicle_schedules (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      service_definition_id TEXT NOT NULL,
      mileage_interval INTEGER,
      month_interval INTEGER,
      is_combined INTEGER DEFAULT 1,
      next_due_mileage INTEGER,
      next_due_date TEXT,
      status TEXT DEFAULT 'ok' CHECK(status IN ('ok', 'upcoming', 'overdue')),
      source TEXT,
      source_notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY (service_definition_id) REFERENCES service_definitions(id) ON DELETE CASCADE
    );

    -- Service history (completed services)
    CREATE TABLE IF NOT EXISTS service_history (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL,
      vehicle_schedule_id TEXT,
      service_definition_id TEXT NOT NULL,
      completed_date TEXT NOT NULL,
      mileage_at_service INTEGER NOT NULL,
      cost REAL,
      notes TEXT,
      shop_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_schedule_id) REFERENCES vehicle_schedules(id) ON DELETE SET NULL,
      FOREIGN KEY (service_definition_id) REFERENCES service_definitions(id) ON DELETE CASCADE
    );

    -- Notifications table
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      vehicle_id TEXT,
      vehicle_schedule_id TEXT,
      type TEXT NOT NULL CHECK(type IN ('upcoming', 'overdue', 'info')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      email_sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
      FOREIGN KEY (vehicle_schedule_id) REFERENCES vehicle_schedules(id) ON DELETE SET NULL
    );

    -- Indexes for performance
    CREATE INDEX IF NOT EXISTS idx_vehicles_user_id ON vehicles(user_id);
    CREATE INDEX IF NOT EXISTS idx_mileage_entries_vehicle_id ON mileage_entries(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_vehicle_schedules_vehicle_id ON vehicle_schedules(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_vehicle_schedules_status ON vehicle_schedules(status);
    CREATE INDEX IF NOT EXISTS idx_service_history_vehicle_id ON service_history(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
    CREATE INDEX IF NOT EXISTS idx_schedule_rules_make_model ON schedule_rules(make, model);
  `);
}

export default db;
