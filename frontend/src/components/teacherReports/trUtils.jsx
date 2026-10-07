export const pad = (n) => String(n).padStart(2, '0');
export const toYmd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const addDaysYmd = (s, n) => {
  const [y, m, d] = s.split('-').map(Number);
  return toYmd(new Date(y, m - 1, d + n));
};

export const PRESETS = [
  { value: 'today',     label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7',     label: 'Last 7 days' },
  { value: 'last30',    label: 'Last 30 days' },
  { value: 'month',     label: 'This month' },
  { value: 'custom',    label: 'Custom range' },
];

export function rangeForPreset(preset) {
  const today = toYmd(new Date());
  switch (preset) {
    case 'today': return { from: today, to: today };
    case 'yesterday': { const y = addDaysYmd(today, -1); return { from: y, to: y }; }
    case 'last30': return { from: addDaysYmd(today, -29), to: today };
    case 'month': return { from: `${today.slice(0, 8)}01`, to: today };
    default: return { from: addDaysYmd(today, -6), to: today };
  }
}

export const fmtPct = (v) => (v === null || v === undefined ? '—' : `${Number(v) % 1 ? Number(v).toFixed(1) : Number(v)}%`);

export const pctColor = (v) => (v === null || v === undefined ? '#94a3b8' : v >= 85 ? '#16a34a' : v >= 60 ? '#f59e0b' : '#dc2626');

export function fmtDateShort(ymd) {
  if (!ymd) return '—';
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export const fmtDateTime = (iso) => (iso
  ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  : '—');

export function timeAgo(iso) {
  if (!iso) return 'Never';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Colour + meaning of each character in an assignment's day string
export const CELL_META = {
  M: { label: 'Marked',                  cls: 'bg-green-500' },
  O: { label: 'Marked by someone else',  cls: 'bg-teal-500' },
  X: { label: 'Missing',                 cls: 'bg-red-500' },
  P: { label: 'Pending today',           cls: 'bg-amber-400' },
  E: { label: 'Extra (non-working day)', cls: 'bg-green-100 border border-green-500' },
  '-': { label: 'Not expected',          cls: 'bg-[#e2e8f0]' },
};

export const MARKS_STATUS = {
  complete:    { label: 'Complete',    variant: 'success' },
  partial:     { label: 'Partial',     variant: 'warning' },
  not_started: { label: 'Not started', variant: 'orange' },
  upcoming:    { label: 'Upcoming',    variant: 'info' },
};

export function MiniBar({ pct = 0, color }) {
  const w = Math.max(0, Math.min(100, pct || 0));
  return (
    <div className="w-full h-1.5 bg-[#e2e8f0] rounded-full overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${w}%`, background: color || pctColor(pct) }} />
    </div>
  );
}

export function downloadFromResponse(res, fallbackName) {
  const cd = res.headers['content-disposition'] || '';
  const match = /filename="?([^"]+)"?/.exec(cd);
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = (match && match[1]) || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}