import { useMemo } from 'react';

interface ScheduleItem {
  id: string;
  service_definition_id: string;
  service_name: string;
  category: string;
  mileage_interval: number | null;
  month_interval: number | null;
  status: 'ok' | 'upcoming' | 'overdue';
  next_due_mileage: number | null;
}

interface MaintenanceMapProps {
  schedule: ScheduleItem[];
  currentMileage: number;
  vehicleLabel: string;
  onServiceClick?: (item: ScheduleItem) => void;
}

// Service type color scheme (matching maintenance map attachment)
// Black = Change Interval, Yellow = Inspect/Change as needed, Red = Service Interval
const SERVICE_TYPE_COLORS: Record<string, string> = {
  // Change intervals (fluids, filters that get replaced)
  'Engine Oil & Filter': '#1f2937',           // black
  'Transmission Fluid': '#1f2937',
  'Coolant/Antifreeze': '#1f2937',
  'Brake Fluid': '#1f2937',
  'Power Steering Fluid': '#1f2937',
  'Differential Fluid': '#1f2937',
  'Front Differential Fluid': '#1f2937',
  'Rear Differential Fluid': '#1f2937',
  'Transfer Case Fluid': '#1f2937',
  'Engine Air Filter': '#1f2937',
  'Cabin Air Filter': '#1f2937',
  
  // Inspect/change as needed (conditional service)
  'Brake Inspection': '#eab308',
  'Brake Pads & Rotors': '#eab308',
  'Front Brake Pads': '#eab308',
  'Rear Brake Pads': '#eab308',
  'Spark Plugs': '#eab308',
  'Battery Inspection': '#eab308',
  'Suspension Inspection': '#eab308',
  'Steering Inspection': '#eab308',
  'Steering Linkage & Boots': '#eab308',
  'Ball Joints & Dust Covers': '#eab308',
  'Driveshaft Lubrication': '#eab308',
  'Propeller Shaft Lubrication': '#eab308',
  'Ball Joint Inspection': '#eab308',
  
  // Service intervals (major scheduled service)
  'Tire Rotation': '#dc2626',                  // red
  'Timing Belt/Chain': '#dc2626',              // red
  'Serpentine Belt': '#dc2626',
  'Coolant Service': '#dc2626',
  'Transmission Service': '#dc2626',
  'Fuel Filter': '#dc2626',
  '30k Service': '#dc2626',
  '60k Service': '#dc2626',
  '90k Service': '#dc2626',
};

function getCategoryColor(serviceName: string, category: string | null): string {
  // First try exact service name match
  if (SERVICE_TYPE_COLORS[serviceName]) {
    return SERVICE_TYPE_COLORS[serviceName];
  }
  
  // Fallback: guess by category
  // Drivetrain fluids → black
  if (category === 'Drivetrain' || category === 'Engine') return '#1f2937';
  // Brakes, Tires, Suspension → yellow (inspections)
  if (category === 'Brakes' || category === 'Tires & Wheels' || category === 'Suspension' || category === 'Steering') return '#eab308';
  // Everything else → red
  return '#dc2626';
}

// Determine the ring (border) color for a circle based on its column mileage
// relative to currentMileage. The circle interior always stays the category color;
// only the thick border ring changes to indicate status.
function getRingColor(item: ScheduleItem, mileageCol: number, currentMileage: number, leadMiles: number = 500): string | null {
  const interval = item.mileage_interval || 0;
  const nextDue = item.next_due_mileage;

  if (nextDue !== null) {
    if (mileageCol === nextDue) {
      if (currentMileage >= nextDue) return '#dc2626';            // red — overdue
      if (currentMileage >= nextDue - leadMiles) return '#d97706'; // amber — upcoming
    }
    if (mileageCol < nextDue && mileageCol <= currentMileage) {
      return '#16a34a'; // green — completed
    }
  } else if (interval > 0) {
    if (mileageCol <= currentMileage) return '#16a34a';
    if (mileageCol <= currentMileage + leadMiles) return '#d97706';
  }

  return null; // no status ring — future milestone
}

