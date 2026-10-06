const PDFDocument = require('pdfkit');
const { stringify } = require('csv-stringify/sync');
const { KIND_PRIORITY, pad, ymd, weekday, maxStr, minStr, eachDay, isWeeklyOff } = require('./calendar.service');

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const KIND_LABEL = { holiday: 'Holiday', exam: 'Exam', event: 'Event', working_day: 'Working day' };

function fmtDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return `${pad(d)} ${MON[m - 1]} ${y}`;
}
const fmtRange = (a, b) => (a === b ? fmtDate(a) : `${fmtDate(a)} to ${fmtDate(b)}`);

// The built-in PDF fonts cannot draw Devanagari. Strip unsupported characters so the
// PDF never shows garbage. CSV, iCal and the web view keep the full Unicode text.
const safe = (s) =>
  String(s == null ? '' : s)
    .replace(/[^\u0020-\u00FF\u2013\u2014\u2018\u2019\u201C\u201D\u2022\u2026]/g, '')
    .trim();

function tint(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.round(255 - (255 - c) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function eventDetails(e, classNames) {
  const parts = [];
  if (e.startTime) parts.push(e.endTime ? `${e.startTime} to ${e.endTime}` : e.startTime);
  if (e.location) parts.push(e.location);
  if (e.classIds.length) parts.push(`Class: ${e.classIds.map((id) => classNames[id]).filter(Boolean).join(', ')}`);
  if (e.audience === 'staff') parts.push('Staff only');
  return parts.join(' | ');
}

// ------------------------------------------------------------------ CSV
function buildCsv(payload) {
  const rows = payload.events.map((e) => [
    e.startDate,
    e.endDate,
    e.title,
    e.categoryName || '',
    KIND_LABEL[e.kind] || e.kind,
    e.startTime ? (e.endTime ? `${e.startTime}-${e.endTime}` : e.startTime) : '',
    e.location || '',
    e.audience === 'staff' ? 'Staff only' : 'Everyone',
    e.classIds.map((id) => payload.classNames[id]).filter(Boolean).join(', ') || 'All classes',
    e.description || '',
  ]);
  const header = ['Start Date', 'End Date', 'Title', 'Category', 'Type', 'Time', 'Location', 'Audience', 'Classes', 'Description'];
  // BOM so Excel opens Hindi text correctly
  return Buffer.from('\uFEFF' + stringify([header, ...rows]), 'utf8');
}

// ------------------------------------------------------------------ iCal
function icsEscape(s) {
  return String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function icsFold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const out = [];
  let current = '';
  let size = 0;
  for (const ch of line) {
    const len = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 75 : 74;
    if (size + len > limit) {
      out.push(current);
      current = ch;
      size = len;
    } else {
      current += ch;
      size += len;
    }
  }
  out.push(current);
  return out.join('\r\n ');
}

function buildIcs(payload) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CampusSafar//Academic Calendar//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${icsEscape(`${payload.school.name} ${payload.session.label}`)}`,
  ];

  for (const e of payload.events) {
    const d = (s) => s.replace(/-/g, '');
    lines.push('BEGIN:VEVENT', `UID:${e.id}@campussafar`, `DTSTAMP:${stamp}`);
    if (e.startTime) {
      const t = (x) => x.replace(':', '') + '00';
      lines.push(`DTSTART:${d(e.startDate)}T${t(e.startTime)}`);
      lines.push(`DTEND:${d(e.endDate)}T${t(e.endTime || e.startTime)}`);
    } else {
      const nextDay = ymd(new Date(Date.parse(`${e.endDate}T00:00:00Z`) + 86400000));
      lines.push(`DTSTART;VALUE=DATE:${d(e.startDate)}`, `DTEND;VALUE=DATE:${d(nextDay)}`);
    }
    lines.push(`SUMMARY:${icsEscape(e.title)}`);
    if (e.description) lines.push(`DESCRIPTION:${icsEscape(e.description)}`);
    if (e.location) lines.push(`LOCATION:${icsEscape(e.location)}`);
    if (e.categoryName) lines.push(`CATEGORIES:${icsEscape(e.categoryName)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return Buffer.from(lines.map(icsFold).join('\r\n') + '\r\n', 'utf8');
}

// ------------------------------------------------------------------ PDF
function buildCalendarPdf(payload, audienceLabel = '') {
  const { school, session, settings, events, stats, classNames } = payload;

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const H = doc.page.height;
    const M = 30;
    const NAVY = '#1e293b';
    const ORANGE = '#f97316';
    const MUTED = '#94a3b8';
    const TEXT = '#334155';
    const BORDER = '#e2e8f0';
    const OFF_BG = '#f1f5f9';

    const sStart = session.startDate;
    const sEnd = session.endDate;

    // Strongest event for each day, used to colour the calendar cells
    const dayBest = {};
    for (const e of events) {
      for (const d of eachDay(maxStr(e.startDate, sStart), minStr(e.endDate, sEnd))) {
        const cur = dayBest[d];
        if (!cur || KIND_PRIORITY[e.kind] > KIND_PRIORITY[cur.kind]) dayBest[d] = e;
      }
    }

    const statsByKey = Object.fromEntries((stats ? stats.months : []).map((m) => [m.key, m]));
    const summaryLine = stats
      ? `${fmtRange(sStart, sEnd)}   |   Working days ${stats.totalWorkingDays}   |   Off days ${stats.totalOffDays}   |   Exams ${stats.examCount}   |   Events ${stats.eventCount}`
      : fmtRange(sStart, sEnd);

    function header(title) {
      doc.rect(0, 0, W, 64).fill(NAVY);
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#ffffff')
        .text(safe(school.name) || 'School', M, 11, { width: W - 2 * M, align: 'center', lineBreak: false });
      doc.font('Helvetica-Bold').fontSize(9.5).fillColor(ORANGE)
        .text(`${title} ${safe(session.label)}`.toUpperCase(), M, 33, { width: W - 2 * M, align: 'center', characterSpacing: 1.2, lineBreak: false });
      doc.font('Helvetica').fontSize(8).fillColor('#cbd5e1')
        .text(summaryLine, M, 48, { width: W - 2 * M, align: 'center', lineBreak: false });
    }

    function legend() {
      const used = new Map();
      for (const e of events) if (e.categoryName) used.set(e.categoryId, { name: safe(e.categoryName), color: e.color });
      const items = [...Array.from(used.values()), { name: 'Weekly off', color: null }];
      let x = M;
      let y = H - 44;
      doc.font('Helvetica').fontSize(7);
      for (const it of items) {
        const w = doc.widthOfString(it.name) + 22;
        if (x + w > W - M) {
          x = M;
          y += 11;
        }
        doc.roundedRect(x, y, 8, 8, 2).fill(it.color ? tint(it.color, 0.45) : OFF_BG);
        doc.fillColor(TEXT).text(it.name, x + 12, y + 1, { lineBreak: false });
        x += w + 8;
      }
    }

    // ---- year planner pages (12 months per page)
    const months = [];
    {
      let y = Number(sStart.slice(0, 4));
      let m = Number(sStart.slice(5, 7));
      const endKey = sEnd.slice(0, 7);
      while (`${y}-${pad(m)}` <= endKey) {
        months.push({ y, m });
        m += 1;
        if (m > 12) {
          m = 1;
          y += 1;
        }
      }
    }

    const cols = 4;
    const rows = 3;
    const gapX = 14;
    const gapY = 10;
    const top = 76;
    const bottom = H - 52;
    const cw = (W - 2 * M - (cols - 1) * gapX) / cols;
    const ch = (bottom - top - (rows - 1) * gapY) / rows;

    header('Academic Calendar');

    months.forEach((mo, idx) => {
      const pos = idx % 12;
      if (pos === 0 && idx > 0) {
        doc.addPage();
        header('Academic Calendar');
      }
      const key = `${mo.y}-${pad(mo.m)}`;
      const x = M + (pos % cols) * (cw + gapX);
      const y = top + Math.floor(pos / cols) * (ch + gapY);

      doc.roundedRect(x, y, cw, ch, 5).lineWidth(0.6).strokeColor(BORDER).stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY).text(`${MONTHS[mo.m - 1]} ${mo.y}`, x + 8, y + 7, { lineBreak: false });
      if (statsByKey[key]) {
        doc.font('Helvetica').fontSize(6.5).fillColor(MUTED)
          .text(`${statsByKey[key].workingDays} working days`, x + 8, y + 9, { width: cw - 16, align: 'right', lineBreak: false });
      }

      const gx = x + 6;
      const cellW = (cw - 12) / 7;
      const gy = y + 24;
      const rowH = (ch - 24 - 6) / 6;

      doc.font('Helvetica-Bold').fontSize(6.5).fillColor(MUTED);
      ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach((l, i) => {
        doc.text(l, gx + i * cellW, y + 16, { width: cellW, align: 'center', lineBreak: false });
      });

      const first = weekday(`${key}-01`);
      const dim = new Date(Date.UTC(mo.y, mo.m, 0)).getUTCDate();
      for (let d = 1; d <= dim; d += 1) {
        const ds = `${key}-${pad(d)}`;
        const cell = first + d - 1;
        const cx = gx + (cell % 7) * cellW;
        const cy = gy + Math.floor(cell / 7) * rowH;
        const inSession = ds >= sStart && ds <= sEnd;
        const best = dayBest[ds];

        let color = TEXT;
        let font = 'Helvetica';
        if (!inSession) {
          color = '#cbd5e1';
        } else if (best) {
          doc.roundedRect(cx + 1, cy + 1, cellW - 2, rowH - 2, 3).fill(tint(best.color, 0.4));
          font = 'Helvetica-Bold';
        } else if (isWeeklyOff(ds, settings)) {
          doc.roundedRect(cx + 1, cy + 1, cellW - 2, rowH - 2, 3).fill(OFF_BG);
          color = MUTED;
        }
        doc.font(font).fontSize(7.5).fillColor(color)
          .text(String(d), cx, cy + rowH / 2 - 4, { width: cellW, align: 'center', lineBreak: false });
      }

      if (pos === 11 || idx === months.length - 1) legend();
    });

    // ---- event list pages
    if (events.length) {
      const colX = { date: M, title: M + 175, cat: M + 480, info: M + 600 };
      const colW = { date: 165, title: 295, cat: 112, info: W - 2 * M - 600 };
      const rowH = 17;
      const limit = H - 40;
      let y = 0;

      const tableHead = () => {
        doc.rect(M, y, W - 2 * M, 18).fill('#eef2f7');
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(NAVY);
        doc.text('DATE', colX.date + 6, y + 6, { lineBreak: false });
        doc.text('EVENT', colX.title, y + 6, { lineBreak: false });
        doc.text('CATEGORY', colX.cat, y + 6, { lineBreak: false });
        doc.text('DETAILS', colX.info, y + 6, { lineBreak: false });
        y += 20;
      };

      const newListPage = () => {
        doc.addPage();
        header('Event List');
        y = 78;
        tableHead();
      };

      newListPage();

      let currentMonth = '';
      events.forEach((e, i) => {
        const mKey = e.startDate.slice(0, 7);
        const needed = mKey !== currentMonth ? rowH * 2 : rowH;
        if (y + needed > limit) {
          newListPage();
          currentMonth = '';
        }
        if (mKey !== currentMonth) {
          currentMonth = mKey;
          doc.font('Helvetica-Bold').fontSize(8.5).fillColor(ORANGE)
            .text(`${MONTHS[Number(mKey.slice(5, 7)) - 1]} ${mKey.slice(0, 4)}`.toUpperCase(), M + 6, y + 4, { lineBreak: false });
          y += rowH;
        }
        if (i % 2 === 0) doc.rect(M, y - 2, W - 2 * M, rowH).fill('#f8fafc');

        const title = safe(e.title) || 'Event (see app for full title)';
        doc.font('Helvetica').fontSize(8).fillColor(TEXT);
        doc.text(fmtRange(e.startDate, e.endDate), colX.date + 6, y + 2, { width: colW.date, lineBreak: false, ellipsis: true });
        doc.font('Helvetica-Bold').fillColor(NAVY)
          .text(title, colX.title, y + 2, { width: colW.title, lineBreak: false, ellipsis: true });
        doc.roundedRect(colX.cat, y + 3, 7, 7, 2).fill(tint(e.color, 0.5));
        doc.font('Helvetica').fillColor(TEXT)
          .text(safe(e.categoryName), colX.cat + 11, y + 2, { width: colW.cat - 11, lineBreak: false, ellipsis: true });
        doc.fillColor(MUTED)
          .text(safe(eventDetails(e, classNames)), colX.info, y + 2, { width: colW.info, lineBreak: false, ellipsis: true });
        y += rowH;
      });
    }

    // ---- footer on every page
    const range = doc.bufferedPageRange();
    const generated = fmtDate(new Date().toISOString().slice(0, 10));
    for (let i = range.start; i < range.start + range.count; i += 1) {
      doc.switchToPage(i);
      doc.moveTo(M, H - 24).lineTo(W - M, H - 24).lineWidth(0.5).strokeColor(BORDER).stroke();
      doc.font('Helvetica').fontSize(7).fillColor(MUTED);
      doc.text(`Generated ${generated}${audienceLabel ? `   |   ${audienceLabel}` : ''}`, M, H - 18, { lineBreak: false });
      doc.text(`Page ${i + 1} of ${range.count}`, M, H - 18, { width: W - 2 * M, align: 'right', lineBreak: false });
    }

    doc.end();
  });
}

// ------------------------------------------------------------------ response helper
async function sendExport(res, payload, format, audienceLabel) {
  const base = `Academic-Calendar-${String(payload.session.label).replace(/[^a-zA-Z0-9-]+/g, '_')}`;
  let buffer;
  let contentType;
  if (format === 'csv') {
    buffer = buildCsv(payload);
    contentType = 'text/csv; charset=utf-8';
  } else if (format === 'ics') {
    buffer = buildIcs(payload);
    contentType = 'text/calendar; charset=utf-8';
  } else {
    buffer = await buildCalendarPdf(payload, audienceLabel);
    contentType = 'application/pdf';
  }
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${base}.${format}"`);
  return res.send(buffer);
}

module.exports = { buildCsv, buildIcs, buildCalendarPdf, sendExport };