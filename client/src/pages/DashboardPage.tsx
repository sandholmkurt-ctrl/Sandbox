import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import {
  AlertTriangle, Clock, CheckCircle, Car, DollarSign, Wrench, Plus, ChevronRight,
} from 'lucide-react';

interface DashboardData {
  vehicles: any[];
  actionItems: any[];
  recentServices: any[];
  summary: {
    totalVehicles: number;
    overdueServices: number;
    upcomingServices: number;
    okServices: number;
    yearCost: number;
    yearServicesCount: number;
  };
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<DashboardData>('/dashboard')
      .then(setData)
      .catch((err) => {
        console.error('Dashboard load error:', err);
        setError(err?.message || err?.detail || 'Unknown error');
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div>
      </div>
    );
  }

  if (!data) return <div className="text-center py-12 text-gray-500">Failed to load dashboard{error ? `: ${error}` : ''}</div>;

  const { vehicles, actionItems, recentServices, summary } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">What's due next across your vehicles</p>
        </div>
        <Link to="/vehicles/add" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Vehicle
        </Link>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card flex items-center gap-4">
          <div className="p-3 bg-blue-100 rounded-xl">
            <Car className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">{summary.totalVehicles}</p>
            <p className="text-sm text-gray-500">Vehicles</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="p-3 bg-red-100 rounded-xl">
            <AlertTriangle className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600">{summary.overdueServices}</p>
            <p className="text-sm text-gray-500">Overdue</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="p-3 bg-yellow-100 rounded-xl">
            <Clock className="w-6 h-6 text-yellow-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-600">{summary.upcomingServices}</p>
            <p className="text-sm text-gray-500">Upcoming</p>
          </div>
        </div>

        <div className="card flex items-center gap-4">
          <div className="p-3 bg-green-100 rounded-xl">
            <DollarSign className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold">${summary.yearCost.toLocaleString()}</p>
            <p className="text-sm text-gray-500">{new Date().getFullYear()} Spend</p>
          </div>
        </div>
      </div>

      {/* Empty State */}
      {vehicles.length === 0 && (
        <div className="card text-center py-16">
          <Car className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No vehicles yet</h2>
          <p className="text-gray-500 mb-6">Add your first vehicle to start tracking maintenance</p>
          <Link to="/vehicles/add" className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Your First Vehicle
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Action Items */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900">What's Due Next</h2>
          {actionItems.length === 0 ? (
            <div className="card text-center py-8">
              <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
              <p className="text-gray-500">All caught up! No services due.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {actionItems.map((item: any) => (
                <Link
                  key={item.id}
                  to={`/vehicles/${item.vehicle_id}`}
                  className="card flex items-center gap-4 hover:shadow-md transition-shadow cursor-pointer"
                >
                  <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                    item.status === 'overdue' ? 'bg-red-500' : 'bg-yellow-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{item.service_name}</p>
                    <p className="text-sm text-gray-500">
                      {item.year} {item.make} {item.model}
                      {item.next_due_mileage && ` • Due at ${item.next_due_mileage.toLocaleString()} mi`}
                      {item.next_due_date && ` • Due ${item.next_due_date}`}
                    </p>
                  </div>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    item.status === 'overdue' ? 'status-overdue' : 'status-upcoming'
                  }`}>
                    {item.status === 'overdue' ? 'Overdue' : 'Upcoming'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Vehicles + Recent History */}
        <div className="space-y-6">
          {/* My Vehicles */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-900">My Vehicles</h2>
              <Link to="/vehicles" className="text-sm text-brand-600 hover:text-brand-700">View all</Link>
            </div>
            <div className="space-y-2">
              {vehicles.map((v: any) => (
                <Link
                  key={v.id}
                  to={`/vehicles/${v.id}`}
                  className="card flex items-center gap-3 hover:shadow-md transition-shadow"
                >
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Car className="w-5 h-5 text-gray-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{v.year} {v.make} {v.model}</p>
                    <p className="text-xs text-gray-500">{v.current_mileage.toLocaleString()} miles</p>
                  </div>
                  <div className="flex gap-1">
                    {v.overdue_count > 0 && (
                      <span className="w-5 h-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                        {v.overdue_count}
                      </span>
                    )}
                    {v.upcoming_count > 0 && (
                      <span className="w-5 h-5 rounded-full bg-yellow-500 text-white text-xs flex items-center justify-center">
                        {v.upcoming_count}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          {/* Recent Services */}
          {recentServices.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-gray-900 mb-3">Recent Services</h2>
              <div className="card divide-y divide-gray-100">
                {recentServices.slice(0, 5).map((s: any) => (
                  <div key={s.id} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-gray-900">{s.service_name}</p>
                      {s.cost > 0 && (
                        <span className="text-sm text-gray-500">${s.cost}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {s.year} {s.make} {s.model} • {s.completed_date} • {s.mileage_at_service.toLocaleString()} mi
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
