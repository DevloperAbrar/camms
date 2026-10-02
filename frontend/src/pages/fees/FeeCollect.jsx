import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Download, Printer, Plus, Percent, Trash2, FileText, CheckCircle } from 'lucide-react';
import {
  getFeeStudents, getFeeLedger, collectFees, applyConcession, addFeeCharge, deleteFeeCharge,
  downloadReceiptPdf, downloadFeeStatement,
} from '../../api/fees.api';
import {
  inr, fmtDate, errMsg, inputCls, Field, MODE_LABEL, useFeeBase, useFeeMeta, saveBlob, printBlob, StatusBadge,
} from './feeUtils';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

// ───── step 1: find a student ─────
function StudentPicker() {
  const base = useFeeBase();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => { const t = setTimeout(() => setQ(search.trim()), 300); return () => clearTimeout(t); }, [search]);

  const { data, isFetching } = useQuery({
    queryKey: ['fee-pick', q],
    queryFn: () => getFeeStudents({ search: q, limit: 10 }).then((r) => r.data.data),
    enabled: q.length >= 2,
  });

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Collect Fees</h1>
        <p className="text-sm text-[#64748b] mt-1">Search a student by name, admission number, parent name or phone</p>
      </div>
      <div className="relative">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
        <input autoFocus className={`${inputCls} pl-10 !py-3 !text-base`} placeholder="Start typing..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {isFetching && <div className="flex justify-center py-6"><Spinner /></div>}
      <div className="space-y-2">
        {(data?.students || []).map((s) => (
          <button key={s.studentId} onClick={() => navigate(`${base}/collect/${s.studentId}`)}
            className="w-full text-left bg-white border border-[#e2e8f0] rounded-xl p-4 flex items-center justify-between hover:border-[#f97316] hover:shadow-sm transition-all">
            <div>
              <p className="font-semibold text-[#1e293b]">{s.name}</p>
              <p className="text-xs text-[#94a3b8]">{s.enrollmentNumber} · {s.className} - {s.sectionName} · {s.parentName || 'Parent'} {s.parentPhone || ''}</p>
            </div>
            <div className="text-right">
              <p className={`font-bold ${s.totalDue > 0 ? 'text-red-600' : 'text-green-600'}`}>{inr(s.totalDue)}</p>
              <p className="text-xs text-[#94a3b8]">due now</p>
            </div>
          </button>
        ))}
        {q.length >= 2 && !isFetching && data?.students?.length === 0 && <p className="text-center text-sm text-[#94a3b8] py-6">No student found</p>}
      </div>
    </div>
  );
}

