import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Calendar, AlertTriangle } from 'lucide-react';
import { format, getDaysInMonth, startOfMonth, getDay } from 'date-fns';
import {
  getMyChildren,
  getAttendanceCalendar,
  getSubjectWiseAttendance,
} from '../../api/parent.api';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';

const STATUS_STYLES = {
  present: 'bg-green-100 text-green-700 font-semibold',
  absent:  'bg-red-100  text-red-700  font-semibold',
  late:    'bg-amber-100 text-amber-700 font-semibold',
};

function CalendarGrid({ year, month, records = [], holidays = [] }) {
  const firstDay   = getDay(startOfMonth(new Date(year, month - 1, 1)));
  const totalDays  = getDaysInMonth(new Date(year, month - 1, 1));
  const dayLabels  = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const recordMap = {};
  records.forEach((r) => {
    const d = new Date(r.date).getDate();
    recordMap[d] = r.status;
  });
  const holidaySet = new Set(holidays.map((h) => new Date(h.date).getDate()));

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  return (
    <div>
      <div className="grid grid-cols-7 mb-1">
        {dayLabels.map((l) => (
          <div key={l} className="text-center text-xs font-semibold text-[#94a3b8] py-1">{l}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => {
          if (!day) return <div key={`empty-${i}`} />;
          const status   = recordMap[day];
          const isHoliday = holidaySet.has(day);
          return (
            <div
              key={day}
              className={`aspect-square flex flex-col items-center justify-center rounded-lg text-xs transition-all ${
                isHoliday
                  ? 'bg-purple-50 text-purple-600 font-semibold'
                  : status
                  ? STATUS_STYLES[status] || 'bg-[#f1f5f9] text-[#64748b]'
                  : 'text-[#64748b]'
              }`}
            >
              <span>{day}</span>
              {isHoliday && <span className="text-[9px] leading-none mt-0.5">Hol</span>}
              {!isHoliday && status && (
                <span className="text-[9px] leading-none mt-0.5 capitalize">{status.charAt(0).toUpperCase()}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ParentAttendance() {
  const now = new Date();
  const [year, setYear]   = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [childId, setChildId] = useState('');

  // Children
  const { data: children = [], isLoading: loadingChildren } = useQuery({
    queryKey: ['my-children'],
    queryFn: () => getMyChildren().then((r) => r.data.data ?? []),
    onSuccess: (data) => { if (data.length > 0 && !childId) setChildId(data[0].id); },
  });

  // Calendar
  const { data: calData, isLoading: loadingCal, isError: calError } = useQuery({
    queryKey: ['attendance-calendar', childId, year, month],
    queryFn: () => getAttendanceCalendar({ studentId: childId, year, month }).then((r) => r.data.data),
    enabled: !!childId,
  });

  // Subject-wise
  const { data: subjectData = [], isLoading: loadingSubject } = useQuery({
    queryKey: ['attendance-subject', childId],
    queryFn: () => getSubjectWiseAttendance({ studentId: childId }).then((r) => r.data.data ?? []),
    enabled: !!childId,
  });

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1); }
    else setMonth((m) => m - 1);
  }
  function nextMonth() {
    const isCurrentOrFuture = year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
    if (isCurrentOrFuture) return;
    if (month === 12) { setMonth(1); setYear((y) => y + 1); }
    else setMonth((m) => m + 1);
  }

  const pct = calData?.monthlyPercentage ?? null;
  const pctColor = pct === null ? 'text-[#94a3b8]' : pct >= 75 ? 'text-green-600' : pct >= 60 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Attendance</h1>
        <p className="text-sm text-[#64748b] mt-1">Monthly calendar and subject-wise breakdown.</p>
      </div>

      {/* Child selector */}
      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => setChildId(c.id)}
              className={`px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                childId === c.id
                  ? 'border-[#f97316] bg-orange-50 text-[#f97316]'
                  : 'border-[#e2e8f0] text-[#64748b] hover:border-[#f97316]'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loadingChildren ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !childId ? (
        <Card><p className="text-sm text-[#94a3b8] text-center py-8">No children found.</p></Card>
      ) : (
        <>
          {/* Calendar */}
          <Card>
            {/* Month nav */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={prevMonth}
                className="p-2 rounded-lg hover:bg-[#f1f5f9] text-[#64748b] transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="text-center">
                <p className="font-bold text-[#1e293b] text-lg">
                  {format(new Date(year, month - 1, 1), 'MMMM yyyy')}
                </p>
                {pct !== null && (
                  <p className={`text-sm font-semibold ${pctColor}`}>{pct}% attendance this month</p>
                )}
              </div>
              <button
                onClick={nextMonth}
                className="p-2 rounded-lg hover:bg-[#f1f5f9] text-[#64748b] transition-colors disabled:opacity-30"
                disabled={year === now.getFullYear() && month >= now.getMonth() + 1}
              >
                <ChevronRight size={18} />
              </button>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-4 text-xs">
              {[
                { label: 'Present', cls: 'bg-green-100 text-green-700' },
                { label: 'Absent',  cls: 'bg-red-100 text-red-700' },
                { label: 'Late',    cls: 'bg-amber-100 text-amber-700' },
                { label: 'Holiday', cls: 'bg-purple-50 text-purple-600' },
              ].map((l) => (
                <span key={l.label} className={`px-2 py-0.5 rounded font-semibold ${l.cls}`}>{l.label}</span>
              ))}
            </div>

            {loadingCal ? (
              <div className="flex justify-center py-10"><Spinner /></div>
            ) : calError ? (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                <AlertTriangle size={16} /> No active enrollment found for this student.
              </div>
            ) : (
              <>
                <CalendarGrid
                  year={year}
                  month={month}
                  records={calData?.records ?? []}
                  holidays={calData?.holidays ?? []}
                />
                {/* Stats row */}
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div className="bg-green-50 rounded-xl p-3 text-center border border-green-100">
                    <p className="text-xl font-bold text-green-700">{calData?.presentDays ?? 0}</p>
                    <p className="text-xs text-green-600 mt-0.5">Present</p>
                  </div>
                  <div className="bg-red-50 rounded-xl p-3 text-center border border-red-100">
                    <p className="text-xl font-bold text-red-700">
                      {(calData?.totalDays ?? 0) - (calData?.presentDays ?? 0)}
                    </p>
                    <p className="text-xs text-red-600 mt-0.5">Absent / Late</p>
                  </div>
                  <div className="bg-[#f8fafc] rounded-xl p-3 text-center border border-[#e2e8f0]">
                    <p className="text-xl font-bold text-[#1e293b]">{calData?.totalDays ?? 0}</p>
                    <p className="text-xs text-[#64748b] mt-0.5">Total Days</p>
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* Subject-wise */}
          <Card>
            <h2 className="text-base font-bold text-[#1e293b] mb-4">Subject-wise Attendance</h2>
            {loadingSubject ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : subjectData.length === 0 ? (
              <p className="text-sm text-[#94a3b8] text-center py-8">No subject-wise attendance data yet.</p>
            ) : (
              <div className="space-y-3">
                {subjectData.map((s) => {
                  const pctNum = s.percentage ?? 0;
                  const barColor = pctNum >= 75 ? 'bg-green-500' : pctNum >= 60 ? 'bg-amber-500' : 'bg-red-500';
                  return (
                    <div key={s.subject}>
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-sm font-semibold text-[#1e293b]">{s.subject}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#64748b]">{s.present}/{s.totalClasses}</span>
                          <span className={`text-xs font-bold ${pctNum >= 75 ? 'text-green-600' : pctNum >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                            {pctNum}%
                          </span>
                        </div>
                      </div>
                      <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                        <div
                          className={`h-2 rounded-full transition-all ${barColor}`}
                          style={{ width: `${Math.min(pctNum, 100)}%` }}
                        />
                      </div>
                      {pctNum < 75 && (
                        <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                          <AlertTriangle size={11} /> Below 75% — attendance at risk
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}