import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Printer, FileText, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { getMyChildren, getParentFees, downloadParentReceipt, downloadParentStatement } from '../../api/parent.api';
import { inr, fmtDate, errMsg, MODE_LABEL, saveBlob, printBlob, StatusBadge } from '../fees/feeUtils';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';

function Stat({ label, value, tone = 'text-[#1e293b]' }) {
  return (
    <Card>
      <p className="text-xs font-medium text-[#64748b] uppercase tracking-wide">{label}</p>
      <p className={`text-xl sm:text-2xl font-extrabold mt-1 ${tone}`}>{value}</p>
    </Card>
  );
}

function ReceiptRow({ r, studentId }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const getPdf = async (print) => {
    setBusy(true);
    try {
      const res = await downloadParentReceipt(r.id, { studentId });
      if (print) printBlob(res.data);
      else saveBlob(res.data, `receipt-${r.receiptNo.replace(/[^A-Za-z0-9-]/g, '-')}.pdf`);
    } catch (e) {
      window.alert(errMsg(e, 'Could not download the receipt'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button className="text-left min-w-0" onClick={() => setOpen((o) => !o)}>
          <p className="font-semibold text-[#1e293b] text-sm flex items-center gap-2 flex-wrap">
            {r.receiptNo} {r.status === 'cancelled' && <StatusBadge status="cancelled" />}
            {open ? <ChevronUp size={14} className="text-[#94a3b8]" /> : <ChevronDown size={14} className="text-[#94a3b8]" />}
          </p>
          <p className="text-xs text-[#94a3b8]">{fmtDate(r.paymentDate)} · {MODE_LABEL[r.paymentMode] || r.paymentMode}{r.referenceNo ? ` · Ref ${r.referenceNo}` : ''}</p>
        </button>
        <div className="flex items-center gap-1">
          <span className={`font-bold text-sm mr-2 ${r.status === 'cancelled' ? 'line-through text-[#94a3b8]' : 'text-[#1e293b]'}`}>{inr(r.totalAmount)}</span>
          <Button size="sm" variant="ghost" icon={Download} disabled={busy} onClick={() => getPdf(false)} />
          <Button size="sm" variant="ghost" icon={Printer} disabled={busy} onClick={() => getPdf(true)} />
        </div>
      </div>
      {open && (
        <div className="mt-3 rounded-lg bg-[#f8fafc] border border-[#e2e8f0] p-3 text-sm space-y-1">
          {(r.items || []).map((i) => (
            <div key={i.id} className="flex justify-between gap-3"><span className="text-[#475569]">{i.title}</span><span>{inr(i.amount)}</span></div>
          ))}
          {r.lateFeeTotal > 0 && <div className="flex justify-between"><span className="text-[#475569]">Late fee</span><span>{inr(r.lateFeeTotal)}</span></div>}
          <div className="flex justify-between font-bold border-t border-[#e2e8f0] pt-1 mt-1"><span>Total paid</span><span>{inr(r.totalAmount)}</span></div>
          <p className="text-xs text-[#94a3b8] pt-1">Received by {r.collectedByName}{r.remarks ? ` · ${r.remarks}` : ''}</p>
          {r.status === 'cancelled' && <p className="text-xs text-red-600">Cancelled{r.cancelReason ? `: ${r.cancelReason}` : ''}</p>}
        </div>
      )}
    </div>
  );
}

export default function ParentFees() {
  const [childId, setChildId] = useState(null);
  const [showPaid, setShowPaid] = useState(false);

  const { data: children = [], isLoading: loadingKids } = useQuery({
    queryKey: ['my-children'],
    queryFn: () => getMyChildren().then((r) => r.data.data ?? []),
  });
  const activeId = childId || children[0]?.id;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['parent-fees', activeId],
    queryFn: () => getParentFees({ studentId: activeId }).then((r) => r.data.data),
    enabled: !!activeId,
  });

  const statement = async () => {
    try {
      const res = await downloadParentStatement({ studentId: activeId, sessionId: data?.enrollment?.sessionId });
      saveBlob(res.data, `fee-statement-${data.student.enrollmentNumber}.pdf`);
    } catch (e) {
      window.alert(errMsg(e, 'Could not download the statement'));
    }
  };

  if (loadingKids) return <div className="flex justify-center h-64 items-center"><Spinner size="lg" /></div>;
  if (children.length === 0) return <p className="text-center text-sm text-[#94a3b8] py-16">No children linked to your account. Contact school admin.</p>;

  const multiSession = data ? new Set(data.charges.map((c) => c.sessionId)).size > 1 : false;
  const visible = data ? data.charges.filter((c) => showPaid || c.balance > 0) : [];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Fees</h1>
        <p className="text-sm text-[#64748b] mt-1">Fee status, receipts and payment history.</p>
      </div>

      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <button key={c.id} onClick={() => setChildId(c.id)}
              className={`px-3 sm:px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${activeId === c.id ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b] hover:border-[#f97316]'}`}>
              {c.name}
            </button>
          ))}
        </div>
      )}

      {isLoading && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
      {isError && <p className="text-sm text-red-500 text-center py-10">{errMsg(error, 'Could not load fee details')}</p>}

      {data && (
        <>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-bold text-[#1e293b] text-lg">{data.student.name}</p>
                <p className="text-xs text-[#64748b]">
                  {data.student.enrollmentNumber}{data.enrollment ? ` · ${data.enrollment.className} - ${data.enrollment.sectionName} · ${data.enrollment.sessionLabel}` : ''}
                </p>
                <p className="text-xs text-[#94a3b8] mt-0.5">{data.school.name}</p>
              </div>
              <Button size="sm" variant="outline" icon={FileText} onClick={statement}>Fee statement (PDF)</Button>
            </div>
          </Card>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Stat label="Due now" value={inr(data.totals.dueNow)} tone={data.totals.dueNow > 0 ? 'text-red-600' : 'text-green-700'} />
            <Stat label="Late fee" value={inr(data.totals.lateFee)} tone="text-amber-600" />
            <Stat label="Upcoming" value={inr(data.totals.upcoming)} />
            <Stat label="Total paid" value={inr(data.totals.paid)} tone="text-green-700" />
          </div>

          {data.totals.previousDue > 0 && (
            <div className="text-sm bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2">Previous year dues: {inr(data.totals.previousDue)}</div>
          )}
          {data.totals.dueNow > 0 && (
            <div className="flex gap-2 text-sm bg-blue-50 border border-blue-200 text-blue-700 rounded-lg px-3 py-2">
              <Info size={16} className="shrink-0 mt-0.5" /> Please pay the pending fees at the school fee counter. Your receipt will appear here after payment.
            </div>
          )}

          <Card padding={false}>
            <div className="p-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0]">
              <h2 className="font-bold text-[#1e293b]">Fee details</h2>
              <label className="text-xs text-[#64748b] flex items-center gap-1">
                <input type="checkbox" checked={showPaid} onChange={(e) => setShowPaid(e.target.checked)} /> Show paid
              </label>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="bg-[#f8fafc] text-xs text-[#64748b] uppercase">
                    <th className="px-4 py-2.5 text-left">Particulars</th><th className="px-4 py-2.5 text-left">Due date</th>
                    <th className="px-4 py-2.5 text-right">Amount</th><th className="px-4 py-2.5 text-right">Paid</th>
                    <th className="px-4 py-2.5 text-right">Balance</th><th className="px-4 py-2.5 text-right">Late fee</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-[#94a3b8]">{data.charges.length ? 'No pending fees' : 'Fee details are not set up yet'}</td></tr>}
                  {visible.map((c) => (
                    <tr key={c.id} className="border-t border-[#f1f5f9]">
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-[#1e293b]">{c.title}</p>
                        <p className="text-xs text-[#94a3b8] flex flex-wrap gap-x-2 items-center">
                          {multiSession && <span>{c.sessionLabel}</span>}
                          {c.discount > 0 && <span className="text-green-600">Concession {inr(c.discount)}</span>}
                          <StatusBadge status={c.status} />
                        </p>
                      </td>
                      <td className={`px-4 py-2.5 whitespace-nowrap ${c.isOverdue ? 'text-red-600 font-semibold' : ''}`}>{fmtDate(c.dueDate)}</td>
                      <td className="px-4 py-2.5 text-right">{inr(c.amount)}</td>
                      <td className="px-4 py-2.5 text-right text-green-700">{inr(c.paid)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{inr(c.balance)}</td>
                      <td className="px-4 py-2.5 text-right text-amber-600">{c.lateFee > 0 ? inr(c.lateFee) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card padding={false}>
            <div className="p-4 border-b border-[#e2e8f0] font-bold text-[#1e293b]">Receipts</div>
            {data.receipts.length === 0 ? (
              <p className="p-8 text-center text-sm text-[#94a3b8]">No payments yet</p>
            ) : (
              <div className="divide-y divide-[#f1f5f9]">
                {data.receipts.map((r) => <ReceiptRow key={r.id} r={r} studentId={activeId} />)}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}