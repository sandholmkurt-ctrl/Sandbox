import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api';
import {
  ArrowLeft, Car, AlertTriangle, Clock, CheckCircle, Wrench,
  Plus, Trash2, Gauge, History, ListChecks, Edit3, Save, X,
} from 'lucide-react';
import MaintenanceMap from '../components/MaintenanceMap';

export default function VehicleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [vehicle, setVehicle] = useState<any>(null);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [serviceHistory, setServiceHistory] = useState<any[]>([]);
  const [mileageHistory, setMileageHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'schedule' | 'history' | 'mileage'>('schedule');

  // Mileage update
  const [editingMileage, setEditingMileage] = useState(false);
  const [newMileage, setNewMileage] = useState('');

  // Complete service modal
  const [showCompleteService, setShowCompleteService] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState<any>(null);
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [serviceMileage, setServiceMileage] = useState('');
  const [serviceCost, setServiceCost] = useState('');
  const [serviceNotes, setServiceNotes] = useState('');
  const [serviceShop, setServiceShop] = useState('');

  // Delete confirm
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadData = useCallback(async () => {
    if (!id) return;
    try {
      const [v, sched, hist, miles] = await Promise.all([
        api.get<any>(`/vehicles/${id}`),
        api.get<any[]>(`/vehicles/${id}/schedule`),
        api.get<any[]>(`/vehicles/${id}/services`),
        api.get<any[]>(`/vehicles/${id}/mileage`),
      ]);
      setVehicle(v);
      setSchedule(sched);
      setServiceHistory(hist);
      setMileageHistory(miles);
    } catch (err) {
      console.error(err);
      navigate('/vehicles');
    } finally {
      setLoading(false);
    }
  }, [id, navigate]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleMileageUpdate = async () => {
    const miles = parseInt(newMileage);
    if (isNaN(miles) || miles < 0) return;
    await api.put(`/vehicles/${id}`, { currentMileage: miles });
    setEditingMileage(false);
    setNewMileage('');
    loadData();
  };

  const handleCompleteService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchedule) return;

    await api.post(`/vehicles/${id}/services`, {
      serviceDefinitionId: selectedSchedule.service_definition_id,
      vehicleScheduleId: selectedSchedule.id,
      completedDate: serviceDate,
      mileageAtService: parseInt(serviceMileage) || vehicle.current_mileage,
      cost: serviceCost ? parseFloat(serviceCost) : undefined,
      notes: serviceNotes || undefined,
      shopName: serviceShop || undefined,
    });

    setShowCompleteService(false);
    setSelectedSchedule(null);
    setServiceNotes('');
    setServiceCost('');
    setServiceShop('');
    loadData();
  };

  const handleDeleteVehicle = async () => {
    await api.delete(`/vehicles/${id}`);
    navigate('/vehicles');
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div></div>;
  }

  if (!vehicle) return null;

  const overdueItems = schedule.filter((s: any) => s.status === 'overdue');
  const upcomingItems = schedule.filter((s: any) => s.status === 'upcoming');
  const okItems = schedule.filter((s: any) => s.status === 'ok');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/vehicles')} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {vehicle.year} {vehicle.make} {vehicle.model}
            </h1>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500">
              {vehicle.vin && <span className="font-mono">VIN: {vehicle.vin}</span>}
              {vehicle.engine && <span>• {vehicle.engine}</span>}
              {vehicle.drive_type && <span>• {vehicle.drive_type}</span>}
            </div>
          </div>
        </div>
        <button
          onClick={() => setConfirmDelete(true)}
          className="btn-secondary text-red-600 border-red-200 hover:bg-red-50 text-sm"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {/* Status Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="card flex items-center gap-3">
          <Gauge className="w-5 h-5 text-brand-600" />
          <div className="flex-1">
            <p className="text-lg font-bold">{vehicle.current_mileage.toLocaleString()}</p>
            <p className="text-xs text-gray-500">Current Miles</p>
          </div>
          {!editingMileage ? (
            <button onClick={() => { setEditingMileage(true); setNewMileage(vehicle.current_mileage.toString()); }}
              className="p-1 hover:bg-gray-100 rounded">
              <Edit3 className="w-4 h-4 text-gray-400" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <input
                type="number"
                className="w-24 input-field text-sm py-1"
                value={newMileage}
                onChange={e => setNewMileage(e.target.value)}
                autoFocus
              />
              <button onClick={handleMileageUpdate} className="p-1 hover:bg-green-100 rounded text-green-600">
                <Save className="w-4 h-4" />
              </button>
              <button onClick={() => setEditingMileage(false)} className="p-1 hover:bg-gray-100 rounded text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
        <div className="card flex items-center gap-3">
          <AlertTriangle className={`w-5 h-5 ${overdueItems.length > 0 ? 'text-red-500' : 'text-gray-300'}`} />
          <div>
            <p className="text-lg font-bold">{overdueItems.length}</p>
            <p className="text-xs text-gray-500">Overdue</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <Clock className={`w-5 h-5 ${upcomingItems.length > 0 ? 'text-yellow-500' : 'text-gray-300'}`} />
          <div>
            <p className="text-lg font-bold">{upcomingItems.length}</p>
            <p className="text-xs text-gray-500">Upcoming</p>
          </div>
        </div>
        <div className="card flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-green-500" />
          <div>
            <p className="text-lg font-bold">{okItems.length}</p>
            <p className="text-xs text-gray-500">On Track</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        {[
          { key: 'schedule' as const, label: 'Maintenance Schedule', icon: ListChecks },
          { key: 'history' as const, label: 'Service History', icon: History },
          { key: 'mileage' as const, label: 'Mileage Log', icon: Gauge },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
              tab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
            onClick={() => setTab(key)}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Schedule Tab */}
      {tab === 'schedule' && (
        <div className="space-y-4">
          {schedule.length === 0 ? (
            <div className="card text-center py-8 text-gray-500">
              No maintenance schedule generated. Contact admin to add schedule rules.
            </div>
          ) : (
            <>
              {/* Visual Maintenance Map Grid */}
              <MaintenanceMap
                schedule={schedule}
                currentMileage={vehicle.current_mileage}
                vehicleLabel={`${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                onServiceClick={(item) => {
                  setSelectedSchedule(item);
                  setServiceMileage(vehicle.current_mileage.toString());
                  setShowCompleteService(true);
                }}
              />

              {/* Detailed List */}
              <div className="space-y-2">
                {schedule.map((s: any) => (
                  <div key={s.id} className="card flex items-center gap-4">
                    <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                      s.status === 'overdue' ? 'bg-red-500' :
                      s.status === 'upcoming' ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{s.service_name}</p>
                      <p className="text-sm text-gray-500">
                        {s.category && <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded mr-2">{s.category}</span>}
                        {s.mileage_interval && `Every ${s.mileage_interval.toLocaleString()} miles`}
                        {s.mileage_interval && s.month_interval && ' or '}
                        {s.month_interval && `${s.month_interval} months`}
                        {s.is_combined ? ' (whichever first)' : ''}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {s.next_due_mileage && `Next due: ${s.next_due_mileage.toLocaleString()} miles`}
                        {s.next_due_mileage && s.next_due_date && ' • '}
                        {s.next_due_date && `Date: ${s.next_due_date}`}
                      </p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${
                      s.status === 'overdue' ? 'status-overdue' :
                      s.status === 'upcoming' ? 'status-upcoming' :
                      'status-ok'
                    }`}>
                      {s.status === 'overdue' ? 'Overdue' : s.status === 'upcoming' ? 'Upcoming' : 'OK'}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedSchedule(s);
                        setServiceMileage(vehicle.current_mileage.toString());
                        setShowCompleteService(true);
                      }}
                      className="btn-secondary text-sm py-1.5 px-3 whitespace-nowrap"
                    >
                      <Wrench className="w-3.5 h-3.5 mr-1 inline" />
                      Done
                    </button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* History Tab */}
      {tab === 'history' && (
        <div className="space-y-2">
          {serviceHistory.length === 0 ? (
            <div className="card text-center py-8 text-gray-500">
              <History className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              No services recorded yet. Complete a service from the Schedule tab.
            </div>
          ) : (
            serviceHistory.map((h: any) => (
              <div key={h.id} className="card flex items-center gap-4">
                <div className="p-2 bg-green-50 rounded-lg">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900">{h.service_name}</p>
                  <p className="text-sm text-gray-500">
                    {h.completed_date} • {h.mileage_at_service.toLocaleString()} miles
                    {h.shop_name && ` • ${h.shop_name}`}
                  </p>
                  {h.notes && <p className="text-xs text-gray-400 mt-0.5">{h.notes}</p>}
                </div>
                {h.cost && (
                  <span className="text-sm font-medium text-gray-700">${h.cost.toFixed(2)}</span>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Mileage Tab */}
      {tab === 'mileage' && (
        <div className="space-y-2">
          {mileageHistory.length === 0 ? (
            <div className="card text-center py-8 text-gray-500">No mileage entries recorded.</div>
          ) : (
            mileageHistory.map((m: any) => (
              <div key={m.id} className="card flex items-center gap-4">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <Gauge className="w-5 h-5 text-blue-500" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-gray-900">{m.mileage.toLocaleString()} miles</p>
                  <p className="text-sm text-gray-500">{m.recorded_at}</p>
                  {m.notes && <p className="text-xs text-gray-400">{m.notes}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Complete Service Modal */}
      {showCompleteService && selectedSchedule && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Complete Service</h2>
              <button onClick={() => setShowCompleteService(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">
              Recording <strong>{selectedSchedule.service_name}</strong> for{' '}
              {vehicle.year} {vehicle.make} {vehicle.model}
            </p>

            <form onSubmit={handleCompleteService} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date Completed</label>
                <input
                  type="date"
                  className="input-field"
                  value={serviceDate}
                  onChange={e => setServiceDate(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mileage at Service</label>
                <input
                  type="number"
                  className="input-field"
                  value={serviceMileage}
                  onChange={e => setServiceMileage(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cost ($)</label>
                <input
                  type="number"
                  step="0.01"
                  className="input-field"
                  value={serviceCost}
                  onChange={e => setServiceCost(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Shop/Location</label>
                <input
                  type="text"
                  className="input-field"
                  value={serviceShop}
                  onChange={e => setServiceShop(e.target.value)}
                  placeholder="Optional"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  className="input-field"
                  rows={2}
                  value={serviceNotes}
                  onChange={e => setServiceNotes(e.target.value)}
                  placeholder="Optional notes..."
                />
              </div>
              <div className="flex gap-3">
                <button type="submit" className="btn-primary flex-1">Mark Complete</button>
                <button type="button" className="btn-secondary" onClick={() => setShowCompleteService(false)}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Delete Vehicle?</h2>
            <p className="text-sm text-gray-600 mb-6">
              This will permanently delete {vehicle.year} {vehicle.make} {vehicle.model} and all its service history.
            </p>
            <div className="flex gap-3">
              <button onClick={handleDeleteVehicle} className="btn-danger flex-1">Delete</button>
              <button onClick={() => setConfirmDelete(false)} className="btn-secondary flex-1">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
