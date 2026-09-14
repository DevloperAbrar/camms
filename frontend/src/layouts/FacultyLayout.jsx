import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import { LayoutDashboard, ClipboardCheck, FileEdit, BookOpen, BarChart2, FileText } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { logoutSchool } from '../api/auth.api';
import useAuthStore from '../store/auth.store';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

const navItems = [
  { to: '/faculty/dashboard',  icon: LayoutDashboard, label: 'Dashboard'  },
  { to: '/faculty/attendance', icon: ClipboardCheck,  label: 'Attendance' },
  { to: '/faculty/marks',      icon: FileEdit,        label: 'Marks'      },
  { to: '/faculty/analytics',  icon: BarChart2,       label: 'Analytics'  },
  { to: '/faculty/reports',    icon: FileText,        label: 'Reports'    },
];

export default function FacultyLayout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const user      = useAuthStore((s) => s.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const logout = useMutation({
    mutationFn: logoutSchool,
    onSuccess: () => { clearAuth(); navigate('/login'); },
  });

  const pageTitle = navItems.find((n) => location.pathname.startsWith(n.to))?.label || 'Faculty Portal';

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      <Sidebar
        portalLabel="Faculty Portal"
        brandIcon={BookOpen}
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