import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import { getFeeDashboard, downloadCollectionPdf } from '../../api/fees.api';
import { inr, fmtDate, inputCls, Field, MODE_LABEL, useFeeMeta, saveBlob } from './feeUtils';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';

const COLORS = ['#f97316', '#3b82f6', '#16a34a', '#a855f7', '#ef4444', '#f59e0b'];
const short = (n) => (n >= 100000 ? `${(n / 100000).toFixed(1)}L` : n >= 1000 ? `${(n / 1000).toFixed(0)}k` : n);

export default function FeeAnalytics() {
  const { data: meta } = useFeeMeta();
  const [sessionId, setSessionId] = useState('');
  const [range, setRange] = useState({ from: '', to: '' });

  const { data, isLoading } = useQuery({
    queryKey: ['fee-dashboard', sessionId],
    queryFn: () => getFeeDashboard({ sessionId: sessionId || undefined }).then((r) => r.data.data),
  });

  if (isLoading || !data) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  const t = data.totals;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Fee Analytics</h1>
          <p className="text-sm text-[#64748b] mt-1">Session {data.session?.label || '—'}</p>
        </div>
        <select className={`${inputCls} !w-auto`} value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
          <option value="">Active session</option>
          {(meta?.sessions || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          ['Total billed', inr(t.billed), 'text-[#1e293b]'],
          ['Collected', inr(t.collected), 'text-green-700'],
          ['Outstanding', inr(t.outstanding), 'text-amber-600'],
          ['Overdue now', inr(t.dueNow), 'text-red-600'],
          ['Collection rate', `${t.collectionRate}%`, 'text-[#f97316]'],
        ].map(([l, v, c]) => (
          <Card key={l}><p className="text-xs text-[#64748b] uppercase">{l}</p><p className={`text-xl font-extrabold mt-1 ${c}`}>{v}</p></Card>
        ))}
      </div>

      <Card>
        <h2 className="font-bold text-[#1e293b] mb-3">Daily collection (last 30 days)</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data.trend}>
              <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#f97316" stopOpacity={0.3} /><stop offset="95%" stopColor="#f97316" stopOpacity={0} /></linearGradient></defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={(d) => d.slice(8)} tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={40} />
              <Tooltip formatter={(v) => inr(v)} labelFormatter={fmtDate} />
              <Area type="monotone" dataKey="amount" stroke="#f97316" fill="url(#g)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2">
          <h2 className="font-bold text-[#1e293b] mb-3">Class-wise: billed vs collected vs due</h2>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.byClass}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="className" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={short} tick={{ fontSize: 11 }} width={40} />
                <Tooltip formatter={(v) => inr(v)} /><Legend />
                <Bar dataKey="billed" name="Billed" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="collected" name="Collected" fill="#16a34a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="due" name="Overdue" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2 className="font-bold text-[#1e293b] mb-3">This month by mode</h2>
          {data.byMode.length === 0 ? <p className="text-sm text-[#94a3b8] py-10 text-center">No collections yet</p> : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.byMode.map((m) => ({ name: MODE_LABEL[m.mode] || m.mode, value: m.total }))} dataKey="value" innerRadius={50} outerRadius={85} paddingAngle={2}>
                    {data.byMode.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v) => inr(v)} /><Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card padding={false}>
          <div className="p-4 border-b border-[#e2e8f0] font-bold text-[#1e293b]">Top defaulters</div>
          <div className="divide-y divide-[#f1f5f9]">
            {data.topDefaulters.length === 0 && <p className="p-6 text-center text-sm text-[#94a3b8]">No overdue fees</p>}
            {data.topDefaulters.map((s) => (
              <div key={s.studentId} className="px-4 py-2.5 flex justify-between text-sm">
                <div><p className="font-semibold text-[#1e293b]">{s.name}</p><p className="text-xs text-[#94a3b8]">{s.className} - {s.sectionName} · {s.parentPhone || ''}</p></div>
                <span className="font-bold text-red-600">{inr(s.due)}</span>
              </div>
            ))}
          </div>
        </Card>
        <Card padding={false}>
          <div className="p-4 border-b border-[#e2e8f0] font-bold text-[#1e293b]">Collector performance (this month)</div>
          <div className="divide-y divide-[#f1f5f9]">
            {data.collectors.length === 0 && <p className="p-6 text-center text-sm text-[#94a3b8]">No collections yet</p>}
            {data.collectors.map((c) => (
              <div key={c.id || c.name} className="px-4 py-2.5 flex justify-between text-sm">
                <div><p className="font-semibold text-[#1e293b]">{c.name}</p><p className="text-xs text-[#94a3b8]">{c.count} receipts</p></div>
                <span className="font-bold text-green-700">{inr(c.total)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card>
        <h2 className="font-bold text-[#1e293b] mb-3">Collection report (PDF)</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="From"><input type="date" className={inputCls} value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
          <Button icon={FileText} onClick={async () => saveBlob((await downloadCollectionPdf({ from: range.from || undefined, to: range.to || undefined })).data, 'fee-collection-report.pdf')}>Download</Button>
        </div>
      </Card>
    </div>
  );
}