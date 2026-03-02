import { Pool, PoolClient, QueryResultRow } from 'pg';

// ─── Connection ──────────────────────────────────────────
// Render injects DATABASE_URL for managed PostgreSQL databases.
// Locally you can set DATABASE_URL or fall back to a local dev PG.
const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/vehicle_maintenance';

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Render managed PG requires SSL in production
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[PG Pool] Unexpected error on idle client', err);
});

export { DATABASE_URL };

// ─── Helper: query shortcut ─────────────────────────────
// Drop-in for the most common usage patterns.
export async function query<T extends QueryResultRow = any>(text: string, params?: any[]) {
  return pool.query<T>(text, params);
}

export async function queryOne<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<T | undefined> {
  const result = await pool.query<T>(text, params);
  return result.rows[0];
}

export async function queryAll<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await pool.query<T>(text, params);
  return result.rows;
}

export async function execute(text: string, params?: any[]): Promise<void> {
  await pool.query(text, params);
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// ─── Schema initialisation ──────────────────────────────
export async function initializeDatabase(): Promise<void> {
  await pool.query(`
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Vehicles table
    CREATE TABLE IF NOT EXISTS vehicles (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vin TEXT,
      year INTEGER NOT NULL,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      engine TEXT,
      trim_level TEXT,
      drive_type TEXT,
      current_mileage INTEGER DEFAULT 0,
      reminders_enabled INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Mileage history table
    CREATE TABLE IF NOT EXISTS mileage_entries (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      mileage INTEGER NOT NULL,
      recorded_at TIMESTAMPTZ DEFAULT NOW(),
      notes TEXT
    );

    -- Service definitions (master list of service types)
    CREATE TABLE IF NOT EXISTS service_definitions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT,
      service_type TEXT NOT NULL DEFAULT 'change',
      is_active INTEGER DEFAULT 1,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Maintenance schedule rules (OEM-based)
    CREATE TABLE IF NOT EXISTS schedule_rules (
      id TEXT PRIMARY KEY,
      service_definition_id TEXT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Vehicle-specific maintenance schedule (generated per vehicle)
    CREATE TABLE IF NOT EXISTS vehicle_schedules (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      service_definition_id TEXT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
      mileage_interval INTEGER,
      month_interval INTEGER,
      is_combined INTEGER DEFAULT 1,
      next_due_mileage INTEGER,
      next_due_date TEXT,
      status TEXT DEFAULT 'ok' CHECK(status IN ('ok', 'upcoming', 'overdue')),
      source TEXT,
      source_notes TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Service history (completed services)
    CREATE TABLE IF NOT EXISTS service_history (
      id TEXT PRIMARY KEY,
      vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      vehicle_schedule_id TEXT REFERENCES vehicle_schedules(id) ON DELETE SET NULL,
      service_definition_id TEXT NOT NULL REFERENCES service_definitions(id) ON DELETE CASCADE,
      completed_date TEXT NOT NULL,
      mileage_at_service INTEGER NOT NULL,
      cost REAL,
      notes TEXT,
      shop_name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Notifications table
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      vehicle_id TEXT REFERENCES vehicles(id) ON DELETE SET NULL,
      vehicle_schedule_id TEXT REFERENCES vehicle_schedules(id) ON DELETE SET NULL,
      type TEXT NOT NULL CHECK(type IN ('upcoming', 'overdue', 'info')),
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      is_read INTEGER DEFAULT 0,
      email_sent INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
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

export default pool;
