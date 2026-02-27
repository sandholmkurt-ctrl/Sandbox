import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useEffect, useState } from 'react';
import api from '../api';
import {
  LayoutDashboard, Car, Bell, User, Shield, LogOut, Menu, X, Wrench,
} from 'lucide-react';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [unread, setUnread] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    api.get<{ count: number }>('/notifications/count')
      .then(r => setUnread(r.count))
      .catch(() => {});
    const interval = setInterval(() => {
      api.get<{ count: number }>('/notifications/count')
        .then(r => setUnread(r.count))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/vehicles', label: 'Vehicles', icon: Car },
    { to: '/notifications', label: 'Notifications', icon: Bell, badge: unread },
    { to: '/profile', label: 'Profile', icon: User },
  ];

  if (user?.isAdmin) {
    navItems.push({ to: '/admin', label: 'Admin', icon: Shield, badge: 0 });
  }

  return (
    <div className="min-h-screen flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-gray-200 transform transition-transform lg:translate-x-0 lg:relative lg:z-auto ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-200">
          <Wrench className="w-8 h-8 text-brand-600" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">VehicleMaint</h1>
            <p className="text-xs text-gray-500">Service Tracker</p>
          </div>
        </div>

        <nav className="p-4 space-y-1">
          {navItems.map(({ to, label, icon: Icon, badge }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
              {!!badge && badge > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs rounded-full px-2 py-0.5">
                  {badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center gap-3 mb-3 px-3">
            <div className="w-8 h-8 bg-brand-100 rounded-full flex items-center justify-center text-brand-700 text-sm font-bold">
              {user?.firstName?.[0] || user?.email[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : user?.email}
              </p>
              <p className="text-xs text-gray-500 truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button onClick={() => setSidebarOpen(true)} className="p-1">
            <Menu className="w-6 h-6 text-gray-600" />
          </button>
          <Wrench className="w-6 h-6 text-brand-600" />
          <h1 className="text-lg font-bold">VehicleMaint</h1>
        </header>

        <main className="flex-1 p-4 lg:p-8 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
