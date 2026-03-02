# Service-Type Classification Framework

> Ensures every service definition across all makes and models displays the
> correct color on the Maintenance Map.

---

## 1. The Three Service Types

| service_type | Map Color | Hex | Meaning |
|---|---|---|---|
| `change` | **Black** | `#1f2937` | Consumable replaced at a fixed OEM interval |
| `inspect` | **Yellow** | `#eab308` | Inspect per schedule; replace only if condition warrants |
| `service` | **Red** | `#dc2626` | Major scheduled task performed at a fixed interval (not a fluid/filter swap) |

---

## 2. Decision Rules

When adding or reviewing a service definition, apply these rules **in order**:

### Rule 1 → `change` (Black)
> **"Is this a fluid drain-and-fill or filter replacement that happens at a
> fixed mileage/time interval regardless of condition?"**

If **yes** → `service_type = 'change'`

Examples:
- Engine Oil & Filter
- Automatic / Manual Transmission Fluid
- Transfer Case Fluid, Front/Rear Differential Fluid
- Brake Fluid, Power Steering Fluid
- Coolant (Antifreeze)
- Engine Air Filter, Cabin Air Filter, Fuel Filter

Key indicator: the OEM manual says **"Replace"** or **"Change"** with a fixed
interval and no conditional language.

---

### Rule 2 → `inspect` (Yellow)
> **"Does the OEM manual say 'Inspect,' 'Check,' or 'Replace if necessary /
> as needed'?"**

If **yes** → `service_type = 'inspect'`

Examples:
- Brake Pads & Rotors Inspection
- Drive Belt (Serpentine) — "Inspect; replace if cracked"
- Ball Joints & Dust Covers
- Steering Linkage & Boots
- PCV Valve — "Inspect; replace if needed"
- Battery & Terminals — "Inspect / clean / test"
- Propeller Shaft Lubrication — "Grease if equipped with fittings"
- Multi-Point Inspection
- Exhaust System Inspection
- Wiper Blades — "Replace when worn"
- Parking Brake Adjustment
- Wheel Alignment — "Check and adjust"

Key indicators:
- **"Inspect"** appears before any replacement language
- Replacement is **conditional** on wear, measurement, or visual check
- Lubrication/greasing only **if equipped**

---

### Rule 3 → `service` (Red)
> **"Is this a major scheduled task (not a fluid/filter change) that is
> always performed at the specified interval?"**

If **yes** → `service_type = 'service'`

Examples:
- Tire Rotation — always performed at interval
- Spark Plugs — replaced at fixed mileage (60K–120K)
- Timing Belt/Chain — replaced at fixed mileage
- Valve Clearance Adjustment — adjusted at fixed mileage

Key indicators:
- The task is **always performed** regardless of condition
- It involves mechanical labor, not just fluid/filter swap
- OEM manual gives a **definitive mileage** for the work

---

## 3. Edge Cases & Tie-Breakers

| Scenario | Decision | Rationale |
|---|---|---|
| OEM says "Replace coolant" | `change` | Fluid replacement → Rule 1 wins |
| OEM says "Inspect drive belt; replace if cracked" | `inspect` | Conditional replacement → Rule 2 |
| OEM says "Replace spark plugs at 60,000 mi" | `service` | Definitive replacement, not fluid/filter → Rule 3 |
| OEM says "Inspect and adjust valve clearance every 60K" | `service` | Always performed at interval → Rule 3 |
| Grease fittings "if equipped" | `inspect` | Conditional on equipment → Rule 2 |
| Wiper blades "replace when worn" | `inspect` | Condition-based → Rule 2 |
| OEM says "Rotate tires every 5,000 mi" | `service` | Always performed, not fluid/filter → Rule 3 |

---

## 4. Complete Service Classification (28 definitions)

### Change (Black) — 12 services
| # | Service Name | Category |
|---|---|---|
| 1 | Engine Oil & Filter | Engine |
| 2 | Engine Air Filter | Engine |
| 3 | Coolant (Antifreeze) | Engine |
| 4 | Fuel Filter | Engine |
| 5 | Automatic Transmission Fluid | Drivetrain |
| 6 | Manual Transmission Fluid | Drivetrain |
| 7 | Transfer Case Fluid | Drivetrain |
| 8 | Front Differential Fluid | Drivetrain |
| 9 | Rear Differential Fluid | Drivetrain |
| 10 | Brake Fluid | Brakes |
| 11 | Cabin Air Filter | HVAC |
| 12 | Power Steering Fluid | Steering |

### Inspect (Yellow) — 12 services
| # | Service Name | Category |
|---|---|---|
| 1 | Drive Belt (Serpentine) | Engine |
| 2 | PCV Valve | Engine |
| 3 | Brake Pads & Rotors Inspection | Brakes |
| 4 | Parking Brake Adjustment | Brakes |
| 5 | Wheel Alignment | Tires & Wheels |
| 6 | Ball Joints & Dust Covers | Suspension |
| 7 | Steering Linkage & Boots | Suspension |
| 8 | Battery & Terminals | Electrical |
| 9 | Wiper Blades | Exterior |
| 10 | Multi-Point Inspection | General |
| 11 | Exhaust System Inspection | General |
| 12 | Propeller Shaft Lubrication | Drivetrain |

### Service (Red) — 4 services
| # | Service Name | Category |
|---|---|---|
| 1 | Spark Plugs | Engine |
| 2 | Timing Belt/Chain | Engine |
| 3 | Valve Clearance Adjustment | Engine |
| 4 | Tire Rotation | Tires & Wheels |

---

## 5. Implementation

The classification is stored in the **`service_type`** column on the
`service_definitions` table. Values: `'change'`, `'inspect'`, `'service'`.

```
service_definitions
├── id TEXT PRIMARY KEY
├── name TEXT
├── description TEXT
├── category TEXT
├── service_type TEXT NOT NULL DEFAULT 'change'   ← color source
├── is_active INTEGER
└── created_at TIMESTAMPTZ
```

The frontend reads `service_type` from the API response and maps it to a color
via a three-entry lookup — no hardcoded service-name map required.

```typescript
const SERVICE_TYPE_COLOR_MAP = {
  change:  '#1f2937',   // black
  inspect: '#eab308',   // yellow
  service: '#dc2626',   // red
};
```

---

## 6. Adding a New Make/Model

When adding schedule rules for a new vehicle:

1. Identify all services from the OEM owner's manual
2. For each service, check if a matching `service_definition` already exists
3. If not, create one and assign `service_type` using the decision rules above
4. Add `schedule_rules` entries pointing to the `service_definition`
5. The Maintenance Map will automatically use the correct color — no frontend
   changes needed

---

## 7. Changing a Classification

If an OEM manual contradicts the current classification (e.g., one manufacturer
treats spark plugs as "inspect" while another says "replace"):

1. The `service_type` is set per **service definition**, not per make/model
2. Use the **majority OEM consensus** to pick the type
3. If genuinely split, consider creating a separate service definition
   (e.g., "Spark Plugs — Inspect" vs. "Spark Plugs — Replace")
4. Document the rationale in the seed data `source` field
