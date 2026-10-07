import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, ChevronDown, ChevronRight, Search } from 'lucide-react';
import { getTeacherReportPending, sendTeacherReminders } from '../../api/schooladmin.api';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Card from '../ui/Card';
import Spinner from '../ui/Spinner';
import { errMsg } from '../calendar/calendarUtils';
import { Notice } from '../syllabus/SyllabusUI';
import { fmtDateShort } from './trUtils';

export default function PendingTab({ params, onOpenTeacher }) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState(() => new Set());
  const [open, setOpen] = useState(() => new Set());
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [notice, setNotice] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tr-pending', params],
    queryFn: () => getTeacherReportPending(params).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  const remind = useMutation({
    mutationFn: () => sendTeacherReminders({ ...params, kind: 'attendance', facultyIds: [...selected], note: note || undefined }),
    onSuccess: (res) => {
      const d = res.data.data;
      setNotice({ type: 'success', text: `${res.data.message}${d.skipped.length ? ` (${d.skipped.length} skipped: ${d.skipped.map((s) => s.name).join(', ')})` : ''}` });
      setSelected(new Set());
      setNote('');
      qc.invalidateQueries({ queryKey: ['tr-pending'] });
    },
    onError: (err) => setNotice({ type: 'error', text: errMsg(err, 'Could not send reminders.') }),
  });

  const teachers = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.teachers.filter((t) => t.missing > 0 && (!q || t.name.toLowerCase().includes(q)));
  }, [data, search]);

  const toggleIn = (setter, id) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const allSelected = teachers.length > 0 && teachers.every((t) => selected.has(t.id));

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (isError) return <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load pending attendance.') }} />;

  return (
    <div className="space-y-3">
      <Notice notice={notice} onClose={() => setNotice(null)} />

      <Card className="!p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div>
            <p className="text-sm font-bold text-[#1e293b]">{data.total} attendance {data.total === 1 ? 'entry' : 'entries'} not marked</p>
            <p className="text-xs text-[#64748b]">{teachers.length} teacher{teachers.length === 1 ? '' : 's'} · {data.range.from} to {data.range.to}{data.truncated ? ' · list truncated, export CSV for everything' : ''}</p>
          </div>
          <div className="relative lg:ml-auto lg:w-56">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search teacher" className="w-full pl-9 pr-3 py-2 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="Optional note to teachers" className="lg:w-64 px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316]" />
          <Button icon={Bell} disabled={!selected.size} loading={remind.isPending} onClick={() => remind.mutate()}>
            Remind {selected.size ? `(${selected.size})` : ''}
          </Button>
        </div>
      </Card>

      {teachers.length === 0 ? (
        <Card><p className="text-sm text-green-700 text-center py-10 font-semibold">All caught up. No pending attendance in this range.</p></Card>
      ) : (
        <Card padding={false}>
          <div className="px-4 py-2.5 border-b border-[#e2e8f0] bg-[#f8fafc] flex items-center gap-3">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() => setSelected(allSelected ? new Set() : new Set(teachers.map((t) => t.id)))}
              className="accent-[#f97316]"
            />
            <span className="text-xs font-semibold text-[#64748b] uppercase tracking-wider">Select all</span>
          </div>
          {teachers.map((t) => (
            <div key={t.id} className="border-b border-[#f1f5f9] last:border-0">
              <div className="flex items-center gap-3 px-4 py-3">
                <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleIn(setSelected, t.id)} className="accent-[#f97316]" />
                <button onClick={() => toggleIn(setOpen, t.id)} className="text-[#94a3b8] hover:text-[#1e293b]">
                  {open.has(t.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                </button>
                <button onClick={() => onOpenTeacher(t.id)} className="text-left flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#1e293b]">{t.name}</p>
                  <p className="text-xs text-[#94a3b8]">{t.email}</p>
                </button>
                <Badge label={`${t.missing} missing of ${t.expected}`} variant="danger" />
              </div>
              {open.has(t.id) && (
                <div className="px-4 pb-3 pl-14 grid sm:grid-cols-2 xl:grid-cols-3 gap-1.5">
                  {t.items.map((i) => (
                    <p key={`${i.date}-${i.sectionId}-${i.subjectId}`} className="text-xs text-[#475569] bg-[#f8fafc] rounded-md px-2.5 py-1.5">
                      <span className="font-semibold text-red-600">{fmtDateShort(i.date)}</span> · {i.className} {i.sectionName} · {i.subjectName}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}