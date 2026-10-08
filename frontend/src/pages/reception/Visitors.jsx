import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { LogIn, LogOut, Printer, Download, Trash2 } from 'lucide-react';
import {
  getVisitors, createVisitor, checkoutVisitor, checkoutAllVisitors, deleteVisitor, exportVisitorsCsv,
} from '../../api/reception.api';
import useAuthStore from '../../store/auth.store';
import {
  useReceptionMeta, inputCls, selectCls, Field, errMsg, saveBlob, DynamicFields, PURPOSE_LABEL, ID_TYPE_LABEL,
  fmtDateTime, duration,
} from './receptionUtils';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import Badge from '../../components/ui/Badge';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function printPass(v, schoolName) {
  const w = window.open('', '_blank', 'width=380,height=560');
  if (!w) { window.alert('Please allow pop-ups to print the visitor pass'); return; }
  const row = (k, val) => (val ? `<div class="row"><span class="k">${k}</span><span>${esc(val)}</span></div>` : '');
  w.document.write(`<!doctype html><html><head><title>Visitor Pass ${esc(v.passNo)}</title>
<style>body{font-family:Arial,sans-serif;padding:14px;color:#1e293b}.pass{border:2px solid #1e293b;border-radius:10px;padding:14px}
h1{font-size:15px;margin:0;text-align:center}.tag{text-align:center;font-size:11px;color:#64748b;letter-spacing:2px;margin-bottom:6px}
.no{font-size:22px;font-weight:700;text-align:center;margin:8px 0}.name{font-size:18px;font-weight:700;text-align:center;margin-bottom:10px}
.row{display:flex;justify-content:space-between;gap:10px;font-size:13px;margin:5px 0;border-top:1px dashed #cbd5e1;padding-top:5px}
.k{color:#64748b}.foot{margin-top:12px;font-size:11px;color:#64748b;text-align:center}</style></head><body>
<div class="pass"><h1>${esc(schoolName || 'School')}</h1><div class="tag">VISITOR PASS</div>
<div class="no">${esc(v.passNo)}</div><div class="name">${esc(v.name)}${v.headCount > 1 ? ` (+${v.headCount - 1})` : ''}</div>
${row('Purpose', PURPOSE_LABEL[v.purpose] || v.purpose)}${row('To meet', v.hostName)}${row('Student', v.studentName)}
${row('Badge', v.badgeNumber)}${row('Vehicle', v.vehicleNumber)}${row('Time in', fmtDateTime(v.checkInAt))}
<div class="foot">Please return this pass at the gate when leaving.</div></div>
<script>window.onload=function(){window.print();}<\/script></body></html>`);
  w.document.close();
}

const BLANK = {
  name: '', phone: '', purpose: 'meet_teacher', hostUserId: '', hostName: '', headCount: 1,
  idProofType: '', idProofLast4: '', vehicleNumber: '', badgeNumber: '', remarks: '', purposeNote: '',
};

