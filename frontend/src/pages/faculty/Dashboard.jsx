import { useQuery } from '@tanstack/react-query';
import { BookOpen, Bell, AlertCircle, ChevronRight, Calendar, Users } from 'lucide-react';
import { format } from 'date-fns';
import { getFacultyDashboard } from '../../api/faculty.api';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

function StatCard({ label, value, icon: Icon, color, sub }) {
  const colors = {
    orange: { bg: 'bg-orange-50', icon: 'text-[#f97316]', val: 'text-[#f97316]' },
    blue:   { bg: 'bg-blue-50',   icon: 'text-blue-600',  val: 'text-blue-700'  },
    red:    { bg: 'bg-red-50',    icon: 'text-red-600',   val: 'text-red-700'   },
    navy:   { bg: 'bg-slate-50',  icon: 'text-[#1e293b]', val: 'text-[#1e293b]' },
  };
  const c = colors[color] || colors.navy;
  return (
    <Card>
      <div className="flex items-start gap-4">
        <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
          <Icon size={22} className={c.icon} />
        </div>
        <div>
          <p className="text-xs font-medium text-[#64748b] uppercase tracking-wide">{label}</p>
          <p className={`text-2xl font-extrabold mt-0.5 ${c.val}`}>{value}</p>
          {sub && <p className="text-xs text-[#94a3b8] mt-0.5">{sub}</p>}
        </div>
      </div>
    </Card>
  );
}

export default function FacultyDashboard() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['faculty-dashboard'],
    queryFn: () => getFacultyDashboard().then((r) => r.data.data),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500 text-sm">Failed to load dashboard. Please refresh.</p>
      </div>
    );
  }

  const { activeSession, assignments = [], recentNotices = [], pendingCorrections = 0 } = data || {};

  // Unique classes from assignments
  const uniqueClasses = [...new Set(assignments.map((a) => a.class.name))];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Welcome back 👋</h1>
        {activeSession ? (
          <p className="text-sm text-[#64748b] mt-1">
            Active Session:{' '}
            <span className="font-semibold text-[#f97316]">{activeSession.label}</span>
          </p>
        ) : (
          <p className="text-sm text-amber-600 mt-1">No active session found. Contact your school admin.</p>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="My Assignments"     value={assignments.length}   icon={BookOpen}     color="orange" sub={`${uniqueClasses.length} class(es)`} />
        <StatCard label="Recent Notices"     value={recentNotices.length} icon={Bell}         color="blue"   />
        <StatCard label="Pending Corrections" value={pendingCorrections}  icon={AlertCircle}  color="red"    sub="Awaiting approval" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Assignments */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#1e293b]">My Assignments</h2>
            <span className="text-xs text-[#94a3b8]">{assignments.length} total</span>
          </div>
          {assignments.length === 0 ? (
            <div className="text-center py-10">
              <Users size={32} className="text-[#e2e8f0] mx-auto mb-2" />
              <p className="text-sm text-[#94a3b8]">No assignments yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {assignments.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center justify-between p-3 bg-[#f8fafc] rounded-lg border border-[#e2e8f0] hover:border-[#f97316] transition-colors"
                >
                  <div>
                    <p className="text-sm font-semibold text-[#1e293b]">{a.subject.name}</p>
                    <p className="text-xs text-[#64748b] mt-0.5">{a.class.name} · {a.section.name}</p>
                  </div>
                  <Badge label="Active" variant="success" />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Notices */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-[#1e293b]">Recent Notices</h2>
            <Calendar size={16} className="text-[#94a3b8]" />
          </div>
          {recentNotices.length === 0 ? (
            <div className="text-center py-10">
              <Bell size={32} className="text-[#e2e8f0] mx-auto mb-2" />
              <p className="text-sm text-[#94a3b8]">No notices yet.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentNotices.map((n) => (
                <div key={n.id} className="flex gap-3">
                  <div className="w-1 rounded-full bg-[#f97316] shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#1e293b] truncate">{n.title}</p>
                    <p className="text-xs text-[#64748b] mt-0.5 line-clamp-2">{n.body}</p>
                    <p className="text-xs text-[#94a3b8] mt-1">
                      {format(new Date(n.createdAt), 'dd MMM yyyy')}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <h2 className="text-base font-bold text-[#1e293b] mb-3">Quick Actions</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <a
            href="/faculty/attendance"
            className="flex items-center justify-between p-4 bg-orange-50 border border-orange-100 rounded-xl hover:border-[#f97316] transition-colors group"
          >
            <div>
              <p className="font-semibold text-[#1e293b] group-hover:text-[#f97316] transition-colors">Mark Attendance</p>
              <p className="text-xs text-[#64748b] mt-0.5">Record today's student attendance</p>
            </div>
            <ChevronRight size={18} className="text-[#94a3b8] group-hover:text-[#f97316] transition-colors" />
          </a>
          <a
            href="/faculty/marks"
            className="flex items-center justify-between p-4 bg-blue-50 border border-blue-100 rounded-xl hover:border-blue-400 transition-colors group"
          >
            <div>
              <p className="font-semibold text-[#1e293b] group-hover:text-blue-600 transition-colors">Enter Marks</p>
              <p className="text-xs text-[#64748b] mt-0.5">Submit exam marks for students</p>
            </div>
            <ChevronRight size={18} className="text-[#94a3b8] group-hover:text-blue-600 transition-colors" />
          </a>
        </div>
      </Card>
    </div>
  );
}