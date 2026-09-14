import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useState } from 'react';
import {
  LayoutDashboard, CalendarDays, BookOpen, Users, UserCheck,
  ClipboardList, BarChart3, FileDown, GraduationCap, Lock,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { logoutSchool } from '../api/auth.api';
import useAuthStore from '../store/auth.store';
import Sidebar from '../components/Sidebar';
import Topbar from '../components/Topbar';

const navItems = [
  { to: '/admin/dashboard',   icon: LayoutDashboard, label: 'Dashboard'   },
  { to: '/admin/sessions',    icon: CalendarDays,    label: 'Sessions'    },
  { to: '/admin/classes',     icon: BookOpen,        label: 'Classes'     },
  { to: '/admin/faculty',     icon: UserCheck,       label: 'Faculty'     },
  { to: '/admin/students',    icon: Users,           label: 'Students'    },
  { to: '/admin/exams',       icon: ClipboardList,   label: 'Exams'       },
  { to: '/admin/marks-lock',  icon: Lock,            label: 'Marks Lock'  },
  { to: '/admin/analytics',   icon: BarChart3,       label: 'Analytics'   },
  { to: '/admin/reports',     icon: FileDown,        label: 'Reports'     },
];

export default function SchoolAdminLayout() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const user      = useAuthStore((s) => s.user);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const logout = useMutation({
    mutationFn: logoutSchool,
    onSuccess: () => { clearAuth(); navigate('/login'); },
  });

  const pageTitle = navItems.find((n) => location.pathname.startsWith(n.to))?.label || 'School Admin';

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      <Sidebar
        portalLabel="School Admin"
        brandIcon={GraduationCap}
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