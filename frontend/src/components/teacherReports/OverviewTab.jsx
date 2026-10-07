import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, Search } from 'lucide-react';
import { getTeacherReportOverview } from '../../api/schooladmin.api';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import Spinner from '../ui/Spinner';
import { errMsg } from '../calendar/calendarUtils';
import { Notice, Select, StatCard } from '../syllabus/SyllabusUI';
import { MiniBar, fmtPct, pctColor, timeAgo } from './trUtils';

const ATTENTION = ['Inactive', 'At risk', 'Needs attention'];

const SORTERS = {
  name:       (t) => t.name.toLowerCase(),
  classes:    (t) => t.assignmentCount,
  attendance: (t) => t.attendance.compliancePct ?? -1,
  marks:      (t) => t.marks.completionPct ?? -1,
  syllabus:   (t) => t.syllabus.avgCoveragePct ?? -1,
  corrections:(t) => t.corrections.pending,
  activity:   (t) => t.activity.activeDays,
  login:      (t) => t.lastLogin || '',
  health:     (t) => (t.health.label === 'Unassigned' ? 999 : t.health.score ?? -1),
};

function Th({ label, k, sort, setSort, className = '' }) {
  const active = sort.key === k;
  return (
    <th className={`px-3 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wider whitespace-nowrap ${className}`}>
      <button
        onClick={() => setSort({ key: k, dir: active && sort.dir === 'asc' ? 'desc' : 'asc' })}
        className="inline-flex items-center gap-1 hover:text-[#1e293b]"
      >
        {label}
        {active && (sort.dir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );
}

export default function OverviewTab({ params, onOpenTeacher }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'health', dir: 'asc' });

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tr-overview', params],
    queryFn: () => getTeacherReportOverview(params).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    let list = data.teachers.filter((t) => {
      if (q && !t.name.toLowerCase().includes(q) && !t.email.toLowerCase().includes(q)) return false;
      if (filter === 'attention') return ATTENTION.includes(t.health.label);
      if (filter === 'inactive') return t.health.label === 'Inactive';
      if (filter === 'unassigned') return t.health.label === 'Unassigned';
      if (filter === 'excellent') return ['Excellent', 'Good'].includes(t.health.label);
      return true;
    });
    const get = SORTERS[sort.key];
    list = [...list].sort((a, b) => {
      const x = get(a); const y = get(b);
      const c = x < y ? -1 : x > y ? 1 : 0;
      return sort.dir === 'asc' ? c : -c;
    });
    return list;
  }, [data, search, filter, sort]);

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (isError) return <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load the teacher overview.') }} />;

  const s = data.summary;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
        <StatCard label="Active teachers" value={`${s.activeTeachers}/${s.withAssignments}`} hint="did any work in range" tone={s.inactiveTeachers ? 'warning' : 'success'} />
        <StatCard label="Attendance" value={fmtPct(s.attendance.compliancePct)} hint={`${s.attendance.marked}/${s.attendance.expected} entries`} tone={s.attendance.compliancePct !== null && s.attendance.compliancePct < 60 ? 'danger' : 'default'} />
        <StatCard label="Missing entries" value={s.attendance.missing} hint={s.attendance.pendingToday ? `${s.attendance.pendingToday} pending today` : 'not marked'} tone={s.attendance.missing ? 'danger' : 'success'} />
        <StatCard label="Late entries" value={s.attendance.late} hint="saved after the day" tone={s.attendance.late ? 'warning' : 'default'} />
        <StatCard label="Marks overdue" value={s.marks.overdue} hint={`${fmtPct(s.marks.completionPct)} entered`} tone={s.marks.overdue ? 'danger' : 'success'} />
        <StatCard label="Syllabus" value={fmtPct(s.syllabus.avgCoveragePct)} hint={`${s.syllabus.behind} behind · ${s.syllabus.stale} stale`} />
        <StatCard label="Need attention" value={s.needsAttention} hint={`${s.corrections.pending} corrections pending`} tone={s.needsAttention ? 'warning' : 'success'} />
      </div>

      <Card padding={false}>
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-[#e2e8f0]">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search teacher name or email"
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316]"
            />
          </div>
          <Select value={filter} onChange={setFilter} className="sm:w-52">
            <option value="all">All teachers</option>
            <option value="attention">Needs attention</option>
            <option value="inactive">Inactive only</option>
            <option value="excellent">Good / Excellent</option>
            <option value="unassigned">Unassigned</option>
          </Select>
          <p className="text-xs text-[#94a3b8] self-center sm:ml-auto">{rows.length} teacher{rows.length === 1 ? '' : 's'} · {data.range.workingDays} working days</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
                <Th label="Teacher" k="name" sort={sort} setSort={setSort} />
                <Th label="Classes" k="classes" sort={sort} setSort={setSort} />
                <Th label="Attendance" k="attendance" sort={sort} setSort={setSort} className="min-w-[150px]" />
                <Th label="Marks" k="marks" sort={sort} setSort={setSort} className="min-w-[140px]" />
                <Th label="Syllabus" k="syllabus" sort={sort} setSort={setSort} className="min-w-[130px]" />
                <Th label="Corrections" k="corrections" sort={sort} setSort={setSort} />
                <Th label="Activity" k="activity" sort={sort} setSort={setSort} />
                <Th label="Last login" k="login" sort={sort} setSort={setSort} />
                <Th label="Health" k="health" sort={sort} setSort={setSort} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} className="py-14 text-center text-[#94a3b8]">No teachers match these filters.</td></tr>
              )}
              {rows.map((t) => (
                <tr key={t.id} onClick={() => onOpenTeacher(t.id)} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] cursor-pointer">
                  <td className="px-3 py-3">
                    <p className="font-semibold text-[#1e293b]">{t.name}</p>
                    <p className="text-xs text-[#94a3b8]">{t.email}</p>
                    {t.classTeacherOf.length > 0 && <div className="mt-1"><Badge label={`Class teacher · ${t.classTeacherOf[0]}`} variant="navy" /></div>}
                  </td>
                  <td className="px-3 py-3 text-[#374151]" title={t.assignmentLabels.join('\n')}>{t.assignmentCount || '—'}</td>
                  <td className="px-3 py-3">
                    {t.attendance.expected === 0 ? (
                      <span className="text-xs text-[#94a3b8]">{t.attendance.pendingToday ? 'Pending today' : 'Nothing due'}</span>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-bold" style={{ color: pctColor(t.attendance.compliancePct) }}>{fmtPct(t.attendance.compliancePct)}</p>
                        <MiniBar pct={t.attendance.compliancePct} />
                        <p className="text-xs text-[#64748b]">
                          {t.attendance.marked}/{t.attendance.expected}
                          {t.attendance.missing > 0 && <span className="text-red-600 font-semibold"> · {t.attendance.missing} missing</span>}
                          {t.attendance.late > 0 && <span className="text-amber-600"> · {t.attendance.late} late</span>}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {t.marks.applicable === 0 ? (
                      <span className="text-xs text-[#94a3b8]">{t.marks.upcoming ? `${t.marks.upcoming} upcoming` : 'None due'}</span>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-bold" style={{ color: pctColor(t.marks.completionPct) }}>{fmtPct(t.marks.completionPct)}</p>
                        <MiniBar pct={t.marks.completionPct} />
                        <p className="text-xs text-[#64748b]">
                          {t.marks.complete}/{t.marks.examSubjects} done
                          {t.marks.overdue > 0 && <span className="text-red-600 font-semibold"> · {t.marks.overdue} overdue</span>}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {t.syllabus.tracked === 0 ? (
                      <span className="text-xs text-[#94a3b8]">{t.assignmentCount ? 'Not set up' : '—'}</span>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-bold text-[#1e293b]">{fmtPct(t.syllabus.avgCoveragePct)}</p>
                        <MiniBar pct={t.syllabus.avgCoveragePct} color="#f97316" />
                        <p className="text-xs text-[#64748b]">
                          {t.syllabus.behind > 0 && <span className="text-red-600 font-semibold">{t.syllabus.behind} behind</span>}
                          {t.syllabus.behind > 0 && t.syllabus.stale > 0 && ' · '}
                          {t.syllabus.stale > 0 && <span className="text-amber-600">{t.syllabus.stale} stale</span>}
                          {t.syllabus.behind === 0 && t.syllabus.stale === 0 && 'On track'}
                        </p>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {t.corrections.pending > 0 ? <Badge label={`${t.corrections.pending} pending`} variant="warning" /> : <span className="text-[#94a3b8]">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs">
                    {t.assignmentCount === 0 ? <span className="text-[#94a3b8]">—</span>
                      : t.activity.total === 0 ? <span className="text-red-600 font-semibold">No activity</span>
                        : (
                          <>
                            <p className="text-[#1e293b] font-semibold">{t.activity.activeDays} active day{t.activity.activeDays === 1 ? '' : 's'}</p>
                            <p className="text-[#94a3b8]">last {timeAgo(t.activity.lastActivityAt)}</p>
                          </>
                        )}
                  </td>
                  <td className="px-3 py-3 text-xs text-[#64748b] whitespace-nowrap">{timeAgo(t.lastLogin)}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <Badge label={t.health.label} variant={t.health.variant} />
                    {t.health.score !== null && <p className="text-xs text-[#94a3b8] mt-1">Score {t.health.score}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <p className="text-xs text-[#94a3b8] leading-relaxed">
        How this is calculated: attendance is expected once per assigned class, section and subject on every working day of the Academic Calendar
        (today only counts once it is marked). Marks are due per section for every exam of the teacher&apos;s subjects; overdue means the exam ended more than 3 days ago.
        Health score = attendance 40% + marks 30% + syllabus 30% (syllabus measured against the planned dates), using whatever data exists.
        &quot;Inactive&quot; means work was due but nothing was marked, entered or updated in this range.
      </p>
    </div>
  );
}