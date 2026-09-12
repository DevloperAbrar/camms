import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, BookOpen, Bell, ChevronRight, School, Calendar } from 'lucide-react';
import { getMyChildren } from '../../api/parent.api';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

const statusVariant = { active: 'success', inactive: 'danger', transferred_out: 'warning', graduated: 'info' };

export default function ParentDashboard() {
  const [selectedChild, setSelectedChild] = useState(null);

  const { data: children = [], isLoading, isError } = useQuery({
    queryKey: ['my-children'],
    queryFn: () => getMyChildren().then((r) => r.data.data ?? []),
    onSuccess: (data) => {
      if (data.length > 0 && !selectedChild) setSelectedChild(data[0]);
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Spinner size="lg" /></div>;
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-red-500 text-sm">Failed to load data. Please refresh.</p>
      </div>
    );
  }

  if (children.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <Users size={40} className="text-[#e2e8f0]" />
        <p className="text-[#94a3b8] text-sm">No children linked to your account. Contact school admin.</p>
      </div>
    );
  }

  const child = selectedChild || children[0];
  const activeEnrollment = child?.enrollments?.[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Parent Dashboard</h1>
        <p className="text-sm text-[#64748b] mt-1">Monitor your child's academic progress.</p>
      </div>

      {/* Child Switcher */}
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedChild(c)}
              className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                (selectedChild?.id ?? children[0].id) === c.id
                  ? 'border-[#f97316] bg-orange-50 text-[#f97316]'
                  : 'border-[#e2e8f0] text-[#64748b] hover:border-[#f97316]'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Child Info Card */}
      {child && (
        <Card>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {child.photoUrl ? (
              <img src={child.photoUrl} alt={child.name} className="w-16 h-16 rounded-full object-cover border-2 border-[#f97316] shrink-0" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <span className="text-2xl font-bold text-[#f97316]">{child.name.charAt(0)}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-xl font-bold text-[#1e293b]">{child.name}</h2>
                <Badge label={child.status} variant={statusVariant[child.status] || 'default'} />
              </div>
              <p className="text-xs text-[#64748b] mt-1">Enrollment: {child.enrollmentNumber}</p>
              {child.school && (
                <p className="text-xs text-[#94a3b8] flex items-center gap-1 mt-0.5">
                  <School size={12} /> {child.school.name}
                </p>
              )}
              {activeEnrollment && (
                <p className="text-xs text-[#94a3b8] flex items-center gap-1 mt-0.5">
                  <Calendar size={12} />
                  {activeEnrollment.class?.name} · {activeEnrollment.section?.name} · {activeEnrollment.session?.label}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Quick Navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <a href="/parent/attendance" className="block group">
          <Card className="hover:border-[#f97316] hover:shadow-md transition-all cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-green-50 flex items-center justify-center mb-3">
                  <Calendar size={20} className="text-green-600" />
                </div>
                <p className="font-bold text-[#1e293b] group-hover:text-[#f97316] transition-colors">Attendance</p>
                <p className="text-sm text-[#64748b] mt-0.5">View monthly calendar & subject-wise breakdown</p>
              </div>
              <ChevronRight size={20} className="text-[#e2e8f0] group-hover:text-[#f97316] transition-colors shrink-0" />
            </div>
          </Card>
        </a>

        <a href="/parent/marks" className="block group">
          <Card className="hover:border-[#f97316] hover:shadow-md transition-all cursor-pointer">
            <div className="flex items-center justify-between">
              <div>
                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
                  <BookOpen size={20} className="text-blue-600" />
                </div>
                <p className="font-bold text-[#1e293b] group-hover:text-[#f97316] transition-colors">Marks & Report Card</p>
                <p className="text-sm text-[#64748b] mt-0.5">View exam results and consolidated report</p>
              </div>
              <ChevronRight size={20} className="text-[#e2e8f0] group-hover:text-[#f97316] transition-colors shrink-0" />
            </div>
          </Card>
        </a>
      </div>

      {/* Notices preview */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Bell size={16} className="text-[#f97316]" />
          <h2 className="text-base font-bold text-[#1e293b]">School Notices</h2>
        </div>
        <p className="text-sm text-[#94a3b8]">Go to the Attendance or Marks page to view recent notices from your school.</p>
      </Card>
    </div>
  );
}