// ───── step 2: the ledger + payment ─────
function Ledger({ studentId }) {
  const base = useFeeBase();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: meta } = useFeeMeta();
  const { data, isLoading } = useQuery({ queryKey: ['fee-ledger', studentId], queryFn: () => getFeeLedger(studentId).then((r) => r.data.data) });

  const [sel, setSel] = useState({}); // chargeId -> { amount, waive }
  const [showPaid, setShowPaid] = useState(false);
  const [pay, setPay] = useState({ mode: 'cash', referenceNo: '', bankName: '', instrumentDate: '', paymentDate: '', remarks: '' });
  const [done, setDone] = useState(null);
  const [modal, setModal] = useState(null);
  const [err, setErr] = useState('');
  const [cForm, setCForm] = useState({ type: 'amount', value: '', reason: '' });
  const [chForm, setChForm] = useState({ feeHeadId: '', title: '', amount: '', dueDate: '' });

  const perms = meta?.permissions || {};
  const today = meta?.today;
  const refresh = () => {
    ['fee-ledger', 'fee-students', 'fee-dashboard', 'fee-receipts', 'fee-pick'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  };

  const collect = useMutation({
    mutationFn: collectFees,
    onSuccess: (r) => { setDone(r.data.data); setSel({}); setErr(''); refresh(); },
    onError: (e) => setErr(errMsg(e)),
  });
  const concession = useMutation({
    mutationFn: applyConcession,
    onSuccess: () => { setModal(null); setSel({}); setErr(''); refresh(); },
    onError: (e) => setErr(errMsg(e)),
  });
  const addCharge = useMutation({
    mutationFn: addFeeCharge,
    onSuccess: () => { setModal(null); setChForm({ feeHeadId: '', title: '', amount: '', dueDate: '' }); setErr(''); refresh(); },
    onError: (e) => setErr(errMsg(e)),
  });
  const delCharge = useMutation({ mutationFn: deleteFeeCharge, onSuccess: refresh, onError: (e) => setErr(errMsg(e)) });

  if (isLoading || !meta) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;
  if (!data) return null;

  const { student, enrollment, charges, totals, receipts } = data;
  const multiSession = new Set(charges.map((c) => c.sessionId)).size > 1;
  const visible = charges.filter((c) => showPaid || c.balance > 0);
  const chosen = charges.filter((c) => sel[c.id]);

  const toggle = (c) => setSel((s) => {
    const n = { ...s };
    if (n[c.id]) delete n[c.id]; else n[c.id] = { amount: String(c.balance), waive: false };
    return n;
  });
  const selectDue = () => {
    const n = {};
    charges.filter((c) => c.balance > 0 && c.dueDate <= today).forEach((c) => { n[c.id] = { amount: String(c.balance), waive: false }; });
    setSel(n);
  };
  const setField = (id, patch) => setSel((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  const feeTotal = chosen.reduce((s, c) => s + (Number(sel[c.id].amount) || 0), 0);
  const lateTotal = chosen.reduce((s, c) => s + (sel[c.id].waive ? 0 : c.lateFee), 0);
  const grand = feeTotal + lateTotal;
  const needsRef = ['cheque', 'dd'].includes(pay.mode);
  const bad = chosen.find((c) => !(Number(sel[c.id].amount) > 0) || Number(sel[c.id].amount) > c.balance + 0.001);

  const submit = () => {
    setErr('');
    if (!chosen.length) return setErr('Select at least one fee to collect');
    if (bad) return setErr(`Check the amount for "${bad.title}"`);
    if (needsRef && !pay.referenceNo.trim()) return setErr('Enter the cheque / DD number');
    collect.mutate({
      studentId,
      items: chosen.map((c) => ({ chargeId: c.id, amount: Number(sel[c.id].amount), waiveLateFee: !!sel[c.id].waive })),
      paymentMode: pay.mode,
      referenceNo: pay.referenceNo || null,
      bankName: pay.bankName || null,
      instrumentDate: pay.instrumentDate || null,
      paymentDate: pay.paymentDate || null,
      remarks: pay.remarks || null,
    });
  };

  const getPdf = async (id, print) => {
    const r = await downloadReceiptPdf(id);
    if (print) printBlob(r.data); else saveBlob(r.data, 'receipt.pdf');
  };
  const getStatement = async () => {
    const r = await downloadFeeStatement(studentId, { sessionId: enrollment?.sessionId });
    saveBlob(r.data, `fee-statement-${student.enrollmentNumber}.pdf`);
  };

  return (
    <div className="space-y-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <button className="text-xs text-[#64748b] hover:text-[#f97316] mb-1" onClick={() => navigate(`${base}/collect`)}>← Search another student</button>
            <h1 className="text-xl font-extrabold text-[#1e293b]">{student.name}</h1>
            <p className="text-sm text-[#64748b]">
              {student.enrollmentNumber} · {enrollment ? `${enrollment.className} - ${enrollment.sectionName}` : 'Not enrolled'} · {student.parentName || 'Parent'} {student.parentPhone || ''}
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-right">
            <div><p className="text-xs text-[#94a3b8]">Due now</p><p className="font-extrabold text-red-600">{inr(totals.dueNow)}</p></div>
            <div><p className="text-xs text-[#94a3b8]">Late fee</p><p className="font-bold text-amber-600">{inr(totals.lateFee)}</p></div>
            <div><p className="text-xs text-[#94a3b8]">Upcoming</p><p className="font-bold text-[#1e293b]">{inr(totals.upcoming)}</p></div>
            <div><p className="text-xs text-[#94a3b8]">Paid</p><p className="font-bold text-green-600">{inr(totals.paid)}</p></div>
          </div>
        </div>
        {totals.previousDue > 0 && <p className="mt-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">Previous year dues: {inr(totals.previousDue)}</p>}
      </Card>

      <div className="grid lg:grid-cols-3 gap-5 items-start">
        <Card padding={false} className="lg:col-span-2 overflow-hidden">
          <div className="p-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0]">
            <h2 className="font-bold text-[#1e293b]">Fee ledger</h2>
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-xs text-[#64748b] flex items-center gap-1"><input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> Show paid</label>
              <Button size="sm" variant="outline" onClick={selectDue}>Select all due</Button>
              <Button size="sm" variant="ghost" onClick={() => setSel({})}>Clear</Button>
              {perms.canConcede && <Button size="sm" variant="ghost" icon={Percent} disabled={!chosen.length} onClick={() => { setErr(''); setModal('concession'); }}>Concession</Button>}
              {perms.isAdmin && <Button size="sm" variant="ghost" icon={Plus} onClick={() => { setErr(''); setModal('charge'); }}>Add charge</Button>}
              <Button size="sm" variant="ghost" icon={FileText} onClick={getStatement}>Statement</Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f8fafc] text-xs text-[#64748b] uppercase">
                  <th className="px-3 py-2 w-8" /><th className="px-3 py-2 text-left">Particulars</th><th className="px-3 py-2 text-left">Due date</th>
                  <th className="px-3 py-2 text-right">Amount</th><th className="px-3 py-2 text-right">Balance</th><th className="px-3 py-2 text-right">Late fee</th><th className="px-3 py-2 text-right">Pay now</th>
                </tr>
              </thead>
              <tbody>
                {visible.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-[#94a3b8]">No dues. Set up the class fee structure first (Fee Setup).</td></tr>}
                {visible.map((c) => {
                  const on = !!sel[c.id];
                  return (
                    <tr key={c.id} className={`border-t border-[#f1f5f9] ${c.balance <= 0 ? 'opacity-50' : ''} ${on ? 'bg-orange-50/50' : ''}`}>
                      <td className="px-3 py-2"><input type="checkbox" disabled={c.balance <= 0} checked={on} onChange={() => toggle(c)} /></td>
                      <td className="px-3 py-2">
                        <p className="font-medium text-[#1e293b]">{c.title}</p>
                        <p className="text-xs text-[#94a3b8] flex flex-wrap gap-x-2 items-center">
                          {multiSession && <span>{c.sessionLabel}</span>}
                          {c.discount > 0 && <span className="text-green-600">Concession {inr(c.discount)}</span>}
                          <StatusBadge status={c.status} />
                          {c.isManual && c.paid === 0 && perms.isAdmin && (
                            <button className="text-red-500" onClick={() => window.confirm('Remove this charge?') && delCharge.mutate(c.id)}><Trash2 size={12} /></button>
                          )}
                        </p>
                      </td>
                      <td className={`px-3 py-2 whitespace-nowrap ${c.isOverdue ? 'text-red-600 font-semibold' : ''}`}>{fmtDate(c.dueDate)}</td>
                      <td className="px-3 py-2 text-right">{inr(c.amount)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{inr(c.balance)}</td>
                      <td className="px-3 py-2 text-right text-amber-600">
                        {c.lateFee > 0 ? (
                          <div>{inr(c.lateFee)}
                            {on && perms.canConcede && (
                              <label className="block text-[10px] text-[#64748b]"><input type="checkbox" checked={sel[c.id].waive} onChange={(e) => setField(c.id, { waive: e.target.checked })} /> waive</label>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {on && <input type="number" min="0" step="0.01" className="w-24 rounded border border-[#e2e8f0] px-2 py-1 text-right text-sm" value={sel[c.id].amount} onChange={(e) => setField(c.id, { amount: e.target.value })} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:sticky lg:top-4 space-y-3">
          <h2 className="font-bold text-[#1e293b]">Payment</h2>
          <Field label="Payment mode">
            <select className={inputCls} value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>
              {(meta.settings.enabledModes || []).map((m) => <option key={m} value={m}>{MODE_LABEL[m] || m}</option>)}
            </select>
          </Field>
          {pay.mode !== 'cash' && (
            <Field label={needsRef ? 'Cheque / DD number *' : 'Transaction / reference no.'}>
              <input className={inputCls} value={pay.referenceNo} onChange={(e) => setPay({ ...pay, referenceNo: e.target.value })} />
            </Field>
          )}
          {needsRef && (
            <div className="grid grid-cols-2 gap-2">
              <Field label="Bank"><input className={inputCls} value={pay.bankName} onChange={(e) => setPay({ ...pay, bankName: e.target.value })} /></Field>
              <Field label="Cheque date"><input type="date" className={inputCls} value={pay.instrumentDate} onChange={(e) => setPay({ ...pay, instrumentDate: e.target.value })} /></Field>
            </div>
          )}
          {perms.canBackdate && (
            <Field label="Payment date" hint="Leave empty for today"><input type="date" max={today} className={inputCls} value={pay.paymentDate} onChange={(e) => setPay({ ...pay, paymentDate: e.target.value })} /></Field>
          )}
          <Field label="Remarks"><input className={inputCls} value={pay.remarks} onChange={(e) => setPay({ ...pay, remarks: e.target.value })} /></Field>

          <div className="border-t border-[#e2e8f0] pt-3 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-[#64748b]">Fees ({chosen.length})</span><span>{inr(feeTotal)}</span></div>
            <div className="flex justify-between"><span className="text-[#64748b]">Late fee</span><span>{inr(lateTotal)}</span></div>
            <div className="flex justify-between text-lg font-extrabold text-[#1e293b]"><span>Total</span><span>{inr(grand)}</span></div>
          </div>
          {err && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-3 py-2">{err}</div>}
          <Button className="w-full" size="lg" loading={collect.isPending} disabled={!chosen.length} onClick={submit}>Collect {grand > 0 ? inr(grand) : ''}</Button>
        </Card>
      </div>

      {receipts.length > 0 && (
        <Card padding={false}>
          <div className="p-4 border-b border-[#e2e8f0] font-bold text-[#1e293b]">Recent receipts</div>
          <div className="divide-y divide-[#f1f5f9]">
            {receipts.map((r) => (
              <div key={r.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
                <div>
                  <p className="font-semibold text-[#1e293b]">{r.receiptNo} {r.status === 'cancelled' && <StatusBadge status="cancelled" />}</p>
                  <p className="text-xs text-[#94a3b8]">{fmtDate(r.paymentDate)} · {MODE_LABEL[r.paymentMode] || r.paymentMode} · {r.collectedByName}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{inr(r.totalAmount)}</span>
                  <Button size="sm" variant="ghost" icon={Download} onClick={() => getPdf(r.id, false)} />
                  <Button size="sm" variant="ghost" icon={Printer} onClick={() => getPdf(r.id, true)} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!done} onClose={() => setDone(null)} title="Payment received" size="sm">
        {done && (
          <div className="space-y-4 text-center">
            <CheckCircle size={48} className="mx-auto text-green-500" />
            <div>
              <p className="text-3xl font-extrabold text-[#1e293b]">{inr(done.totalAmount)}</p>
              <p className="text-sm text-[#64748b] mt-1">Receipt {done.receiptNo}</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" icon={Printer} onClick={() => getPdf(done.id, true)}>Print</Button>
              <Button className="flex-1" variant="outline" icon={Download} onClick={() => getPdf(done.id, false)}>Download</Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => { setDone(null); navigate(`${base}/collect`); }}>Collect for another student</Button>
          </div>
        )}
      </Modal>

      <Modal open={modal === 'concession'} onClose={() => setModal(null)} title="Give concession" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-[#64748b]">Applies to the {chosen.length} selected fee(s). Enter 0 to remove an existing concession.</p>
          <Field label="Type">
            <select className={inputCls} value={cForm.type} onChange={(e) => setCForm({ ...cForm, type: e.target.value })}>
              <option value="amount">Flat amount (₹) per fee</option><option value="percent">Percent (%)</option>
            </select>
          </Field>
          <Field label="Value"><input type="number" min="0" className={inputCls} value={cForm.value} onChange={(e) => setCForm({ ...cForm, value: e.target.value })} /></Field>
          <Field label="Reason"><input className={inputCls} placeholder="Sibling / staff child / scholarship" value={cForm.reason} onChange={(e) => setCForm({ ...cForm, reason: e.target.value })} /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button className="w-full" loading={concession.isPending}
            onClick={() => concession.mutate({ chargeIds: chosen.map((c) => c.id), type: cForm.type, value: Number(cForm.value) || 0, reason: cForm.reason })}>Apply</Button>
        </div>
      </Modal>

      <Modal open={modal === 'charge'} onClose={() => setModal(null)} title="Add a charge" size="sm">
        <div className="space-y-3">
          <Field label="Fee head">
            <select className={inputCls} value={chForm.feeHeadId} onChange={(e) => setChForm({ ...chForm, feeHeadId: e.target.value })}>
              <option value="">Select...</option>{meta.heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </Field>
          <Field label="Description (optional)"><input className={inputCls} value={chForm.title} onChange={(e) => setChForm({ ...chForm, title: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Amount"><input type="number" min="0" className={inputCls} value={chForm.amount} onChange={(e) => setChForm({ ...chForm, amount: e.target.value })} /></Field>
            <Field label="Due date"><input type="date" className={inputCls} value={chForm.dueDate} onChange={(e) => setChForm({ ...chForm, dueDate: e.target.value })} /></Field>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button className="w-full" loading={addCharge.isPending} disabled={!chForm.feeHeadId || !chForm.amount || !chForm.dueDate}
            onClick={() => addCharge.mutate({ studentId, enrollmentId: enrollment.id, feeHeadId: chForm.feeHeadId, title: chForm.title || null, amount: Number(chForm.amount), dueDate: chForm.dueDate })}>Add charge</Button>
        </div>
      </Modal>
    </div>
  );
}

export default function FeeCollect() {
  const { studentId } = useParams();
  return studentId ? <Ledger key={studentId} studentId={studentId} /> : <StudentPicker />;
}