import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Wallet, Receipt, AlertCircle, BarChart3, Search, RefreshCw } from 'lucide-react';
import { getFeeStudents, getFeeDashboard, generateFeeDues } from '../../api/fees.api';
import { inr, inputCls, errMsg, useFeeBase, useFeeMeta, StatusBadge } from './feeUtils';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';

function Stat({ label, value, sub, tone = 'navy' }) {
  const color = { navy: 'text-[#1e293b]', green: 'text-green-700', red: 'text-red-600', orange: 'text-[#f97316]' }[tone];
  return (
    <Card>
      <p className="text-xs font-medium text-[#64748b] uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-extrabold mt-1 ${color}`}>{value}</p>
      {sub && <p className="text-xs text-[#94a3b8] mt-0.5">{sub}</p>}
    </Card>
  );
}

export default function FeeDashboard() {
  const base = useFeeBase();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: meta } = useFeeMeta();

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [status, setStatus] = useState('all');
  const [page, setPage] = useState(1);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    const t = setTimeout(() => { setQ(search); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data: stats } = useQuery({ queryKey: ['fee-dashboard'], queryFn: () => getFeeDashboard().then((r) => r.data.data) });

  const { data, isLoading } = useQuery({
    queryKey: ['fee-students', { q, classId, sectionId, status, page }],
    queryFn: () => getFeeStudents({ search: q || undefined, classId: classId || undefined, sectionId: sectionId || undefined, status, page, limit: 25 }).then((r) => r.data.data),
    placeholderData: keepPreviousData,
  });

  const sync = useMutation({
    mutationFn: () => generateFeeDues(),
    onSuccess: (r) => {
      setNotice(r.data.message);
      qc.invalidateQueries({ queryKey: ['fee-students'] });
      qc.invalidateQueries({ queryKey: ['fee-dashboard'] });
    },
    onError: (e) => setNotice(errMsg(e)),
  });

  const classes = (meta?.classes || []).filter((c) => c.sessionId === meta?.activeSessionId);
  const sections = classes.find((c) => c.id === classId)?.sections || [];
  const counts = data?.counts || {};

  const tiles = [
    { to: `${base}/collect`,  icon: Wallet,      label: 'Collect Fees',     sub: 'Take a payment, issue a receipt', color: 'bg-orange-50 text-[#f97316]' },
    { to: `${base}/receipts`, icon: Receipt,     label: 'Receipts',         sub: 'Download / print / search',       color: 'bg-blue-50 text-blue-600' },
    { to: `${base}/dues`,     icon: AlertCircle, label: 'Due / Remaining',  sub: 'Defaulters and reminders',        color: 'bg-red-50 text-red-600' },
    { to: `${base}/analytics`,icon: BarChart3,   label: 'Analytics',        sub: 'Collection insights',             color: 'bg-green-50 text-green-600' },
  ];

  const columns = [
    { key: 'name', label: 'Student', render: (r) => (<div><p className="font-semibold text-[#1e293b]">{r.name}</p><p className="text-xs text-[#94a3b8]">{r.enrollmentNumber}</p></div>) },
    { key: 'class', label: 'Class', render: (r) => `${r.className} - ${r.sectionName}${r.rollNumber ? ` (#${r.rollNumber})` : ''}` },
    { key: 'parent', label: 'Parent', render: (r) => (<div><p>{r.parentName || '—'}</p><p className="text-xs text-[#94a3b8]">{r.parentPhone || ''}</p></div>) },
    { key: 'paid', label: 'Paid', render: (r) => inr(r.paid) },
    { key: 'due', label: 'Due Now', render: (r) => <span className={r.totalDue > 0 ? 'font-bold text-red-600' : 'text-[#94a3b8]'}>{inr(r.totalDue)}</span> },
    { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
    { key: 'act', label: '', render: (r) => <Button size="sm" onClick={() => navigate(`${base}/collect/${r.studentId}`)}>Collect</Button> },
  ];

  const tabs = [
    ['all', 'All'], ['overdue', 'Due'], ['upcoming', 'Upcoming'], ['paid', 'Paid'],
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">{meta?.school?.name || 'Fee Counter'}</h1>
          <p className="text-sm text-[#64748b] mt-1">Session {stats?.session?.label || '—'} · {meta?.user?.name}</p>
        </div>
        <Button variant="outline" size="sm" icon={RefreshCw} loading={sync.isPending} onClick={() => sync.mutate()}>Sync new admissions</Button>
      </div>
      {notice && <div className="bg-blue-50 border border-blue-200 text-blue-700 text-sm rounded-lg px-4 py-2">{notice}</div>}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Collected today" value={inr(stats?.today?.amount)} sub={`${stats?.today?.count || 0} receipts`} tone="green" />
        <Stat label="This month" value={inr(stats?.month?.amount)} sub={`${stats?.month?.count || 0} receipts`} />
        <Stat label="Due till today" value={inr(stats?.totals?.dueNow)} sub={`${stats?.overdueStudents || 0} students`} tone="red" />
        <Stat label="Collection rate" value={`${stats?.totals?.collectionRate || 0}%`} sub={`${inr(stats?.totals?.outstanding)} outstanding`} tone="orange" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <button key={t.to} onClick={() => navigate(t.to)} className="text-left bg-white border border-[#e2e8f0] rounded-xl p-4 hover:shadow-md hover:border-[#f97316] transition-all">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${t.color}`}><t.icon size={20} /></div>
            <p className="font-bold text-[#1e293b] mt-3">{t.label}</p>
            <p className="text-xs text-[#94a3b8] mt-0.5">{t.sub}</p>
          </button>
        ))}
      </div>

      <Card padding={false}>
        <div className="p-4 flex flex-wrap gap-3 items-center border-b border-[#e2e8f0]">
          <div className="relative flex-1 min-w-[220px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input className={`${inputCls} pl-9`} placeholder="Search name, admission no., parent, phone" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <select className={`${inputCls} !w-auto`} value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(''); setPage(1); }}>
            <option value="">All classes</option>
            {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select className={`${inputCls} !w-auto`} value={sectionId} disabled={!classId} onChange={(e) => { setSectionId(e.target.value); setPage(1); }}>
            <option value="">All sections</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="px-4 pt-3 flex gap-2 overflow-x-auto">
          {tabs.map(([k, label]) => (
            <button key={k} onClick={() => { setStatus(k); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap ${status === k ? 'bg-[#1e293b] text-white' : 'bg-[#f1f5f9] text-[#64748b]'}`}>
              {label} ({k === 'all' ? counts.all || 0 : counts[k === 'overdue' ? 'overdue' : k] || 0})
            </button>
          ))}
        </div>
        <div className="p-4">
          <Table columns={columns} data={data?.students || []} loading={isLoading} emptyMessage="No students found" />
          {data?.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-[#64748b]">
              <span>{data.total} students</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span className="py-1.5">Page {page} of {data.totalPages}</span>
                <Button size="sm" variant="ghost" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}