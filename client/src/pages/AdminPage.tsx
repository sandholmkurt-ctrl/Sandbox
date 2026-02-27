import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Navigate } from 'react-router-dom';
import api from '../api';
import { Shield, Users, Car, Wrench, AlertTriangle, Clock, Plus, Trash2, Save } from 'lucide-react';

export default function AdminPage() {
  const { user } = useAuth();
  const [stats, setStats] = useState<any>(null);
  const [definitions, setDefinitions] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'services' | 'rules'>('overview');

  // New service form
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceDesc, setNewServiceDesc] = useState('');
  const [newServiceCategory, setNewServiceCategory] = useState('');

  // New rule form
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [ruleServiceId, setRuleServiceId] = useState('');
  const [ruleMake, setRuleMake] = useState('');
  const [ruleModel, setRuleModel] = useState('');
  const [ruleMileageInterval, setRuleMileageInterval] = useState('');
  const [ruleMonthInterval, setRuleMonthInterval] = useState('');
  const [rulePriority, setRulePriority] = useState('0');
  const [ruleDriveType, setRuleDriveType] = useState('');

  if (!user?.isAdmin) return <Navigate to="/dashboard" replace />;

  const load = async () => {
    try {
      const [s, d, r] = await Promise.all([
        api.get<any>('/admin/stats'),
        api.get<any[]>('/admin/service-definitions'),
        api.get<any[]>('/admin/schedule-rules'),
      ]);
      setStats(s);
      setDefinitions(d);
      setRules(r);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const addServiceDefinition = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/admin/service-definitions', {
      name: newServiceName,
      description: newServiceDesc || undefined,
      category: newServiceCategory || undefined,
    });
    setNewServiceName('');
    setNewServiceDesc('');
    setNewServiceCategory('');
    load();
  };

  const deleteDefinition = async (id: string) => {
    await api.delete(`/admin/service-definitions/${id}`);
    load();
  };

  const addRule = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/admin/schedule-rules', {
      serviceDefinitionId: ruleServiceId,
      make: ruleMake || undefined,
      model: ruleModel || undefined,
      driveType: ruleDriveType || undefined,
      mileageInterval: parseInt(ruleMileageInterval) || undefined,
      monthInterval: parseInt(ruleMonthInterval) || undefined,
      priority: parseInt(rulePriority) || 0,
    });
    setShowRuleForm(false);
    setRuleServiceId('');
    setRuleMake('');
    setRuleModel('');
    setRuleMileageInterval('');
    setRuleMonthInterval('');
    setRuleDriveType('');
    load();
  };

  const deleteRule = async (id: string) => {
    await api.delete(`/admin/schedule-rules/${id}`);
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div></div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Shield className="w-6 h-6 text-brand-600" />
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-500">Manage service definitions, rules, and monitor system health</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        {['overview', 'services', 'rules'].map(t => (
          <button
            key={t}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize ${
              tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}
            onClick={() => setTab(t as any)}
          >{t}</button>
        ))}
      </div>

      {/* Overview */}
      {tab === 'overview' && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="card flex items-center gap-3">
            <Users className="w-5 h-5 text-blue-500" />
            <div><p className="text-xl font-bold">{stats.users}</p><p className="text-xs text-gray-500">Users</p></div>
          </div>
          <div className="card flex items-center gap-3">
            <Car className="w-5 h-5 text-indigo-500" />
            <div><p className="text-xl font-bold">{stats.vehicles}</p><p className="text-xs text-gray-500">Vehicles</p></div>
          </div>
          <div className="card flex items-center gap-3">
            <Wrench className="w-5 h-5 text-green-500" />
            <div><p className="text-xl font-bold">{stats.servicesCompleted}</p><p className="text-xs text-gray-500">Services Done</p></div>
          </div>
          <div className="card flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <div><p className="text-xl font-bold">{stats.overdueServices}</p><p className="text-xs text-gray-500">Overdue</p></div>
          </div>
          <div className="card flex items-center gap-3">
            <Clock className="w-5 h-5 text-yellow-500" />
            <div><p className="text-xl font-bold">{stats.upcomingServices}</p><p className="text-xs text-gray-500">Upcoming</p></div>
          </div>
        </div>
      )}

      {/* Services Tab */}
      {tab === 'services' && (
        <div className="space-y-4">
          <form onSubmit={addServiceDefinition} className="card flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Service Name</label>
              <input className="input-field text-sm" value={newServiceName} onChange={e => setNewServiceName(e.target.value)} required placeholder="e.g. Oil Change" />
            </div>
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
              <input className="input-field text-sm" value={newServiceDesc} onChange={e => setNewServiceDesc(e.target.value)} placeholder="Optional" />
            </div>
            <div className="w-40">
              <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
              <input className="input-field text-sm" value={newServiceCategory} onChange={e => setNewServiceCategory(e.target.value)} placeholder="e.g. Engine" />
            </div>
            <button type="submit" className="btn-primary text-sm whitespace-nowrap"><Plus className="w-4 h-4 mr-1 inline" />Add</button>
          </form>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Description</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {definitions.map((d: any) => (
                  <tr key={d.id}>
                    <td className="py-2 font-medium">{d.name}</td>
                    <td className="py-2 text-gray-500">{d.description || '—'}</td>
                    <td className="py-2"><span className="bg-gray-100 px-2 py-0.5 rounded text-xs">{d.category || 'General'}</span></td>
                    <td className="py-2">{d.is_active ? <span className="text-green-600 text-xs">Active</span> : <span className="text-red-600 text-xs">Inactive</span>}</td>
                    <td className="py-2">
                      <button onClick={() => deleteDefinition(d.id)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{rules.length} schedule rules configured</p>
            <button onClick={() => setShowRuleForm(!showRuleForm)} className="btn-primary text-sm flex items-center gap-1">
              <Plus className="w-4 h-4" />Add Rule
            </button>
          </div>

          {showRuleForm && (
            <form onSubmit={addRule} className="card space-y-3">
              <h3 className="font-semibold">New Schedule Rule</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Service *</label>
                  <select className="input-field text-sm" value={ruleServiceId} onChange={e => setRuleServiceId(e.target.value)} required>
                    <option value="">Select...</option>
                    {definitions.filter(d => d.is_active).map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Make</label>
                  <input className="input-field text-sm" value={ruleMake} onChange={e => setRuleMake(e.target.value)} placeholder="All makes" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Model</label>
                  <input className="input-field text-sm" value={ruleModel} onChange={e => setRuleModel(e.target.value)} placeholder="All models" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Mileage Interval</label>
                  <input type="number" className="input-field text-sm" value={ruleMileageInterval} onChange={e => setRuleMileageInterval(e.target.value)} placeholder="e.g. 5000" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Month Interval</label>
                  <input type="number" className="input-field text-sm" value={ruleMonthInterval} onChange={e => setRuleMonthInterval(e.target.value)} placeholder="e.g. 6" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Drive Type</label>
                  <select className="input-field text-sm" value={ruleDriveType} onChange={e => setRuleDriveType(e.target.value)}>
                    <option value="">Any</option>
                    <option value="FWD">FWD</option>
                    <option value="RWD">RWD</option>
                    <option value="4WD">4WD</option>
                    <option value="AWD">AWD</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                  <input type="number" className="input-field text-sm" value={rulePriority} onChange={e => setRulePriority(e.target.value)} />
                </div>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary text-sm">Save Rule</button>
                <button type="button" className="btn-secondary text-sm" onClick={() => setShowRuleForm(false)}>Cancel</button>
              </div>
            </form>
          )}

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="pb-2 font-medium">Service</th>
                  <th className="pb-2 font-medium">Make / Model</th>
                  <th className="pb-2 font-medium">Drive</th>
                  <th className="pb-2 font-medium">Mileage</th>
                  <th className="pb-2 font-medium">Months</th>
                  <th className="pb-2 font-medium">Priority</th>
                  <th className="pb-2 font-medium w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rules.map((r: any) => (
                  <tr key={r.id}>
                    <td className="py-2 font-medium">{r.service_name}</td>
                    <td className="py-2 text-gray-500">{r.make || '*'} / {r.model || '*'}</td>
                    <td className="py-2 text-gray-500">{r.drive_type || 'Any'}</td>
                    <td className="py-2">{r.mileage_interval?.toLocaleString() || '—'}</td>
                    <td className="py-2">{r.month_interval || '—'}</td>
                    <td className="py-2">{r.priority}</td>
                    <td className="py-2">
                      <button onClick={() => deleteRule(r.id)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
