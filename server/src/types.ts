import { z } from 'zod';

// ─── User ───────────────────────────────────────────────
export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const UpdateProfileSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  emailNotifications: z.boolean().optional(),
  reminderLeadMiles: z.number().int().min(0).max(5000).optional(),
  reminderLeadDays: z.number().int().min(0).max(365).optional(),
});

export const ResetPasswordRequestSchema = z.object({
  email: z.string().email(),
});

export const ResetPasswordSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8),
});

// ─── Vehicle ────────────────────────────────────────────
export const AddVehicleSchema = z.object({
  vin: z.string().length(17).optional(),
  year: z.number().int().min(1900).max(2030),
  make: z.string().min(1),
  model: z.string().min(1),
  engine: z.string().optional(),
  trimLevel: z.string().optional(),
  driveType: z.string().optional(),
  currentMileage: z.number().int().min(0).default(0),
});

export const UpdateVehicleSchema = z.object({
  currentMileage: z.number().int().min(0).optional(),
  engine: z.string().optional(),
  trimLevel: z.string().optional(),
  driveType: z.string().optional(),
  remindersEnabled: z.boolean().optional(),
});

// ─── Mileage ────────────────────────────────────────────
export const AddMileageSchema = z.object({
  mileage: z.number().int().min(0),
  recordedAt: z.string().optional(),
  notes: z.string().optional(),
});

export const UpdateMileageSchema = z.object({
  mileage: z.number().int().min(0),
  notes: z.string().optional(),
});

// ─── Service History ────────────────────────────────────
export const CompleteServiceSchema = z.object({
  serviceDefinitionId: z.string(),
  vehicleScheduleId: z.string().optional(),
  completedDate: z.string(),
  mileageAtService: z.number().int().min(0),
  cost: z.number().min(0).optional(),
  notes: z.string().optional(),
  shopName: z.string().optional(),
});

// ─── Admin ──────────────────────────────────────────────
export const ServiceDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
});

export const ScheduleRuleSchema = z.object({
  serviceDefinitionId: z.string(),
  yearMin: z.number().int().optional(),
  yearMax: z.number().int().optional(),
  make: z.string().optional(),
  model: z.string().optional(),
  engine: z.string().optional(),
  driveType: z.string().optional(),
  mileageInterval: z.number().int().min(0).optional(),
  monthInterval: z.number().int().min(0).optional(),
  isCombined: z.boolean().default(true),
  priority: z.number().int().default(0),
  notes: z.string().optional(),
});

// ─── Types ──────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name: string | null;
  last_name: string | null;
  is_admin: number;
  email_notifications: number;
  reminder_lead_miles: number;
  reminder_lead_days: number;
  created_at: string;
  updated_at: string;
}

export interface Vehicle {
  id: string;
  user_id: string;
  vin: string | null;
  year: number;
  make: string;
  model: string;
  engine: string | null;
  trim_level: string | null;
  drive_type: string | null;
  current_mileage: number;
  reminders_enabled: number;
  created_at: string;
  updated_at: string;
}

export interface MileageEntry {
  id: string;
  vehicle_id: string;
  mileage: number;
  recorded_at: string;
  notes: string | null;
}

export interface ServiceDefinition {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  is_active: number;
  created_at: string;
}

export interface ScheduleRule {
  id: string;
  service_definition_id: string;
  year_min: number | null;
  year_max: number | null;
  make: string | null;
  model: string | null;
  engine: string | null;
  drive_type: string | null;
  mileage_interval: number | null;
  month_interval: number | null;
  is_combined: number;
  priority: number;
  notes: string | null;
  created_at: string;
}

export interface VehicleSchedule {
  id: string;
  vehicle_id: string;
  service_definition_id: string;
  mileage_interval: number | null;
  month_interval: number | null;
  is_combined: number;
  next_due_mileage: number | null;
  next_due_date: string | null;
  status: 'ok' | 'upcoming' | 'overdue';
  created_at: string;
  updated_at: string;
}

export interface ServiceHistory {
  id: string;
  vehicle_id: string;
  vehicle_schedule_id: string | null;
  service_definition_id: string;
  completed_date: string;
  mileage_at_service: number;
  cost: number | null;
  notes: string | null;
  shop_name: string | null;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  vehicle_id: string | null;
  vehicle_schedule_id: string | null;
  type: 'upcoming' | 'overdue' | 'info';
  title: string;
  message: string;
  is_read: number;
  email_sent: number;
  created_at: string;
}
