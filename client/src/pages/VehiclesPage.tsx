import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { Car, Plus, ChevronRight, AlertTriangle, Clock, CheckCircle } from 'lucide-react';

export default function VehiclesPage() {
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>('/vehicles')
      .then(setVehicles)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Vehicles</h1>
          <p className="text-gray-500 mt-1">{vehicles.length} vehicle{vehicles.length !== 1 ? 's' : ''} registered</p>
        </div>
        <Link to="/vehicles/add" className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" />
          Add Vehicle
        </Link>
      </div>

      {vehicles.length === 0 ? (
        <div className="card text-center py-16">
          <Car className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">No vehicles yet</h2>
          <p className="text-gray-500 mb-6">Add your first vehicle to get started</p>
          <Link to="/vehicles/add" className="btn-primary inline-flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Vehicle
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {vehicles.map((v: any) => (
            <Link
              key={v.id}
              to={`/vehicles/${v.id}`}
              className="card hover:shadow-lg transition-shadow group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="p-3 bg-brand-50 rounded-xl">
                  <Car className="w-6 h-6 text-brand-600" />
                </div>
                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-brand-500 transition-colors" />
              </div>

              <h3 className="text-lg font-semibold text-gray-900">
                {v.year} {v.make} {v.model}
              </h3>
              {v.vin && <p className="text-xs text-gray-400 font-mono mt-0.5">VIN: {v.vin}</p>}
              <p className="text-sm text-gray-500 mt-1">
                {v.current_mileage.toLocaleString()} miles
                {v.engine && ` • ${v.engine}`}
                {v.drive_type && ` • ${v.drive_type}`}
              </p>

              <div className="flex items-center gap-3 mt-4 pt-4 border-t border-gray-100">
                {v.overdue_count > 0 && (
                  <div className="flex items-center gap-1.5 text-red-600 text-sm">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{v.overdue_count} overdue</span>
                  </div>
                )}
                {v.upcoming_count > 0 && (
                  <div className="flex items-center gap-1.5 text-yellow-600 text-sm">
                    <Clock className="w-4 h-4" />
                    <span>{v.upcoming_count} upcoming</span>
                  </div>
                )}
                {v.overdue_count === 0 && v.upcoming_count === 0 && (
                  <div className="flex items-center gap-1.5 text-green-600 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    <span>All good</span>
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
