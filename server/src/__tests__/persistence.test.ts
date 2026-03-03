/**
 * PostgreSQL persistence integration tests
 *
 * These tests call the REAL seed.ts code (as a subprocess) with DATABASE_URL
 * pointed at a test PostgreSQL database.  They verify the actual code paths.
 *
 *  1. Real seed() populates a fresh PG DB (28 service defs, 349+ rules, demo user)
 *  2. Re-running seed() on a populated DB skips destructive operations
 *  3. User-added data (e.g. a new vehicle) survives a re-seed
 *  4. Dropping all tables and re-running seed() recreates everything
 *     (simulates fresh deploy — now safe because PG is external)
 *  5. DATABASE_URL env var is respected by the real database.ts module
 *
 * Requires: a running PostgreSQL with DATABASE_URL or default
 *           postgresql://postgres:postgres@localhost:5432/vehicle_maintenance_test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import { Client } from 'pg';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// ─── config ───────────────────────────────────────────────────────────

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:postgres@localhost:5432/vehicle_maintenance_test';

const SERVER_DIR = path.resolve(__dirname, '..', '..');
const SEED_SCRIPT = path.join(SERVER_DIR, 'src', 'seed.ts');

// ─── helpers ──────────────────────────────────────────────────────────

/** Check if we can connect to the test PG database */
async function canConnectToPg(): Promise<boolean> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  try {
    await client.connect();
    await client.query('SELECT 1');
    await client.end();
    return true;
  } catch {
    try { await client.end(); } catch { /* ignore */ }
    return false;
  }
}

/** Open a PG client for inspection queries */
async function openPg(): Promise<Client> {
  const client = new Client({ connectionString: TEST_DATABASE_URL });
  await client.connect();
  return client;
}

/** Run the real seed.ts with DATABASE_URL set to test database */
function runRealSeed(): string {
  const env = {
    ...process.env,
    DATABASE_URL: TEST_DATABASE_URL,
    SERVER_ROOT: SERVER_DIR,
  };
  const output = execSync(
    `npx tsx "${SEED_SCRIPT}"`,
    { cwd: SERVER_DIR, env, encoding: 'utf-8', timeout: 60_000 }
  );
  return output;
}

