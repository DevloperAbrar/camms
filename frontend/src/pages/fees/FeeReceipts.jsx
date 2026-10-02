import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Search, Download, Printer, XCircle, FileSpreadsheet, FileText } from 'lucide-react';
import {
  getFeeReceipts, downloadReceiptPdf, exportReceiptsCsv, downloadCollectionPdf, cancelFeeReceipt, getFeeStaff,
} from '../../api/fees.api';
import { inr, fmtDate, errMsg, inputCls, MODE_LABEL, useFeeMeta, saveBlob, printBlob, StatusBadge, Field } from './feeUtils';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';

export default function FeeReceipts() {
  const qc = useQueryClient();
  const { data: meta } = useFeeMeta();
  const isAdmin = meta?.permissions?.isAdmin;

  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [f, setF] = useState({ from: '', to: '', mode: '', collectorId: '', status: '' });
  const [page, setPage] = useState(1);
  const [cancel, setCancel] = useState(null);
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);

  const params = { search: q || undefined, from: f.from || undefined, to: f.to || undefined, mode: f.mode || undefined, collectorId: f.collectorId || undefined, status: f.status || undefined };

  const { data, isLoading } = useQuery({
    queryKey: ['fee-receipts', params, page],
    queryFn: () => getFeeReceipts({ ...params, page, limit: 20 }).then((r) => r.data.data),
    placeholderData: keepPreviousData,
  });
  const { data: staff } = useQuery({ queryKey: ['fee-staff'], queryFn: () => getFeeStaff().then((r) => r.data.data), enabled: !!isAdmin });

  const cancelMut = useMutation({
    mutationFn: () => cancelFeeReceipt(cancel.id, { reason }),
    onSuccess: () => {
      setCancel(null); setReason(''); setErr('');
      ['fee-receipts', 'fee-students', 'fee-dashboard', 'fee-ledger'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e) => setErr(errMsg(e)),
  });

  const pdf = async (r, print) => {
    const res = await downloadReceiptPdf(r.id);
    if (print) printBlob(res.data); else saveBlob(res.data, `receipt-${r.receiptNo.replace(/[^A-Za-z0-9-]/g, '-')}.pdf`);
  };
  const exportCsv = async () => saveBlob((await exportReceiptsCsv(params)).data, 'fee-receipts.csv');
  const exportPdf = async () => saveBlob((await downloadCollectionPdf(params)).data, 'fee-collection-report.pdf');

  const columns = [
    { key: 'receiptNo', label: 'Receipt', render: (r) => (<div><p className="font-semibold text-[#1e293b]">{r.receiptNo}</p><p className="text-xs text-[#94a3b8]">{fmtDate(r.paymentDate)}</p></div>) },
    { key: 'student', label: 'Student', render: (r) => (<div><p>{r.studentName}</p><p className="text-xs text-[#94a3b8]">{r.enrollmentNumber} · {r.className} {r.sectionName}</p></div>) },
    { key: 'mode', label: 'Mode', render: (r) => MODE_LABEL[r.paymentMode] || r.paymentMode },
    { key: 'by', label: 'Collected by', render: (r) => r.collectedByName },
    { key: 'amount', label: 'Amount', render: (r) => <span className={`font-bold ${r.status === 'cancelled' ? 'line-through text-[#94a3b8]' : ''}`}>{inr(r.totalAmount)}</span> },
    { key: 'status', label: '', render: (r) => (r.status === 'cancelled' ? <StatusBadge status="cancelled" /> : null) },
    {
      key: 'act', label: '',
      render: (r) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={Download} onClick={() => pdf(r, false)} />
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => pdf(r, true)} />
          {isAdmin && r.status === 'active' && <Button size="sm" variant="ghost" icon={XCircle} onClick={() => { setCancel(r); setReason(''); setErr(''); }} />}
        </div>
      ),
    },
  ];

  const s = data?.summary;
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setPage(1); };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Receipts</h1>
          <p className="text-sm text-[#64748b] mt-1">Download, print, search and export every receipt</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" icon={FileSpreadsheet} onClick={exportCsv}>CSV</Button>
          <Button variant="outline" size="sm" icon={FileText} onClick={exportPdf}>Collection report</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card><p className="text-xs text-[#64748b] uppercase">Collected</p><p className="text-2xl font-extrabold text-green-700">{inr(s?.collected)}</p><p className="text-xs text-[#94a3b8]">{s?.count || 0} receipts</p></Card>
        {(s?.byMode || []).slice(0, 3).map((m) => (
          <Card key={m.mode}><p className="text-xs text-[#64748b] uppercase">{MODE_LABEL[m.mode] || m.mode}</p><p className="text-xl font-extrabold text-[#1e293b]">{inr(m.total)}</p><p className="text-xs text-[#94a3b8]">{m.count} receipts</p></Card>
        ))}
      </div>

      <Card padding={false}>
        <div className="p-4 flex flex-wrap gap-3 border-b border-[#e2e8f0] items-end">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input className={`${inputCls} pl-9`} placeholder="Receipt no., student, admission no." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Field label="From"><input type="date" className={inputCls} value={f.from} onChange={set('from')} /></Field>
          <Field label="To"><input type="date" className={inputCls} value={f.to} onChange={set('to')} /></Field>
          <select className={`${inputCls} !w-auto`} value={f.mode} onChange={set('mode')}>
            <option value="">All modes</option>
            {(meta?.settings?.enabledModes || []).map((m) => <option key={m} value={m}>{MODE_LABEL[m] || m}</option>)}
          </select>
          {isAdmin && (
            <select className={`${inputCls} !w-auto`} value={f.collectorId} onChange={set('collectorId')}>
              <option value="">All collectors</option>
              {(staff || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          )}
          <select className={`${inputCls} !w-auto`} value={f.status} onChange={set('status')}>
            <option value="">All</option><option value="active">Active</option><option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div className="p-4">
          <Table columns={columns} data={data?.receipts || []} loading={isLoading} emptyMessage="No receipts found" />
          {data?.totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 text-sm text-[#64748b]">
              <span>{data.total} receipts</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span className="py-1.5">Page {page} of {data.totalPages}</span>
                <Button size="sm" variant="ghost" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Modal open={!!cancel} onClose={() => setCancel(null)} title="Cancel receipt" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-[#64748b]">Receipt <b>{cancel?.receiptNo}</b> ({inr(cancel?.totalAmount)}) will be marked cancelled and the amount returns to the student's dues. This cannot be undone.</p>
          <Field label="Reason"><input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Wrong student / wrong amount..." /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button variant="danger" className="w-full" loading={cancelMut.isPending} disabled={reason.trim().length < 3} onClick={() => cancelMut.mutate()}>Cancel this receipt</Button>
        </div>
      </Modal>
    </div>
  );
}