export default function Visitors() {
  const qc = useQueryClient();
  const { data: meta } = useReceptionMeta();
  const isAdmin = useAuthStore((s) => s.role) === 'admin';

  const [form, setForm] = useState(BLANK);
  const [custom, setCustom] = useState({});
  const [err, setErr] = useState('');
  const [dupes, setDupes] = useState(null);
  const [last, setLast] = useState(null);

  const [view, setView] = useState('in'); // in | today | all
  const [range, setRange] = useState({ from: '', to: '' });
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const params = {
    page, limit: 30,
    ...(search.trim() ? { search: search.trim() } : {}),
    ...(view === 'in' ? { status: 'in' } : {}),
    ...(view === 'today' && meta ? { from: meta.today, to: meta.today } : {}),
    ...(view === 'all' ? Object.fromEntries(Object.entries(range).filter(([, v]) => v)) : {}),
  };

  const { data, isLoading } = useQuery({
    queryKey: ['visitors', params],
    queryFn: () => getVisitors(params).then((r) => r.data.data),
    placeholderData: keepPreviousData,
    enabled: !!meta,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['visitors'] });
    qc.invalidateQueries({ queryKey: ['reception-dashboard'] });
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const checkIn = useMutation({
    mutationFn: (force) => {
      const clean = (v) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v);
      const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, clean(v)]));
      payload.headCount = Number(form.headCount) || 1;
      payload.customData = custom;
      if (force) payload.force = true;
      return createVisitor(payload);
    },
    onSuccess: (r) => { setLast(r.data.data); setForm(BLANK); setCustom({}); setErr(''); setDupes(null); setPage(1); refresh(); },
    onError: (e) => {
      const d = e?.response?.data;
      if (e?.response?.status === 409 && d?.errors?.duplicates) setDupes(d.errors.duplicates);
      else setErr(errMsg(e));
    },
  });

  const out = useMutation({ mutationFn: (v) => checkoutVisitor(v.id), onSuccess: refresh, onError: (e) => window.alert(errMsg(e)) });
  const outAll = useMutation({
    mutationFn: checkoutAllVisitors,
    onSuccess: (r) => { window.alert(r.data.message); refresh(); },
    onError: (e) => window.alert(errMsg(e)),
  });
  const remove = useMutation({ mutationFn: (v) => deleteVisitor(v.id), onSuccess: refresh, onError: (e) => window.alert(errMsg(e)) });

  const doExport = async () => {
    try {
      const { page: _p, limit: _l, ...rest } = params;
      saveBlob((await exportVisitorsCsv(rest)).data, 'visitors.csv');
    } catch (e) { window.alert(errMsg(e)); }
  };

  const valid = form.name.trim().length >= 2 && form.phone.replace(/\D/g, '').length >= 10 && (!form.idProofType || form.idProofLast4.trim().length >= 3);

  const columns = [
    { key: 'pass', label: 'Pass', render: (v) => (<div><p className="font-semibold text-[#1e293b]">{v.passNo}</p>{v.badgeNumber && <p className="text-xs text-[#94a3b8]">Badge {v.badgeNumber}</p>}</div>) },
    { key: 'who', label: 'Visitor', render: (v) => (<div><p className="text-[#1e293b]">{v.name}{v.headCount > 1 ? ` (+${v.headCount - 1})` : ''}</p><p className="text-xs text-[#64748b]">{v.phone}</p></div>) },
    {
      key: 'why', label: 'Purpose', render: (v) => (
        <div><p>{PURPOSE_LABEL[v.purpose] || v.purpose}</p>
          <p className="text-xs text-[#64748b]">{[v.hostName && `to meet ${v.hostName}`, v.studentName && `re: ${v.studentName}`].filter(Boolean).join(' · ')}</p></div>
      ),
    },
    { key: 'in', label: 'Check-in', render: (v) => fmtDateTime(v.checkInAt) },
    {
      key: 'out', label: 'Check-out', render: (v) => {
        if (!v.checkOutAt) {
          const stale = data && v.checkInAt < data.todayStart;
          return <Badge label={stale ? `Not checked out (${duration(v.checkInAt)})` : `Inside · ${duration(v.checkInAt)}`} variant={stale ? 'danger' : 'info'} />;
        }
        return <div><p>{fmtDateTime(v.checkOutAt)}</p><p className="text-xs text-[#94a3b8]">{duration(v.checkInAt, v.checkOutAt)}{v.autoCheckedOut ? ' · auto' : ''}</p></div>;
      },
    },
    {
      key: 'act', label: '', render: (v) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => printPass(v, meta?.school?.name)} />
          {!v.checkOutAt && <Button size="sm" variant="outline" icon={LogOut} loading={out.isPending && out.variables?.id === v.id} onClick={() => out.mutate(v)}>Out</Button>}
          {isAdmin && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm(`Delete entry ${v.passNo}?`) && remove.mutate(v)} />}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Visitor Log</h1>
          <p className="text-sm text-[#64748b] mt-1">Digital gate register: who is on campus, why, and for how long.</p>
        </div>
        <Button variant="outline" icon={Download} onClick={doExport}>Export CSV</Button>
      </div>

      <Card>
        <h2 className="font-bold text-[#1e293b] mb-3">Check in a visitor</h2>

        {last && (
          <div className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 flex flex-wrap items-center justify-between gap-2">
            <span><b>{last.passNo}</b> issued to {last.name}.</span>
            <div className="flex gap-2">
              <Button size="sm" icon={Printer} onClick={() => printPass(last, meta?.school?.name)}>Print pass</Button>
              <Button size="sm" variant="ghost" onClick={() => setLast(null)}>Dismiss</Button>
            </div>
          </div>
        )}

        {dupes && (
          <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-800">This number is already inside the campus:</p>
            <ul className="list-disc pl-5 text-amber-900">{dupes.map((d) => <li key={d.id}>{d.passNo} — {d.name} (since {fmtDateTime(d.checkInAt)})</li>)}</ul>
            <p className="mt-1 text-amber-800">Check them out first, or check in again if this is a different person.</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" loading={checkIn.isPending} onClick={() => checkIn.mutate(true)}>Check in anyway</Button>
              <Button size="sm" variant="ghost" onClick={() => setDupes(null)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Field label="Visitor name *"><input className={inputCls} value={form.name} onChange={set('name')} /></Field>
          <Field label="Mobile number *"><input className={inputCls} inputMode="tel" value={form.phone} onChange={set('phone')} /></Field>
          <Field label="Purpose *">
            <select className={selectCls} value={form.purpose} onChange={set('purpose')}>
              {(meta?.purposes || []).map((p) => <option key={p} value={p}>{PURPOSE_LABEL[p] || p}</option>)}
            </select>
          </Field>
          <Field label="No. of people"><input type="number" min={1} max={50} className={inputCls} value={form.headCount} onChange={set('headCount')} /></Field>
          <Field label="Whom to meet">
            <select className={selectCls} value={form.hostUserId} onChange={set('hostUserId')}>
              <option value="">Other / not listed</option>
              {(meta?.hosts || []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </Field>
          {!form.hostUserId && <Field label="Name of person to meet"><input className={inputCls} value={form.hostName} onChange={set('hostName')} /></Field>}
          <Field label="ID shown">
            <select className={selectCls} value={form.idProofType} onChange={set('idProofType')}>
              <option value="">Not taken</option>
              {(meta?.idTypes || []).map((t) => <option key={t} value={t}>{ID_TYPE_LABEL[t] || t}</option>)}
            </select>
          </Field>
          {form.idProofType && (
            <Field label="Last 3-4 digits of ID" hint="Only these digits are stored.">
              <input className={inputCls} maxLength={4} value={form.idProofLast4} onChange={set('idProofLast4')} />
            </Field>
          )}
          <Field label="Vehicle number"><input className={inputCls} value={form.vehicleNumber} onChange={set('vehicleNumber')} /></Field>
          <Field label="Badge number"><input className={inputCls} value={form.badgeNumber} onChange={set('badgeNumber')} /></Field>
          <Field label="Remarks" className="sm:col-span-2"><input className={inputCls} value={form.remarks} onChange={set('remarks')} /></Field>
        </div>

        {(meta?.fields?.visitor || []).length > 0 && (
          <div className="mt-3"><DynamicFields fields={meta.fields.visitor} values={custom} onChange={(k, v) => setCustom((c) => ({ ...c, [k]: v }))} /></div>
        )}

        {err && <p className="text-sm text-red-600 mt-3">{err}</p>}
        <div className="mt-4">
          <Button icon={LogIn} loading={checkIn.isPending && !dupes} disabled={!valid} onClick={() => { setErr(''); checkIn.mutate(false); }}>Check in</Button>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-[#e2e8f0] overflow-hidden bg-white">
          {[{ v: 'in', l: `Inside now${data ? ` (${data.inside})` : ''}` }, { v: 'today', l: 'Today' }, { v: 'all', l: 'All records' }].map((o) => (
            <button key={o.v} onClick={() => { setView(o.v); setPage(1); }}
              className={`px-4 py-2 text-sm font-semibold ${view === o.v ? 'bg-[#1e293b] text-white' : 'text-[#475569]'}`}>{o.l}</button>
          ))}
        </div>
        {view === 'all' && (
          <div className="flex items-center gap-2">
            <input type="date" className={`${inputCls} !w-auto`} value={range.from} onChange={(e) => { setRange({ ...range, from: e.target.value }); setPage(1); }} />
            <span className="text-sm text-[#94a3b8]">to</span>
            <input type="date" className={`${inputCls} !w-auto`} value={range.to} onChange={(e) => { setRange({ ...range, to: e.target.value }); setPage(1); }} />
          </div>
        )}
        <input className={`${inputCls} !w-64`} placeholder="Search name, phone, pass, badge…" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        {isAdmin && data?.inside > 0 && (
          <Button variant="danger" size="sm" loading={outAll.isPending}
            onClick={() => window.confirm(`Check out all ${data.inside} visitor(s) still inside? Use this for end-of-day cleanup.`) && outAll.mutate()}>
            Check out everyone
          </Button>
        )}
      </div>

      <Card padding={false}>
        <div className="p-4">
          <Table columns={columns} data={data?.visitors || []} loading={isLoading} emptyMessage={view === 'in' ? 'Nobody is inside right now' : 'No visitor records found'} />
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-[#64748b]">
              <span>{data.total} records</span>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span>Page {data.page} of {data.totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}