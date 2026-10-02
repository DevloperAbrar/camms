import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Users, BookOpen, Bell, ChevronRight, School, Calendar, Wallet } from 'lucide-react';
import { getMyChildren, getParentFees } from '../../api/parent.api';
import { inr } from '../fees/feeUtils';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

const statusVariant = { active: 'success', inactive: 'danger', transferred_out: 'warning', graduated: 'info' };

// Small fee summary for the selected child. Silent if fees are unavailable for the school.
function FeeSummary({ studentId }) {
  const { data } = useQuery({
    queryKey: ['parent-fees', studentId],
    queryFn: () => getParentFees({ studentId }).then((r) => r.data.data),
    enabled: !!studentId,
    retry: false,
  });
  if (!data) return null;
  const due = data.totals.dueNow;
  const last = data.receipts.find((r) => r.status === 'active');

  return (
    <Card className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-[#f97316]" />
          <h2 className="text-base font-bold text-[#1e293b]">Fee Summary</h2>
        </div>
        <a href="/parent/fees" className="text-xs font-semibold text-[#f97316]">View all</a>
      </div>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div><p className="text-xs text-[#94a3b8]">Due now</p><p className={`font-extrabold ${due > 0 ? 'text-red-600' : 'text-green-700'}`}>{inr(due)}</p></div>
        <div><p className="text-xs text-[#94a3b8]">Upcoming</p><p className="font-extrabold text-[#1e293b]">{inr(data.totals.upcoming)}</p></div>
        <div><p className="text-xs text-[#94a3b8]">Paid</p><p className="font-extrabold text-green-700">{inr(data.totals.paid)}</p></div>
      </div>
      {last && <p className="text-xs text-[#94a3b8] mt-3">Last receipt: {last.receiptNo} · {inr(last.totalAmount)}</p>}
      {due > 0 && <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 mt-3">Please pay pending fees at the school fee counter.</p>}
    </Card>
  );
}

export default function ParentDashboard() {
  const [selectedChild, setSelectedChild] = useState(null);

  const { data: children = [], isLoading, isError } = useQuery({
    queryKey: ['my-children'],
    queryFn: () => getMyChildren().then((r) => r.data.data ?? []),
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
      <div className="flex flex-col items-center justify-center h-64 gap-3 px-4 text-center">
        <Users size={40} className="text-[#e2e8f0]" />
        <p className="text-[#94a3b8] text-sm">No children linked to your account. Contact school admin.</p>
      </div>
    );
  }

  const child = selectedChild || children[0];
  const activeEnrollment = child?.enrollments?.[0];

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Parent Dashboard</h1>
        <p className="text-sm text-[#64748b] mt-1">Monitor your child's academic progress.</p>
      </div>

      {/* Child Switcher */}
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedChild(c)}
              className={`px-3 sm:px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
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
        <Card className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            {child.photoUrl ? (
              <img src={child.photoUrl} alt={child.name} className="w-14 h-14 sm:w-16 sm:h-16 rounded-full object-cover border-2 border-[#f97316] shrink-0" />
            ) : (
              <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                <span className="text-xl sm:text-2xl font-bold text-[#f97316]">{child.name.charAt(0)}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-[#1e293b] break-words">{child.name}</h2>
                <Badge label={child.status} variant={statusVariant[child.status] || 'default'} />
              </div>
              <p className="text-xs text-[#64748b] mt-1">Enrollment: {child.enrollmentNumber}</p>
              {child.school && (
                <p className="text-xs text-[#94a3b8] flex items-center gap-1 mt-0.5">
                  <School size={12} className="shrink-0" /> <span className="truncate">{child.school.name}</span>
                </p>
              )}
              {activeEnrollment && (
                <p className="text-xs text-[#94a3b8] flex items-center gap-1 mt-0.5">
                  <Calendar size={12} className="shrink-0" />
                  {activeEnrollment.class?.name} · {activeEnrollment.section?.name} · {activeEnrollment.session?.label}
                </p>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Fee summary */}
      {child && <FeeSummary studentId={child.id} />}

      {/* Quick Navigation */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <a href="/parent/attendance" className="block group">
          <Card className="p-4 sm:p-6 hover:border-[#f97316] hover:shadow-md transition-all cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
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
          <Card className="p-4 sm:p-6 hover:border-[#f97316] hover:shadow-md transition-all cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
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

        <a href="/parent/fees" className="block group">
          <Card className="p-4 sm:p-6 hover:border-[#f97316] hover:shadow-md transition-all cursor-pointer">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center mb-3">
                  <Wallet size={20} className="text-[#f97316]" />
                </div>
                <p className="font-bold text-[#1e293b] group-hover:text-[#f97316] transition-colors">Fees & Receipts</p>
                <p className="text-sm text-[#64748b] mt-0.5">View dues, download and print receipts</p>
              </div>
              <ChevronRight size={20} className="text-[#e2e8f0] group-hover:text-[#f97316] transition-colors shrink-0" />
            </div>
          </Card>
        </a>
      </div>

      {/* Notices preview */}
      <Card className="p-4 sm:p-6">
        <div className="flex items-center gap-2 mb-4">
          <Bell size={16} className="text-[#f97316]" />
          <h2 className="text-base font-bold text-[#1e293b]">School Notices</h2>
        </div>
        <p className="text-sm text-[#94a3b8]">Go to the Attendance or Marks page to view recent notices from your school.</p>
      </Card>
    </div>
  );
}