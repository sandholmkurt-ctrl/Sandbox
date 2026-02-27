import { useEffect, useState } from 'react';
import api from '../api';
import { Bell, Check, CheckCheck, Trash2, AlertTriangle, Clock, Info } from 'lucide-react';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');

  const load = () => {
    api.get<any[]>(`/notifications${filter === 'unread' ? '?unreadOnly=true' : ''}`)
      .then(setNotifications)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]);

  const markRead = async (id: string) => {
    await api.put(`/notifications/${id}/read`);
    load();
  };

  const markAllRead = async () => {
    await api.put('/notifications/read-all');
    load();
  };

  const deleteNotification = async (id: string) => {
    await api.delete(`/notifications/${id}`);
    load();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-600"></div></div>;
  }

  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-gray-500 mt-1">{unreadCount} unread notification{unreadCount !== 1 ? 's' : ''}</p>
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="btn-secondary text-sm flex items-center gap-2">
            <CheckCheck className="w-4 h-4" />
            Mark All Read
          </button>
        )}
      </div>

      <div className="flex gap-2">
        <button
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === 'all' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          onClick={() => setFilter('all')}
        >All</button>
        <button
          className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === 'unread' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'}`}
          onClick={() => setFilter('unread')}
        >Unread</button>
      </div>

      {notifications.length === 0 ? (
        <div className="card text-center py-12">
          <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n: any) => (
            <div key={n.id} className={`card flex items-start gap-4 ${!n.is_read ? 'border-l-4 border-l-brand-500' : ''}`}>
              <div className={`p-2 rounded-lg flex-shrink-0 ${
                n.type === 'overdue' ? 'bg-red-100' :
                n.type === 'upcoming' ? 'bg-yellow-100' :
                'bg-blue-100'
              }`}>
                {n.type === 'overdue' ? <AlertTriangle className="w-5 h-5 text-red-600" /> :
                 n.type === 'upcoming' ? <Clock className="w-5 h-5 text-yellow-600" /> :
                 <Info className="w-5 h-5 text-blue-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-medium ${!n.is_read ? 'text-gray-900' : 'text-gray-600'}`}>{n.title}</p>
                <p className="text-sm text-gray-500 mt-0.5">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                {!n.is_read && (
                  <button onClick={() => markRead(n.id)} className="p-1.5 hover:bg-gray-100 rounded" title="Mark as read">
                    <Check className="w-4 h-4 text-gray-400" />
                  </button>
                )}
                <button onClick={() => deleteNotification(n.id)} className="p-1.5 hover:bg-red-50 rounded" title="Delete">
                  <Trash2 className="w-4 h-4 text-gray-400 hover:text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