export default function MaintenanceMap({ schedule, currentMileage, vehicleLabel, onServiceClick }: MaintenanceMapProps) {
  const { serviceList, mileageColumns, grid, maxMileage, axisStep } = useMemo(() => {
    // Get unique services with mileage intervals, assign index numbers
    const withInterval = schedule.filter(s => s.mileage_interval && s.mileage_interval > 0);
    // Sort by interval (most frequent first, like the image)
    const sorted = [...withInterval].sort((a, b) => (a.mileage_interval || 0) - (b.mileage_interval || 0));

    // Assign service numbers (1-based)
    const serviceList = sorted.map((s, i) => ({
      ...s,
      num: i + 1,
    }));

    // Compute the axis step from the vehicle's own intervals.
    // Use the GCD of all mileage_intervals so every service lines up
    // perfectly with a column (e.g. 7 500 → axis at 7.5K, 15K, 22.5K …).
    function gcd(a: number, b: number): number {
      while (b) { [a, b] = [b, a % b]; }
      return a;
    }
    const intervals = serviceList.map(s => s.mileage_interval!);
    const axisStep = intervals.length > 0
      ? intervals.reduce((g, v) => gcd(g, v))
      : 5000;

    // Determine max mileage for the map (at least 100K, round up to axisStep)
    const maxMileage = Math.max(100000, Math.ceil((currentMileage + 50000) / axisStep) * axisStep);

    // Generate columns at every axisStep — every service multiple will land
    // on a column because axisStep divides every interval evenly.
    const columns: number[] = [];
    for (let m = 0; m <= maxMileage; m += axisStep) {
      columns.push(m);
    }

    // Build grid: for each column, which services are due
    const grid: Map<number, typeof serviceList> = new Map();
    for (const col of columns) {
      const dueHere: typeof serviceList = [];
      for (const svc of serviceList) {
        const interval = svc.mileage_interval!;
        // Service is due at every multiple of its interval
        if (col > 0 && col % interval === 0) {
          dueHere.push(svc);
        }
      }
      // Sort by number (bottom = #1, top = highest) to stack like the image
      dueHere.sort((a, b) => a.num - b.num);
      grid.set(col, dueHere);
    }

    return { serviceList, mileageColumns: columns, grid, maxMileage, axisStep };
  }, [schedule, currentMileage]);

  if (serviceList.length === 0) {
    return null;
  }

  // Max stack height across all columns
  const maxStack = Math.max(...Array.from(grid.values()).map(v => v.length), 1);
  const CELL_SIZE = 36; // px per circle
  const COL_WIDTH = 52; // px per mileage column
  const HEADER_HEIGHT = 30;
  const LEGEND_OFFSET = 20;

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-gray-900">Maintenance Map</h3>
          <p className="text-xs text-gray-500">{vehicleLabel} • Every {axisStep >= 1000 ? `${(axisStep / 1000)}K` : axisStep.toLocaleString()} mi to {(maxMileage / 1000).toFixed(0)}K</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Service Type Legend */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gray-900 inline-block"></span>
              Change Interval
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-yellow-500 inline-block"></span>
              Inspect / Change as needed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-red-600 inline-block"></span>
              Service Interval
            </span>
          </div>
          {/* Status Legend */}
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gray-400 border-[3px] border-green-600 inline-block"></span>
              Complete
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gray-400 inline-block"></span>
              Scheduled
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gray-400 border-[3px] border-yellow-600 inline-block"></span>
              Upcoming
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-gray-400 border-[3px] border-red-600 inline-block"></span>
              Overdue
            </span>
          </div>
        </div>
      </div>

      {/* Scrollable grid area */}
      <div className="overflow-x-auto -mx-6 px-6 pb-2">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${mileageColumns.length}, ${COL_WIDTH}px)`,
            gap: '0',
            minWidth: mileageColumns.length * COL_WIDTH,
          }}
        >
          {/* Column stacks */}
          {mileageColumns.map((mileage) => {
            const items = grid.get(mileage) || [];
            const isCurrentRange = currentMileage >= mileage && currentMileage < mileage + axisStep;

            return (
              <div
                key={mileage}
                className="flex flex-col items-center relative"
                style={{ minHeight: maxStack * CELL_SIZE + HEADER_HEIGHT + LEGEND_OFFSET }}
              >
                {/* Stack of service circles (bottom-aligned) */}
                <div
                  className="flex flex-col-reverse items-center gap-0.5 flex-1 justify-start mt-auto"
                  style={{ paddingBottom: HEADER_HEIGHT + LEGEND_OFFSET }}
                >
                  {items.map((item) => {
                    const catColor = getCategoryColor(item.service_name, item.category);
                    const ringColor = getRingColor(item, mileage, currentMileage);
                    return (
                      <button
                        key={`${mileage}-${item.id}`}
                        onClick={() => onServiceClick?.(item)}
                        className="group relative flex-shrink-0"
                        title={`${item.service_name} — Every ${item.mileage_interval!.toLocaleString()} mi`}
                      >
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-transform group-hover:scale-110 cursor-pointer"
                          style={{
                            backgroundColor: catColor,
                            border: `3px solid ${ringColor || catColor}`,
                            color: '#ffffff',
                          }}
                        >
                          {item.num}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Current mileage marker */}
                {isCurrentRange && (
                  <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-0.5 bg-brand-600 opacity-60"
                    style={{ height: maxStack * CELL_SIZE + 8, zIndex: 0 }}
                  />
                )}

                {/* Mileage label at bottom */}
                <div className={`absolute bottom-0 text-center ${isCurrentRange ? 'font-bold text-brand-700' : 'text-gray-400'}`}>
                  <div className="w-full h-px bg-gray-200 mb-1"></div>
                  <span className="text-[10px] leading-none whitespace-nowrap">
                    {mileage === 0 ? '0' : mileage % 1000 === 0 ? `${mileage / 1000}K` : `${(mileage / 1000).toFixed(1)}K`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Current mileage indicator */}
      <div className="flex items-center gap-2 mt-3 mb-4 text-xs text-brand-700 font-medium">
        <div className="w-3 h-3 bg-brand-600 rounded-sm"></div>
        Current: {currentMileage.toLocaleString()} miles
      </div>

      {/* Service Legend — numbered list like the image */}
      <div className="border-t border-gray-200 pt-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">Service Legend</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-2.5">
          {serviceList.map((svc) => {
            const color = getCategoryColor(svc.service_name, svc.category);
            return (
              <button
                key={svc.id}
                onClick={() => onServiceClick?.(svc)}
                className="flex items-start gap-2.5 text-left group hover:bg-gray-50 rounded-lg p-1.5 -m-1.5 transition-colors"
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: color, color: '#fff' }}
                >
                  {svc.num}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 leading-tight group-hover:text-brand-700">
                    {svc.service_name}
                  </p>
                  <p className="text-[11px] text-gray-500 leading-tight mt-0.5">
                    Every {svc.mileage_interval!.toLocaleString()} mi
                    {svc.month_interval ? ` / ${svc.month_interval} mo` : ''}
                    {svc.status === 'overdue' && (
                      <span className="ml-1.5 text-red-600 font-semibold">OVERDUE</span>
                    )}
                    {svc.status === 'upcoming' && (
                      <span className="ml-1.5 text-yellow-600 font-semibold">UPCOMING</span>
                    )}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
