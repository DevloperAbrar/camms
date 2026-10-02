import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Trash2, Plus, Save } from 'lucide-react';
import { getFeeSettings, updateFeeSettings, uploadFeeLogo, removeFeeLogo } from '../../api/fees.api';
import { errMsg, inputCls, Field, MODE_LABEL } from './feeUtils';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';

const KEYS = [
  'displayName', 'tagline', 'address', 'phone', 'email', 'website', 'headerFields', 'gstEnabled', 'gstin', 'panNumber',
  'bankName', 'accountName', 'accountNumber', 'ifscCode', 'bankBranch', 'upiId', 'showBankOnReceipt', 'receiptPrefix',
  'copiesPerReceipt', 'showBalanceOnReceipt', 'termsText', 'signatureLabel', 'enabledModes', 'lateFeeMode', 'lateFeeAmount',
  'lateFeeGraceDays', 'lateFeeMaxAmount', 'collectorCanConcede',
];
const ALL_MODES = ['cash', 'upi', 'card', 'cheque', 'bank_transfer', 'dd', 'other'];

function Section({ title, hint, children }) {
  return (
    <Card>
      <h2 className="font-bold text-[#1e293b]">{title}</h2>
      {hint && <p className="text-xs text-[#94a3b8] mb-3">{hint}</p>}
      <div className={`space-y-3 ${hint ? '' : 'mt-3'}`}>{children}</div>
    </Card>
  );
}

