import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db, { initializeDatabase } from './database';
import { generateScheduleForVehicle } from './services/scheduleEngine';

/**
 * Seeds the database with manufacturer-recommended service definitions and
 * schedule rules sourced from official owner's manuals.
 *
 * Sources:
 *   Toyota — Toyota Warranty and Maintenance Guide (2010-2024 models)
 *   Ford   — Ford Scheduled Maintenance Guide (2015-2024 models)
 *   Honda  — Honda Maintenance Minder / Owner's Manual (2016-2024 models)
 *   Chevrolet — GM Owner's Manual Maintenance Schedule (2015-2024 models)
 */
async function seed() {
  console.log('Initializing database...');
  initializeDatabase();

  // Clear old data so we can re-seed from scratch
  db.prepare('DELETE FROM vehicle_schedules').run();
  db.prepare('DELETE FROM schedule_rules').run();
  db.prepare('DELETE FROM service_definitions').run();

  // ═══════════════════════════════════════════════════════════════════
  //  SERVICE DEFINITIONS
  // ═══════════════════════════════════════════════════════════════════
  console.log('Seeding service definitions...');

  const serviceDefinitions = [
    // Engine
    { name: 'Engine Oil & Filter', description: 'Replace engine oil and oil filter with manufacturer-specified grade', category: 'Engine' },
    { name: 'Engine Air Filter', description: 'Replace engine air cleaner element', category: 'Engine' },
    { name: 'Spark Plugs', description: 'Replace spark plugs (iridium-tipped where specified)', category: 'Engine' },
    { name: 'Drive Belt (Serpentine)', description: 'Inspect and replace drive/serpentine belt', category: 'Engine' },
    { name: 'Timing Belt/Chain', description: 'Inspect or replace timing belt/chain and tensioner', category: 'Engine' },
    { name: 'PCV Valve', description: 'Inspect or replace positive crankcase ventilation valve', category: 'Engine' },
    { name: 'Coolant (Antifreeze)', description: 'Drain and replace engine coolant per OEM spec', category: 'Engine' },
    { name: 'Fuel Filter', description: 'Replace fuel filter (where serviceable)', category: 'Engine' },
    { name: 'Valve Clearance Adjustment', description: 'Check and adjust intake/exhaust valve clearances', category: 'Engine' },

    // Transmission / Drivetrain
    { name: 'Automatic Transmission Fluid', description: 'Replace automatic transmission fluid and filter', category: 'Drivetrain' },
    { name: 'Manual Transmission Fluid', description: 'Replace manual transmission gear oil', category: 'Drivetrain' },
    { name: 'Transfer Case Fluid', description: 'Replace transfer case fluid (4WD/AWD)', category: 'Drivetrain' },
    { name: 'Front Differential Fluid', description: 'Replace front differential gear oil', category: 'Drivetrain' },
    { name: 'Rear Differential Fluid', description: 'Replace rear differential gear oil', category: 'Drivetrain' },
    { name: 'Propeller Shaft Lubrication', description: 'Grease propeller shaft universal joints and slip yoke', category: 'Drivetrain' },

    // Brakes
    { name: 'Brake Fluid', description: 'Replace brake fluid (DOT 3/4 per OEM spec)', category: 'Brakes' },
    { name: 'Brake Pads & Rotors Inspection', description: 'Inspect brake pad thickness, rotor condition, and calipers', category: 'Brakes' },
    { name: 'Parking Brake Adjustment', description: 'Inspect and adjust parking brake', category: 'Brakes' },

    // Tires & Wheels
    { name: 'Tire Rotation', description: 'Rotate tires per manufacturer pattern', category: 'Tires & Wheels' },
    { name: 'Wheel Alignment', description: 'Check and adjust wheel alignment', category: 'Tires & Wheels' },

    // HVAC
    { name: 'Cabin Air Filter', description: 'Replace cabin air (pollen) filter', category: 'HVAC' },

    // Steering & Suspension
    { name: 'Power Steering Fluid', description: 'Inspect level and replace power steering fluid', category: 'Steering' },
    { name: 'Ball Joints & Dust Covers', description: 'Inspect front suspension ball joints and dust covers', category: 'Suspension' },
    { name: 'Steering Linkage & Boots', description: 'Inspect steering gear box, linkage, and boots', category: 'Suspension' },

    // Electrical / Misc
    { name: 'Battery & Terminals', description: 'Inspect battery condition, clean terminals, test charge', category: 'Electrical' },
    { name: 'Wiper Blades', description: 'Replace windshield wiper blades', category: 'Exterior' },
    { name: 'Multi-Point Inspection', description: 'Comprehensive vehicle safety and systems inspection', category: 'General' },
    { name: 'Exhaust System Inspection', description: 'Inspect exhaust pipes, muffler, hangers, and connections', category: 'General' },
  ];

  const serviceIds: Record<string, string> = {};
  const insertDef = db.prepare(`
    INSERT INTO service_definitions (id, name, description, category)
    VALUES (?, ?, ?, ?)
  `);

  for (const def of serviceDefinitions) {
    const id = uuidv4();
    insertDef.run(id, def.name, def.description, def.category);
    serviceIds[def.name] = id;
  }

  console.log(`  ✓ ${serviceDefinitions.length} service definitions created`);

  // ═══════════════════════════════════════════════════════════════════
  //  SCHEDULE RULES — sourced from manufacturer owner's manuals
  // ═══════════════════════════════════════════════════════════════════
  console.log('Seeding OEM schedule rules...');

  interface RuleDef {
    service: string;
    make?: string;
    model?: string;
    yearMin?: number;
    yearMax?: number;
    engine?: string;
    driveType?: string;
    mileage: number;
    months: number;
    priority: number;
    source: string;
    notes?: string;
  }

  const rules: RuleDef[] = [
    // ─────────────────────────────────────────────────────
    //  UNIVERSAL FALLBACK (priority 0)
    //  Conservative generic intervals for makes not yet covered
    // ─────────────────────────────────────────────────────
    { service: 'Engine Oil & Filter',          mileage: 7500,   months: 12, priority: 0, source: 'Generic — most OEMs recommend 7,500-10,000 mi with synthetic oil' },
    { service: 'Tire Rotation',                mileage: 7500,   months: 12, priority: 0, source: 'Generic — industry standard 5,000-7,500 mi' },
    { service: 'Engine Air Filter',            mileage: 30000,  months: 36, priority: 0, source: 'Generic — typical OEM interval' },
    { service: 'Cabin Air Filter',             mileage: 20000,  months: 24, priority: 0, source: 'Generic — typical OEM interval' },
    { service: 'Brake Pads & Rotors Inspection', mileage: 15000, months: 12, priority: 0, source: 'Generic — annual inspection standard' },
    { service: 'Brake Fluid',                  mileage: 30000,  months: 36, priority: 0, source: 'Generic — most OEMs specify 2-3 years' },
    { service: 'Spark Plugs',                  mileage: 60000,  months: 60, priority: 0, source: 'Generic — iridium plugs typical at 60K' },
    { service: 'Coolant (Antifreeze)',         mileage: 60000,  months: 60, priority: 0, source: 'Generic — varies widely by OEM' },
    { service: 'Automatic Transmission Fluid', mileage: 60000,  months: 60, priority: 0, source: 'Generic — varies widely by OEM' },
    { service: 'Drive Belt (Serpentine)',       mileage: 60000,  months: 60, priority: 0, source: 'Generic — inspect at 60K, replace as needed' },
    { service: 'Battery & Terminals',          mileage: 30000,  months: 12, priority: 0, source: 'Generic — annual inspection' },
    { service: 'Wiper Blades',                 mileage: 20000,  months: 12, priority: 0, source: 'Generic — replace annually or when streaking' },
    { service: 'Multi-Point Inspection',       mileage: 15000,  months: 12, priority: 0, source: 'Generic — annual safety inspection' },
    { service: 'Wheel Alignment',              mileage: 30000,  months: 24, priority: 0, source: 'Generic — every 2-3 years or after suspension work' },
    { service: 'Power Steering Fluid',         mileage: 50000,  months: 48, priority: 0, source: 'Generic — inspect periodically' },
    { service: 'Exhaust System Inspection',    mileage: 30000,  months: 24, priority: 0, source: 'Generic — inspect every 2 years' },


    // ═════════════════════════════════════════════════════════════════
    //  TOYOTA — Toyota Warranty & Maintenance Guide
    //  Source: Toyota Scheduled Maintenance Guide (2010-2024)
    //  All modern Toyotas use 0W-20 synthetic; 10K oil change intervals
    // ═════════════════════════════════════════════════════════════════

    // ── Toyota Universal (all models 2018+) ─────────────────────
    { service: 'Engine Oil & Filter', make: 'Toyota', yearMin: 2018, mileage: 10000, months: 12, priority: 10,
      source: "Toyota Warranty & Maintenance Guide — 'Replace engine oil and filter every 10,000 miles or 12 months'" },
    { service: 'Tire Rotation', make: 'Toyota', yearMin: 2018, mileage: 5000, months: 6, priority: 10,
      source: "Toyota Warranty & Maintenance Guide — 'Rotate tires every 5,000 miles or 6 months'",
      notes: 'Toyota recommends rotation at every oil change visit or every 5K miles' },
    { service: 'Multi-Point Inspection', make: 'Toyota', yearMin: 2018, mileage: 5000, months: 6, priority: 10,
      source: 'Toyota Maintenance Guide — Multi-point inspection at every service visit' },
    { service: 'Cabin Air Filter', make: 'Toyota', yearMin: 2018, mileage: 25000, months: 24, priority: 10,
      source: "Toyota Maintenance Guide — 'Replace cabin air filter every 25,000 miles'" },
    { service: 'Engine Air Filter', make: 'Toyota', yearMin: 2018, mileage: 30000, months: 36, priority: 10,
      source: "Toyota Maintenance Guide — 'Inspect at 30,000 miles, replace as necessary or at 60,000 miles'",
      notes: 'Inspect at 30K; replace at 60K or sooner if dirty. Using 30K for inspection reminder.' },
    { service: 'Spark Plugs', make: 'Toyota', yearMin: 2018, mileage: 60000, months: 60, priority: 10,
      source: "Toyota Maintenance Guide — 'Replace spark plugs at 60,000 miles'",
      notes: 'Iridium-tipped plugs standard on all modern Toyota engines' },
    { service: 'Drive Belt (Serpentine)', make: 'Toyota', yearMin: 2018, mileage: 60000, months: 60, priority: 10,
      source: "Toyota Maintenance Guide — 'Inspect drive belt at 60,000 miles, replace as needed'" },
    { service: 'Brake Pads & Rotors Inspection', make: 'Toyota', yearMin: 2018, mileage: 10000, months: 12, priority: 10,
      source: "Toyota Maintenance Guide — 'Inspect brake linings and drums/pads and discs at every scheduled service'" },
    { service: 'Brake Fluid', make: 'Toyota', yearMin: 2018, mileage: 30000, months: 36, priority: 10,
      source: "Toyota Maintenance Guide — 'Replace brake fluid every 30,000 miles or 36 months'" },
    { service: 'Battery & Terminals', make: 'Toyota', yearMin: 2018, mileage: 15000, months: 12, priority: 10,
      source: 'Toyota Maintenance Guide — Inspect battery at every major service interval' },
    { service: 'Wiper Blades', make: 'Toyota', yearMin: 2018, mileage: 10000, months: 12, priority: 10,
      source: "Toyota Maintenance Guide — 'Inspect wiper blades at every service, replace annually'" },
    { service: 'Coolant (Antifreeze)', make: 'Toyota', yearMin: 2018, mileage: 100000, months: 120, priority: 10,
      source: "Toyota Maintenance Guide — 'Replace engine coolant at 100,000 miles, then every 50,000 miles thereafter'",
      notes: 'First fill uses Toyota Super Long-Life Coolant (SLLC). After initial 100K, interval drops to 50K.' },

    // ── Toyota 4Runner (2010-2024, 5th/6th Gen, 4.0L V6 / 2.4T) ─
    { service: 'Engine Oil & Filter', make: 'Toyota', model: '4Runner', yearMin: 2010, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "5th/6th Gen 4Runner Owner's Manual — 10,000 mi / 12 months with 0W-20 synthetic" },
    { service: 'Tire Rotation', make: 'Toyota', model: '4Runner', yearMin: 2010, yearMax: 2024, mileage: 5000, months: 6, priority: 20,
      source: "4Runner Owner's Manual — Every 5,000 mi or 6 months" },
    { service: 'Automatic Transmission Fluid', make: 'Toyota', model: '4Runner', yearMin: 2010, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "4Runner Owner's Manual — 'Replace automatic transmission fluid at 60,000 miles under normal conditions'",
      notes: 'Under severe conditions (towing, dusty roads, trailer): 30,000 miles' },
    { service: 'Transfer Case Fluid', make: 'Toyota', model: '4Runner', yearMin: 2010, yearMax: 2024, driveType: '4WD', mileage: 30000, months: 24, priority: 25,
      source: "4Runner Owner's Manual — 'Replace transfer case oil every 30,000 miles'" },
    { service: 'Front Differential Fluid', make: 'Toyota', model: '4Runner', yearMin: 2010, yearMax: 2024, driveType: '4WD', mileage: 30000, months: 24, priority: 25,
      source: "4Runner Owner's Manual — 'Replace front differential oil every 30,000 miles'" },
    { service: 'Rear Differential Fluid', make: 'Toyota', model: '4Runner', yearMin: 2010, yearMax: 2024, mileage: 30000, months: 24, priority: 20,
      source: "4Runner Owner's Manual — 'Replace rear differential oil every 30,000 miles'",
      notes: 'Limited-slip differential may use additive — check manual' },
    { service: 'Propeller Shaft Lubrication', make: 'Toyota', model: '4Runner', yearMin: 2010, yearMax: 2024, driveType: '4WD', mileage: 15000, months: 12, priority: 25,
      source: "4Runner Owner's Manual — 'Lubricate propeller shaft every 15,000 miles'" },
    { service: 'Ball Joints & Dust Covers', make: 'Toyota', model: '4Runner', yearMin: 2010, yearMax: 2024, mileage: 15000, months: 12, priority: 20,
      source: "4Runner Owner's Manual — 'Inspect ball joints and dust covers every 15,000 miles'" },
    { service: 'Steering Linkage & Boots', make: 'Toyota', model: '4Runner', yearMin: 2010, yearMax: 2024, mileage: 15000, months: 12, priority: 20,
      source: "4Runner Owner's Manual — 'Inspect steering linkage and boots every 15,000 miles'" },
    { service: 'Exhaust System Inspection', make: 'Toyota', model: '4Runner', yearMin: 2010, yearMax: 2024, mileage: 30000, months: 24, priority: 20,
      source: "4Runner Owner's Manual — 'Inspect exhaust system every 30,000 miles'" },

    // ── Toyota Tacoma (2016-2024, 3rd Gen) ──────────────────────
    { service: 'Engine Oil & Filter', make: 'Toyota', model: 'Tacoma', yearMin: 2016, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Tacoma Owner's Manual — 10,000 mi / 12 months with 0W-20 synthetic" },
    { service: 'Tire Rotation', make: 'Toyota', model: 'Tacoma', yearMin: 2016, yearMax: 2024, mileage: 5000, months: 6, priority: 20,
      source: "Tacoma Owner's Manual — Every 5,000 mi or 6 months" },
    { service: 'Automatic Transmission Fluid', make: 'Toyota', model: 'Tacoma', yearMin: 2016, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Tacoma Owner's Manual — Replace AT fluid at 60,000 mi (normal); 30,000 mi (severe)" },
    { service: 'Transfer Case Fluid', make: 'Toyota', model: 'Tacoma', yearMin: 2016, yearMax: 2024, driveType: '4WD', mileage: 30000, months: 24, priority: 25,
      source: "Tacoma Owner's Manual — Replace transfer case oil every 30,000 mi" },
    { service: 'Front Differential Fluid', make: 'Toyota', model: 'Tacoma', yearMin: 2016, yearMax: 2024, driveType: '4WD', mileage: 30000, months: 24, priority: 25,
      source: "Tacoma Owner's Manual — Replace front differential oil every 30,000 mi" },
    { service: 'Rear Differential Fluid', make: 'Toyota', model: 'Tacoma', yearMin: 2016, yearMax: 2024, mileage: 30000, months: 24, priority: 20,
      source: "Tacoma Owner's Manual — Replace rear differential oil every 30,000 mi" },
    { service: 'Propeller Shaft Lubrication', make: 'Toyota', model: 'Tacoma', yearMin: 2016, yearMax: 2024, driveType: '4WD', mileage: 15000, months: 12, priority: 25,
      source: "Tacoma Owner's Manual — Lubricate propeller shaft every 15,000 mi" },
    { service: 'Ball Joints & Dust Covers', make: 'Toyota', model: 'Tacoma', yearMin: 2016, yearMax: 2024, mileage: 15000, months: 12, priority: 20,
      source: "Tacoma Owner's Manual — Inspect ball joints and dust covers every 15,000 mi" },

    // ── Toyota Tundra (2022-2024, 3rd Gen, i-FORCE / i-FORCE MAX) ─
    { service: 'Engine Oil & Filter', make: 'Toyota', model: 'Tundra', yearMin: 2022, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Tundra Owner's Manual — 10,000 mi / 12 months with 0W-20 synthetic" },
    { service: 'Tire Rotation', make: 'Toyota', model: 'Tundra', yearMin: 2022, yearMax: 2024, mileage: 5000, months: 6, priority: 20,
      source: "Tundra Owner's Manual — Every 5,000 mi or 6 months" },
    { service: 'Automatic Transmission Fluid', make: 'Toyota', model: 'Tundra', yearMin: 2022, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Tundra Owner's Manual — Replace AT fluid at 60,000 mi" },
    { service: 'Transfer Case Fluid', make: 'Toyota', model: 'Tundra', yearMin: 2022, yearMax: 2024, driveType: '4WD', mileage: 30000, months: 24, priority: 25,
      source: "Tundra Owner's Manual — Replace transfer case oil every 30,000 mi" },
    { service: 'Front Differential Fluid', make: 'Toyota', model: 'Tundra', yearMin: 2022, yearMax: 2024, driveType: '4WD', mileage: 30000, months: 24, priority: 25,
      source: "Tundra Owner's Manual — Replace front differential oil every 30,000 mi" },
    { service: 'Rear Differential Fluid', make: 'Toyota', model: 'Tundra', yearMin: 2022, yearMax: 2024, mileage: 30000, months: 24, priority: 20,
      source: "Tundra Owner's Manual — Replace rear differential oil every 30,000 mi" },
    { service: 'Propeller Shaft Lubrication', make: 'Toyota', model: 'Tundra', yearMin: 2022, yearMax: 2024, driveType: '4WD', mileage: 15000, months: 12, priority: 25,
      source: "Tundra Owner's Manual — Lubricate propeller shaft every 15,000 mi" },

    // ── Toyota Tundra (2014-2021, 2nd Gen, 5.7L V8) ────────────
    { service: 'Engine Oil & Filter', make: 'Toyota', model: 'Tundra', yearMin: 2014, yearMax: 2021, mileage: 10000, months: 12, priority: 20,
      source: "Tundra Owner's Manual (2nd Gen) — 10,000 mi / 12 months with 0W-20 synthetic" },
    { service: 'Spark Plugs', make: 'Toyota', model: 'Tundra', yearMin: 2014, yearMax: 2021, mileage: 60000, months: 60, priority: 20,
      source: "Tundra Owner's Manual (2nd Gen) — Replace spark plugs at 60,000 mi" },
    { service: 'Automatic Transmission Fluid', make: 'Toyota', model: 'Tundra', yearMin: 2014, yearMax: 2021, mileage: 60000, months: 48, priority: 20,
      source: "Tundra Owner's Manual (2nd Gen) — Replace AT fluid at 60,000 mi" },

    // ── Toyota Camry (2018-2024) ────────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Toyota', model: 'Camry', yearMin: 2018, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Camry Owner's Manual — 10,000 mi / 12 months with 0W-20 synthetic" },
    { service: 'Tire Rotation', make: 'Toyota', model: 'Camry', yearMin: 2018, yearMax: 2024, mileage: 5000, months: 6, priority: 20,
      source: "Camry Owner's Manual — Every 5,000 mi or 6 months" },
    { service: 'Automatic Transmission Fluid', make: 'Toyota', model: 'Camry', yearMin: 2018, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Camry Owner's Manual — Replace AT fluid at 60,000 mi",
      notes: "Toyota WS fluid. Some owner's manuals say 'inspect' — replacement widely recommended." },
    { service: 'Coolant (Antifreeze)', make: 'Toyota', model: 'Camry', yearMin: 2018, yearMax: 2024, mileage: 100000, months: 120, priority: 20,
      source: "Camry Owner's Manual — First coolant replacement at 100,000 mi, then 50,000 mi" },


    // ═════════════════════════════════════════════════════════════════
    //  FORD — Ford Scheduled Maintenance Guide
    //  Source: Ford Owner's Manual / Scheduled Maintenance (2015-2024)
    //  Ford uses Intelligent Oil-Life Monitor (IOLM); max interval listed
    // ═════════════════════════════════════════════════════════════════

    // ── Ford Universal (all models 2018+) ───────────────────────
    { service: 'Engine Oil & Filter', make: 'Ford', yearMin: 2018, mileage: 10000, months: 12, priority: 10,
      source: "Ford Scheduled Maintenance — 'Change per IOLM or every 12 months / 10,000 miles max'",
      notes: 'Ford Intelligent Oil-Life Monitor may call for oil change sooner under severe use' },
    { service: 'Tire Rotation', make: 'Ford', yearMin: 2018, mileage: 10000, months: 12, priority: 10,
      source: "Ford Scheduled Maintenance — 'Rotate tires every 10,000 miles or 12 months'" },
    { service: 'Multi-Point Inspection', make: 'Ford', yearMin: 2018, mileage: 10000, months: 12, priority: 10,
      source: "Ford Scheduled Maintenance — 'Perform multi-point inspection at every oil change service'" },
    { service: 'Cabin Air Filter', make: 'Ford', yearMin: 2018, mileage: 20000, months: 24, priority: 10,
      source: "Ford Scheduled Maintenance — 'Replace cabin air filter every 20,000 miles'" },
    { service: 'Engine Air Filter', make: 'Ford', yearMin: 2018, mileage: 30000, months: 36, priority: 10,
      source: "Ford Scheduled Maintenance — 'Replace engine air filter at 30,000 miles under normal conditions'" },
    { service: 'Spark Plugs', make: 'Ford', yearMin: 2018, mileage: 60000, months: 60, priority: 10,
      source: "Ford Scheduled Maintenance — 'Replace spark plugs at 60,000 miles (EcoBoost/turbo)'",
      notes: 'Naturally aspirated V8 (5.0L Coyote) may extend to 100K. Using 60K as conservative interval.' },
    { service: 'Coolant (Antifreeze)', make: 'Ford', yearMin: 2018, mileage: 100000, months: 120, priority: 10,
      source: "Ford Scheduled Maintenance — 'Replace Motorcraft Orange coolant at 100,000 miles, then every 60,000 miles'",
      notes: 'First fill interval. Subsequent refills use Motorcraft Yellow at 60K intervals.' },
    { service: 'Brake Fluid', make: 'Ford', yearMin: 2018, mileage: 45000, months: 36, priority: 10,
      source: "Ford Scheduled Maintenance — 'Inspect brake fluid at every oil change; replace every 3 years or as needed'",
      notes: 'Ford does not specify a mileage interval — using 45K / 36 months as practical guideline' },
    { service: 'Drive Belt (Serpentine)', make: 'Ford', yearMin: 2018, mileage: 60000, months: 60, priority: 10,
      source: "Ford Scheduled Maintenance — 'Inspect accessory drive belt at 60,000 miles, replace as needed'" },
    { service: 'Battery & Terminals', make: 'Ford', yearMin: 2018, mileage: 20000, months: 12, priority: 10,
      source: "Ford Scheduled Maintenance — 'Inspect battery and terminals at every service interval'" },

    // ── Ford F-150 (2021-2024, 14th Gen) ────────────────────────
    { service: 'Engine Oil & Filter', make: 'Ford', model: 'F-150', yearMin: 2021, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "F-150 Owner's Manual — Per IOLM, max 10,000 mi / 12 months (5W-30 or 0W-20 per engine)" },
    { service: 'Automatic Transmission Fluid', make: 'Ford', model: 'F-150', yearMin: 2021, yearMax: 2024, mileage: 150000, months: 120, priority: 20,
      source: "F-150 Owner's Manual — 'Replace automatic transmission fluid at 150,000 miles under normal conditions'",
      notes: 'Severe duty (towing, hot climate): 60,000 miles. 10-speed (10R80) uses Mercon ULV.' },
    { service: 'Transfer Case Fluid', make: 'Ford', model: 'F-150', yearMin: 2021, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "F-150 Owner's Manual — 'Replace transfer case fluid every 60,000 miles'" },
    { service: 'Front Differential Fluid', make: 'Ford', model: 'F-150', yearMin: 2021, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "F-150 Owner's Manual — 'Replace front axle fluid every 60,000 miles'" },
    { service: 'Rear Differential Fluid', make: 'Ford', model: 'F-150', yearMin: 2021, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "F-150 Owner's Manual — 'Replace rear axle fluid every 60,000 miles'" },
    { service: 'Fuel Filter', make: 'Ford', model: 'F-150', yearMin: 2021, yearMax: 2024, engine: '3.0L V6 Diesel', mileage: 30000, months: 24, priority: 30,
      source: "F-150 Power Stroke Diesel Supplement — 'Replace fuel filter every 30,000 miles'" },

    // ── Ford F-150 (2015-2020, 13th Gen) ────────────────────────
    { service: 'Engine Oil & Filter', make: 'Ford', model: 'F-150', yearMin: 2015, yearMax: 2020, mileage: 10000, months: 12, priority: 20,
      source: "F-150 Owner's Manual (13th Gen) — Per IOLM, max 10,000 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Ford', model: 'F-150', yearMin: 2015, yearMax: 2020, mileage: 150000, months: 120, priority: 20,
      source: "F-150 Owner's Manual (13th Gen) — 'Replace AT fluid at 150,000 mi (normal); 60,000 mi (severe)'" },
    { service: 'Spark Plugs', make: 'Ford', model: 'F-150', yearMin: 2015, yearMax: 2020, mileage: 60000, months: 60, priority: 20,
      source: "F-150 Owner's Manual (13th Gen) — Replace spark plugs at 60,000 mi (EcoBoost); 100,000 mi (5.0L)" },

    // ── Ford Bronco (2021-2024) ─────────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Ford', model: 'Bronco', yearMin: 2021, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Bronco Owner's Manual — Per IOLM, max 10,000 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Ford', model: 'Bronco', yearMin: 2021, yearMax: 2024, mileage: 150000, months: 120, priority: 20,
      source: "Bronco Owner's Manual — 'Replace 10-speed AT fluid at 150,000 mi (normal); 60,000 mi (severe)'",
      notes: 'Manual transmission (Sasquatch/7-speed): Replace gear oil every 60,000 mi' },
    { service: 'Transfer Case Fluid', make: 'Ford', model: 'Bronco', yearMin: 2021, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Bronco Owner's Manual — 'Replace transfer case fluid every 60,000 mi'" },
    { service: 'Front Differential Fluid', make: 'Ford', model: 'Bronco', yearMin: 2021, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Bronco Owner's Manual — 'Replace front axle fluid every 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Ford', model: 'Bronco', yearMin: 2021, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Bronco Owner's Manual — 'Replace rear axle fluid every 60,000 mi'" },

    // ── Ford Explorer (2020-2024, 6th Gen) ──────────────────────
    { service: 'Engine Oil & Filter', make: 'Ford', model: 'Explorer', yearMin: 2020, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Explorer Owner's Manual — Per IOLM, max 10,000 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Ford', model: 'Explorer', yearMin: 2020, yearMax: 2024, mileage: 150000, months: 120, priority: 20,
      source: "Explorer Owner's Manual — 'Replace 10-speed AT fluid at 150,000 mi (normal)'" },
    { service: 'Rear Differential Fluid', make: 'Ford', model: 'Explorer', yearMin: 2020, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Explorer Owner's Manual — 'Replace rear drive unit fluid every 60,000 mi'" },

    // ── Ford Mustang (2015-2024, S550/S650) ─────────────────────
    { service: 'Engine Oil & Filter', make: 'Ford', model: 'Mustang', yearMin: 2015, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Mustang Owner's Manual — Per IOLM, max 10,000 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Ford', model: 'Mustang', yearMin: 2015, yearMax: 2024, mileage: 150000, months: 120, priority: 20,
      source: "Mustang Owner's Manual — 'Replace AT fluid at 150,000 mi (normal)'" },
    { service: 'Manual Transmission Fluid', make: 'Ford', model: 'Mustang', yearMin: 2015, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Mustang Owner's Manual — 'Replace manual transmission fluid at 60,000 mi (if equipped)'" },
    { service: 'Spark Plugs', make: 'Ford', model: 'Mustang', yearMin: 2015, yearMax: 2024, mileage: 100000, months: 84, priority: 20,
      source: "Mustang Owner's Manual — 'Replace spark plugs at 100,000 mi (5.0L Coyote NA V8)'",
      notes: 'EcoBoost 4-cyl: 60,000 mi. 5.0L V8: 100,000 mi.' },
    { service: 'Rear Differential Fluid', make: 'Ford', model: 'Mustang', yearMin: 2015, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Mustang Owner's Manual — 'Replace rear axle lubricant every 60,000 mi'" },


    // ═════════════════════════════════════════════════════════════════
    //  HONDA — Honda Maintenance Minder / Owner's Manual
    //  Source: Honda Owner's Manual (2016-2024)
    //  Honda uses Maintenance Minder codes (A/B + sub-codes 1-8)
    //  Intervals below are distance-based equivalents per the
    //  Owner's Manual Maintenance Minder Description table.
    // ═════════════════════════════════════════════════════════════════

    // ── Honda Universal (all models 2018+) ──────────────────────
    { service: 'Engine Oil & Filter', make: 'Honda', yearMin: 2018, mileage: 7500, months: 12, priority: 10,
      source: "Honda Maintenance Minder Code A/B — Oil life algorithm triggers at approx. 7,500 mi under normal driving",
      notes: 'Honda Maintenance Minder adapts to driving conditions. 7,500 mi is the typical interval; may vary from 5K-10K.' },
    { service: 'Tire Rotation', make: 'Honda', yearMin: 2018, mileage: 7500, months: 12, priority: 10,
      source: "Honda Maintenance Minder Code A — 'Rotate tires at every A service (approx. 7,500 mi)'" },
    { service: 'Engine Air Filter', make: 'Honda', yearMin: 2018, mileage: 30000, months: 36, priority: 10,
      source: "Honda Maintenance Minder Sub-code 2 — 'Replace air cleaner element'" },
    { service: 'Cabin Air Filter', make: 'Honda', yearMin: 2018, mileage: 15000, months: 24, priority: 10,
      source: "Honda Owner's Manual — 'Replace cabin air filter approximately every 15,000 miles'",
      notes: 'Not a Maintenance Minder code — manual specifies separately' },
    { service: 'Spark Plugs', make: 'Honda', yearMin: 2018, mileage: 105000, months: 84, priority: 10,
      source: "Honda Maintenance Minder Sub-code 4 — 'Replace spark plugs'",
      notes: 'Honda uses iridium spark plugs with 105,000 mi interval on most models. 1.5T may differ.' },
    { service: 'Coolant (Antifreeze)', make: 'Honda', yearMin: 2018, mileage: 120000, months: 120, priority: 10,
      source: "Honda Maintenance Minder Sub-code 5 — 'Replace engine coolant'",
      notes: 'Honda Type 2 coolant: first at 120,000 mi / 10 years, then 60,000 mi / 5 years' },
    { service: 'Brake Fluid', make: 'Honda', yearMin: 2018, mileage: 45000, months: 36, priority: 10,
      source: "Honda Maintenance Minder Sub-code 6 — 'Replace brake fluid every 3 years'",
      notes: 'Honda specifies time-based: every 3 years regardless of mileage. 45K is approximate mileage equivalent.' },
    { service: 'Automatic Transmission Fluid', make: 'Honda', yearMin: 2018, mileage: 60000, months: 48, priority: 10,
      source: "Honda Maintenance Minder Sub-code 3 — 'Replace transmission fluid'",
      notes: 'Honda DW-1 ATF. Maintenance Minder typically triggers around 30K-60K depending on driving patterns.' },
    { service: 'Drive Belt (Serpentine)', make: 'Honda', yearMin: 2018, mileage: 60000, months: 60, priority: 10,
      source: "Honda Owner's Manual — 'Inspect drive belt at 60,000 mi; replace as needed'" },
    { service: 'Valve Clearance Adjustment', make: 'Honda', yearMin: 2018, mileage: 105000, months: 84, priority: 10,
      source: "Honda Maintenance Minder Sub-code 4 — 'Adjust valve clearance'",
      notes: 'Done at same interval as spark plugs on most Honda engines' },
    { service: 'Brake Pads & Rotors Inspection', make: 'Honda', yearMin: 2018, mileage: 15000, months: 12, priority: 10,
      source: "Honda Maintenance Minder Code B — 'Inspect front and rear brakes at every B service'" },

    // ── Honda Civic (2016-2024, 10th/11th Gen) ──────────────────
    { service: 'Engine Oil & Filter', make: 'Honda', model: 'Civic', yearMin: 2016, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Civic Owner's Manual — Per Maintenance Minder, approx. 7,500 mi with 0W-20 synthetic" },
    { service: 'Automatic Transmission Fluid', make: 'Honda', model: 'Civic', yearMin: 2016, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Civic Owner's Manual — Sub-code 3, approx. every 60,000 mi under normal conditions" },

    // ── Honda Accord (2018-2024, 10th/11th Gen) ─────────────────
    { service: 'Engine Oil & Filter', make: 'Honda', model: 'Accord', yearMin: 2018, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Accord Owner's Manual — Per Maintenance Minder, approx. 7,500 mi" },
    { service: 'Automatic Transmission Fluid', make: 'Honda', model: 'Accord', yearMin: 2018, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Accord Owner's Manual — Sub-code 3, approx. every 60,000 mi" },
    { service: 'Spark Plugs', make: 'Honda', model: 'Accord', yearMin: 2018, yearMax: 2024, mileage: 105000, months: 84, priority: 20,
      source: "Accord Owner's Manual — Sub-code 4, replace at 105,000 mi (iridium)" },

    // ── Honda CR-V (2017-2024, 5th/6th Gen) ─────────────────────
    { service: 'Engine Oil & Filter', make: 'Honda', model: 'CR-V', yearMin: 2017, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "CR-V Owner's Manual — Per Maintenance Minder, approx. 7,500 mi",
      notes: '1.5L Turbo uses 0W-20 synthetic. Maintenance Minder adapts to driving.' },
    { service: 'Automatic Transmission Fluid', make: 'Honda', model: 'CR-V', yearMin: 2017, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "CR-V Owner's Manual — Sub-code 3" },
    { service: 'Rear Differential Fluid', make: 'Honda', model: 'CR-V', yearMin: 2017, yearMax: 2024, driveType: 'AWD', mileage: 30000, months: 24, priority: 25,
      source: "CR-V Owner's Manual — Sub-code 8: 'Replace rear differential fluid (AWD models)'",
      notes: 'AWD-only item. Honda Real-Time AWD uses dual-pump rear differential.' },

    // ── Honda Pilot (2016-2024, 3rd/4th Gen) ────────────────────
    { service: 'Engine Oil & Filter', make: 'Honda', model: 'Pilot', yearMin: 2016, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Pilot Owner's Manual — Per Maintenance Minder, approx. 7,500 mi" },
    { service: 'Automatic Transmission Fluid', make: 'Honda', model: 'Pilot', yearMin: 2016, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Pilot Owner's Manual — Sub-code 3, approx. every 60,000 mi",
      notes: '9-speed ZF or 10-speed Honda. Early 9-speed models may benefit from more frequent changes.' },
    { service: 'Rear Differential Fluid', make: 'Honda', model: 'Pilot', yearMin: 2016, yearMax: 2024, driveType: 'AWD', mileage: 30000, months: 24, priority: 25,
      source: "Pilot Owner's Manual — Sub-code 8: 'Replace rear differential fluid (AWD models)'" },
    { service: 'Spark Plugs', make: 'Honda', model: 'Pilot', yearMin: 2016, yearMax: 2024, mileage: 105000, months: 84, priority: 20,
      source: "Pilot Owner's Manual — Sub-code 4, replace at 105,000 mi" },


    // ═════════════════════════════════════════════════════════════════
    //  CHEVROLET — GM Owner's Manual / Maintenance Schedule
    //  Source: Chevrolet/GM Owner's Manual (2015-2024)
    //  GM uses Oil Life Monitor (OLM) system; max intervals listed
    // ═════════════════════════════════════════════════════════════════

    // ── Chevrolet Universal (all models 2018+) ──────────────────
    { service: 'Engine Oil & Filter', make: 'Chevrolet', yearMin: 2018, mileage: 7500, months: 12, priority: 10,
      source: "GM Owner's Manual — 'Change engine oil per Oil Life Monitor or at least once a year / 7,500 miles'",
      notes: 'GM Oil Life System typically triggers between 3,000-10,000 mi depending on driving' },
    { service: 'Tire Rotation', make: 'Chevrolet', yearMin: 2018, mileage: 7500, months: 12, priority: 10,
      source: "GM Owner's Manual — 'Rotate tires at each oil change or every 7,500 miles'" },
    { service: 'Engine Air Filter', make: 'Chevrolet', yearMin: 2018, mileage: 45000, months: 48, priority: 10,
      source: "GM Owner's Manual — 'Replace engine air cleaner filter at 45,000 miles under normal conditions'",
      notes: 'Severe conditions: 22,500 mi' },
    { service: 'Cabin Air Filter', make: 'Chevrolet', yearMin: 2018, mileage: 22500, months: 24, priority: 10,
      source: "GM Owner's Manual — 'Replace cabin air filter every 22,500 miles or sooner if airflow diminishes'" },
    { service: 'Brake Fluid', make: 'Chevrolet', yearMin: 2018, mileage: 45000, months: 36, priority: 10,
      source: "GM Owner's Manual — 'Replace brake fluid every 45,000 miles or 3 years'" },
    { service: 'Coolant (Antifreeze)', make: 'Chevrolet', yearMin: 2018, mileage: 150000, months: 120, priority: 10,
      source: "GM Owner's Manual — 'Replace DEX-COOL coolant at 150,000 miles or 5 years'",
      notes: 'After first replacement: every 30,000 mi or 2 years with DEX-COOL' },
    { service: 'Spark Plugs', make: 'Chevrolet', yearMin: 2018, mileage: 97500, months: 84, priority: 10,
      source: "GM Owner's Manual — 'Replace spark plugs at 97,500 miles'",
      notes: 'V8 engines (5.3L/6.2L). Turbo 4-cyl (1.4T/2.7T): 60,000 mi' },
    { service: 'Drive Belt (Serpentine)', make: 'Chevrolet', yearMin: 2018, mileage: 60000, months: 60, priority: 10,
      source: "GM Owner's Manual — 'Inspect accessory drive belt at 60,000 mi, replace as needed'" },

    // ── Chevrolet Silverado 1500 (2019-2024, T1XX) ─────────────
    { service: 'Engine Oil & Filter', make: 'Chevrolet', model: 'Silverado 1500', yearMin: 2019, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Silverado Owner's Manual — Per OLM, max 7,500 mi / 12 months (0W-20 for 5.3L/6.2L, 0W-20 for 2.7T)" },
    { service: 'Automatic Transmission Fluid', make: 'Chevrolet', model: 'Silverado 1500', yearMin: 2019, yearMax: 2024, mileage: 45000, months: 48, priority: 20,
      source: "Silverado Owner's Manual — 'Replace AT fluid and filter at 45,000 mi under normal conditions'",
      notes: '8L90/10-speed. Severe service (towing >3,500 lbs regularly): 22,500 mi' },
    { service: 'Transfer Case Fluid', make: 'Chevrolet', model: 'Silverado 1500', yearMin: 2019, yearMax: 2024, driveType: '4WD', mileage: 45000, months: 48, priority: 25,
      source: "Silverado Owner's Manual — 'Replace transfer case fluid at 45,000 mi'" },
    { service: 'Front Differential Fluid', make: 'Chevrolet', model: 'Silverado 1500', yearMin: 2019, yearMax: 2024, driveType: '4WD', mileage: 45000, months: 48, priority: 25,
      source: "Silverado Owner's Manual — 'Replace front axle fluid at 45,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Chevrolet', model: 'Silverado 1500', yearMin: 2019, yearMax: 2024, mileage: 45000, months: 48, priority: 20,
      source: "Silverado Owner's Manual — 'Replace rear axle fluid at 45,000 mi'" },
    { service: 'Spark Plugs', make: 'Chevrolet', model: 'Silverado 1500', yearMin: 2019, yearMax: 2024, mileage: 97500, months: 84, priority: 20,
      source: "Silverado Owner's Manual — 'Replace spark plugs at 97,500 mi (5.3L/6.2L V8)'",
      notes: '2.7L Turbo 4-cyl: 60,000 mi' },
    { service: 'Fuel Filter', make: 'Chevrolet', model: 'Silverado 1500', yearMin: 2019, yearMax: 2024, engine: '3.0L Diesel', mileage: 22500, months: 24, priority: 30,
      source: "Silverado Duramax Diesel Supplement — 'Replace fuel filter every 22,500 mi'" },

    // ── Chevrolet Tahoe / Suburban (2021-2024, T1XX) ────────────
    { service: 'Engine Oil & Filter', make: 'Chevrolet', model: 'Tahoe', yearMin: 2021, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Tahoe Owner's Manual — Per OLM, max 7,500 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Chevrolet', model: 'Tahoe', yearMin: 2021, yearMax: 2024, mileage: 45000, months: 48, priority: 20,
      source: "Tahoe Owner's Manual — 'Replace 10-speed AT fluid at 45,000 mi'" },
    { service: 'Transfer Case Fluid', make: 'Chevrolet', model: 'Tahoe', yearMin: 2021, yearMax: 2024, driveType: '4WD', mileage: 45000, months: 48, priority: 25,
      source: "Tahoe Owner's Manual — 'Replace transfer case fluid at 45,000 mi'" },
    { service: 'Front Differential Fluid', make: 'Chevrolet', model: 'Tahoe', yearMin: 2021, yearMax: 2024, driveType: '4WD', mileage: 45000, months: 48, priority: 25,
      source: "Tahoe Owner's Manual — 'Replace front axle fluid at 45,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Chevrolet', model: 'Tahoe', yearMin: 2021, yearMax: 2024, mileage: 45000, months: 48, priority: 20,
      source: "Tahoe Owner's Manual — 'Replace rear axle fluid at 45,000 mi'" },

    // ── Chevrolet Colorado (2023-2024, 3rd Gen) ─────────────────
    { service: 'Engine Oil & Filter', make: 'Chevrolet', model: 'Colorado', yearMin: 2023, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Colorado Owner's Manual — Per OLM, max 7,500 mi / 12 months (2.7L Turbo)" },
    { service: 'Automatic Transmission Fluid', make: 'Chevrolet', model: 'Colorado', yearMin: 2023, yearMax: 2024, mileage: 45000, months: 48, priority: 20,
      source: "Colorado Owner's Manual — 'Replace 8-speed AT fluid at 45,000 mi'" },
    { service: 'Transfer Case Fluid', make: 'Chevrolet', model: 'Colorado', yearMin: 2023, yearMax: 2024, driveType: '4WD', mileage: 45000, months: 48, priority: 25,
      source: "Colorado Owner's Manual — 'Replace transfer case fluid at 45,000 mi'" },
    { service: 'Front Differential Fluid', make: 'Chevrolet', model: 'Colorado', yearMin: 2023, yearMax: 2024, driveType: '4WD', mileage: 45000, months: 48, priority: 25,
      source: "Colorado Owner's Manual — 'Replace front axle fluid at 45,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Chevrolet', model: 'Colorado', yearMin: 2023, yearMax: 2024, mileage: 45000, months: 48, priority: 20,
      source: "Colorado Owner's Manual — 'Replace rear axle fluid at 45,000 mi'" },
    { service: 'Spark Plugs', make: 'Chevrolet', model: 'Colorado', yearMin: 2023, yearMax: 2024, mileage: 60000, months: 60, priority: 20,
      source: "Colorado Owner's Manual — 'Replace spark plugs at 60,000 mi (2.7L Turbo)'" },

    // ── Chevrolet Colorado (2015-2022, 2nd Gen) ─────────────────
    { service: 'Engine Oil & Filter', make: 'Chevrolet', model: 'Colorado', yearMin: 2015, yearMax: 2022, mileage: 7500, months: 12, priority: 20,
      source: "Colorado Owner's Manual (2nd Gen) — Per OLM, max 7,500 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Chevrolet', model: 'Colorado', yearMin: 2015, yearMax: 2022, mileage: 45000, months: 48, priority: 20,
      source: "Colorado Owner's Manual (2nd Gen) — 'Replace AT fluid at 45,000 mi'" },
    { service: 'Spark Plugs', make: 'Chevrolet', model: 'Colorado', yearMin: 2015, yearMax: 2022, mileage: 97500, months: 84, priority: 20,
      source: "Colorado Owner's Manual (2nd Gen) — 'Replace spark plugs at 97,500 mi (3.6L V6)'" },


    // ═════════════════════════════════════════════════════════════════
    //  TOYOTA — Additional Popular Models
    // ═════════════════════════════════════════════════════════════════

    // ── Toyota Highlander (2020-2024, 4th Gen, 3.5L V6 / 2.5L Hybrid) ─
    { service: 'Engine Oil & Filter', make: 'Toyota', model: 'Highlander', yearMin: 2020, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Highlander Owner's Manual — 10,000 mi / 12 months with 0W-20 synthetic" },
    { service: 'Tire Rotation', make: 'Toyota', model: 'Highlander', yearMin: 2020, yearMax: 2024, mileage: 5000, months: 6, priority: 20,
      source: "Highlander Owner's Manual — Every 5,000 mi or 6 months" },
    { service: 'Automatic Transmission Fluid', make: 'Toyota', model: 'Highlander', yearMin: 2020, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Highlander Owner's Manual — 'Replace AT fluid at 60,000 mi under normal conditions'",
      notes: 'Toyota WS ATF. Hybrid models use eCVT — no traditional ATF change required.' },
    { service: 'Coolant (Antifreeze)', make: 'Toyota', model: 'Highlander', yearMin: 2020, yearMax: 2024, mileage: 100000, months: 120, priority: 20,
      source: "Highlander Owner's Manual — First coolant at 100,000 mi, then 50,000 mi" },
    { service: 'Rear Differential Fluid', make: 'Toyota', model: 'Highlander', yearMin: 2020, yearMax: 2024, driveType: 'AWD', mileage: 30000, months: 24, priority: 25,
      source: "Highlander Owner's Manual — 'Replace rear differential oil every 30,000 mi (AWD models)'" },

    // ── Toyota Highlander (2014-2019, 3rd Gen) ──────────────────
    { service: 'Engine Oil & Filter', make: 'Toyota', model: 'Highlander', yearMin: 2014, yearMax: 2019, mileage: 10000, months: 12, priority: 20,
      source: "Highlander Owner's Manual (3rd Gen) — 10,000 mi / 12 months with 0W-20 synthetic" },
    { service: 'Tire Rotation', make: 'Toyota', model: 'Highlander', yearMin: 2014, yearMax: 2019, mileage: 5000, months: 6, priority: 20,
      source: "Highlander Owner's Manual (3rd Gen) — Every 5,000 mi or 6 months" },
    { service: 'Automatic Transmission Fluid', make: 'Toyota', model: 'Highlander', yearMin: 2014, yearMax: 2019, mileage: 60000, months: 48, priority: 20,
      source: "Highlander Owner's Manual (3rd Gen) — Replace AT fluid at 60,000 mi" },
    { service: 'Rear Differential Fluid', make: 'Toyota', model: 'Highlander', yearMin: 2014, yearMax: 2019, driveType: 'AWD', mileage: 30000, months: 24, priority: 25,
      source: "Highlander Owner's Manual (3rd Gen) — Replace rear differential oil every 30,000 mi (AWD)" },

    // ── Toyota RAV4 (2019-2024, 5th Gen, 2.5L / Hybrid) ────────
    { service: 'Engine Oil & Filter', make: 'Toyota', model: 'RAV4', yearMin: 2019, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "RAV4 Owner's Manual — 10,000 mi / 12 months with 0W-16 or 0W-20 synthetic" },
    { service: 'Tire Rotation', make: 'Toyota', model: 'RAV4', yearMin: 2019, yearMax: 2024, mileage: 5000, months: 6, priority: 20,
      source: "RAV4 Owner's Manual — Every 5,000 mi or 6 months" },
    { service: 'Automatic Transmission Fluid', make: 'Toyota', model: 'RAV4', yearMin: 2019, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "RAV4 Owner's Manual — 'Replace Direct Shift CVT fluid at 60,000 mi'",
      notes: 'Hybrid models: inspect only. Non-hybrid uses Direct Shift CVT.' },
    { service: 'Coolant (Antifreeze)', make: 'Toyota', model: 'RAV4', yearMin: 2019, yearMax: 2024, mileage: 100000, months: 120, priority: 20,
      source: "RAV4 Owner's Manual — First coolant at 100,000 mi, then 50,000 mi" },
    { service: 'Rear Differential Fluid', make: 'Toyota', model: 'RAV4', yearMin: 2019, yearMax: 2024, driveType: 'AWD', mileage: 30000, months: 24, priority: 25,
      source: "RAV4 Owner's Manual — 'Replace rear differential oil every 30,000 mi (AWD models)'" },

    // ── Toyota RAV4 (2013-2018, 4th Gen) ────────────────────────
    { service: 'Engine Oil & Filter', make: 'Toyota', model: 'RAV4', yearMin: 2013, yearMax: 2018, mileage: 10000, months: 12, priority: 20,
      source: "RAV4 Owner's Manual (4th Gen) — 10,000 mi / 12 months with 0W-20 synthetic" },
    { service: 'Automatic Transmission Fluid', make: 'Toyota', model: 'RAV4', yearMin: 2013, yearMax: 2018, mileage: 60000, months: 48, priority: 20,
      source: "RAV4 Owner's Manual (4th Gen) — Replace AT fluid at 60,000 mi" },

    // ── Toyota Corolla (2019-2024, 12th Gen) ────────────────────
    { service: 'Engine Oil & Filter', make: 'Toyota', model: 'Corolla', yearMin: 2019, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Corolla Owner's Manual — 10,000 mi / 12 months with 0W-16 or 0W-20 synthetic" },
    { service: 'Tire Rotation', make: 'Toyota', model: 'Corolla', yearMin: 2019, yearMax: 2024, mileage: 5000, months: 6, priority: 20,
      source: "Corolla Owner's Manual — Every 5,000 mi or 6 months" },
    { service: 'Automatic Transmission Fluid', make: 'Toyota', model: 'Corolla', yearMin: 2019, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Corolla Owner's Manual — 'Replace CVT fluid at 60,000 mi under normal conditions'" },
    { service: 'Coolant (Antifreeze)', make: 'Toyota', model: 'Corolla', yearMin: 2019, yearMax: 2024, mileage: 100000, months: 120, priority: 20,
      source: "Corolla Owner's Manual — First coolant at 100,000 mi, then 50,000 mi" },


    // ═════════════════════════════════════════════════════════════════
    //  KIA — Kia Owner's Manual / Maintenance Schedule
    //  Source: Kia Owner's Manual (2016-2024)
    //  Kia uses distance- and time-based intervals per owner's manual
    // ═════════════════════════════════════════════════════════════════

    // ── Kia Universal (all models 2017+) ────────────────────────
    { service: 'Engine Oil & Filter', make: 'Kia', yearMin: 2017, mileage: 7500, months: 12, priority: 10,
      source: "Kia Owner's Manual — 'Replace engine oil and filter every 7,500 miles or 12 months (full synthetic)'",
      notes: 'Turbo models (1.6T, 2.5T): 5,000 mi or 6 months under severe conditions' },
    { service: 'Tire Rotation', make: 'Kia', yearMin: 2017, mileage: 7500, months: 12, priority: 10,
      source: "Kia Owner's Manual — 'Rotate tires every 7,500 miles'" },
    { service: 'Engine Air Filter', make: 'Kia', yearMin: 2017, mileage: 30000, months: 36, priority: 10,
      source: "Kia Owner's Manual — 'Replace air cleaner filter every 30,000 miles'" },
    { service: 'Cabin Air Filter', make: 'Kia', yearMin: 2017, mileage: 15000, months: 24, priority: 10,
      source: "Kia Owner's Manual — 'Replace cabin air filter every 15,000 miles or 24 months'" },
    { service: 'Spark Plugs', make: 'Kia', yearMin: 2017, mileage: 97500, months: 84, priority: 10,
      source: "Kia Owner's Manual — 'Replace spark plugs (iridium) every 97,500 miles'" },
    { service: 'Coolant (Antifreeze)', make: 'Kia', yearMin: 2017, mileage: 120000, months: 120, priority: 10,
      source: "Kia Owner's Manual — 'Replace coolant at 120,000 miles or 10 years, then 30,000 mi / 2 yrs'" },
    { service: 'Brake Fluid', make: 'Kia', yearMin: 2017, mileage: 30000, months: 24, priority: 10,
      source: "Kia Owner's Manual — 'Inspect brake fluid every 30,000 miles or 24 months; replace as needed'" },
    { service: 'Automatic Transmission Fluid', make: 'Kia', yearMin: 2017, mileage: 60000, months: 48, priority: 10,
      source: "Kia Owner's Manual — 'Inspect AT fluid at 60,000 mi; replace if deteriorated'" },
    { service: 'Drive Belt (Serpentine)', make: 'Kia', yearMin: 2017, mileage: 60000, months: 60, priority: 10,
      source: "Kia Owner's Manual — 'Inspect drive belt at 60,000 mi; replace as needed'" },
    { service: 'Brake Pads & Rotors Inspection', make: 'Kia', yearMin: 2017, mileage: 15000, months: 12, priority: 10,
      source: "Kia Owner's Manual — 'Inspect brake pads, calipers, and rotors every 15,000 mi'" },

    // ── Kia Carnival (2022-2024, KA4) ───────────────────────────
    { service: 'Engine Oil & Filter', make: 'Kia', model: 'Carnival', yearMin: 2022, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Carnival Owner's Manual — 'Replace engine oil every 7,500 mi / 12 months (3.5L V6, 0W-20 full synthetic)'" },
    { service: 'Tire Rotation', make: 'Kia', model: 'Carnival', yearMin: 2022, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Carnival Owner's Manual — 'Rotate tires every 7,500 mi'" },
    { service: 'Automatic Transmission Fluid', make: 'Kia', model: 'Carnival', yearMin: 2022, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Carnival Owner's Manual — 'Inspect AT fluid at 60,000 mi; replace if dark or contaminated'",
      notes: '8-speed automatic. Kia says inspect; many techs recommend replacement at 60K.' },
    { service: 'Coolant (Antifreeze)', make: 'Kia', model: 'Carnival', yearMin: 2022, yearMax: 2024, mileage: 120000, months: 120, priority: 20,
      source: "Carnival Owner's Manual — 'Replace coolant at 120,000 mi or 10 years, then 30,000 mi / 2 yrs'" },
    { service: 'Spark Plugs', make: 'Kia', model: 'Carnival', yearMin: 2022, yearMax: 2024, mileage: 97500, months: 84, priority: 20,
      source: "Carnival Owner's Manual — 'Replace iridium spark plugs at 97,500 mi'" },

    // ── Kia Telluride (2020-2024) ───────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Kia', model: 'Telluride', yearMin: 2020, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Telluride Owner's Manual — 'Replace engine oil every 7,500 mi / 12 months (3.8L V6, 0W-20)'" },
    { service: 'Tire Rotation', make: 'Kia', model: 'Telluride', yearMin: 2020, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Telluride Owner's Manual — 'Rotate tires every 7,500 mi'" },
    { service: 'Automatic Transmission Fluid', make: 'Kia', model: 'Telluride', yearMin: 2020, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Telluride Owner's Manual — 'Inspect AT fluid at 60,000 mi; replace if needed'",
      notes: '8-speed automatic. Replace recommended at 60K even if manual says inspect.' },
    { service: 'Coolant (Antifreeze)', make: 'Kia', model: 'Telluride', yearMin: 2020, yearMax: 2024, mileage: 120000, months: 120, priority: 20,
      source: "Telluride Owner's Manual — 'Replace coolant at 120,000 mi or 10 years'" },
    { service: 'Rear Differential Fluid', make: 'Kia', model: 'Telluride', yearMin: 2020, yearMax: 2024, driveType: 'AWD', mileage: 60000, months: 48, priority: 25,
      source: "Telluride Owner's Manual — 'Replace rear differential fluid at 60,000 mi (AWD models)'" },
    { service: 'Transfer Case Fluid', make: 'Kia', model: 'Telluride', yearMin: 2020, yearMax: 2024, driveType: 'AWD', mileage: 60000, months: 48, priority: 25,
      source: "Telluride Owner's Manual — 'Replace transfer case fluid at 60,000 mi (AWD models)'" },

    // ── Kia Sorento (2016-2024) ─────────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Kia', model: 'Sorento', yearMin: 2016, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Sorento Owner's Manual — 'Replace engine oil every 7,500 mi / 12 months'" },
    { service: 'Automatic Transmission Fluid', make: 'Kia', model: 'Sorento', yearMin: 2016, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Sorento Owner's Manual — 'Inspect AT fluid at 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Kia', model: 'Sorento', yearMin: 2016, yearMax: 2024, driveType: 'AWD', mileage: 60000, months: 48, priority: 25,
      source: "Sorento Owner's Manual — 'Replace rear diff fluid at 60,000 mi (AWD)'" },

    // ── Kia Sportage (2017-2024) ────────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Kia', model: 'Sportage', yearMin: 2017, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Sportage Owner's Manual — 'Replace engine oil every 7,500 mi / 12 months'" },
    { service: 'Automatic Transmission Fluid', make: 'Kia', model: 'Sportage', yearMin: 2017, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Sportage Owner's Manual — 'Inspect AT fluid at 60,000 mi'" },

    // ── Kia Forte (2019-2024) ───────────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Kia', model: 'Forte', yearMin: 2019, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Forte Owner's Manual — 'Replace engine oil every 7,500 mi / 12 months (2.0L, 0W-20)'" },
    { service: 'Automatic Transmission Fluid', make: 'Kia', model: 'Forte', yearMin: 2019, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Forte Owner's Manual — 'Inspect CVT/IVT fluid at 60,000 mi'" },


    // ═════════════════════════════════════════════════════════════════
    //  HYUNDAI — Hyundai Owner's Manual / Maintenance Schedule
    //  Source: Hyundai Owner's Manual (2016-2024)
    //  Hyundai/Kia share powertrain platforms; similar intervals
    // ═════════════════════════════════════════════════════════════════

    // ── Hyundai Universal (all models 2017+) ────────────────────
    { service: 'Engine Oil & Filter', make: 'Hyundai', yearMin: 2017, mileage: 7500, months: 12, priority: 10,
      source: "Hyundai Owner's Manual — 'Replace engine oil and filter every 7,500 miles or 12 months (full synthetic)'",
      notes: 'Turbo engines (1.6T, 2.5T): may trigger sooner under severe conditions' },
    { service: 'Tire Rotation', make: 'Hyundai', yearMin: 2017, mileage: 7500, months: 12, priority: 10,
      source: "Hyundai Owner's Manual — 'Rotate tires every 7,500 miles'" },
    { service: 'Engine Air Filter', make: 'Hyundai', yearMin: 2017, mileage: 30000, months: 36, priority: 10,
      source: "Hyundai Owner's Manual — 'Replace air cleaner filter every 30,000 miles'" },
    { service: 'Cabin Air Filter', make: 'Hyundai', yearMin: 2017, mileage: 15000, months: 24, priority: 10,
      source: "Hyundai Owner's Manual — 'Replace climate control air filter every 15,000 mi or 24 months'" },
    { service: 'Spark Plugs', make: 'Hyundai', yearMin: 2017, mileage: 97500, months: 84, priority: 10,
      source: "Hyundai Owner's Manual — 'Replace spark plugs (iridium) every 97,500 miles'" },
    { service: 'Coolant (Antifreeze)', make: 'Hyundai', yearMin: 2017, mileage: 120000, months: 120, priority: 10,
      source: "Hyundai Owner's Manual — 'Replace coolant at 120,000 mi or 10 years, then 30,000 mi / 2 yrs'" },
    { service: 'Brake Fluid', make: 'Hyundai', yearMin: 2017, mileage: 30000, months: 24, priority: 10,
      source: "Hyundai Owner's Manual — 'Inspect brake fluid every 30,000 mi or 24 months; replace as needed'" },
    { service: 'Automatic Transmission Fluid', make: 'Hyundai', yearMin: 2017, mileage: 60000, months: 48, priority: 10,
      source: "Hyundai Owner's Manual — 'Inspect AT fluid at 60,000 mi; replace if deteriorated'" },
    { service: 'Drive Belt (Serpentine)', make: 'Hyundai', yearMin: 2017, mileage: 60000, months: 60, priority: 10,
      source: "Hyundai Owner's Manual — 'Inspect drive belt at 60,000 mi; replace as needed'" },
    { service: 'Brake Pads & Rotors Inspection', make: 'Hyundai', yearMin: 2017, mileage: 15000, months: 12, priority: 10,
      source: "Hyundai Owner's Manual — 'Inspect brake pads, calipers, and rotors every 15,000 mi'" },

    // ── Hyundai Palisade (2020-2024) ────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Hyundai', model: 'Palisade', yearMin: 2020, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Palisade Owner's Manual — 'Replace engine oil every 7,500 mi / 12 months (3.8L V6, 0W-20)'" },
    { service: 'Automatic Transmission Fluid', make: 'Hyundai', model: 'Palisade', yearMin: 2020, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Palisade Owner's Manual — 'Inspect AT fluid at 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Hyundai', model: 'Palisade', yearMin: 2020, yearMax: 2024, driveType: 'AWD', mileage: 60000, months: 48, priority: 25,
      source: "Palisade Owner's Manual — 'Replace coupling fluid at 60,000 mi (HTRAC AWD)'" },

    // ── Hyundai Tucson (2022-2024, NX4) ─────────────────────────
    { service: 'Engine Oil & Filter', make: 'Hyundai', model: 'Tucson', yearMin: 2022, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Tucson Owner's Manual — 'Replace engine oil every 7,500 mi / 12 months'" },
    { service: 'Automatic Transmission Fluid', make: 'Hyundai', model: 'Tucson', yearMin: 2022, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Tucson Owner's Manual — 'Inspect 8-speed DCT fluid at 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Hyundai', model: 'Tucson', yearMin: 2022, yearMax: 2024, driveType: 'AWD', mileage: 60000, months: 48, priority: 25,
      source: "Tucson Owner's Manual — 'Replace coupling fluid at 60,000 mi (AWD)'" },

    // ── Hyundai Santa Fe (2019-2024) ────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Hyundai', model: 'Santa Fe', yearMin: 2019, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Santa Fe Owner's Manual — 'Replace engine oil every 7,500 mi / 12 months'" },
    { service: 'Automatic Transmission Fluid', make: 'Hyundai', model: 'Santa Fe', yearMin: 2019, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Santa Fe Owner's Manual — 'Inspect AT fluid at 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Hyundai', model: 'Santa Fe', yearMin: 2019, yearMax: 2024, driveType: 'AWD', mileage: 60000, months: 48, priority: 25,
      source: "Santa Fe Owner's Manual — 'Replace HTRAC coupling fluid at 60,000 mi (AWD)'" },

    // ── Hyundai Elantra (2021-2024, CN7) ────────────────────────
    { service: 'Engine Oil & Filter', make: 'Hyundai', model: 'Elantra', yearMin: 2021, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Elantra Owner's Manual — 'Replace engine oil every 7,500 mi / 12 months'" },
    { service: 'Automatic Transmission Fluid', make: 'Hyundai', model: 'Elantra', yearMin: 2021, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Elantra Owner's Manual — 'Inspect CVT/IVT fluid at 60,000 mi'" },

    // ── Hyundai Sonata (2020-2024, DN8) ─────────────────────────
    { service: 'Engine Oil & Filter', make: 'Hyundai', model: 'Sonata', yearMin: 2020, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Sonata Owner's Manual — 'Replace engine oil every 7,500 mi / 12 months'" },
    { service: 'Automatic Transmission Fluid', make: 'Hyundai', model: 'Sonata', yearMin: 2020, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Sonata Owner's Manual — 'Inspect 8-speed AT fluid at 60,000 mi'" },


    // ═════════════════════════════════════════════════════════════════
    //  JEEP — Jeep/Stellantis Owner's Manual Maintenance Schedule
    //  Source: Jeep Owner's Manual (2014-2024)
    // ═════════════════════════════════════════════════════════════════

    // ── Jeep Universal (all models 2018+) ───────────────────────
    { service: 'Engine Oil & Filter', make: 'Jeep', yearMin: 2018, mileage: 10000, months: 12, priority: 10,
      source: "Jeep Owner's Manual — 'Change engine oil per Oil Change Indicator or every 10,000 mi / 12 months max'",
      notes: 'Jeep Oil Change Indicator system adapts to driving conditions' },
    { service: 'Tire Rotation', make: 'Jeep', yearMin: 2018, mileage: 10000, months: 12, priority: 10,
      source: "Jeep Owner's Manual — 'Rotate tires at every oil change interval'" },
    { service: 'Engine Air Filter', make: 'Jeep', yearMin: 2018, mileage: 30000, months: 36, priority: 10,
      source: "Jeep Owner's Manual — 'Replace engine air filter at 30,000 mi'" },
    { service: 'Cabin Air Filter', make: 'Jeep', yearMin: 2018, mileage: 20000, months: 24, priority: 10,
      source: "Jeep Owner's Manual — 'Replace cabin air filter every 20,000 mi'" },
    { service: 'Spark Plugs', make: 'Jeep', yearMin: 2018, mileage: 100000, months: 84, priority: 10,
      source: "Jeep Owner's Manual — 'Replace spark plugs at 100,000 mi (3.6L Pentastar V6)'",
      notes: '2.0L Turbo: 60,000 mi. 3.6L V6: 100,000 mi. 5.7L HEMI: 100,000 mi.' },
    { service: 'Coolant (Antifreeze)', make: 'Jeep', yearMin: 2018, mileage: 150000, months: 120, priority: 10,
      source: "Jeep Owner's Manual — 'Replace OAT coolant at 150,000 mi or 10 years'" },
    { service: 'Brake Fluid', make: 'Jeep', yearMin: 2018, mileage: 45000, months: 36, priority: 10,
      source: "Jeep Owner's Manual — 'Inspect brake fluid every 3 years; replace as needed'" },

    // ── Jeep Wrangler (2018-2024, JL) ───────────────────────────
    { service: 'Engine Oil & Filter', make: 'Jeep', model: 'Wrangler', yearMin: 2018, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Wrangler (JL) Owner's Manual — Per Oil Change Indicator, max 10,000 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Jeep', model: 'Wrangler', yearMin: 2018, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Wrangler Owner's Manual — 'Replace 8-speed AT fluid at 60,000 mi (normal); 30,000 mi (severe/off-road)'" },
    { service: 'Manual Transmission Fluid', make: 'Jeep', model: 'Wrangler', yearMin: 2018, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Wrangler Owner's Manual — 'Replace manual transmission fluid at 60,000 mi'" },
    { service: 'Transfer Case Fluid', make: 'Jeep', model: 'Wrangler', yearMin: 2018, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Wrangler Owner's Manual — 'Replace transfer case fluid at 60,000 mi'" },
    { service: 'Front Differential Fluid', make: 'Jeep', model: 'Wrangler', yearMin: 2018, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Wrangler Owner's Manual — 'Replace front axle fluid at 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Jeep', model: 'Wrangler', yearMin: 2018, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Wrangler Owner's Manual — 'Replace rear axle fluid at 60,000 mi'" },
    { service: 'Spark Plugs', make: 'Jeep', model: 'Wrangler', yearMin: 2018, yearMax: 2024, mileage: 100000, months: 84, priority: 20,
      source: "Wrangler Owner's Manual — 'Replace spark plugs at 100,000 mi (3.6L V6)'" },

    // ── Jeep Grand Cherokee (2022-2024, WL) ─────────────────────
    { service: 'Engine Oil & Filter', make: 'Jeep', model: 'Grand Cherokee', yearMin: 2022, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Grand Cherokee (WL) Owner's Manual — Per Oil Change Indicator, max 10,000 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Jeep', model: 'Grand Cherokee', yearMin: 2022, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Grand Cherokee Owner's Manual — 'Replace AT fluid at 60,000 mi'" },
    { service: 'Transfer Case Fluid', make: 'Jeep', model: 'Grand Cherokee', yearMin: 2022, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Grand Cherokee Owner's Manual — 'Replace transfer case fluid at 60,000 mi (Quadra-Trac/Quadra-Drive)'" },
    { service: 'Front Differential Fluid', make: 'Jeep', model: 'Grand Cherokee', yearMin: 2022, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Grand Cherokee Owner's Manual — 'Replace front axle fluid at 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Jeep', model: 'Grand Cherokee', yearMin: 2022, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Grand Cherokee Owner's Manual — 'Replace rear axle fluid at 60,000 mi'" },

    // ── Jeep Grand Cherokee (2014-2021, WK2) ────────────────────
    { service: 'Engine Oil & Filter', make: 'Jeep', model: 'Grand Cherokee', yearMin: 2014, yearMax: 2021, mileage: 10000, months: 12, priority: 20,
      source: "Grand Cherokee (WK2) Owner's Manual — Per Oil Change Indicator, max 10,000 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Jeep', model: 'Grand Cherokee', yearMin: 2014, yearMax: 2021, mileage: 60000, months: 48, priority: 20,
      source: "Grand Cherokee (WK2) Owner's Manual — 'Replace AT fluid at 60,000 mi'" },
    { service: 'Transfer Case Fluid', make: 'Jeep', model: 'Grand Cherokee', yearMin: 2014, yearMax: 2021, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Grand Cherokee (WK2) Owner's Manual — 'Replace transfer case fluid at 60,000 mi'" },
    { service: 'Front Differential Fluid', make: 'Jeep', model: 'Grand Cherokee', yearMin: 2014, yearMax: 2021, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Grand Cherokee (WK2) Owner's Manual — 'Replace front axle fluid at 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Jeep', model: 'Grand Cherokee', yearMin: 2014, yearMax: 2021, mileage: 60000, months: 48, priority: 20,
      source: "Grand Cherokee (WK2) Owner's Manual — 'Replace rear axle fluid at 60,000 mi'" },


    // ═════════════════════════════════════════════════════════════════
    //  RAM — Ram/Stellantis Owner's Manual Maintenance Schedule
    //  Source: Ram Owner's Manual (2019-2024)
    // ═════════════════════════════════════════════════════════════════

    // ── Ram 1500 (2019-2024, DT, 5th Gen) ───────────────────────
    { service: 'Engine Oil & Filter', make: 'Ram', model: '1500', yearMin: 2019, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Ram 1500 Owner's Manual — 'Change oil per Oil Change Indicator or 10,000 mi / 12 months max'",
      notes: '5.7L HEMI uses 0W-20. 3.6L Pentastar uses 0W-20. EcoDiesel 3.0L: see diesel supplement.' },
    { service: 'Tire Rotation', make: 'Ram', model: '1500', yearMin: 2019, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Ram 1500 Owner's Manual — 'Rotate tires at every oil change'" },
    { service: 'Automatic Transmission Fluid', make: 'Ram', model: '1500', yearMin: 2019, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Ram 1500 Owner's Manual — 'Replace 8-speed AT fluid at 60,000 mi (normal)'",
      notes: 'Severe duty (towing frequently): 30,000 mi. Uses ZF 8HP75 transmission.' },
    { service: 'Transfer Case Fluid', make: 'Ram', model: '1500', yearMin: 2019, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Ram 1500 Owner's Manual — 'Replace transfer case fluid at 60,000 mi'" },
    { service: 'Front Differential Fluid', make: 'Ram', model: '1500', yearMin: 2019, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Ram 1500 Owner's Manual — 'Replace front axle fluid at 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Ram', model: '1500', yearMin: 2019, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Ram 1500 Owner's Manual — 'Replace rear axle fluid at 60,000 mi'" },
    { service: 'Spark Plugs', make: 'Ram', model: '1500', yearMin: 2019, yearMax: 2024, mileage: 100000, months: 84, priority: 20,
      source: "Ram 1500 Owner's Manual — 'Replace spark plugs at 100,000 mi (5.7L HEMI / 3.6L V6)'" },
    { service: 'Engine Air Filter', make: 'Ram', model: '1500', yearMin: 2019, yearMax: 2024, mileage: 30000, months: 36, priority: 20,
      source: "Ram 1500 Owner's Manual — 'Replace engine air filter at 30,000 mi'" },
    { service: 'Cabin Air Filter', make: 'Ram', model: '1500', yearMin: 2019, yearMax: 2024, mileage: 20000, months: 24, priority: 20,
      source: "Ram 1500 Owner's Manual — 'Replace cabin air filter every 20,000 mi'" },
    { service: 'Coolant (Antifreeze)', make: 'Ram', model: '1500', yearMin: 2019, yearMax: 2024, mileage: 150000, months: 120, priority: 20,
      source: "Ram 1500 Owner's Manual — 'Replace OAT coolant at 150,000 mi or 10 years'" },

    // ── Ram 1500 (2013-2018, DS, 4th Gen) ───────────────────────
    { service: 'Engine Oil & Filter', make: 'Ram', model: '1500', yearMin: 2013, yearMax: 2018, mileage: 10000, months: 12, priority: 20,
      source: "Ram 1500 Owner's Manual (4th Gen) — Per Oil Change Indicator, max 10,000 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Ram', model: '1500', yearMin: 2013, yearMax: 2018, mileage: 60000, months: 48, priority: 20,
      source: "Ram 1500 Owner's Manual (4th Gen) — 'Replace AT fluid at 60,000 mi'" },
    { service: 'Spark Plugs', make: 'Ram', model: '1500', yearMin: 2013, yearMax: 2018, mileage: 100000, months: 84, priority: 20,
      source: "Ram 1500 Owner's Manual (4th Gen) — 'Replace spark plugs at 100,000 mi'" },


    // ═════════════════════════════════════════════════════════════════
    //  SUBARU — Subaru Owner's Manual Maintenance Schedule
    //  Source: Subaru Owner's Manual (2015-2024)
    //  Subaru: all models AWD standard; Boxer engines
    // ═════════════════════════════════════════════════════════════════

    // ── Subaru Universal (all models 2017+) ─────────────────────
    { service: 'Engine Oil & Filter', make: 'Subaru', yearMin: 2017, mileage: 6000, months: 6, priority: 10,
      source: "Subaru Owner's Manual — 'Replace engine oil and filter every 6,000 miles or 6 months (0W-20 synthetic)'",
      notes: 'Subaru specifies 6,000 mi intervals even with synthetic oil' },
    { service: 'Tire Rotation', make: 'Subaru', yearMin: 2017, mileage: 7500, months: 12, priority: 10,
      source: "Subaru Owner's Manual — 'Rotate tires every 7,500 miles'" },
    { service: 'Engine Air Filter', make: 'Subaru', yearMin: 2017, mileage: 30000, months: 36, priority: 10,
      source: "Subaru Owner's Manual — 'Replace air cleaner element every 30,000 miles'" },
    { service: 'Cabin Air Filter', make: 'Subaru', yearMin: 2017, mileage: 15000, months: 24, priority: 10,
      source: "Subaru Owner's Manual — 'Replace cabin air filter every 15,000 miles'" },
    { service: 'Spark Plugs', make: 'Subaru', yearMin: 2017, mileage: 60000, months: 60, priority: 10,
      source: "Subaru Owner's Manual — 'Replace spark plugs every 60,000 miles (all Boxer engines)'" },
    { service: 'Coolant (Antifreeze)', make: 'Subaru', yearMin: 2017, mileage: 110000, months: 120, priority: 10,
      source: "Subaru Owner's Manual — 'Replace Super Coolant at 110,000 mi or 11 years, then 30,000 mi / 2 yrs'" },
    { service: 'Brake Fluid', make: 'Subaru', yearMin: 2017, mileage: 30000, months: 24, priority: 10,
      source: "Subaru Owner's Manual — 'Replace brake fluid every 30,000 mi or 24 months'" },
    { service: 'Automatic Transmission Fluid', make: 'Subaru', yearMin: 2017, mileage: 60000, months: 48, priority: 10,
      source: "Subaru Owner's Manual — 'Replace CVT fluid (Lineartronic) every 60,000 mi'",
      notes: 'All modern Subarus use CVT except WRX manual' },
    { service: 'Drive Belt (Serpentine)', make: 'Subaru', yearMin: 2017, mileage: 60000, months: 60, priority: 10,
      source: "Subaru Owner's Manual — 'Inspect drive belt at 60,000 mi; replace as needed'" },
    { service: 'Rear Differential Fluid', make: 'Subaru', yearMin: 2017, driveType: 'AWD', mileage: 30000, months: 24, priority: 15,
      source: "Subaru Owner's Manual — 'Replace rear differential gear oil every 30,000 mi'" },
    { service: 'Front Differential Fluid', make: 'Subaru', yearMin: 2017, driveType: 'AWD', mileage: 30000, months: 24, priority: 15,
      source: "Subaru Owner's Manual — 'Replace front differential gear oil every 30,000 mi'",
      notes: 'Front diff shares fluid with transmission on some models' },

    // ── Subaru Outback (2015-2024) ──────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Subaru', model: 'Outback', yearMin: 2015, yearMax: 2024, mileage: 6000, months: 6, priority: 20,
      source: "Outback Owner's Manual — Every 6,000 mi / 6 months (2.5L/2.4T Boxer, 0W-20)" },
    { service: 'Automatic Transmission Fluid', make: 'Subaru', model: 'Outback', yearMin: 2015, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Outback Owner's Manual — 'Replace Lineartronic CVT fluid every 60,000 mi'" },

    // ── Subaru Forester (2014-2024) ─────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Subaru', model: 'Forester', yearMin: 2014, yearMax: 2024, mileage: 6000, months: 6, priority: 20,
      source: "Forester Owner's Manual — Every 6,000 mi / 6 months (2.5L/2.4T Boxer, 0W-20)" },
    { service: 'Automatic Transmission Fluid', make: 'Subaru', model: 'Forester', yearMin: 2014, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Forester Owner's Manual — 'Replace Lineartronic CVT fluid every 60,000 mi'" },

    // ── Subaru Crosstrek (2018-2024) ────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Subaru', model: 'Crosstrek', yearMin: 2018, yearMax: 2024, mileage: 6000, months: 6, priority: 20,
      source: "Crosstrek Owner's Manual — Every 6,000 mi / 6 months (2.0L/2.5L Boxer, 0W-20)" },
    { service: 'Automatic Transmission Fluid', make: 'Subaru', model: 'Crosstrek', yearMin: 2018, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Crosstrek Owner's Manual — 'Replace Lineartronic CVT fluid every 60,000 mi'" },


    // ═════════════════════════════════════════════════════════════════
    //  NISSAN — Nissan Owner's Manual Maintenance Schedule
    //  Source: Nissan Owner's Manual (2015-2024)
    // ═════════════════════════════════════════════════════════════════

    // ── Nissan Universal (all models 2018+) ─────────────────────
    { service: 'Engine Oil & Filter', make: 'Nissan', yearMin: 2018, mileage: 5000, months: 6, priority: 10,
      source: "Nissan Owner's Manual — 'Replace engine oil and filter every 5,000 miles or 6 months'",
      notes: 'Nissan specifies shorter intervals than most OEMs — 5K mi / 6 months' },
    { service: 'Tire Rotation', make: 'Nissan', yearMin: 2018, mileage: 5000, months: 6, priority: 10,
      source: "Nissan Owner's Manual — 'Rotate tires every 5,000 miles'" },
    { service: 'Engine Air Filter', make: 'Nissan', yearMin: 2018, mileage: 30000, months: 36, priority: 10,
      source: "Nissan Owner's Manual — 'Replace engine air filter every 30,000 mi'" },
    { service: 'Cabin Air Filter', make: 'Nissan', yearMin: 2018, mileage: 15000, months: 24, priority: 10,
      source: "Nissan Owner's Manual — 'Replace in-cabin microfilter every 15,000 mi or 12 months'" },
    { service: 'Spark Plugs', make: 'Nissan', yearMin: 2018, mileage: 105000, months: 84, priority: 10,
      source: "Nissan Owner's Manual — 'Replace iridium spark plugs at 105,000 mi'",
      notes: 'Turbo models may be shorter. 3.5L VQ35: 105K. 2.0L VC-Turbo: 60K.' },
    { service: 'Coolant (Antifreeze)', make: 'Nissan', yearMin: 2018, mileage: 105000, months: 120, priority: 10,
      source: "Nissan Owner's Manual — 'Replace Nissan Long-Life coolant at 105,000 mi or 10 years'" },
    { service: 'Brake Fluid', make: 'Nissan', yearMin: 2018, mileage: 30000, months: 24, priority: 10,
      source: "Nissan Owner's Manual — 'Replace brake fluid every 30,000 mi or 24 months'" },
    { service: 'Automatic Transmission Fluid', make: 'Nissan', yearMin: 2018, mileage: 60000, months: 48, priority: 10,
      source: "Nissan Owner's Manual — 'Replace CVT fluid (Xtronic) every 60,000 mi'",
      notes: 'Most Nissan models use Xtronic CVT. Uses Nissan NS-3 CVT fluid.' },
    { service: 'Drive Belt (Serpentine)', make: 'Nissan', yearMin: 2018, mileage: 60000, months: 60, priority: 10,
      source: "Nissan Owner's Manual — 'Inspect drive belt at 60,000 mi'" },
    { service: 'Brake Pads & Rotors Inspection', make: 'Nissan', yearMin: 2018, mileage: 10000, months: 12, priority: 10,
      source: "Nissan Owner's Manual — 'Inspect brake pads, rotors, and brake lines every 10,000 mi'" },

    // ── Nissan Rogue (2021-2024, T33) ───────────────────────────
    { service: 'Engine Oil & Filter', make: 'Nissan', model: 'Rogue', yearMin: 2021, yearMax: 2024, mileage: 5000, months: 6, priority: 20,
      source: "Rogue Owner's Manual — Every 5,000 mi / 6 months (1.5L VC-Turbo, 0W-20)" },
    { service: 'Automatic Transmission Fluid', make: 'Nissan', model: 'Rogue', yearMin: 2021, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Rogue Owner's Manual — 'Replace Xtronic CVT fluid every 60,000 mi'" },

    // ── Nissan Rogue (2014-2020, T32) ───────────────────────────
    { service: 'Engine Oil & Filter', make: 'Nissan', model: 'Rogue', yearMin: 2014, yearMax: 2020, mileage: 5000, months: 6, priority: 20,
      source: "Rogue Owner's Manual (T32) — Every 5,000 mi / 6 months (2.5L, 0W-20)" },
    { service: 'Automatic Transmission Fluid', make: 'Nissan', model: 'Rogue', yearMin: 2014, yearMax: 2020, mileage: 60000, months: 48, priority: 20,
      source: "Rogue Owner's Manual (T32) — 'Replace CVT fluid every 60,000 mi'" },

    // ── Nissan Altima (2019-2024, L34) ──────────────────────────
    { service: 'Engine Oil & Filter', make: 'Nissan', model: 'Altima', yearMin: 2019, yearMax: 2024, mileage: 5000, months: 6, priority: 20,
      source: "Altima Owner's Manual — Every 5,000 mi / 6 months" },
    { service: 'Automatic Transmission Fluid', make: 'Nissan', model: 'Altima', yearMin: 2019, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Altima Owner's Manual — 'Replace CVT fluid every 60,000 mi'" },
    { service: 'Spark Plugs', make: 'Nissan', model: 'Altima', yearMin: 2019, yearMax: 2024, mileage: 60000, months: 60, priority: 20,
      source: "Altima Owner's Manual — 'Replace spark plugs at 60,000 mi (2.0L VC-Turbo)'",
      notes: '2.5L NA: 105,000 mi. 2.0L VC-Turbo: 60,000 mi.' },

    // ── Nissan Pathfinder (2022-2024, R53) ──────────────────────
    { service: 'Engine Oil & Filter', make: 'Nissan', model: 'Pathfinder', yearMin: 2022, yearMax: 2024, mileage: 5000, months: 6, priority: 20,
      source: "Pathfinder Owner's Manual — Every 5,000 mi / 6 months (3.5L V6, 0W-20)" },
    { service: 'Automatic Transmission Fluid', make: 'Nissan', model: 'Pathfinder', yearMin: 2022, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Pathfinder Owner's Manual — 'Replace 9-speed AT fluid every 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Nissan', model: 'Pathfinder', yearMin: 2022, yearMax: 2024, driveType: 'AWD', mileage: 60000, months: 48, priority: 25,
      source: "Pathfinder Owner's Manual — 'Replace rear differential fluid at 60,000 mi (4WD)'" },

    // ── Nissan Frontier (2022-2024, D41) ────────────────────────
    { service: 'Engine Oil & Filter', make: 'Nissan', model: 'Frontier', yearMin: 2022, yearMax: 2024, mileage: 5000, months: 6, priority: 20,
      source: "Frontier Owner's Manual — Every 5,000 mi / 6 months (3.8L V6, 0W-20)" },
    { service: 'Automatic Transmission Fluid', make: 'Nissan', model: 'Frontier', yearMin: 2022, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Frontier Owner's Manual — 'Replace 9-speed AT fluid every 60,000 mi'" },
    { service: 'Transfer Case Fluid', make: 'Nissan', model: 'Frontier', yearMin: 2022, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Frontier Owner's Manual — 'Replace transfer case fluid at 60,000 mi'" },
    { service: 'Front Differential Fluid', make: 'Nissan', model: 'Frontier', yearMin: 2022, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Frontier Owner's Manual — 'Replace front differential fluid at 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Nissan', model: 'Frontier', yearMin: 2022, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Frontier Owner's Manual — 'Replace rear differential fluid at 60,000 mi'" },


    // ═════════════════════════════════════════════════════════════════
    //  GMC — GM Owner's Manual (same platform as Chevrolet trucks)
    //  Source: GMC Owner's Manual (2019-2024)
    // ═════════════════════════════════════════════════════════════════

    // ── GMC Sierra 1500 (2019-2024, T1XX, same platform as Silverado) ─
    { service: 'Engine Oil & Filter', make: 'GMC', model: 'Sierra 1500', yearMin: 2019, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Sierra Owner's Manual — Per OLM, max 7,500 mi / 12 months" },
    { service: 'Tire Rotation', make: 'GMC', model: 'Sierra 1500', yearMin: 2019, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Sierra Owner's Manual — 'Rotate tires at every oil change'" },
    { service: 'Automatic Transmission Fluid', make: 'GMC', model: 'Sierra 1500', yearMin: 2019, yearMax: 2024, mileage: 45000, months: 48, priority: 20,
      source: "Sierra Owner's Manual — 'Replace AT fluid and filter at 45,000 mi'" },
    { service: 'Transfer Case Fluid', make: 'GMC', model: 'Sierra 1500', yearMin: 2019, yearMax: 2024, driveType: '4WD', mileage: 45000, months: 48, priority: 25,
      source: "Sierra Owner's Manual — 'Replace transfer case fluid at 45,000 mi'" },
    { service: 'Front Differential Fluid', make: 'GMC', model: 'Sierra 1500', yearMin: 2019, yearMax: 2024, driveType: '4WD', mileage: 45000, months: 48, priority: 25,
      source: "Sierra Owner's Manual — 'Replace front axle fluid at 45,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'GMC', model: 'Sierra 1500', yearMin: 2019, yearMax: 2024, mileage: 45000, months: 48, priority: 20,
      source: "Sierra Owner's Manual — 'Replace rear axle fluid at 45,000 mi'" },
    { service: 'Spark Plugs', make: 'GMC', model: 'Sierra 1500', yearMin: 2019, yearMax: 2024, mileage: 97500, months: 84, priority: 20,
      source: "Sierra Owner's Manual — 'Replace spark plugs at 97,500 mi (5.3L/6.2L V8)'" },


    // ═════════════════════════════════════════════════════════════════
    //  MAZDA — Mazda Owner's Manual Maintenance Schedule
    //  Source: Mazda Owner's Manual (2017-2024)
    // ═════════════════════════════════════════════════════════════════

    // ── Mazda Universal (all models 2017+) ──────────────────────
    { service: 'Engine Oil & Filter', make: 'Mazda', yearMin: 2017, mileage: 7500, months: 12, priority: 10,
      source: "Mazda Owner's Manual — 'Replace engine oil and filter every 7,500 miles or 12 months (0W-20)'",
      notes: 'Mazda Skyactiv engines use 0W-20 synthetic' },
    { service: 'Tire Rotation', make: 'Mazda', yearMin: 2017, mileage: 7500, months: 12, priority: 10,
      source: "Mazda Owner's Manual — 'Rotate tires every 7,500 miles'" },
    { service: 'Engine Air Filter', make: 'Mazda', yearMin: 2017, mileage: 30000, months: 36, priority: 10,
      source: "Mazda Owner's Manual — 'Replace engine air filter every 30,000 miles'" },
    { service: 'Cabin Air Filter', make: 'Mazda', yearMin: 2017, mileage: 25000, months: 24, priority: 10,
      source: "Mazda Owner's Manual — 'Replace cabin air filter every 25,000 mi'" },
    { service: 'Spark Plugs', make: 'Mazda', yearMin: 2017, mileage: 75000, months: 72, priority: 10,
      source: "Mazda Owner's Manual — 'Replace spark plugs every 75,000 miles (Skyactiv-G iridium)'" },
    { service: 'Coolant (Antifreeze)', make: 'Mazda', yearMin: 2017, mileage: 120000, months: 120, priority: 10,
      source: "Mazda Owner's Manual — 'Replace FL22 coolant at 120,000 mi or 10 years, then 60,000 mi / 4 yrs'" },
    { service: 'Brake Fluid', make: 'Mazda', yearMin: 2017, mileage: 30000, months: 24, priority: 10,
      source: "Mazda Owner's Manual — 'Replace brake fluid every 30,000 mi or 24 months'" },
    { service: 'Automatic Transmission Fluid', make: 'Mazda', yearMin: 2017, mileage: 75000, months: 60, priority: 10,
      source: "Mazda Owner's Manual — 'Replace Skyactiv-Drive AT fluid every 75,000 mi'" },

    // ── Mazda CX-5 (2017-2024) ──────────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Mazda', model: 'CX-5', yearMin: 2017, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "CX-5 Owner's Manual — Every 7,500 mi / 12 months (Skyactiv-G 2.5L, 0W-20)" },
    { service: 'Automatic Transmission Fluid', make: 'Mazda', model: 'CX-5', yearMin: 2017, yearMax: 2024, mileage: 75000, months: 60, priority: 20,
      source: "CX-5 Owner's Manual — 'Replace Skyactiv-Drive AT fluid at 75,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Mazda', model: 'CX-5', yearMin: 2017, yearMax: 2024, driveType: 'AWD', mileage: 37500, months: 36, priority: 25,
      source: "CX-5 Owner's Manual — 'Replace rear differential oil at 37,500 mi (i-ACTIV AWD)'" },

    // ── Mazda CX-50 (2023-2024) ─────────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Mazda', model: 'CX-50', yearMin: 2023, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "CX-50 Owner's Manual — Every 7,500 mi / 12 months (2.5L/2.5T Skyactiv-G, 0W-20)" },
    { service: 'Automatic Transmission Fluid', make: 'Mazda', model: 'CX-50', yearMin: 2023, yearMax: 2024, mileage: 75000, months: 60, priority: 20,
      source: "CX-50 Owner's Manual — 'Replace Skyactiv-Drive AT fluid at 75,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Mazda', model: 'CX-50', yearMin: 2023, yearMax: 2024, driveType: 'AWD', mileage: 37500, months: 36, priority: 25,
      source: "CX-50 Owner's Manual — 'Replace rear differential oil at 37,500 mi (i-ACTIV AWD)'" },

    // ── Mazda3 (2019-2024) ──────────────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Mazda', model: 'Mazda3', yearMin: 2019, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Mazda3 Owner's Manual — Every 7,500 mi / 12 months (2.5L Skyactiv-G, 0W-20)" },
    { service: 'Automatic Transmission Fluid', make: 'Mazda', model: 'Mazda3', yearMin: 2019, yearMax: 2024, mileage: 75000, months: 60, priority: 20,
      source: "Mazda3 Owner's Manual — 'Replace Skyactiv-Drive AT fluid at 75,000 mi'" },


    // ═════════════════════════════════════════════════════════════════
    //  DODGE — Stellantis Owner's Manual Maintenance Schedule
    //  Source: Dodge Owner's Manual (2015-2024)
    // ═════════════════════════════════════════════════════════════════

    // ── Dodge Durango (2014-2024) ───────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Dodge', model: 'Durango', yearMin: 2014, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Durango Owner's Manual — Per Oil Change Indicator, max 10,000 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Dodge', model: 'Durango', yearMin: 2014, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Durango Owner's Manual — 'Replace AT fluid at 60,000 mi (8-speed ZF)'" },
    { service: 'Transfer Case Fluid', make: 'Dodge', model: 'Durango', yearMin: 2014, yearMax: 2024, driveType: 'AWD', mileage: 60000, months: 48, priority: 25,
      source: "Durango Owner's Manual — 'Replace transfer case fluid at 60,000 mi'" },
    { service: 'Front Differential Fluid', make: 'Dodge', model: 'Durango', yearMin: 2014, yearMax: 2024, driveType: 'AWD', mileage: 60000, months: 48, priority: 25,
      source: "Durango Owner's Manual — 'Replace front axle fluid at 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Dodge', model: 'Durango', yearMin: 2014, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Durango Owner's Manual — 'Replace rear axle fluid at 60,000 mi'" },
    { service: 'Spark Plugs', make: 'Dodge', model: 'Durango', yearMin: 2014, yearMax: 2024, mileage: 100000, months: 84, priority: 20,
      source: "Durango Owner's Manual — 'Replace spark plugs at 100,000 mi (3.6L V6 / 5.7L HEMI)'" },

    // ── Dodge Charger/Challenger (2015-2023) ────────────────────
    { service: 'Engine Oil & Filter', make: 'Dodge', model: 'Charger', yearMin: 2015, yearMax: 2023, mileage: 10000, months: 12, priority: 20,
      source: "Charger Owner's Manual — Per Oil Change Indicator, max 10,000 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Dodge', model: 'Charger', yearMin: 2015, yearMax: 2023, mileage: 60000, months: 48, priority: 20,
      source: "Charger Owner's Manual — 'Replace AT fluid at 60,000 mi (8-speed ZF / TorqueFlite)'" },
    { service: 'Spark Plugs', make: 'Dodge', model: 'Charger', yearMin: 2015, yearMax: 2023, mileage: 100000, months: 84, priority: 20,
      source: "Charger Owner's Manual — 'Replace spark plugs at 100,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Dodge', model: 'Charger', yearMin: 2015, yearMax: 2023, mileage: 60000, months: 48, priority: 20,
      source: "Charger Owner's Manual — 'Replace rear axle fluid at 60,000 mi'" },


    // ═════════════════════════════════════════════════════════════════
    //  FORD — Additional Popular Models
    // ═════════════════════════════════════════════════════════════════

    // ── Ford Escape (2020-2024, 4th Gen) ────────────────────────
    { service: 'Engine Oil & Filter', make: 'Ford', model: 'Escape', yearMin: 2020, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Escape Owner's Manual — Per IOLM, max 10,000 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Ford', model: 'Escape', yearMin: 2020, yearMax: 2024, mileage: 150000, months: 120, priority: 20,
      source: "Escape Owner's Manual — 'Replace 8-speed AT fluid at 150,000 mi (normal)'",
      notes: 'Hybrid models: eCVT — no traditional AT fluid change.' },

    // ── Ford Ranger (2019-2024) ─────────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Ford', model: 'Ranger', yearMin: 2019, yearMax: 2024, mileage: 10000, months: 12, priority: 20,
      source: "Ranger Owner's Manual — Per IOLM, max 10,000 mi / 12 months (2.3L EcoBoost)" },
    { service: 'Automatic Transmission Fluid', make: 'Ford', model: 'Ranger', yearMin: 2019, yearMax: 2024, mileage: 150000, months: 120, priority: 20,
      source: "Ranger Owner's Manual — 'Replace 10-speed AT fluid at 150,000 mi (normal); 60,000 mi (severe)'" },
    { service: 'Transfer Case Fluid', make: 'Ford', model: 'Ranger', yearMin: 2019, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Ranger Owner's Manual — 'Replace transfer case fluid every 60,000 mi'" },
    { service: 'Front Differential Fluid', make: 'Ford', model: 'Ranger', yearMin: 2019, yearMax: 2024, driveType: '4WD', mileage: 60000, months: 48, priority: 25,
      source: "Ranger Owner's Manual — 'Replace front axle fluid every 60,000 mi'" },
    { service: 'Rear Differential Fluid', make: 'Ford', model: 'Ranger', yearMin: 2019, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Ranger Owner's Manual — 'Replace rear axle fluid every 60,000 mi'" },

    // ── Honda Odyssey (2018-2024) ───────────────────────────────
    { service: 'Engine Oil & Filter', make: 'Honda', model: 'Odyssey', yearMin: 2018, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Odyssey Owner's Manual — Per Maintenance Minder, approx. 7,500 mi (3.5L V6, 0W-20)" },
    { service: 'Automatic Transmission Fluid', make: 'Honda', model: 'Odyssey', yearMin: 2018, yearMax: 2024, mileage: 60000, months: 48, priority: 20,
      source: "Odyssey Owner's Manual — Sub-code 3, approx. every 60,000 mi",
      notes: '10-speed or 9-speed ZF depending on year. Honda ATF DW-1.' },
    { service: 'Spark Plugs', make: 'Honda', model: 'Odyssey', yearMin: 2018, yearMax: 2024, mileage: 105000, months: 84, priority: 20,
      source: "Odyssey Owner's Manual — Sub-code 4, replace at 105,000 mi (iridium)" },

    // ── Chevrolet Equinox (2018-2024) ───────────────────────────
    { service: 'Engine Oil & Filter', make: 'Chevrolet', model: 'Equinox', yearMin: 2018, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Equinox Owner's Manual — Per OLM, max 7,500 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Chevrolet', model: 'Equinox', yearMin: 2018, yearMax: 2024, mileage: 45000, months: 48, priority: 20,
      source: "Equinox Owner's Manual — 'Replace 9-speed AT fluid at 45,000 mi'" },
    { service: 'Spark Plugs', make: 'Chevrolet', model: 'Equinox', yearMin: 2018, yearMax: 2024, mileage: 60000, months: 60, priority: 20,
      source: "Equinox Owner's Manual — 'Replace spark plugs at 60,000 mi (1.5T/2.0T)'" },

    // ── Chevrolet Traverse (2018-2024) ──────────────────────────
    { service: 'Engine Oil & Filter', make: 'Chevrolet', model: 'Traverse', yearMin: 2018, yearMax: 2024, mileage: 7500, months: 12, priority: 20,
      source: "Traverse Owner's Manual — Per OLM, max 7,500 mi / 12 months" },
    { service: 'Automatic Transmission Fluid', make: 'Chevrolet', model: 'Traverse', yearMin: 2018, yearMax: 2024, mileage: 45000, months: 48, priority: 20,
      source: "Traverse Owner's Manual — 'Replace 9-speed AT fluid at 45,000 mi'" },
    { service: 'Spark Plugs', make: 'Chevrolet', model: 'Traverse', yearMin: 2018, yearMax: 2024, mileage: 97500, months: 84, priority: 20,
      source: "Traverse Owner's Manual — 'Replace spark plugs at 97,500 mi (3.6L V6)'" },
    { service: 'Transfer Case Fluid', driveType: '4WD', mileage: 45000, months: 36, priority: 5,
      source: 'Generic 4WD — most OEMs recommend 30,000-60,000 mi for transfer case fluid' },
    { service: 'Transfer Case Fluid', driveType: 'AWD', mileage: 45000, months: 36, priority: 5,
      source: 'Generic AWD — most OEMs recommend 30,000-60,000 mi for transfer case fluid' },
    { service: 'Front Differential Fluid', driveType: '4WD', mileage: 45000, months: 36, priority: 5,
      source: 'Generic 4WD — most OEMs recommend 30,000-60,000 mi for differential fluid' },
    { service: 'Rear Differential Fluid', driveType: '4WD', mileage: 45000, months: 36, priority: 5,
      source: 'Generic 4WD — most OEMs recommend 30,000-60,000 mi for differential fluid' },
    { service: 'Rear Differential Fluid', driveType: 'AWD', mileage: 60000, months: 48, priority: 5,
      source: 'Generic AWD — most OEMs recommend 30,000-60,000 mi for differential fluid' },
    { service: 'Propeller Shaft Lubrication', driveType: '4WD', mileage: 15000, months: 12, priority: 5,
      source: 'Generic 4WD — if equipped with grease fittings' },
  ];

  const insertRule = db.prepare(`
    INSERT INTO schedule_rules (id, service_definition_id, make, model, engine, drive_type, year_min, year_max, mileage_interval, month_interval, is_combined, priority, source, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `);

  let ruleCount = 0;
  for (const rule of rules) {
    const serviceId = serviceIds[rule.service];
    if (!serviceId) {
      console.warn(`  ⚠ Service not found: ${rule.service}`);
      continue;
    }
    insertRule.run(
      uuidv4(), serviceId,
      rule.make || null, rule.model || null,
      rule.engine || null, rule.driveType || null,
      rule.yearMin || null, rule.yearMax || null,
      rule.mileage, rule.months,
      rule.priority,
      rule.source,
      rule.notes || null
    );
    ruleCount++;
  }

  console.log(`  ✓ ${ruleCount} schedule rules created from owner's manual data`);
  console.log('    Sources: Toyota Warranty & Maintenance Guide, Ford Scheduled Maintenance Guide,');
  console.log("             Honda Maintenance Minder / Owner's Manual, GM/Chevrolet Owner's Manual");

  // ═══════════════════════════════════════════════════════════════════
  //  ADMIN USER
  // ═══════════════════════════════════════════════════════════════════
  console.log('Creating admin user...');
  const adminExists = db.prepare("SELECT id FROM users WHERE email = 'admin@vehiclemaint.com'").get();
  if (!adminExists) {
    const passwordHash = await bcrypt.hash('Admin123!', 12);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, is_admin)
      VALUES (?, 'admin@vehiclemaint.com', ?, 'System', 'Admin', 1)
    `).run(uuidv4(), passwordHash);
    console.log('  ✓ Admin: admin@vehiclemaint.com / Admin123!');
  }

  // ═══════════════════════════════════════════════════════════════════
  //  DEMO USER with sample vehicle
  // ═══════════════════════════════════════════════════════════════════
  console.log('Creating demo user...');
  const demoExists = db.prepare("SELECT id FROM users WHERE email = 'demo@example.com'").get();
  if (!demoExists) {
    const passwordHash = await bcrypt.hash('Demo1234!', 12);
    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, is_admin)
      VALUES (?, 'demo@example.com', ?, 'Demo', 'User', 0)
    `).run(userId, passwordHash);
    console.log('  ✓ Demo user: demo@example.com / Demo1234!');

    // Add a sample 4Runner
    const vehicleId = uuidv4();
    db.prepare(`
      INSERT INTO vehicles (id, user_id, year, make, model, engine, drive_type, current_mileage)
      VALUES (?, ?, 2021, 'Toyota', '4Runner', '4.0L V6', '4WD', 45000)
    `).run(vehicleId, userId);

    db.prepare(`
      INSERT INTO mileage_entries (id, vehicle_id, mileage, notes)
      VALUES (?, ?, 45000, 'Initial registration')
    `).run(uuidv4(), vehicleId);

    // Generate schedule from OEM data
    generateScheduleForVehicle(vehicleId);

    console.log('  ✓ Demo vehicle: 2021 Toyota 4Runner 4WD @ 45,000 mi');
  }

  console.log('\n════════════════════════════════════════════════════');
  console.log("  ✓ Seed complete!");
  console.log("  Data sourced from manufacturer owner's manuals.");
  console.log('════════════════════════════════════════════════════');
}

seed().catch(console.error);
