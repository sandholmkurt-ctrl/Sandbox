/**
 * Persistence integration tests
 *
 * These tests call the REAL seed.ts code (as a subprocess) with DB_PATH
 * pointed at a temp file.  They verify the actual code paths, not simulations.
 *
 *  1. Real seed() populates a fresh DB (28 service defs, 349 rules, demo user)
 *  2. Re-running seed() on a populated DB skips destructive operations
 *  3. User-added data (e.g. a new vehicle) survives a re-seed
 *  4. Deleting the DB file and re-running seed() recreates everything (simulates
 *     ephemeral filesystem — this is what's happening on Render free tier)
 *  5. DB_PATH env var is respected by the real database.ts module
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'child_process';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

// ─── helpers ──────────────────────────────────────────────────────────

const SERVER_DIR = path.resolve(__dirname, '..', '..');
const SEED_SCRIPT = path.join(SERVER_DIR, 'src', 'seed.ts');

/** Create a temp dir and return the DB path inside it */
function makeTempDbPath(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-persist-'));
  return path.join(dir, 'vehicle_maintenance.db');
}

/** Run the real seed.ts with DB_PATH set to a temp path */
function runRealSeed(dbPath: string): string {
  const env = {
    ...process.env,
    DB_PATH: dbPath,
    SERVER_ROOT: SERVER_DIR,
  };
  const output = execSync(
    `npx tsx "${SEED_SCRIPT}"`,
    { cwd: SERVER_DIR, env, encoding: 'utf-8', timeout: 60_000 }
  );
  return output;
}

/** Open an existing DB (read-only inspection) */
function openDb(dbPath: string): Database.Database {
  return new Database(dbPath);
}

