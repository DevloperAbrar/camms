import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { LayoutDashboard, School, CreditCard, ShieldCheck, HardDrive } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { logoutSuperadmin } from '../api/auth.api';
import useAuthStore from '../store/auth.store';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

const navItems = [
  { to: '/superadmin/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/superadmin/schools',   icon: School,          label: 'Schools'   },
  { to: '/superadmin/plans',     icon: CreditCard,      label: 'Plans'     },
  { to: '/superadmin/notes-access', icon: HardDrive,   label: 'Notes Access' },
];

export default function SuperAdminLayout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const user      = useAuthStore((s) => s.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const logout = useMutation({
    mutationFn: logoutSuperadmin,
    onSuccess: () => { clearAuth(); navigate('/superadmin/login'); },
  });

  const pageTitle = navItems.find((n) => location.pathname.startsWith(n.to))?.label || 'Super Admin';

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      <Sidebar
        portalLabel="Super Admin"
        brandIcon={ShieldCheck}
        navItems={navItems}
        user={user}
        onLogout={() => logout.mutate()}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar title={pageTitle} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 page-enter">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}