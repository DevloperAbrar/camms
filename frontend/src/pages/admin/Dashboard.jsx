import { useQuery } from '@tanstack/react-query';
import { CalendarDays, BookOpen, UserCheck, Users, ClipboardList, BarChart3, GraduationCap } from 'lucide-react';
import { getSessions, getClasses, getFaculty, getStudents } from '../../api/schooladmin.api';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';

function StatCard({ label, value, icon: Icon, color, sub }) {
  const colors = {
    orange: { bg: 'bg-orange-50', icon: 'text-[#f97316]', val: 'text-[#f97316]' },
    navy:   { bg: 'bg-[#f0f4ff]', icon: 'text-[#1e293b]', val: 'text-[#1e293b]' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-600', val: 'text-green-700' },
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',  val: 'text-blue-700' },
  };
  const c = colors[color] || colors.navy;
  return (
    <Card className="flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
        <Icon size={22} className={c.icon} />
      </div>
      <div>
        <p className="text-xs font-medium text-[#64748b] uppercase tracking-wide">{label}</p>
        <p className={`text-2xl font-extrabold mt-0.5 ${c.val}`}>{value}</p>
        {sub && <p className="text-xs text-[#94a3b8] mt-0.5">{sub}</p>}
      </div>
    </Card>
  );
}

export default function AdminDashboard() {
  const { data: sessions, isLoading: loadingSessions } = useQuery({
    queryKey: ['ad-sessions'],
    queryFn: () => getSessions().then((r) => r.data.data),
  });

  const activeSession = (sessions || []).find((s) => s.isActive);

  const { data: classes, isLoading: loadingClasses } = useQuery({
    queryKey: ['ad-classes'],
    queryFn: () => getClasses().then((r) => r.data.data),
  });

  const { data: faculty, isLoading: loadingFaculty } = useQuery({
    queryKey: ['ad-faculty'],
    queryFn: () => getFaculty().then((r) => r.data.data),
  });

  const { data: studentsData, isLoading: loadingStudents } = useQuery({
    queryKey: ['ad-students-count', activeSession?.id],
    queryFn: () => getStudents({ sessionId: activeSession?.id, limit: 1 }).then((r) => r.data.data),
    enabled: !!activeSession?.id,
  });

  const isLoading = loadingSessions || loadingClasses || loadingFaculty;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Spinner size="lg" />
      </div>
    );
  }

  const classesThisSession = (classes || []).filter((c) => c.sessionId === activeSession?.id);
  const totalSections = classesThisSession.reduce((sum, c) => sum + (c.sections?.length || 0), 0);

  const quickLinks = [
    { to: '/admin/sessions',  label: 'Academic Sessions',  sub: 'Create sessions, promote year to year',   icon: CalendarDays },
    { to: '/admin/classes',   label: 'Classes & Sections', sub: 'Manage classes, sections and subjects',   icon: BookOpen },
    { to: '/admin/faculty',   label: 'Faculty',            sub: 'Add faculty, assign class and subject',   icon: UserCheck },
    { to: '/admin/students',  label: 'Students',           sub: 'Enroll students, bulk CSV upload',        icon: Users },
    { to: '/admin/exams',     label: 'Exams & Marks',      sub: 'Configure exam types and marks',          icon: ClipboardList },
    { to: '/admin/analytics', label: 'Analytics',          sub: 'Attendance and marks insights',           icon: BarChart3 },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">School Overview</h1>
        <p className="text-sm text-[#64748b] mt-1">
          {activeSession ? `Active Session: ${activeSession.label}` : 'No active session yet, create one to get started'}
        </p>
      </div>

      {!activeSession && (
        <Card className="border-amber-200 bg-amber-50">
          <div className="flex items-center gap-3">
            <GraduationCap size={20} className="text-amber-600" />
            <p className="text-sm text-amber-800">
              You don't have an active academic session yet. Go to <span className="font-semibold">Sessions</span> to create and activate one before adding classes or students.
            </p>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Academic Sessions"       value={(sessions || []).length}               icon={CalendarDays} color="navy" />
        <StatCard label="Classes (This Session)"  value={classesThisSession.length}              icon={BookOpen}     color="orange" sub={`${totalSections} sections`} />
        <StatCard label="Faculty"                 value={(faculty || []).length}                 icon={UserCheck}    color="blue" />
        <StatCard label="Students (This Session)" value={loadingStudents ? '...' : (studentsData?.total ?? 0)} icon={Users} color="green" />
      </div>

      <div>
        <h2 className="text-sm font-semibold text-[#64748b] uppercase tracking-wide mb-3">Quick Links</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {quickLinks.map(({ to, label, sub, icon: Icon }) => (
            <a href={to} key={to} className="block">
              <Card className="hover:border-[#f97316] hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#1e293b] group-hover:text-[#f97316] transition-colors">{label}</p>
                    <p className="text-sm text-[#64748b] mt-0.5">{sub}</p>
                  </div>
                  <Icon size={22} className="text-[#cbd5e1] group-hover:text-[#f97316] transition-colors shrink-0" />
                </div>
              </Card>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}