export default function FeeSettings() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const { data, isLoading } = useQuery({ queryKey: ['fee-settings'], queryFn: () => getFeeSettings().then((r) => r.data.data) });
  const [form, setForm] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (data) {
      const f = {};
      KEYS.forEach((k) => { f[k] = data[k] ?? (k === 'headerFields' || k === 'enabledModes' ? [] : ''); });
      setForm(f);
    }
  }, [data]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const afterSave = (m) => ({
    onSuccess: (r) => { qc.setQueryData(['fee-settings'], r.data.data); qc.invalidateQueries({ queryKey: ['fee-meta'] }); setMsg(m); setErr(''); setTimeout(() => setMsg(''), 3000); },
    onError: (e) => { setErr(errMsg(e)); setMsg(''); },
  });

  const save = useMutation({
    mutationFn: () => updateFeeSettings({
      ...form,
      copiesPerReceipt: Number(form.copiesPerReceipt) || 2,
      lateFeeAmount: Number(form.lateFeeAmount) || 0,
      lateFeeGraceDays: Number(form.lateFeeGraceDays) || 0,
      lateFeeMaxAmount: form.lateFeeMaxAmount === '' || form.lateFeeMaxAmount == null ? null : Number(form.lateFeeMaxAmount),
    }),
    ...afterSave('Settings saved'),
  });
  const upload = useMutation({ mutationFn: (file) => uploadFeeLogo(file), ...afterSave('Logo saved') });
  const remove = useMutation({ mutationFn: removeFeeLogo, ...afterSave('Logo removed') });

  if (isLoading || !form) return <div className="flex justify-center py-20"><Spinner size="lg" /></div>;

  const text = (k, label, props = {}) => (
    <Field label={label}><input className={inputCls} value={form[k] ?? ''} onChange={(e) => set(k, e.target.value)} {...props} /></Field>
  );
  const toggle = (k, label, hint) => (
    <label className="flex items-start gap-2 text-sm text-[#374151]">
      <input type="checkbox" className="mt-1" checked={!!form[k]} onChange={(e) => set(k, e.target.checked)} />
      <span>{label}{hint && <span className="block text-xs text-[#94a3b8]">{hint}</span>}</span>
    </label>
  );
  const setHF = (i, patch) => set('headerFields', form.headerFields.map((h, idx) => (idx === i ? { ...h, ...patch } : h)));

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Receipt Settings</h1>
          <p className="text-sm text-[#64748b] mt-1">Everything printed on fee receipts. Past receipts keep the details they were issued with.</p>
        </div>
        <Button icon={Save} size="lg" loading={save.isPending} onClick={() => save.mutate()}>Save settings</Button>
      </div>
      {msg && <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-2">{msg}</div>}
      {err && <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-lg px-4 py-2">{err}</div>}

      <Section title="School logo" hint="Upload once. PNG or JPG, under 1 MB. It prints on every receipt.">
        <div className="flex items-center gap-4">
          <div className="w-24 h-24 rounded-xl border border-dashed border-[#cbd5e1] bg-[#f8fafc] flex items-center justify-center overflow-hidden">
            {data.logoDataUrl ? <img src={data.logoDataUrl} alt="logo" className="max-w-full max-h-full object-contain" /> : <span className="text-xs text-[#94a3b8]">No logo</span>}
          </div>
          <div className="flex gap-2">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => { if (e.target.files[0]) upload.mutate(e.target.files[0]); e.target.value = ''; }} />
            <Button variant="outline" icon={Upload} loading={upload.isPending} onClick={() => fileRef.current.click()}>{data.hasLogo ? 'Replace' : 'Upload logo'}</Button>
            {data.hasLogo && <Button variant="ghost" icon={Trash2} onClick={() => remove.mutate()}>Remove</Button>}
          </div>
        </div>
      </Section>

      <Section title="Receipt header">
        <div className="grid sm:grid-cols-2 gap-3">
          {text('displayName', 'School name on receipt')}
          {text('tagline', 'Tagline (optional)')}
        </div>
        {text('address', 'Address')}
        <div className="grid sm:grid-cols-3 gap-3">
          {text('phone', 'Phone')}{text('email', 'Email', { type: 'email' })}{text('website', 'Website')}
        </div>
        <div>
          <p className="text-sm font-medium text-[#374151] mb-1">Extra header fields</p>
          <p className="text-xs text-[#94a3b8] mb-2">Affiliation no., UDISE code, school code, registration no. etc.</p>
          {form.headerFields.map((h, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input className={inputCls} placeholder="Label (UDISE)" value={h.label} onChange={(e) => setHF(i, { label: e.target.value })} />
              <input className={inputCls} placeholder="Value" value={h.value} onChange={(e) => setHF(i, { value: e.target.value })} />
              <Button variant="ghost" icon={Trash2} onClick={() => set('headerFields', form.headerFields.filter((_, idx) => idx !== i))} />
            </div>
          ))}
          {form.headerFields.length < 8 && <Button size="sm" variant="outline" icon={Plus} onClick={() => set('headerFields', [...form.headerFields, { label: '', value: '' }])}>Add field</Button>}
        </div>
      </Section>

      <Section title="Tax (optional)" hint="Most school fees are GST exempt. Enable only if your school charges GST on some fees; set the rate per fee head in Fee Setup.">
        {toggle('gstEnabled', 'Show GSTIN and GST amount on receipts')}
        <div className="grid sm:grid-cols-2 gap-3">
          {text('gstin', 'GSTIN', { placeholder: '23ABCDE1234F1Z5', disabled: !form.gstEnabled })}
          {text('panNumber', 'PAN (optional)')}
        </div>
      </Section>

      <Section title="Bank details" hint="Used for bank-transfer instructions printed on the receipt.">
        <div className="grid sm:grid-cols-2 gap-3">
          {text('bankName', 'Bank name')}{text('accountName', 'Account holder')}
          {text('accountNumber', 'Account number')}{text('ifscCode', 'IFSC')}
          {text('bankBranch', 'Branch')}{text('upiId', 'UPI ID')}
        </div>
        {toggle('showBankOnReceipt', 'Print bank / UPI details on the receipt')}
      </Section>

      <Section title="Receipt format">
        <div className="grid sm:grid-cols-3 gap-3">
          {text('receiptPrefix', 'Receipt no. prefix', { maxLength: 10 })}
          <Field label="Copies per receipt">
            <select className={inputCls} value={form.copiesPerReceipt} onChange={(e) => set('copiesPerReceipt', e.target.value)}>
              <option value={2}>2 (Parent + Office)</option><option value={1}>1 copy</option>
            </select>
          </Field>
          {text('signatureLabel', 'Signature label')}
        </div>
        <Field label="Terms / footer note"><textarea rows={3} className={inputCls} value={form.termsText ?? ''} onChange={(e) => set('termsText', e.target.value)} placeholder="Fees once paid are non-refundable..." /></Field>
        {toggle('showBalanceOnReceipt', 'Show remaining balance on the receipt')}
        <p className="text-xs text-[#94a3b8]">Receipt numbers look like <b>{form.receiptPrefix || 'RCP'}/2026-27/00001</b> and restart every session.</p>
      </Section>

      <Section title="Payment modes accepted">
        <div className="flex flex-wrap gap-4">
          {ALL_MODES.map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.enabledModes.includes(m)}
                onChange={(e) => set('enabledModes', e.target.checked ? [...form.enabledModes, m] : form.enabledModes.filter((x) => x !== m))} />
              {MODE_LABEL[m]}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Late fee" hint="Applied automatically on overdue installments and shown to the collector before payment.">
        <div className="grid sm:grid-cols-4 gap-3">
          <Field label="Type">
            <select className={inputCls} value={form.lateFeeMode} onChange={(e) => set('lateFeeMode', e.target.value)}>
              <option value="none">No late fee</option><option value="flat">Flat per installment</option><option value="per_day">Per day late</option>
            </select>
          </Field>
          {text('lateFeeAmount', form.lateFeeMode === 'per_day' ? 'Amount per day (₹)' : 'Amount (₹)', { type: 'number', min: 0, disabled: form.lateFeeMode === 'none' })}
          {text('lateFeeGraceDays', 'Grace days', { type: 'number', min: 0, disabled: form.lateFeeMode === 'none' })}
          {text('lateFeeMaxAmount', 'Max per installment (₹)', { type: 'number', min: 0, disabled: form.lateFeeMode === 'none', placeholder: 'No cap' })}
        </div>
      </Section>

      <Section title="Fee collector permissions">
        {toggle('collectorCanConcede', 'Allow fee collectors to give concessions and waive late fees', 'Back-dating receipts and cancelling receipts always stay admin-only.')}
      </Section>

      <div className="flex justify-end"><Button icon={Save} size="lg" loading={save.isPending} onClick={() => save.mutate()}>Save settings</Button></div>
    </div>
  );
}