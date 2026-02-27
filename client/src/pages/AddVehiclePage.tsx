import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import { Search, Car } from 'lucide-react';

export default function AddVehiclePage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<'vin' | 'manual'>('vin');
  const [vin, setVin] = useState('');
  const [vinLoading, setVinLoading] = useState(false);
  const [vinError, setVinError] = useState('');

  const [year, setYear] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [engine, setEngine] = useState('');
  const [driveType, setDriveType] = useState('');
  const [trimLevel, setTrimLevel] = useState('');
  const [currentMileage, setCurrentMileage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleVinLookup = async () => {
    if (vin.length !== 17) {
      setVinError('VIN must be exactly 17 characters');
      return;
    }
    setVinError('');
    setVinLoading(true);
    try {
      const result = await api.get<any>(`/vin/decode/${vin}`);
      setYear(result.year?.toString() || '');
      setMake(result.make || '');
      setModel(result.model || '');
      setEngine(result.engine || '');
      setDriveType(result.driveType || '');
      setTrimLevel(result.trimLevel || '');
      setMode('manual'); // Switch to show all fields
    } catch (err: any) {
      setVinError(err.message || 'Could not decode VIN. Please enter details manually.');
    } finally {
      setVinLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!year || !make || !model) {
      setError('Year, Make, and Model are required');
      return;
    }

    setSaving(true);
    try {
      const vehicle = await api.post<any>('/vehicles', {
        vin: vin || undefined,
        year: parseInt(year),
        make,
        model,
        engine: engine || undefined,
        driveType: driveType || undefined,
        trimLevel: trimLevel || undefined,
        currentMileage: parseInt(currentMileage) || 0,
      });
      navigate(`/vehicles/${vehicle.id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to add vehicle');
    } finally {
      setSaving(false);
    }
  };

  const currentYear = new Date().getFullYear();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Add Vehicle</h1>
        <p className="text-gray-500 mt-1">Enter your vehicle information to generate a maintenance schedule</p>
      </div>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          type="button"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'vin' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          onClick={() => setMode('vin')}
        >
          Lookup by VIN
        </button>
        <button
          type="button"
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            mode === 'manual' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
          onClick={() => setMode('manual')}
        >
          Manual Entry
        </button>
      </div>

      {/* VIN Lookup */}
      {mode === 'vin' && (
        <div className="card">
          <h2 className="text-lg font-semibold mb-4">VIN Lookup</h2>
          <p className="text-sm text-gray-500 mb-4">
            Enter your 17-character Vehicle Identification Number to auto-fill vehicle details.
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              className="input-field font-mono uppercase"
              value={vin}
              onChange={e => setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17))}
              placeholder="1HGBH41JXMN109186"
              maxLength={17}
            />
            <button
              type="button"
              className="btn-primary flex items-center gap-2 whitespace-nowrap"
              onClick={handleVinLookup}
              disabled={vinLoading}
            >
              <Search className="w-4 h-4" />
              {vinLoading ? 'Looking up...' : 'Decode'}
            </button>
          </div>
          {vinError && <p className="text-red-600 text-sm mt-2">{vinError}</p>}
          <p className="text-xs text-gray-400 mt-2">
            Uses NHTSA Vehicle API for VIN decoding
          </p>
        </div>
      )}

      {/* Manual Entry Form */}
      {(mode === 'manual' || (mode === 'vin' && year)) && (
        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <Car className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-semibold">Vehicle Details</h2>
          </div>

          {error && (
            <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm">{error}</div>
          )}

          {vin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">VIN</label>
              <input type="text" className="input-field font-mono bg-gray-50" value={vin} readOnly />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year *</label>
              <input
                type="number"
                className="input-field"
                value={year}
                onChange={e => setYear(e.target.value)}
                min={1900}
                max={currentYear + 1}
                placeholder="2024"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Make *</label>
              <input
                type="text"
                className="input-field"
                value={make}
                onChange={e => setMake(e.target.value)}
                placeholder="Toyota"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Model *</label>
              <input
                type="text"
                className="input-field"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="Tacoma"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Engine</label>
              <input
                type="text"
                className="input-field"
                value={engine}
                onChange={e => setEngine(e.target.value)}
                placeholder="3.5L V6"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Drive Type</label>
              <select
                className="input-field"
                value={driveType}
                onChange={e => setDriveType(e.target.value)}
              >
                <option value="">Select...</option>
                <option value="FWD">FWD</option>
                <option value="RWD">RWD</option>
                <option value="4WD">4WD</option>
                <option value="AWD">AWD</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Trim</label>
              <input
                type="text"
                className="input-field"
                value={trimLevel}
                onChange={e => setTrimLevel(e.target.value)}
                placeholder="TRD Off-Road"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Current Mileage</label>
            <input
              type="number"
              className="input-field"
              value={currentMileage}
              onChange={e => setCurrentMileage(e.target.value)}
              min={0}
              placeholder="35000"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="submit" className="btn-primary flex-1" disabled={saving}>
              {saving ? 'Adding Vehicle...' : 'Add Vehicle'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => navigate('/vehicles')}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
