# Vehicle Maintenance & Service Schedule Platform

A full-stack web application for tracking vehicle maintenance schedules, service history, and receiving automated reminders.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS + React Router
- **Backend**: Express + TypeScript + SQLite (better-sqlite3)
- **Auth**: JWT tokens + bcrypt password hashing
- **Scheduling**: node-cron for daily maintenance checks

## Quick Start

### Prerequisites
- Node.js 18+ 
- npm 9+

### Installation

```bash
# Install all dependencies (root + server + client)
npm run install:all

# Seed the database with service definitions and demo data
cd server && npm run seed && cd ..

# Start both server and client in development mode
npm run dev
```

### Default Accounts

| Account | Email | Password |
|---------|-------|----------|
| Admin   | admin@vehiclemaint.com | Admin123! |
| Demo    | demo@example.com | Demo1234! |

The demo account comes with a pre-configured 2022 Toyota Tacoma with a full maintenance schedule.

## Project Structure

```
├── client/                 # React frontend (Vite)
│   ├── src/
│   │   ├── components/     # Layout, shared components
│   │   ├── context/        # React context (Auth)
│   │   ├── pages/          # Route pages
│   │   ├── api.ts          # API client
│   │   ├── App.tsx         # Router config
│   │   └── main.tsx        # Entry point
│   └── ...
├── server/                 # Express API server
│   ├── src/
│   │   ├── middleware/      # Auth middleware
│   │   ├── routes/          # API route handlers
│   │   ├── services/        # Business logic
│   │   ├── database.ts      # SQLite setup & schema
│   │   ├── types.ts         # TypeScript types & Zod schemas
│   │   ├── seed.ts          # Database seeder
│   │   └── index.ts         # Express server entry
│   └── ...
└── package.json            # Root monorepo scripts
```

## API Endpoints

### Authentication
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Sign in
- `GET /api/auth/me` — Get profile
- `PUT /api/auth/me` — Update profile
- `POST /api/auth/password-reset` — Request password reset

### Vehicles
- `GET /api/vehicles` — List user's vehicles
- `GET /api/vehicles/:id` — Get vehicle details with schedule
- `POST /api/vehicles` — Add vehicle
- `PUT /api/vehicles/:id` — Update vehicle
- `DELETE /api/vehicles/:id` — Delete vehicle

### VIN Decode
- `GET /api/vin/decode/:vin` — Decode VIN via NHTSA API

### Mileage
- `GET /api/vehicles/:id/mileage` — Mileage history
- `POST /api/vehicles/:id/mileage` — Add mileage entry
- `PUT /api/vehicles/:id/mileage/:entryId` — Update entry
- `DELETE /api/vehicles/:id/mileage/:entryId` — Delete entry

### Services & Schedule
- `GET /api/vehicles/:id/schedule` — Get maintenance schedule
- `GET /api/vehicles/:id/services` — Service history
- `POST /api/vehicles/:id/services` — Complete a service
- `DELETE /api/vehicles/:id/services/:serviceId` — Delete record

### Dashboard
- `GET /api/dashboard` — Dashboard summary

### Notifications
- `GET /api/notifications` — List notifications
- `GET /api/notifications/count` — Unread count
- `PUT /api/notifications/:id/read` — Mark read
- `PUT /api/notifications/read-all` — Mark all read
- `DELETE /api/notifications/:id` — Delete

### Admin (requires admin role)
- `GET /api/admin/stats` — System statistics
- `GET/POST/PUT/DELETE /api/admin/service-definitions` — Manage services
- `GET/POST/DELETE /api/admin/schedule-rules` — Manage rules

## Features

### Core
- ✅ User registration & JWT authentication
- ✅ Add vehicles by VIN (NHTSA API) or manual entry
- ✅ Multiple vehicle management
- ✅ Manufacturer-recommended maintenance schedules
- ✅ Mileage-based and time-based service intervals
- ✅ Color-coded status (Green/Yellow/Red)
- ✅ Maintenance Map visualization
- ✅ Service history tracking with cost
- ✅ In-app notification system
- ✅ Daily cron job for status updates
- ✅ Admin dashboard for managing service definitions & rules
- ✅ Responsive mobile-first design

### Pre-loaded Service Types
Oil Change, Tire Rotation, Brake Inspection, Transmission Service, Coolant Service, Spark Plugs, Timing Belt/Chain, Air Filters, Differential Fluid, Transfer Case Oil, Power Steering Fluid, Driveshaft Lubrication, Ball Joint Inspection, and more.

### Pre-loaded Schedule Rules
- Universal defaults for all vehicles
- Toyota, Ford, Honda, Chevrolet manufacturer-specific intervals
- 4WD/AWD-specific drivetrain services

## Development

```bash
# Server only (port 3001)
npm run dev:server

# Client only (port 5173, proxies to server)
npm run dev:client

# Both
npm run dev
```

## Production Build

```bash
npm run build
npm start
```

The built client is served from `client/dist/` and the server runs on port 3001.
