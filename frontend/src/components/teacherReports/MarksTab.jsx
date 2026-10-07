import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { getTeacherReportMarks, sendTeacherReminders } from '../../api/schooladmin.api';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Spinner from '../ui/Spinner';
import { errMsg } from '../calendar/calendarUtils';
import { Notice, Select, StatCard } from '../syllabus/SyllabusUI';
import { MARKS_STATUS, MiniBar, fmtDateShort, fmtPct, timeAgo } from './trUtils';

export default function MarksTab({ params }) {
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tr-marks', params],
    queryFn: () => getTeacherReportMarks(params).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => {
    if (!data) return [];
    if (filter === 'overdue') return data.rows.filter((r) => r.overdue);
    if (filter === 'pending') return data.rows.filter((r) => r.status !== 'complete' && r.status !== 'upcoming');
    if (filter === 'complete') return data.rows.filter((r) => r.status === 'complete');
    return data.rows;
  }, [data, filter]);

  const overdueTeacherIds = useMemo(() => [...new Set((data?.rows || []).filter((r) => r.overdue).map((r) => r.facultyId))], [data]);

  const remind = useMutation({
    mutationFn: () => sendTeacherReminders({ ...params, kind: 'marks', facultyIds: overdueTeacherIds }),
    onSuccess: (res) => setNotice({ type: 'success', text: res.data.message }),
    onError: (err) => setNotice({ type: 'error', text: errMsg(err, 'Could not send reminders.') }),
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (isError) return <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load the marks tracker.') }} />;

  const s = data.summary;
  return (
    <div className="space-y-4">
      <Notice notice={notice} onClose={() => setNotice(null)} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <StatCard label="Exam subjects" value={s.total} hint="across all teachers" />
        <StatCard label="Complete" value={s.complete} tone="success" />
        <StatCard label="In progress" value={s.partial + s.notStarted} hint={`${s.upcoming} upcoming`} tone={s.partial + s.notStarted ? 'warning' : 'default'} />
        <StatCard label="Overdue" value={s.overdue} hint="exam ended 3+ days ago" tone={s.overdue ? 'danger' : 'success'} />
        <StatCard label="Marks entered" value={fmtPct(s.completionPct)} hint="of students due" />
      </div>

      <Card padding={false}>
        <div className="flex flex-col sm:flex-row gap-3 p-4 border-b border-[#e2e8f0]">
          <Select value={filter} onChange={setFilter} className="sm:w-52">
            <option value="all">All exam subjects</option>
            <option value="overdue">Overdue only</option>
            <option value="pending">Not complete</option>
            <option value="complete">Complete</option>
          </Select>
          <div className="sm:ml-auto">
            <Button icon={Bell} variant="outline" size="sm" disabled={!overdueTeacherIds.length} loading={remind.isPending} onClick={() => remind.mutate()}>
              Remind teachers with overdue marks ({overdueTeacherIds.length})
            </Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-xs uppercase text-[#64748b]">
                {['Exam', 'Class', 'Subject', 'Teacher', 'Progress', 'Status', 'Exam ends', 'Last entry', 'Entered by'].map((h) => (
                  <th key={h} className="px-3 py-3 text-left font-semibold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={9} className="py-14 text-center text-[#94a3b8]">Nothing to show for this filter.</td></tr>}
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc]">
                  <td className="px-3 py-3 font-semibold text-[#1e293b] whitespace-nowrap">{r.examName}{r.examLocked && <span className="ml-1.5 text-[10px] text-[#94a3b8]">locked</span>}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-[#374151]">{r.className} · {r.sectionName}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-[#374151]">{r.subjectName}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-[#374151]">{r.facultyName}</td>
                  <td className="px-3 py-3 min-w-[130px]">
                    <p className="text-xs text-[#64748b] mb-1">{r.entered}/{r.expected} students</p>
                    <MiniBar pct={r.completionPct} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-1.5">
                      <Badge label={MARKS_STATUS[r.status].label} variant={MARKS_STATUS[r.status].variant} />
                      {r.overdue && <Badge label="Overdue" variant="danger" />}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs whitespace-nowrap text-[#64748b]">
                    {r.examEnd ? fmtDateShort(r.examEnd) : 'No date'}
                    {r.overdue && <span className="text-red-600 font-semibold"> · {r.daysPastEnd}d ago</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-[#64748b] whitespace-nowrap">{r.lastEntryAt ? timeAgo(r.lastEntryAt) : '—'}</td>
                  <td className="px-3 py-3 text-xs text-[#64748b]">{r.enteredBy.length ? r.enteredBy.map((e) => e.name).join(', ') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-[#94a3b8]">Exam dates come from the Academic Calendar: an event of kind &quot;exam&quot; whose title contains the exam name. Exams without a calendar date are never marked overdue.</p>
    </div>
  );
}