/** Drop all application tables to simulate a fresh database */
async function dropAllTables(): Promise<void> {
  const client = await openPg();
  try {
    await client.query(`
      DROP TABLE IF EXISTS notifications CASCADE;
      DROP TABLE IF EXISTS vehicle_schedules CASCADE;
      DROP TABLE IF EXISTS mileage_history CASCADE;
      DROP TABLE IF EXISTS service_history CASCADE;
      DROP TABLE IF EXISTS schedule_rules CASCADE;
      DROP TABLE IF EXISTS service_definitions CASCADE;
      DROP TABLE IF EXISTS vehicles CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);
  } finally {
    await client.end();
  }
}

// ─── Skip guard ───────────────────────────────────────────────────────

let pgAvailable = false;

beforeAll(async () => {
  pgAvailable = await canConnectToPg();
  if (!pgAvailable) {
    console.warn(
      `⚠  Skipping persistence tests — cannot connect to PostgreSQL at ${TEST_DATABASE_URL}\n` +
      '   Set TEST_DATABASE_URL or start a local PG instance to run these tests.'
    );
  }
});

// ─── Tests ────────────────────────────────────────────────────────────

describe('Real seed() — fresh PostgreSQL database', () => {
  beforeAll(async () => {
    if (!pgAvailable) return;
    await dropAllTables();
    runRealSeed();
  });

  afterAll(async () => {
    if (!pgAvailable) return;
    await dropAllTables();
  });

  it('populates 28 service definitions', async () => {
    if (!pgAvailable) return;
    const client = await openPg();
    const res = await client.query('SELECT COUNT(*)::int as cnt FROM service_definitions');
    expect(res.rows[0].cnt).toBe(28);
    await client.end();
  });

  it('populates 349+ schedule rules', async () => {
    if (!pgAvailable) return;
    const client = await openPg();
    const res = await client.query('SELECT COUNT(*)::int as cnt FROM schedule_rules');
    expect(res.rows[0].cnt).toBeGreaterThanOrEqual(349);
    await client.end();
  });

  it('creates the demo user (demo@example.com)', async () => {
    if (!pgAvailable) return;
    const client = await openPg();
    const res = await client.query(
      'SELECT email, first_name FROM users WHERE email = $1',
      ['demo@example.com']
    );
    expect(res.rows[0]).toBeDefined();
    expect(res.rows[0].email).toBe('demo@example.com');
    expect(res.rows[0].first_name).toBe('Demo');
    await client.end();
  });

  it('creates the admin user', async () => {
    if (!pgAvailable) return;
    const client = await openPg();
    const res = await client.query('SELECT email, is_admin FROM users WHERE is_admin = true');
    expect(res.rows.length).toBeGreaterThanOrEqual(1);
    expect(res.rows[0].is_admin).toBe(true);
    await client.end();
  });

  it('creates the demo vehicle (2021 Toyota 4Runner)', async () => {
    if (!pgAvailable) return;
    const client = await openPg();
    const res = await client.query('SELECT year, make, model FROM vehicles LIMIT 1');
    expect(res.rows[0]).toBeDefined();
    expect(res.rows[0].year).toBe(2021);
    expect(res.rows[0].make).toBe('Toyota');
    expect(res.rows[0].model).toBe('4Runner');
    await client.end();
  });
});

describe('Real seed() — idempotent re-run preserves data', () => {
  let userVehicleId: string;

  beforeAll(async () => {
    if (!pgAvailable) return;

    // Fresh start
    await dropAllTables();
    runRealSeed();

    // Simulate user adding a vehicle (like adding a 2026 Kia Carnival)
    const client = await openPg();
    const userRes = await client.query(
      'SELECT id FROM users WHERE email = $1',
      ['demo@example.com']
    );
    const userId = userRes.rows[0].id;

    userVehicleId = uuidv4();
    await client.query(
      `INSERT INTO vehicles (id, user_id, year, make, model, current_mileage)
       VALUES ($1, $2, 2026, 'Kia', 'Carnival', 500)`,
      [userVehicleId, userId]
    );

    // Also record a service history entry
    const svcRes = await client.query('SELECT id FROM service_definitions LIMIT 1');
    await client.query(
      `INSERT INTO service_history (id, vehicle_id, service_definition_id, completed_date, mileage_at_service, cost, notes)
       VALUES ($1, $2, $3, '2026-02-15', 500, 45.00, 'First oil change')`,
      [uuidv4(), userVehicleId, svcRes.rows[0].id]
    );
    await client.end();

    // Run 2: re-seed (simulates Render redeploy — PG data persists)
    const output = runRealSeed();
    expect(output).toContain('skipping seed to preserve data');
  });

  afterAll(async () => {
    if (!pgAvailable) return;
    await dropAllTables();
  });

  it('still has 28 service definitions (not re-seeded)', async () => {
    if (!pgAvailable) return;
    const client = await openPg();
    const res = await client.query('SELECT COUNT(*)::int as cnt FROM service_definitions');
    expect(res.rows[0].cnt).toBe(28);
    await client.end();
  });

  it('preserves user-added vehicle (Kia Carnival)', async () => {
    if (!pgAvailable) return;
    const client = await openPg();
    const res = await client.query('SELECT * FROM vehicles WHERE id = $1', [userVehicleId]);
    expect(res.rows[0]).toBeDefined();
    expect(res.rows[0].make).toBe('Kia');
    expect(res.rows[0].model).toBe('Carnival');
    expect(res.rows[0].year).toBe(2026);
    expect(res.rows[0].current_mileage).toBe(500);
    await client.end();
  });

  it('preserves user service history', async () => {
    if (!pgAvailable) return;
    const client = await openPg();
    const res = await client.query(
      'SELECT * FROM service_history WHERE vehicle_id = $1',
      [userVehicleId]
    );
    expect(res.rows[0]).toBeDefined();
    expect(res.rows[0].notes).toBe('First oil change');
    expect(parseFloat(res.rows[0].cost)).toBe(45.0);
    await client.end();
  });

  it('demo user still exists', async () => {
    if (!pgAvailable) return;
    const client = await openPg();
    const res = await client.query(
      'SELECT id FROM users WHERE email = $1',
      ['demo@example.com']
    );
    expect(res.rows.length).toBe(1);
    await client.end();
  });

  it('has 2 vehicles total (original + user-added)', async () => {
    if (!pgAvailable) return;
    const client = await openPg();
    const res = await client.query('SELECT COUNT(*)::int as cnt FROM vehicles');
    expect(res.rows[0].cnt).toBe(2);
    await client.end();
  });
});

describe('PostgreSQL persistence (THE FIX)', () => {
  /*
   * Unlike SQLite on Render free tier (ephemeral filesystem),
   * PostgreSQL data persists across deploys because it lives in
   * Render's managed database, not on the web service filesystem.
   *
   * These tests verify that:
   *  - Dropping tables + re-seeding recreates everything (simulates initial deploy)
   *  - Data survives re-seed without table drops (simulates normal redeploy)
   */
  afterAll(async () => {
    if (!pgAvailable) return;
    await dropAllTables();
  });

  it('dropping tables and re-seeding recreates all data', async () => {
    if (!pgAvailable) return;

    // Seed once
    await dropAllTables();
    runRealSeed();

    // User adds data
    const client1 = await openPg();
    const userRes = await client1.query(
      'SELECT id FROM users WHERE email = $1',
      ['demo@example.com']
    );
    await client1.query(
      `INSERT INTO vehicles (id, user_id, year, make, model, current_mileage)
       VALUES ($1, $2, 2026, 'Kia', 'Carnival', 500)`,
      [uuidv4(), userRes.rows[0].id]
    );
    const beforeCount = await client1.query('SELECT COUNT(*)::int as cnt FROM vehicles');
    expect(beforeCount.rows[0].cnt).toBe(2); // 4Runner + Carnival
    await client1.end();

    // *** Simulate total wipe (like dropping DB or fresh PG instance) ***
    await dropAllTables();

    // Re-seed from scratch
    const output = runRealSeed();
    expect(output).toContain('Fresh database detected');

    // Verify: user's Kia Carnival is GONE (tables were dropped)
    const client2 = await openPg();
    const vehicles = await client2.query('SELECT COUNT(*)::int as cnt FROM vehicles');
    expect(vehicles.rows[0].cnt).toBe(1); // only demo 4Runner

    const kia = await client2.query("SELECT * FROM vehicles WHERE make = 'Kia'");
    expect(kia.rows.length).toBe(0); // DATA LOST (but only if tables dropped)

    const defs = await client2.query('SELECT COUNT(*)::int as cnt FROM service_definitions');
    expect(defs.rows[0].cnt).toBe(28);
    await client2.end();
  });

  it('normal redeploy preserves all data (PG persists across deploys)', async () => {
    if (!pgAvailable) return;

    // Fresh start
    await dropAllTables();
    runRealSeed();

    // User adds data
    const client1 = await openPg();
    const userRes = await client1.query(
      'SELECT id FROM users WHERE email = $1',
      ['demo@example.com']
    );
    const kiaId = uuidv4();
    await client1.query(
      `INSERT INTO vehicles (id, user_id, year, make, model, current_mileage)
       VALUES ($1, $2, 2026, 'Kia', 'Carnival', 500)`,
      [kiaId, userRes.rows[0].id]
    );
    await client1.end();

    // Simulate redeploy: seed runs again (PG data still there — no table drops)
    const output = runRealSeed();
    expect(output).toContain('skipping seed to preserve data');

    const client2 = await openPg();
    const vehicles = await client2.query('SELECT COUNT(*)::int as cnt FROM vehicles');
    expect(vehicles.rows[0].cnt).toBe(2); // 4Runner + Carnival PRESERVED

    const kia = await client2.query("SELECT * FROM vehicles WHERE make = 'Kia'");
    expect(kia.rows.length).toBe(1);
    expect(kia.rows[0].model).toBe('Carnival');
    await client2.end();
  });
});

describe('DATABASE_URL env var', () => {
  afterAll(async () => {
    if (!pgAvailable) return;
    await dropAllTables();
  });

  it('seed connects to the database specified by DATABASE_URL', async () => {
    if (!pgAvailable) return;

    await dropAllTables();
    runRealSeed();

    const client = await openPg();
    const defs = await client.query('SELECT COUNT(*)::int as cnt FROM service_definitions');
    expect(defs.rows[0].cnt).toBe(28);
    await client.end();
  });
});
