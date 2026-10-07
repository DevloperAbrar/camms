import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { getTeacherReportGrid } from '../../api/schooladmin.api';
import Badge from '../ui/Badge';
import Card from '../ui/Card';
import Spinner from '../ui/Spinner';
import { errMsg } from '../calendar/calendarUtils';
import { Notice } from '../syllabus/SyllabusUI';
import { CELL_META } from './trUtils';

const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function teacherCell(assignments, i) {
  let m = 0; let x = 0; let p = 0; let e = 0;
  for (const a of assignments) {
    const c = a.cells[i];
    if (c === 'M' || c === 'O') m += 1;
    else if (c === 'X') x += 1;
    else if (c === 'P') p += 1;
    else if (c === 'E') e += 1;
  }
  return { m, x, p, e };
}

function DayCell({ c, onClick }) {
  const total = c.m + c.x + c.p;
  if (!total) {
    return (
      <button onClick={onClick} className={`w-7 h-6 rounded text-[10px] ${c.e ? 'bg-green-100 text-green-700 font-bold' : 'text-[#cbd5e1]'}`} title={c.e ? 'Extra attendance on a non-working day' : 'Nothing expected'}>
        {c.e ? '+' : '·'}
      </button>
    );
  }
  const cls = c.x === 0 && c.p === 0 ? 'bg-green-500 text-white'
    : c.m === 0 && c.x > 0 ? 'bg-red-500 text-white'
      : c.x > 0 ? 'bg-amber-400 text-white'
        : 'bg-amber-100 text-amber-700';
  return (
    <button onClick={onClick} className={`w-7 h-6 rounded text-[10px] font-bold ${cls}`} title={`${c.m} marked · ${c.x} missing${c.p ? ` · ${c.p} pending today` : ''}`}>
      {c.m}/{total}
    </button>
  );
}

export default function DayGridTab({ params, onOpenTeacher, onOpenDay }) {
  const [open, setOpen] = useState(() => new Set());
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tr-grid', params],
    queryFn: () => getTeacherReportGrid(params).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  const teachers = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.teachers.filter((t) => !q || t.name.toLowerCase().includes(q));
  }, [data, search]);

  const toggle = (id) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  if (isLoading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (isError) return <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load the day-wise grid.') }} />;
  if (!data.days.length) return <Card><p className="text-sm text-[#94a3b8] text-center py-10">No days to show in this range.</p></Card>;

  return (
    <div className="space-y-3">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative max-w-xs w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search teacher"
            className="w-full pl-9 pr-3 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748b] lg:ml-auto">
          {['M', 'O', 'X', 'P', 'E'].map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-sm ${CELL_META[k].cls}`} />{CELL_META[k].label}
            </span>
          ))}
        </div>
      </div>

      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse">
            <thead>
              <tr className="border-b border-[#e2e8f0]">
                <th className="sticky left-0 z-20 bg-[#f8fafc] px-3 py-2 text-left text-xs font-semibold text-[#64748b] uppercase min-w-[210px]">Teacher</th>
                {data.days.map((d) => (
                  <th key={d.date} className={`px-0.5 py-1.5 text-center font-medium ${d.off ? 'bg-[#f1f5f9] text-[#94a3b8]' : 'bg-[#f8fafc] text-[#64748b]'}`} title={d.date}>
                    <div className="text-[9px]">{WD[d.dow]}</div>
                    <div className="text-[11px] font-semibold">{Number(d.date.slice(8, 10))}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teachers.length === 0 && (
                <tr><td colSpan={data.days.length + 1} className="py-12 text-center text-[#94a3b8]">No teachers to show.</td></tr>
              )}
              {teachers.map((t) => (
                <Fragment key={t.id}>
                  <tr className="border-b border-[#f1f5f9]">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => toggle(t.id)} className="text-[#94a3b8] hover:text-[#1e293b]">
                          {open.has(t.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <button onClick={() => onOpenTeacher(t.id)} className="text-left min-w-0">
                          <p className="text-sm font-semibold text-[#1e293b] truncate max-w-[130px]">{t.name}</p>
                        </button>
                        <Badge label={t.health.label} variant={t.health.variant} />
                      </div>
                    </td>
                    {data.days.map((d, i) => (
                      <td key={d.date} className={`px-0.5 py-1 text-center ${d.off ? 'bg-[#f8fafc]' : ''}`}>
                        <DayCell c={teacherCell(t.assignments, i)} onClick={() => onOpenDay(t.id, d.date)} />
                      </td>
                    ))}
                  </tr>
                  {open.has(t.id) && t.assignments.map((a) => (
                    <tr key={a.id} className="border-b border-[#f1f5f9] bg-[#f8fafc]">
                      <td className="sticky left-0 z-10 bg-[#f8fafc] pl-9 pr-3 py-1.5">
                        <p className="text-[11px] font-semibold text-[#374151] truncate max-w-[190px]">{a.subjectName}</p>
                        <p className="text-[10px] text-[#94a3b8]">{a.label}</p>
                      </td>
                      {data.days.map((d, i) => (
                        <td key={d.date} className="px-0.5 py-1 text-center">
                          <button
                            onClick={() => onOpenDay(t.id, d.date)}
                            title={`${d.date} — ${CELL_META[a.cells[i]].label}`}
                            className={`w-4 h-4 rounded-sm ${CELL_META[a.cells[i]].cls}`}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <p className="text-xs text-[#94a3b8]">Each box shows attendance sessions marked out of expected for that day. Click a box for the exact details (who marked it, when, how many students). Grey columns are weekly offs or holidays.</p>
    </div>
  );
}