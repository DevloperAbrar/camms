import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Copy, RefreshCw } from 'lucide-react';
import {
  getFeeHeads, createFeeHead, updateFeeHead, deleteFeeHead,
  getFeeStructure, createFeeStructure, updateFeeStructure, deleteFeeStructure, copyFeeStructure, generateFeeDues,
} from '../../api/fees.api';
import { inr, fmtDate, errMsg, inputCls, Field, useFeeMeta } from './feeUtils';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';

const FREQ = { one_time: 'One time', monthly: 'Monthly', quarterly: 'Quarterly', half_yearly: 'Half yearly', yearly: 'Yearly' };
const EMPTY_HEAD = { name: '', code: '', gstRate: '0', description: '' };
const EMPTY_ITEM = { classId: '', feeHeadId: '', amount: '', frequency: 'monthly', installments: '12', firstDueDate: '', appliesTo: 'all' };

export default function FeeSetup() {
  const qc = useQueryClient();
  const { data: meta } = useFeeMeta();
  const [tab, setTab] = useState('structure');
  const [sessionId, setSessionId] = useState('');
  const [classFilter, setClassFilter] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [headModal, setHeadModal] = useState(null); // {id?} | {}
  const [headForm, setHeadForm] = useState(EMPTY_HEAD);
  const [itemModal, setItemModal] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [copyModal, setCopyModal] = useState(false);
  const [copyFrom, setCopyFrom] = useState('');

  const activeSessionId = sessionId || meta?.activeSessionId || '';
  const classes = (meta?.classes || []).filter((c) => c.sessionId === activeSessionId);

  const { data: heads, isLoading: loadingHeads } = useQuery({ queryKey: ['fee-heads'], queryFn: () => getFeeHeads().then((r) => r.data.data) });
  const { data: items, isLoading: loadingItems } = useQuery({
    queryKey: ['fee-structure', activeSessionId, classFilter],
    queryFn: () => getFeeStructure({ sessionId: activeSessionId, classId: classFilter || undefined }).then((r) => r.data.data),
    enabled: !!activeSessionId,
  });

  const refreshAll = () => ['fee-heads', 'fee-structure', 'fee-meta', 'fee-students', 'fee-dashboard'].forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  const ok = (m) => ({ onSuccess: (r) => { setMsg(m || r?.data?.message || 'Saved'); setErr(''); setHeadModal(null); setItemModal(null); setCopyModal(false); refreshAll(); }, onError: (e) => setErr(errMsg(e)) });

  const saveHead = useMutation({
    mutationFn: () => {
      const body = { name: headForm.name, code: headForm.code || null, description: headForm.description || null, gstRate: Number(headForm.gstRate) || 0 };
      return headModal?.id ? updateFeeHead(headModal.id, body) : createFeeHead(body);
    },
    ...ok(),
  });
  const toggleHead = useMutation({ mutationFn: (h) => updateFeeHead(h.id, { isActive: !h.isActive }), ...ok() });
  const removeHead = useMutation({ mutationFn: (h) => deleteFeeHead(h.id), ...ok() });

  const saveItem = useMutation({
    mutationFn: () => {
      if (itemModal?.id) return updateFeeStructure(itemModal.id, itemModal.locked ? { amount: Number(itemForm.amount) } : {
        amount: Number(itemForm.amount), frequency: itemForm.frequency,
        installments: itemForm.frequency === 'one_time' ? 1 : Number(itemForm.installments) || 1, firstDueDate: itemForm.firstDueDate, appliesTo: itemForm.appliesTo,
      });
      return createFeeStructure({
        sessionId: activeSessionId, classId: itemForm.classId, feeHeadId: itemForm.feeHeadId, amount: Number(itemForm.amount),
        frequency: itemForm.frequency, installments: itemForm.frequency === 'one_time' ? 1 : Number(itemForm.installments) || 1,
        firstDueDate: itemForm.firstDueDate, appliesTo: itemForm.appliesTo,
      });
    },
    ...ok(),
  });
  const removeItem = useMutation({ mutationFn: (i) => deleteFeeStructure(i.id), ...ok() });
  const copyMut = useMutation({ mutationFn: () => copyFeeStructure({ fromSessionId: copyFrom, toSessionId: activeSessionId }), ...ok() });
  const genMut = useMutation({ mutationFn: () => generateFeeDues({ sessionId: activeSessionId }), ...ok() });

  const openHead = (h) => { setErr(''); setHeadForm(h ? { name: h.name, code: h.code || '', gstRate: String(h.gstRate), description: h.description || '' } : EMPTY_HEAD); setHeadModal(h || {}); };
  const openItem = (i) => {
    setErr('');
    setItemForm(i ? { classId: i.classId, feeHeadId: i.feeHeadId, amount: String(i.amount), frequency: i.frequency, installments: String(i.installments), firstDueDate: i.firstDueDate, appliesTo: i.appliesTo } : EMPTY_ITEM);
    setItemModal(i ? { id: i.id, locked: i.chargeCount > 0 } : {});
  };

  const headCols = [
    { key: 'name', label: 'Fee head', render: (h) => <span className="font-semibold text-[#1e293b]">{h.name}</span> },
    { key: 'code', label: 'Code' },
    { key: 'gst', label: 'GST', render: (h) => `${h.gstRate}%` },
    { key: 'status', label: 'Status', render: (h) => <Badge label={h.isActive ? 'Active' : 'Inactive'} variant={h.isActive ? 'success' : 'default'} /> },
    {
      key: 'act', label: '', render: (h) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openHead(h)} />
          <Button size="sm" variant="ghost" onClick={() => toggleHead.mutate(h)}>{h.isActive ? 'Deactivate' : 'Activate'}</Button>
          {!h.inUse && <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm('Delete this fee head?') && removeHead.mutate(h)} />}
        </div>
      ),
    },
  ];

  const itemCols = [
    { key: 'className', label: 'Class' },
    { key: 'headName', label: 'Fee' },
    { key: 'amount', label: 'Amount', render: (i) => inr(i.amount) },
    { key: 'freq', label: 'Frequency', render: (i) => `${FREQ[i.frequency]}${i.frequency !== 'one_time' ? ` × ${i.installments}` : ''}` },
    { key: 'first', label: 'First due', render: (i) => fmtDate(i.firstDueDate) },
    { key: 'ap', label: 'Applies to', render: (i) => ({ all: 'All students', new: 'New students', old: 'Old students' }[i.appliesTo]) },
    { key: 'tot', label: 'Yearly total', render: (i) => <b>{inr(i.yearlyTotal)}</b> },
    {
      key: 'act', label: '', render: (i) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openItem(i)} />
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm('Remove this fee from the class?') && removeItem.mutate(i)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Fee Setup</h1>
        <p className="text-sm text-[#64748b] mt-1">Define fee heads, then set what each class pays</p>
      </div>
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">{msg}</div>}
      {err && !headModal && !itemModal && !copyModal && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-2">{err}</div>}

      <div className="flex gap-2">
        {[['structure', 'Class fee structure'], ['heads', 'Fee heads']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${tab === k ? 'bg-[#1e293b] text-white' : 'bg-white border border-[#e2e8f0] text-[#64748b]'}`}>{l}</button>
        ))}
      </div>

      {tab === 'heads' && (
        <Card padding={false}>
          <div className="p-4 flex justify-between items-center border-b border-[#e2e8f0]">
            <p className="text-sm text-[#64748b]">e.g. Tuition, Transport, Admission, Lab, Exam, Uniform</p>
            <Button size="sm" icon={Plus} onClick={() => openHead(null)}>Add fee head</Button>
          </div>
          <div className="p-4"><Table columns={headCols} data={heads || []} loading={loadingHeads} emptyMessage="No fee heads yet. Add Tuition Fee to begin." /></div>
        </Card>
      )}

      {tab === 'structure' && (
        <Card padding={false}>
          <div className="p-4 flex flex-wrap gap-3 items-center justify-between border-b border-[#e2e8f0]">
            <div className="flex gap-3">
              <select className={`${inputCls} !w-auto`} value={activeSessionId} onChange={(e) => { setSessionId(e.target.value); setClassFilter(''); }}>
                {(meta?.sessions || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select className={`${inputCls} !w-auto`} value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
                <option value="">All classes</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" icon={RefreshCw} loading={genMut.isPending} onClick={() => genMut.mutate()}>Generate dues</Button>
              <Button size="sm" variant="outline" icon={Copy} onClick={() => { setErr(''); setCopyModal(true); }}>Copy from session</Button>
              <Button size="sm" icon={Plus} onClick={() => openItem(null)}>Add fee to class</Button>
            </div>
          </div>
          <div className="p-4"><Table columns={itemCols} data={items || []} loading={loadingItems} emptyMessage="No fees set for this session yet" /></div>
        </Card>
      )}

      <Modal open={!!headModal} onClose={() => setHeadModal(null)} title={headModal?.id ? 'Edit fee head' : 'Add fee head'} size="sm">
        <div className="space-y-3">
          <Field label="Name"><input className={inputCls} value={headForm.name} onChange={(e) => setHeadForm({ ...headForm, name: e.target.value })} placeholder="Tuition Fee" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code"><input className={inputCls} value={headForm.code} onChange={(e) => setHeadForm({ ...headForm, code: e.target.value })} /></Field>
            <Field label="GST %" hint="0 for exempt (most school fees)"><input type="number" min="0" max="100" className={inputCls} value={headForm.gstRate} onChange={(e) => setHeadForm({ ...headForm, gstRate: e.target.value })} /></Field>
          </div>
          <Field label="Description"><input className={inputCls} value={headForm.description} onChange={(e) => setHeadForm({ ...headForm, description: e.target.value })} /></Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button className="w-full" loading={saveHead.isPending} disabled={headForm.name.trim().length < 2} onClick={() => saveHead.mutate()}>Save</Button>
        </div>
      </Modal>

      <Modal open={!!itemModal} onClose={() => setItemModal(null)} title={itemModal?.id ? 'Edit class fee' : 'Add fee to class'}>
        <div className="space-y-3">
          {itemModal?.locked && <p className="text-xs bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-3 py-2">Dues are already generated, so only the amount can change. Unpaid dues will take the new amount.</p>}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Class">
              <select className={inputCls} disabled={!!itemModal?.id} value={itemForm.classId} onChange={(e) => setItemForm({ ...itemForm, classId: e.target.value })}>
                <option value="">Select...</option>{classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Fee head">
              <select className={inputCls} disabled={!!itemModal?.id} value={itemForm.feeHeadId} onChange={(e) => setItemForm({ ...itemForm, feeHeadId: e.target.value })}>
                <option value="">Select...</option>{(heads || []).filter((h) => h.isActive).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount per installment (₹)"><input type="number" min="0" className={inputCls} value={itemForm.amount} onChange={(e) => setItemForm({ ...itemForm, amount: e.target.value })} /></Field>
            <Field label="Applies to">
              <select className={inputCls} disabled={itemModal?.locked} value={itemForm.appliesTo} onChange={(e) => setItemForm({ ...itemForm, appliesTo: e.target.value })}>
                <option value="all">All students</option><option value="new">New students only</option><option value="old">Old students only</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Frequency">
              <select className={inputCls} disabled={itemModal?.locked} value={itemForm.frequency}
                onChange={(e) => setItemForm({ ...itemForm, frequency: e.target.value, installments: { monthly: '12', quarterly: '4', half_yearly: '2', yearly: '1', one_time: '1' }[e.target.value] })}>
                {Object.entries(FREQ).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Installments"><input type="number" min="1" max="24" className={inputCls} disabled={itemModal?.locked || itemForm.frequency === 'one_time'} value={itemForm.installments} onChange={(e) => setItemForm({ ...itemForm, installments: e.target.value })} /></Field>
            <Field label="First due date"><input type="date" className={inputCls} disabled={itemModal?.locked} value={itemForm.firstDueDate} onChange={(e) => setItemForm({ ...itemForm, firstDueDate: e.target.value })} /></Field>
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button className="w-full" loading={saveItem.isPending}
            disabled={itemForm.amount === '' || (!itemModal?.id && (!itemForm.classId || !itemForm.feeHeadId)) || !itemForm.firstDueDate}
            onClick={() => saveItem.mutate()}>Save</Button>
        </div>
      </Modal>

      <Modal open={copyModal} onClose={() => setCopyModal(false)} title="Copy fee structure" size="sm">
        <div className="space-y-3">
          <p className="text-sm text-[#64748b]">Copy every class fee from another session into <b>{meta?.sessions?.find((s) => s.id === activeSessionId)?.label}</b>. Classes are matched by name; due dates shift forward by the gap between the sessions.</p>
          <Field label="Copy from">
            <select className={inputCls} value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
              <option value="">Select session...</option>{(meta?.sessions || []).filter((s) => s.id !== activeSessionId).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button className="w-full" loading={copyMut.isPending} disabled={!copyFrom} onClick={() => copyMut.mutate()}>Copy</Button>
        </div>
      </Modal>
    </div>
  );
}