/** Clean up temp dir */
function cleanupTempDb(dbPath: string): void {
  const dir = path.dirname(dbPath);
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('Real seed() — fresh database', () => {
  let dbPath: string;

  beforeAll(() => {
    dbPath = makeTempDbPath();
    runRealSeed(dbPath);
  });

  afterAll(() => cleanupTempDb(dbPath));

  it('creates the DB file at DB_PATH', () => {
    expect(fs.existsSync(dbPath)).toBe(true);
    const stat = fs.statSync(dbPath);
    expect(stat.size).toBeGreaterThan(0);
  });

  it('populates 28 service definitions', () => {
    const db = openDb(dbPath);
    const row = db.prepare('SELECT COUNT(*) as cnt FROM service_definitions').get() as { cnt: number };
    expect(row.cnt).toBe(28);
    db.close();
  });

  it('populates 349 schedule rules', () => {
    const db = openDb(dbPath);
    const row = db.prepare('SELECT COUNT(*) as cnt FROM schedule_rules').get() as { cnt: number };
    expect(row.cnt).toBe(349);
    db.close();
  });

  it('creates the demo user (demo@example.com)', () => {
    const db = openDb(dbPath);
    const user = db.prepare('SELECT email, first_name FROM users WHERE email = ?').get('demo@example.com') as any;
    expect(user).toBeDefined();
    expect(user.email).toBe('demo@example.com');
    expect(user.first_name).toBe('Demo');
    db.close();
  });

  it('creates the admin user', () => {
    const db = openDb(dbPath);
    const admin = db.prepare('SELECT email, is_admin FROM users WHERE is_admin = 1').get() as any;
    expect(admin).toBeDefined();
    expect(admin.is_admin).toBe(1);
    db.close();
  });

  it('creates the demo vehicle (2021 Toyota 4Runner)', () => {
    const db = openDb(dbPath);
    const vehicle = db.prepare('SELECT year, make, model FROM vehicles').get() as any;
    expect(vehicle).toBeDefined();
    expect(vehicle.year).toBe(2021);
    expect(vehicle.make).toBe('Toyota');
    expect(vehicle.model).toBe('4Runner');
    db.close();
  });
});

describe('Real seed() — idempotent re-run preserves data', () => {
  let dbPath: string;
  let userVehicleId: string;

  beforeAll(() => {
    dbPath = makeTempDbPath();

    // Run 1: initial seed
    runRealSeed(dbPath);

    // Simulate user adding a vehicle (like adding a 2026 Kia Carnival)
    const db = openDb(dbPath);
    const demoUser = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@example.com') as any;
    userVehicleId = uuidv4();
    db.prepare(
      `INSERT INTO vehicles (id, user_id, year, make, model, current_mileage)
       VALUES (?, ?, 2026, 'Kia', 'Carnival', 500)`
    ).run(userVehicleId, demoUser.id);

    // Also record a service history entry
    const svcDef = db.prepare('SELECT id FROM service_definitions LIMIT 1').get() as any;
    db.prepare(
      `INSERT INTO service_history (id, vehicle_id, service_definition_id, completed_date, mileage_at_service, cost, notes)
       VALUES (?, ?, ?, '2026-02-15', 500, 45.00, 'First oil change')`
    ).run(uuidv4(), userVehicleId, svcDef.id);
    db.close();

    // Run 2: re-seed (simulates Render redeploy with persistent disk)
    const output = runRealSeed(dbPath);
    // Verify the seed actually skipped
    expect(output).toContain('skipping seed to preserve data');
  });

  afterAll(() => cleanupTempDb(dbPath));

  it('still has 28 service definitions (not re-seeded)', () => {
    const db = openDb(dbPath);
    const row = db.prepare('SELECT COUNT(*) as cnt FROM service_definitions').get() as { cnt: number };
    expect(row.cnt).toBe(28);
    db.close();
  });

  it('preserves user-added vehicle (Kia Carnival)', () => {
    const db = openDb(dbPath);
    const kia = db.prepare('SELECT * FROM vehicles WHERE id = ?').get(userVehicleId) as any;
    expect(kia).toBeDefined();
    expect(kia.make).toBe('Kia');
    expect(kia.model).toBe('Carnival');
    expect(kia.year).toBe(2026);
    expect(kia.current_mileage).toBe(500);
    db.close();
  });

  it('preserves user service history', () => {
    const db = openDb(dbPath);
    const history = db.prepare(
      'SELECT * FROM service_history WHERE vehicle_id = ?'
    ).get(userVehicleId) as any;
    expect(history).toBeDefined();
    expect(history.notes).toBe('First oil change');
    expect(history.cost).toBe(45.0);
    db.close();
  });

  it('demo user still exists', () => {
    const db = openDb(dbPath);
    const user = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@example.com') as any;
    expect(user).toBeDefined();
    db.close();
  });

  it('has 2 vehicles total (original + user-added)', () => {
    const db = openDb(dbPath);
    const row = db.prepare('SELECT COUNT(*) as cnt FROM vehicles').get() as { cnt: number };
    expect(row.cnt).toBe(2);
    db.close();
  });
});

describe('Ephemeral filesystem simulation (THE BUG)', () => {
  /*
   * This test simulates what happens on Render free tier:
   *   1. Deploy 1: seed runs, populates DB at /var/data/vm.db
   *   2. User adds data
   *   3. Deploy 2: container destroyed, /var/data/ wiped, seed runs again
   *   4. All user data is GONE — seed creates fresh DB
   *
   * This test demonstrates that if the DB file is deleted between
   * deploys, data loss is GUARANTEED. The only fix is infrastructure-
   * level: a persistent disk must actually be mounted.
   */
  it('deleting DB file between deploys causes total data loss', () => {
    const dbPath = makeTempDbPath();

    // Deploy 1: seed
    runRealSeed(dbPath);

    // User adds data
    const db1 = openDb(dbPath);
    const user = db1.prepare('SELECT id FROM users WHERE email = ?').get('demo@example.com') as any;
    db1.prepare(
      `INSERT INTO vehicles (id, user_id, year, make, model, current_mileage)
       VALUES (?, ?, 2026, 'Kia', 'Carnival', 500)`
    ).run(uuidv4(), user.id);
    const vehiclesBefore = (db1.prepare('SELECT COUNT(*) as cnt FROM vehicles').get() as any).cnt;
    expect(vehiclesBefore).toBe(2); // 4Runner + Carnival
    db1.close();

    // *** EPHEMERAL FILESYSTEM WIPE (simulates Render free tier redeploy) ***
    fs.unlinkSync(dbPath);
    // Also remove WAL/SHM files
    try { fs.unlinkSync(dbPath + '-wal'); } catch {}
    try { fs.unlinkSync(dbPath + '-shm'); } catch {}

    expect(fs.existsSync(dbPath)).toBe(false);

    // Deploy 2: seed runs on fresh filesystem
    const output = runRealSeed(dbPath);
    expect(output).toContain('Fresh database detected'); // NOT "skipping seed"

    // Verify: user's Kia Carnival is GONE
    const db2 = openDb(dbPath);
    const vehicles = db2.prepare('SELECT COUNT(*) as cnt FROM vehicles').get() as { cnt: number };
    expect(vehicles.cnt).toBe(1); // only the demo 4Runner

    const kia = db2.prepare("SELECT * FROM vehicles WHERE make = 'Kia'").get();
    expect(kia).toBeUndefined(); // DATA LOST

    // Service defs re-seeded from scratch
    const defs = (db2.prepare('SELECT COUNT(*) as cnt FROM service_definitions').get() as any).cnt;
    expect(defs).toBe(28); // re-created
    db2.close();

    cleanupTempDb(dbPath);
  });

  it('keeping the DB file between deploys preserves all data', () => {
    const dbPath = makeTempDbPath();

    // Deploy 1
    runRealSeed(dbPath);

    // User adds data
    const db1 = openDb(dbPath);
    const user = db1.prepare('SELECT id FROM users WHERE email = ?').get('demo@example.com') as any;
    const kiaId = uuidv4();
    db1.prepare(
      `INSERT INTO vehicles (id, user_id, year, make, model, current_mileage)
       VALUES (?, ?, 2026, 'Kia', 'Carnival', 500)`
    ).run(kiaId, user.id);
    db1.close();

    // Deploy 2: DB file still exists (persistent disk scenario)
    const output = runRealSeed(dbPath);
    expect(output).toContain('skipping seed to preserve data');

    const db2 = openDb(dbPath);
    const vehicles = db2.prepare('SELECT COUNT(*) as cnt FROM vehicles').get() as { cnt: number };
    expect(vehicles.cnt).toBe(2); // 4Runner + Carnival PRESERVED

    const kia = db2.prepare("SELECT * FROM vehicles WHERE make = 'Kia'").get() as any;
    expect(kia).toBeDefined();
    expect(kia.model).toBe('Carnival');
    db2.close();

    cleanupTempDb(dbPath);
  });
});

describe('DB_PATH env var', () => {
  it('seed creates DB at the exact path specified by DB_PATH', () => {
    const customDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vm-dbpath-'));
    const customPath = path.join(customDir, 'subdir', 'custom.db');

    // subdir doesn't exist yet — seed (via database.ts) should create it
    expect(fs.existsSync(path.dirname(customPath))).toBe(false);

    runRealSeed(customPath);

    expect(fs.existsSync(customPath)).toBe(true);
    const db = openDb(customPath);
    const defs = (db.prepare('SELECT COUNT(*) as cnt FROM service_definitions').get() as any).cnt;
    expect(defs).toBe(28);
    db.close();

    fs.rmSync(customDir, { recursive: true, force: true });
  });
});
