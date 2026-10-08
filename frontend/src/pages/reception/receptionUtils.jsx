import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getReceptionMeta } from '../../api/reception.api';
import { inputCls, selectCls, Field, errMsg, saveBlob } from '../fees/feeUtils';
import Badge from '../../components/ui/Badge';

export { inputCls, selectCls, Field, errMsg, saveBlob };

export const STAGE_LABEL = {
  new_lead: 'New', follow_up: 'Follow-up', interested: 'Interested',
  test_scheduled: 'Test scheduled', interview: 'Interview', admitted: 'Admitted', lost: 'Lost',
};
export const STAGE_VARIANT = {
  new_lead: 'info', follow_up: 'warning', interested: 'orange',
  test_scheduled: 'navy', interview: 'navy', admitted: 'success', lost: 'danger',
};
export const SOURCE_LABEL = {
  walk_in: 'Walk-in', phone_call: 'Phone call', website: 'Website', referral: 'Referral', social_media: 'Social media',
  newspaper: 'Newspaper', hoarding: 'Hoarding / banner', school_event: 'School event', other: 'Other',
};
export const PURPOSE_LABEL = {
  admission_enquiry: 'Admission enquiry', meet_teacher: 'Meet teacher', meet_principal: 'Meet principal',
  fee_payment: 'Fee payment', collect_student: 'Collect student', parent_meeting: 'Parent meeting',
  vendor: 'Vendor / delivery', official: 'Official visit', interview: 'Interview', other: 'Other',
};
export const KIND_LABEL = {
  call: 'Call', whatsapp: 'WhatsApp', sms: 'SMS', email: 'Email', visit: 'Visit', note: 'Note',
  created: 'Created', stage_change: 'Stage change', converted: 'Admitted',
};
export const ID_TYPE_LABEL = {
  aadhaar: 'Aadhaar', driving_licence: 'Driving licence', voter_id: 'Voter ID', pan: 'PAN',
  passport: 'Passport', school_id: 'School / office ID', other: 'Other',
};
export const PRIORITY_VARIANT = { low: 'default', medium: 'info', high: 'danger' };
export const LOST_REASONS = [
  'Fees too high', 'Chose another school', 'Location / distance', 'Seat not available',
  'Not interested anymore', 'No response', 'Other',
];
export const CLOSED = ['admitted', 'lost'];

// '/admin/reception' for the school admin, '/reception' for the receptionist
export const useReceptionBase = () => (useLocation().pathname.startsWith('/admin') ? '/admin/reception' : '/reception');

export function useReceptionMeta() {
  return useQuery({
    queryKey: ['reception-meta'],
    queryFn: () => getReceptionMeta().then((r) => r.data.data),
    staleTime: 2 * 60 * 1000,
  });
}

export const StageBadge = ({ stage }) => <Badge label={STAGE_LABEL[stage] || stage} variant={STAGE_VARIANT[stage] || 'default'} />;

export const fmtDate = (s) => {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};

export const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export const addDays = (str, n) => {
  const d = new Date(`${str}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// wa.me click-to-chat: free, opens WhatsApp with the parent's number (no API needed)
export const waLink = (phone, text) => `https://wa.me/91${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

export function duration(fromIso, toIso) {
  const mins = Math.max(0, Math.round(((toIso ? new Date(toIso) : new Date()) - new Date(fromIso)) / 60000));
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  return mins >= 1440 ? `${Math.floor(h / 24)}d ${h % 24}h` : `${h}h ${mins % 60}m`;
}

// Renders the school's custom fields. values: { [key]: value }, onChange(key, value)
export function DynamicFields({ fields = [], values = {}, onChange }) {
  if (!fields.length) return null;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map((f) => {
        const v = values[f.key];
        const label = `${f.label}${f.isRequired ? ' *' : ''}`;

        if (f.type === 'checkbox') {
          return (
            <label key={f.id} className="flex items-center gap-2 text-sm text-[#374151] sm:pt-6">
              <input type="checkbox" checked={!!v} onChange={(e) => onChange(f.key, e.target.checked)} />
              {label}
            </label>
          );
        }
        if (f.type === 'select') {
          return (
            <Field key={f.id} label={label}>
              <select className={selectCls} value={v ?? ''} onChange={(e) => onChange(f.key, e.target.value)}>
                <option value="">Select…</option>
                {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </Field>
          );
        }
        if (f.type === 'textarea') {
          return (
            <Field key={f.id} label={label} className="sm:col-span-2">
              <textarea rows={2} className={inputCls} value={v ?? ''} onChange={(e) => onChange(f.key, e.target.value)} />
            </Field>
          );
        }
        return (
          <Field key={f.id} label={label}>
            <input
              type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
              className={inputCls}
              value={v ?? ''}
              onChange={(e) => onChange(f.key, e.target.value)}
            />
          </Field>
        );
      })}
    </div>
  );
}