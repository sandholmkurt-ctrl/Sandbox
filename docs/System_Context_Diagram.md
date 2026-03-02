# System Context Diagram - Vehicle Maintenance & Service Schedule Platform

**Data Flow Context | React + Express + PostgreSQL | Hosted on Render | March 2026**

```mermaid
graph TB
    %% Actors
    Owner["Vehicle Owner<br/>(Person)<br/><br/>Registers vehicles, logs<br/>services & mileage"]
    Admin["Admin User<br/>(Person)<br/><br/>Manages OEM rules &<br/>service definitions"]
    
    %% Central System
    System["Vehicle Maintenance &<br/>Service Schedule Platform<br/><br/>(Software System)<br/><br/>React 18 SPA + Express 4 API<br/>JWT Auth | 349 OEM Rules | 13 Makes<br/>Cron: daily status engine 06:00 UTC"]
    
    %% External Systems
    NHTSA["NHTSA vPIC API<br/>(External System)<br/><br/>vpic.nhtsa.dot.gov<br/>VIN Decode Service"]
    DB[("Neon PostgreSQL<br/>(External Database)<br/><br/>users | vehicles | vehicle_schedules<br/>schedule_rules | service_history<br/>service_definitions | mileage_entries<br/>notifications")]
    Render["Render<br/>(Cloud Platform)<br/><br/>Hosts API + static SPA<br/>Auto-deploy from GitHub"]
    GitHub["GitHub<br/>(Source Control)<br/><br/>CI/CD trigger"]
    
    %% Connections with data flow labels
    Owner <-->|"HTTPS/JSON<br/><br/>IN: credentials, VIN, vehicle info,<br/>service records, mileage<br/>OUT: dashboard, schedules,<br/>history, notifications"| System
    
    Admin <-->|"HTTPS/JSON<br/><br/>IN: OEM rules, definitions<br/>OUT: metrics, user/vehicle data"| System
    
    System -->|"VIN (17 chars)<br/>REST/JSON"| NHTSA
    NHTSA -->|"year, make, model,<br/>engine, driveType"| System
    
    System <-->|"SQL/TLS (pg Pool)<br/><br/>CRUD: all 8 tables<br/>ENV: DATABASE_URL"| DB
    
    System -.->|"Deployed on<br/>PORT 3001<br/>HTTPS"| Render
    
    GitHub -.->|"Git push webhook<br/>auto build + deploy"| Render
    
    %% Styling
    classDef personStyle fill:#D1FAE5,stroke:#059669,stroke-width:2px,color:#065F46
    classDef systemStyle fill:#DBEAFE,stroke:#1E40AF,stroke-width:3px,color:#1E40AF
    classDef externalStyle fill:#F3F4F6,stroke:#6B7280,stroke-width:2px,stroke-dasharray: 5 5,color:#374151
    classDef dbStyle fill:#CCFBF1,stroke:#0D9488,stroke-width:2px,stroke-dasharray: 5 5,color:#134E4A
    classDef cloudStyle fill:#FEF3C7,stroke:#D97706,stroke-width:2px,stroke-dasharray: 5 5,color:#78350F
    
    class Owner,Admin personStyle
    class System systemStyle
    class NHTSA,GitHub externalStyle
    class DB dbStyle
    class Render cloudStyle
```

## Legend

- **Blue** = Core System
- **Green** = Person/Actor
- **Dashed borders** = External System
- **Solid arrows** = Data flow
- **Dashed arrows** = Async/deployment flow

## Components Description

### Central System
- **Frontend**: React 18 + Vite + Tailwind CSS + TypeScript
- **Backend**: Express 4 + TypeScript + PostgreSQL (pg Pool)
- **Authentication**: Custom JWT + bcrypt (4-source token extraction)
- **OEM Rules**: 349 maintenance schedules across 13 makes, 40+ models
- **Automation**: Daily cron job at 06:00 UTC for status calculation

### External Systems
- **NHTSA vPIC API**: VIN decoding service (REST/JSON)
- **Neon PostgreSQL**: Cloud database with 8 tables (users, vehicles, vehicle_schedules, schedule_rules, service_history, service_definitions, mileage_entries, notifications)
- **Render**: Cloud hosting platform (auto-deploy from GitHub)
- **GitHub**: Source control + CI/CD trigger

### Actors
- **Vehicle Owner**: Registers vehicles, logs services, tracks mileage, views maintenance schedules
- **Admin User**: Manages OEM maintenance rules and service definitions

## Data Flow Summary

### Vehicle Owner → System (HTTPS/JSON)
- **IN**: Login credentials, VIN, vehicle information, service records, mileage entries
- **OUT**: Dashboard view, maintenance schedules, service history, notifications

### Admin User → System (HTTPS/JSON)
- **IN**: OEM maintenance rules, service definitions
- **OUT**: System metrics, user data, vehicle statistics

### System → NHTSA vPIC API (REST/JSON)
- **Request**: VIN (17 characters)
- **Response**: Year, make, model, engine, drive type

### System ↔ Neon PostgreSQL (SQL/TLS)
- Connection via `pg` Pool using `DATABASE_URL` environment variable
- CRUD operations across all 8 tables
- TLS-encrypted connection

### GitHub → Render (Webhook)
- Git push triggers automatic build and deployment
- Deploys from `feature/postgres-migration` branch

## Deployment

- **Live URL**: https://vehicle-maintenance-uc4a.onrender.com
- **Port**: 3001
- **Branch**: feature/postgres-migration
- **Demo Credentials**: demo@example.com / Demo1234!
