import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import db, { initializeDatabase } from './database';

/**
 * Seeds the database with default service definitions, schedule rules,
 * and a demo admin user.
 */
async function seed() {
  console.log('Initializing database...');
  initializeDatabase();

  // ═══════════════════════════════════════════════════════
  // Service Definitions
  // ═══════════════════════════════════════════════════════
  console.log('Seeding service definitions...');

  const serviceDefinitions = [
    { name: 'Oil Change', description: 'Replace engine oil and oil filter', category: 'Engine' },
    { name: 'Tire Rotation', description: 'Rotate tires for even wear', category: 'Tires & Wheels' },
    { name: 'Brake Inspection', description: 'Inspect brake pads, rotors, and fluid', category: 'Brakes' },
    { name: 'Change Brake Pads/Rotors', description: 'Replace worn brake pads or rotors', category: 'Brakes' },
    { name: 'Transmission Service', description: 'Replace transmission fluid and filter', category: 'Drivetrain' },
    { name: 'Coolant Service', description: 'Flush and replace engine coolant', category: 'Engine' },
    { name: 'Spark Plugs', description: 'Replace spark plugs', category: 'Engine' },
    { name: 'Timing Belt/Chain', description: 'Inspect or replace timing belt or chain', category: 'Engine' },
    { name: 'Engine Air Filter', description: 'Replace engine air filter', category: 'Engine' },
    { name: 'Cabin Air Filter', description: 'Replace cabin air filter', category: 'HVAC' },
    { name: 'Transfer Case Oil Change', description: 'Replace transfer case fluid (4WD/AWD)', category: 'Drivetrain' },
    { name: 'Differential Fluid Change', description: 'Replace front and/or rear differential fluid', category: 'Drivetrain' },
    { name: 'Power Steering Fluid', description: 'Replace power steering fluid', category: 'Steering' },
    { name: 'Lubricate Propeller Shaft', description: 'Grease propeller shaft U-joints (4WD)', category: 'Drivetrain' },
    { name: 'Inspect Ball Joints', description: 'Inspect front suspension ball joints', category: 'Suspension' },
    { name: 'Inspect Transmission/Differential Fluids', description: 'Check fluid levels and condition', category: 'Drivetrain' },
    { name: 'Grease Driveshaft', description: 'Lubricate driveshaft joints and splines', category: 'Drivetrain' },
    { name: 'Battery Inspection', description: 'Test battery condition and clean terminals', category: 'Electrical' },
    { name: 'Wiper Blades', description: 'Replace windshield wiper blades', category: 'Exterior' },
    { name: 'Serpentine Belt', description: 'Inspect and replace serpentine/drive belt', category: 'Engine' },
    { name: 'Wheel Alignment', description: 'Check and adjust wheel alignment', category: 'Tires & Wheels' },
    { name: 'Multi-Point Inspection', description: 'Comprehensive vehicle safety inspection', category: 'General' },
  ];

  const serviceIds: Record<string, string> = {};

  const insertDef = db.prepare(`
    INSERT OR IGNORE INTO service_definitions (id, name, description, category)
    VALUES (?, ?, ?, ?)
  `);

  for (const def of serviceDefinitions) {
    const existing = db.prepare('SELECT id FROM service_definitions WHERE name = ?').get(def.name) as any;
    if (existing) {
      serviceIds[def.name] = existing.id;
      continue;
    }
    const id = uuidv4();
    insertDef.run(id, def.name, def.description, def.category);
    serviceIds[def.name] = id;
  }

  // ═══════════════════════════════════════════════════════
  // Default Schedule Rules (generic OEM-style intervals)
  // ═══════════════════════════════════════════════════════
  console.log('Seeding schedule rules...');

  const existingRules = db.prepare('SELECT COUNT(*) as count FROM schedule_rules').get() as any;
  if (existingRules.count === 0) {
    const rules = [
      // Universal rules (no make/model — fallback for any vehicle)
      { service: 'Oil Change', mileage: 5000, months: 6, priority: 0 },
      { service: 'Tire Rotation', mileage: 7500, months: 6, priority: 0 },
      { service: 'Brake Inspection', mileage: 15000, months: 12, priority: 0 },
      { service: 'Change Brake Pads/Rotors', mileage: 50000, months: 48, priority: 0 },
      { service: 'Engine Air Filter', mileage: 30000, months: 24, priority: 0 },
      { service: 'Cabin Air Filter', mileage: 20000, months: 12, priority: 0 },
      { service: 'Transmission Service', mileage: 60000, months: 48, priority: 0 },
      { service: 'Coolant Service', mileage: 60000, months: 48, priority: 0 },
      { service: 'Spark Plugs', mileage: 60000, months: 60, priority: 0 },
      { service: 'Timing Belt/Chain', mileage: 100000, months: 84, priority: 0 },
      { service: 'Serpentine Belt', mileage: 60000, months: 60, priority: 0 },
      { service: 'Battery Inspection', mileage: 30000, months: 12, priority: 0 },
      { service: 'Wiper Blades', mileage: 20000, months: 12, priority: 0 },
      { service: 'Wheel Alignment', mileage: 30000, months: 24, priority: 0 },
      { service: 'Power Steering Fluid', mileage: 50000, months: 48, priority: 0 },
      { service: 'Multi-Point Inspection', mileage: 15000, months: 12, priority: 0 },
      { service: 'Inspect Ball Joints', mileage: 30000, months: 24, priority: 0 },

      // Toyota-specific overrides
      { service: 'Oil Change', make: 'Toyota', mileage: 10000, months: 12, priority: 10 },
      { service: 'Tire Rotation', make: 'Toyota', mileage: 5000, months: 6, priority: 10 },
      { service: 'Transmission Service', make: 'Toyota', mileage: 60000, months: 48, priority: 10 },
      { service: 'Coolant Service', make: 'Toyota', mileage: 100000, months: 60, priority: 10 },
      { service: 'Spark Plugs', make: 'Toyota', mileage: 60000, months: 60, priority: 10 },

      // Ford-specific overrides
      { service: 'Oil Change', make: 'Ford', mileage: 7500, months: 12, priority: 10 },
      { service: 'Transmission Service', make: 'Ford', mileage: 150000, months: 120, priority: 10 },

      // Honda-specific overrides
      { service: 'Oil Change', make: 'Honda', mileage: 7500, months: 12, priority: 10 },
      { service: 'Transmission Service', make: 'Honda', mileage: 90000, months: 72, priority: 10 },

      // Chevrolet/GM-specific overrides
      { service: 'Oil Change', make: 'Chevrolet', mileage: 7500, months: 12, priority: 10 },
      { service: 'Transmission Service', make: 'Chevrolet', mileage: 45000, months: 48, priority: 10 },

      // 4WD/AWD specific rules
      { service: 'Transfer Case Oil Change', driveType: '4WD', mileage: 30000, months: 24, priority: 5 },
      { service: 'Transfer Case Oil Change', driveType: 'AWD', mileage: 30000, months: 24, priority: 5 },
      { service: 'Differential Fluid Change', driveType: '4WD', mileage: 30000, months: 24, priority: 5 },
      { service: 'Differential Fluid Change', driveType: 'AWD', mileage: 60000, months: 48, priority: 5 },
      { service: 'Lubricate Propeller Shaft', driveType: '4WD', mileage: 15000, months: 12, priority: 5 },
      { service: 'Grease Driveshaft', driveType: '4WD', mileage: 15000, months: 12, priority: 5 },
      { service: 'Inspect Transmission/Differential Fluids', driveType: '4WD', mileage: 15000, months: 12, priority: 5 },
    ];

    const insertRule = db.prepare(`
      INSERT INTO schedule_rules (id, service_definition_id, make, model, engine, drive_type, year_min, year_max, mileage_interval, month_interval, is_combined, priority, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `);

    for (const rule of rules) {
      const serviceId = serviceIds[rule.service];
      if (!serviceId) {
        console.warn(`Service not found: ${rule.service}`);
        continue;
      }
      insertRule.run(
        uuidv4(), serviceId,
        (rule as any).make || null, (rule as any).model || null,
        (rule as any).engine || null, (rule as any).driveType || null,
        null, null,
        rule.mileage, rule.months,
        rule.priority,
        null
      );
    }
  }

  // ═══════════════════════════════════════════════════════
  // Admin User
  // ═══════════════════════════════════════════════════════
  console.log('Creating admin user...');

  const adminExists = db.prepare("SELECT id FROM users WHERE email = 'admin@vehiclemaint.com'").get();
  if (!adminExists) {
    const passwordHash = await bcrypt.hash('Admin123!', 12);
    db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, is_admin)
      VALUES (?, 'admin@vehiclemaint.com', ?, 'System', 'Admin', 1)
    `).run(uuidv4(), passwordHash);
    console.log('Admin user created: admin@vehiclemaint.com / Admin123!');
  }

  // ═══════════════════════════════════════════════════════
  // Demo User with sample vehicle
  // ═══════════════════════════════════════════════════════
  console.log('Creating demo user...');

  const demoExists = db.prepare("SELECT id FROM users WHERE email = 'demo@example.com'").get();
  if (!demoExists) {
    const passwordHash = await bcrypt.hash('Demo1234!', 12);
    const userId = uuidv4();
    db.prepare(`
      INSERT INTO users (id, email, password_hash, first_name, last_name, is_admin)
      VALUES (?, 'demo@example.com', ?, 'Demo', 'User', 0)
    `).run(userId, passwordHash);
    console.log('Demo user created: demo@example.com / Demo1234!');

    // Add a sample vehicle
    const vehicleId = uuidv4();
    db.prepare(`
      INSERT INTO vehicles (id, user_id, year, make, model, engine, drive_type, current_mileage)
      VALUES (?, ?, 2022, 'Toyota', 'Tacoma', '3.5L V6', '4WD', 35000)
    `).run(vehicleId, userId);

    // Record mileage
    db.prepare(`
      INSERT INTO mileage_entries (id, vehicle_id, mileage, notes)
      VALUES (?, ?, 35000, 'Initial registration')
    `).run(uuidv4(), vehicleId);

    // Generate schedule for the demo vehicle
    const { generateScheduleForVehicle } = require('./services/scheduleEngine');
    generateScheduleForVehicle(vehicleId);

    console.log('Demo vehicle added: 2022 Toyota Tacoma @ 35,000 miles');
  }

  console.log('✓ Seed complete!');
}

seed().catch(console.error);
