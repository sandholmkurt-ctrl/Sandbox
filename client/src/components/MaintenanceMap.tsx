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

// Color palette for service categories
const CATEGORY_COLORS: Record<string, string> = {
  Engine: '#2563eb',       // blue
  'Tires & Wheels': '#7c3aed', // violet
  Brakes: '#dc2626',      // red
  Drivetrain: '#ea580c',   // orange
  Steering: '#0891b2',     // cyan
  Suspension: '#4f46e5',   // indigo
  HVAC: '#059669',         // emerald
  Electrical: '#d97706',   // amber
  Exterior: '#6b7280',     // gray
  General: '#8b5cf6',      // purple
};

function getCategoryColor(category: string | null): string {
  return CATEGORY_COLORS[category || 'General'] || '#6b7280';
}

// Determine circle type: filled (change), outline+fill (inspect), red ring (severe/overdue)
function getCircleStyle(item: ScheduleItem, mileageCol: number, currentMileage: number) {
  // If this specific column mileage is past current mileage + interval (overdue pattern)
  if (item.status === 'overdue') {
    return { bg: '#fca5a5', border: '#dc2626', textColor: '#991b1b', ring: true }; // red
  }
  if (item.status === 'upcoming') {
    return { bg: '#fde68a', border: '#d97706', textColor: '#92400e', ring: false }; // yellow
  }
  // Standard: use category color
  const color = getCategoryColor(item.category);
  return { bg: color, border: color, textColor: '#ffffff', ring: false };
}

export default function MaintenanceMap({ schedule, currentMileage, vehicleLabel, onServiceClick }: MaintenanceMapProps) {
  const { serviceList, mileageColumns, grid, maxMileage } = useMemo(() => {
    // Get unique services with mileage intervals, assign index numbers
    const withInterval = schedule.filter(s => s.mileage_interval && s.mileage_interval > 0);
    // Sort by interval (most frequent first, like the image)
    const sorted = [...withInterval].sort((a, b) => (a.mileage_interval || 0) - (b.mileage_interval || 0));

    // Assign service numbers (1-based)
    const serviceList = sorted.map((s, i) => ({
      ...s,
      num: i + 1,
    }));

    // Determine max mileage for the map (at least 100K, or round up from current)
    const maxFromCurrent = Math.max(100000, Math.ceil((currentMileage + 50000) / 5000) * 5000);
    const maxMileage = maxFromCurrent;

    // Generate mileage columns (every 5K)
    const columns: number[] = [];
    for (let m = 0; m <= maxMileage; m += 5000) {
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

    return { serviceList, mileageColumns: columns, grid, maxMileage };
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
          <p className="text-xs text-gray-500">{vehicleLabel} • Mileage intervals from 0 to {(maxMileage / 1000).toFixed(0)}K</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-blue-600 inline-block"></span>
            Change
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-yellow-400 border-2 border-yellow-600 inline-block"></span>
            Upcoming
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-4 h-4 rounded-full bg-red-300 border-2 border-red-600 inline-block"></span>
            Overdue
          </span>
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
            const isCurrentRange = currentMileage >= mileage && currentMileage < mileage + 5000;

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
                    const style = getCircleStyle(item, mileage, currentMileage);
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
                            backgroundColor: style.bg,
                            border: style.ring ? `2.5px solid ${style.border}` : `2px solid ${style.border}`,
                            color: style.textColor,
                            boxShadow: style.ring ? `0 0 0 1px ${style.border}` : 'none',
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
                    {mileage === 0 ? '0' : `${mileage / 1000}K`}
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
            const color = getCategoryColor(svc.category);
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
