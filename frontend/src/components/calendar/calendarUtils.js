export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const KIND_LABEL = { holiday: 'Holiday', exam: 'Exam', event: 'Event', working_day: 'Working day' };

export const pad = (n) => String(n).padStart(2, '0');

export const parseYmd = (s) => {
  const [y, m, d] = s.slice(0, 10).split('-').map(Number);
  return { y, m, d };
};

export const makeYmd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export const todayYmd = () => {
  const t = new Date();
  return makeYmd(t.getFullYear(), t.getMonth() + 1, t.getDate());
};

export const weekdayOf = (s) => {
  const { y, m, d } = parseYmd(s);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};

export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();

export const fmtDate = (s) => {
  const { y, m, d } = parseYmd(s);
  return `${pad(d)} ${MON[m - 1]} ${y}`;
};

export const fmtRange = (a, b) => (a === b ? fmtDate(a) : `${fmtDate(a)} to ${fmtDate(b)}`);

export function isWeeklyOff(s, settings) {
  const wd = weekdayOf(s);
  if ((settings?.weeklyOffDays || []).includes(wd)) return true;
  if (wd === 6 && (settings?.offSaturdays || []).includes(Math.ceil(parseYmd(s).d / 7))) return true;
  return false;
}

export const eventsOnDay = (events, s) => events.filter((e) => e.startDate <= s && e.endDate >= s);

// Leading nulls so the first day lands under the right weekday column
export function monthCells(y, m) {
  const cells = [];
  const first = weekdayOf(makeYmd(y, m, 1));
  for (let i = 0; i < first; i += 1) cells.push(null);
  for (let d = 1; d <= daysInMonth(y, m); d += 1) cells.push(makeYmd(y, m, d));
  return cells;
}

export function sessionMonths(session) {
  if (!session) return [];
  const out = [];
  let { y, m } = parseYmd(session.startDate);
  const end = parseYmd(session.endDate);
  while (y < end.y || (y === end.y && m <= end.m)) {
    out.push({ y, m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export const timeLabel = (e) => (e.startTime ? (e.endTime ? `${e.startTime} to ${e.endTime}` : e.startTime) : '');

export function saveBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export const errMsg = (err, fallback) => err?.response?.data?.message || fallback;