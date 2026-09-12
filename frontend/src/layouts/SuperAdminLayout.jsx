import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, School, CreditCard, LogOut, ShieldCheck } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { logoutSuperadmin } from '../api/auth.api';
import useAuthStore from '../store/auth.store';

const navItems = [
  { to: '/superadmin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/superadmin/schools',   icon: School,          label: 'Schools'   },
  { to: '/superadmin/plans',     icon: CreditCard,      label: 'Plans'     },
];

export default function SuperAdminLayout() {
  const navigate  = useNavigate();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const user      = useAuthStore((s) => s.user);

  const logout = useMutation({
    mutationFn: logoutSuperadmin,
    onSuccess: () => { clearAuth(); navigate('/superadmin/login'); },
  });

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1e293b] flex flex-col shrink-0">
        {/* Logo */}
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#f97316] rounded-lg flex items-center justify-center">
              <ShieldCheck size={20} className="text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-sm leading-none">CampusSafar</p>
              <p className="text-[#94a3b8] text-xs mt-0.5">Super Admin</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to} to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${isActive
                  ? 'bg-[#f97316] text-white'
                  : 'text-[#94a3b8] hover:bg-white/10 hover:text-white'}`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User + Logout */}
        <div className="px-3 py-4 border-t border-white/10">
          <div className="px-3 py-2 mb-2">
            <p className="text-white text-sm font-medium truncate">{user?.name || 'Super Admin'}</p>
            <p className="text-[#64748b] text-xs truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => logout.mutate()}
            className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-[#94a3b8] hover:bg-red-500/10 hover:text-red-400 transition-all"
          >
            <LogOut size={18} />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}