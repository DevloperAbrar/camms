import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { LayoutDashboard, Wallet, Receipt, AlertCircle, BarChart3, IndianRupee } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { logoutSchool } from '../api/auth.api';
import useAuthStore from '../store/auth.store';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

const navItems = [
  { to: '/fees/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/fees/collect',   icon: Wallet,          label: 'Collect Fees' },
  { to: '/fees/receipts',  icon: Receipt,         label: 'Receipts' },
  { to: '/fees/dues',      icon: AlertCircle,     label: 'Due / Remaining' },
  { to: '/fees/analytics', icon: BarChart3,       label: 'Analytics' },
];

export default function FeeLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const user = useAuthStore((s) => s.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const logout = useMutation({
    mutationFn: logoutSchool,
    onSuccess: () => { clearAuth(); navigate('/login'); },
  });

  const pageTitle = navItems.find((n) => location.pathname.startsWith(n.to))?.label || 'Fee Counter';

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      <Sidebar
        portalLabel="Fee Counter"
        brandIcon={IndianRupee}
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