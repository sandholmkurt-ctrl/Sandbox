import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import api from '../api';
import { User, Save } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [reminderLeadMiles, setReminderLeadMiles] = useState('500');
  const [reminderLeadDays, setReminderLeadDays] = useState('30');

  useEffect(() => {
    api.get<any>('/auth/me')
      .then(p => {
        setProfile(p);
        setFirstName(p.firstName || '');
        setLastName(p.lastName || '');
        setEmailNotifications(p.emailNotifications);
        setReminderLeadMiles(p.reminderLeadMiles?.toString() || '500');
        setReminderLeadDays(p.reminderLeadDays?.toString() || '30');
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccess('');
    try {
      await api.put('/auth/me', {
        firstName,
        lastName,
        emailNotifications,
        reminderLeadMiles: parseInt(reminderLeadMiles) || 500,
        reminderLeadDays: parseInt(reminderLeadDays) || 30,
      });
      setSuccess('Profile updated successfully');
    } catch (err: any) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div></div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Profile Settings</h1>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Personal Info */}
        <div className="card space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <User className="w-5 h-5 text-brand-600" />
            <h2 className="text-lg font-semibold">Personal Information</h2>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input type="email" className="input-field bg-gray-50" value={profile?.email || ''} readOnly />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input type="text" className="input-field" value={firstName} onChange={e => setFirstName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input type="text" className="input-field" value={lastName} onChange={e => setLastName(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Notification Settings */}
        <div className="card space-y-4">
          <h2 className="text-lg font-semibold">Reminder & Notification Settings</h2>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              className="w-4 h-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
              checked={emailNotifications}
              onChange={e => setEmailNotifications(e.target.checked)}
            />
            <span className="text-sm text-gray-700">Email notifications for upcoming and overdue services</span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mileage Lead Warning
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="input-field"
                  value={reminderLeadMiles}
                  onChange={e => setReminderLeadMiles(e.target.value)}
                  min={0}
                  max={5000}
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">miles before due</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Time Lead Warning
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  className="input-field"
                  value={reminderLeadDays}
                  onChange={e => setReminderLeadDays(e.target.value)}
                  min={0}
                  max={365}
                />
                <span className="text-sm text-gray-500 whitespace-nowrap">days before due</span>
              </div>
            </div>
          </div>
        </div>

        {success && (
          <div className="bg-green-50 text-green-700 px-4 py-3 rounded-lg text-sm">{success}</div>
        )}

        <button type="submit" className="btn-primary flex items-center gap-2" disabled={saving}>
          <Save className="w-4 h-4" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>

      {/* Account Info */}
      <div className="card">
        <h2 className="text-lg font-semibold mb-2">Account</h2>
        <p className="text-sm text-gray-500">
          Member since {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString() : 'N/A'}
        </p>
      </div>
    </div>
  );
}
