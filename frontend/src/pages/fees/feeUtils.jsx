import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'react-router-dom';
import { getFeeMeta } from '../../api/fees.api';
import Badge from '../../components/ui/Badge';

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const fmtDate = (s) => {
  if (!s) return '—';
  const [y, m, d] = String(s).slice(0, 10).split('-');
  return `${d}-${m}-${y}`;
};

export const errMsg = (e, fallback = 'Something went wrong') => e?.response?.data?.message || fallback;

export const MODE_LABEL = {
  cash: 'Cash', upi: 'UPI', card: 'Card', cheque: 'Cheque', bank_transfer: 'Bank Transfer', dd: 'Demand Draft', other: 'Other',
};

export const inputCls =
  'w-full rounded-lg border border-[#e2e8f0] bg-white px-3 py-2 text-sm text-[#1e293b] placeholder-[#94a3b8] hover:border-[#cbd5e1] focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent disabled:bg-[#f8fafc]';
export const selectCls = inputCls;

export function Field({ label, hint, children, className = '' }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="text-sm font-medium text-[#374151]">{label}</label>}
      {children}
      {hint && <p className="text-xs text-[#94a3b8]">{hint}</p>}
    </div>
  );
}

// '/admin/fees' for the school admin, '/fees' for a fee collector
export function useFeeBase() {
  const { pathname } = useLocation();
  return pathname.startsWith('/admin') ? '/admin/fees' : '/fees';
}

export function useFeeMeta() {
  return useQuery({
    queryKey: ['fee-meta'],
    queryFn: () => getFeeMeta().then((r) => r.data.data),
    staleTime: 5 * 60 * 1000,
  });
}

export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export function printBlob(blob) {
  const url = URL.createObjectURL(blob);
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.src = url;
  f.onload = () => {
    try { f.contentWindow.focus(); f.contentWindow.print(); } catch { window.open(url, '_blank'); }
  };
  document.body.appendChild(f);
  setTimeout(() => { f.remove(); URL.revokeObjectURL(url); }, 120000);
}

const STATUS = {
  paid: ['Paid', 'success'], partial: ['Partial', 'warning'], pending: ['Pending', 'default'],
  overdue: ['Due', 'danger'], upcoming: ['Upcoming', 'info'], no_fees: ['No fees set', 'default'],
  active: ['Active', 'success'], inactive: ['Inactive', 'default'], cancelled: ['Cancelled', 'danger'],
};
export function StatusBadge({ status }) {
  const [label, variant] = STATUS[status] || [status, 'default'];
  return <Badge label={label} variant={variant} />;
}