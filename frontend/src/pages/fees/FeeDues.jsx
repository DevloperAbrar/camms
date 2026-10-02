import { useState, useEffect } from 'react';
import { useQuery, useMutation, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, FileSpreadsheet, FileText } from 'lucide-react';
import { getFeeStudents, exportDuesCsv, downloadDuesPdf, sendDueReminders } from '../../api/fees.api';
import { inr, errMsg, inputCls, useFeeBase, useFeeMeta, saveBlob } from './feeUtils';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';

export default function FeeDues() {
  const base = useFeeBase();
  const navigate = useNavigate();
  const { data: meta } = useFeeMeta();

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [page, setPage] = useState(1);
  const [picked, setPicked] = useState({});
  const [msg, setMsg] = useState('');

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const params = { status: 'overdue', sort: 'due', search: q || undefined, classId: classId || undefined, sectionId: sectionId || undefined };
  const { data, isLoading } = useQuery({
    queryKey: ['fee-dues', params, page],
    queryFn: () => getFeeStudents({ ...params, page, limit: 50 }).then((r) => r.data.data),
    placeholderData: keepPreviousData,
  });

  const remind = useMutation({
    mutationFn: () => sendDueReminders({ studentIds: Object.keys(picked).filter((k) => picked[k]) }),
    onSuccess: (r) => { setMsg(r.data.message); setPicked({}); },
    onError: (e) => setMsg(errMsg(e)),
  });

  const classes = (meta?.classes || []).filter((c) => c.sessionId === meta?.activeSessionId);
  const sections = classes.find((c) => c.id === classId)?.sections || [];
  const rows = data?.students || [];
  const pickedCount = Object.values(picked).filter(Boolean).length;
  const allOn = rows.length > 0 && rows.every((r) => picked[r.studentId]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Due / Remaining</h1>
          <p className="text-sm text-[#64748b] mt-1">Students with pending fees till today, highest dues first</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" icon={FileSpreadsheet} onClick={async () => saveBlob((await exportDuesCsv(params)).data, 'fee-dues.csv')}>CSV</Button>
          <Button variant="outline" size="sm" icon={FileText} onClick={async () => saveBlob((await downloadDuesPdf(params)).data, 'fee-dues.pdf')}>PDF</Button>
          <Button size="sm" icon={Bell} disabled={!pickedCount} loading={remind.isPending} onClick={() => remind.mutate()}>Remind parents ({pickedCount})</Button>
        </div>
      </div>
      {msg && <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg px-4 py-2">{msg}</div>}

      <div className="grid grid-cols-2 gap-4 max-w-md">
        <Card><p className="text-xs text-[#64748b] uppercase">Defaulters</p><p className="text-2xl font-extrabold text-red-600">{data?.total ?? '—'}</p></Card>
        <Card><p className="text-xs text-[#64748b] uppercase">Total due</p><p className="text-2xl font-extrabold text-red-600">{inr(data?.summary?.due)}</p></Card>
      </div>

      <Card padding={false}>
        <div className="p-4 flex flex-wrap gap-3 border-b border-[#e2e8f0]">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input className={`${inputCls} pl-9`} placeholder="Search student / parent / phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className={`${inputCls} !w-auto`} value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); setPage(1); }}>
            <option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={`${inputCls} !w-auto`} value={sectionId} disabled={!classId} onChange={(e) => { setSectionId(e.target.value); setPage(1); }}>
            <option value="">All sections</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f8fafc] text-xs text-[#64748b] uppercase">
                <th className="px-4 py-3 w-8"><input type="checkbox" checked={allOn} onChange={(e) => setPicked(Object.fromEntries(rows.map((r) => [r.studentId, e.target.checked])))} /></th>
                <th className="px-4 py-3 text-left">Student</th><th className="px-4 py-3 text-left">Class</th><th className="px-4 py-3 text-left">Parent</th>
                <th className="px-4 py-3 text-right">Previous</th><th className="px-4 py-3 text-right">Total due</th><th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {!isLoading && rows.length === 0 && <tr><td colSpan={7} className="py-12 text-center text-[#94a3b8]">No pending dues</td></tr>}
              {rows.map((r) => (
                <tr key={r.studentId} className="border-t border-[#f1f5f9] hover:bg-[#f8fafc]">
                  <td className="px-4 py-3"><input type="checkbox" checked={!!picked[r.studentId]} onChange={(e) => setPicked({ ...picked, [r.studentId]: e.target.checked })} /></td>
                  <td className="px-4 py-3"><p className="font-semibold text-[#1e293b]">{r.name}</p><p className="text-xs text-[#94a3b8]">{r.enrollmentNumber}</p></td>
                  <td className="px-4 py-3">{r.className} - {r.sectionName}</td>
                  <td className="px-4 py-3"><p>{r.parentName || '—'}</p><p className="text-xs text-[#94a3b8]">{r.parentPhone || ''}</p></td>
                  <td className="px-4 py-3 text-right">{r.arrears > 0 ? inr(r.arrears) : '—'}</td>
                  <td className="px-4 py-3 text-right font-extrabold text-red-600">{inr(r.totalDue)}</td>
                  <td className="px-4 py-3 text-right"><Button size="sm" onClick={() => navigate(`${base}/collect/${r.studentId}`)}>Collect</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data?.totalPages > 1 && (
          <div className="flex items-center justify-between p-4 text-sm text-[#64748b]">
            <span>{data.total} students</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
              <span className="py-1.5">Page {page} of {data.totalPages}</span>
              <Button size="sm" variant="ghost" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}