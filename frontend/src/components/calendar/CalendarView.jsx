import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, Search, LayoutGrid, List, CalendarRange, Plus, Pencil, MapPin, Clock } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import Badge from '../ui/Badge';
import {
  MONTHS, DOW, KIND_LABEL, parseYmd, makeYmd, todayYmd, fmtDate, fmtRange, isWeeklyOff,
  eventsOnDay, monthCells, sessionMonths, timeLabel,
} from './calendarUtils';

const pillStyle = (color) => ({ backgroundColor: `${color}22`, borderLeft: `3px solid ${color}` });

function EventPill({ ev, onClick }) {
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(ev); }}
      style={pillStyle(ev.color)}
      className="truncate text-[11px] leading-4 px-1.5 rounded text-[#1e293b] cursor-pointer hover:brightness-95"
      title={ev.title}
    >
      {ev.title}
    </div>
  );
}

function MiniMonth({ y, m, events, settings, session, onPick }) {
  const cells = monthCells(y, m);
  const today = todayYmd();
  return (
    <button
      type="button"
      onClick={() => onPick(y, m)}
      className="text-left bg-white border border-[#e2e8f0] rounded-xl p-3 hover:border-[#f97316] transition-colors"
    >
      <p className="text-sm font-bold text-[#1e293b] mb-2">{MONTHS[m - 1]} {y}</p>
      <div className="grid grid-cols-7 gap-0.5 text-center">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((l, i) => (
          <span key={i} className="text-[9px] font-semibold text-[#94a3b8]">{l}</span>
        ))}
        {cells.map((s, i) => {
          if (!s) return <span key={`e${i}`} />;
          const inSession = s >= session.startDate && s <= session.endDate;
          const list = eventsOnDay(events, s);
          const best = list.find((e) => e.kind === 'working_day') || list.find((e) => e.kind === 'holiday') || list[0];
          const off = isWeeklyOff(s, settings);
          return (
            <span
              key={s}
              style={best && inSession ? { backgroundColor: `${best.color}33` } : undefined}
              className={`text-[10px] leading-5 rounded ${!inSession ? 'text-[#cbd5e1]' : best ? 'font-bold text-[#1e293b]' : off ? 'bg-[#f1f5f9] text-[#94a3b8]' : 'text-[#475569]'} ${s === today ? 'ring-1 ring-[#f97316]' : ''}`}
            >
              {Number(s.slice(8, 10))}
            </span>
          );
        })}
      </div>
    </button>
  );
}

export default function CalendarView({
  data, loading, errorMessage, canEdit = false, onAddEvent, onEditEvent, onExport, exporting = false,
}) {
  const session = data?.session;
  const settings = data?.settings || { weeklyOffDays: [0], offSaturdays: [] };
  const allEvents = data?.events || [];
  const stats = data?.stats;

  const [view, setView] = useState('month');
  const [cursor, setCursor] = useState(() => {
    const p = parseYmd(todayYmd());
    return { y: p.y, m: p.m };
  });
  const [selected, setSelected] = useState(null);
  const [hidden, setHidden] = useState(() => new Set());
  const [query, setQuery] = useState('');
  const [detail, setDetail] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // Jump to a sensible month whenever the session changes
  useEffect(() => {
    if (!session) return;
    const t = todayYmd();
    const ref = t >= session.startDate && t <= session.endDate ? t : session.startDate;
    const p = parseYmd(ref);
    setCursor({ y: p.y, m: p.m });
    setSelected(null);
    setHidden(new Set());
  }, [session?.id]);

  const legend = useMemo(() => {
    const map = new Map();
    allEvents.forEach((e) => map.set(e.categoryId, { id: e.categoryId, name: e.categoryName, color: e.color }));
    return Array.from(map.values());
  }, [allEvents]);

  const events = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allEvents.filter((e) => {
      if (hidden.has(e.categoryId)) return false;
      if (!q) return true;
      return `${e.title} ${e.categoryName} ${e.location || ''}`.toLowerCase().includes(q);
    });
  }, [allEvents, hidden, query]);

  const toggleCategory = (id) => {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const monthKey = `${cursor.y}-${String(cursor.m).padStart(2, '0')}`;
  const monthStat = stats?.months.find((m) => m.key === monthKey);
  const today = todayYmd();

  const shiftMonth = (delta) => {
    setCursor((c) => {
      let m = c.m + delta;
      let y = c.y;
      if (m < 1) { m = 12; y -= 1; }
      if (m > 12) { m = 1; y += 1; }
      return { y, m };
    });
  };

  if (loading && !data) return <div className="flex justify-center py-20"><Spinner /></div>;
  if (errorMessage) {
    return <Card><p className="text-sm text-red-600 text-center py-8">{errorMessage}</p></Card>;
  }
  if (!session) {
    return <Card><p className="text-sm text-[#94a3b8] text-center py-10">No academic session has been set up yet.</p></Card>;
  }

  const selectedEvents = selected ? eventsOnDay(events, selected) : [];

  const listGroups = [];
  events.forEach((e) => {
    const key = e.startDate.slice(0, 7);
    let g = listGroups.find((x) => x.key === key);
    if (!g) {
      g = { key, items: [] };
      listGroups.push(g);
    }
    g.items.push(e);
  });

  const statCards = [
    { label: 'Working days', value: stats?.totalWorkingDays ?? 0, tone: 'text-green-700 bg-green-50 border-green-100' },
    { label: 'Off days', value: stats?.totalOffDays ?? 0, tone: 'text-red-700 bg-red-50 border-red-100' },
    { label: 'Exams', value: stats?.examCount ?? 0, tone: 'text-indigo-700 bg-indigo-50 border-indigo-100' },
    { label: 'Events', value: stats?.eventCount ?? 0, tone: 'text-blue-700 bg-blue-50 border-blue-100' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map((c) => (
          <div key={c.label} className={`rounded-xl border px-4 py-3 ${c.tone}`}>
            <p className="text-2xl font-extrabold leading-none">{c.value}</p>
            <p className="text-xs mt-1 opacity-80">{c.label}</p>
          </div>
        ))}
      </div>

      <Card className="!p-3 sm:!p-4">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="flex items-center gap-1 bg-[#f1f5f9] rounded-lg p-1 w-fit">
            {[
              { id: 'month', label: 'Month', icon: CalendarRange },
              { id: 'year', label: 'Year', icon: LayoutGrid },
              { id: 'list', label: 'List', icon: List },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-semibold transition-colors ${view === v.id ? 'bg-white text-[#1e293b] shadow-sm' : 'text-[#64748b]'}`}
              >
                <v.icon size={15} /> {v.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 lg:max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search events"
              className="w-full pl-9 pr-3 py-2 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316]"
            />
          </div>

          <div className="flex items-center gap-2 lg:ml-auto flex-wrap">
            {canEdit && (
              <Button icon={Plus} size="sm" onClick={() => onAddEvent(selected)}>Add event</Button>
            )}
            <div className="relative">
              <Button variant="outline" size="sm" icon={Download} loading={exporting} onClick={() => setMenuOpen((o) => !o)}>
                Download
              </Button>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-56 bg-white border border-[#e2e8f0] rounded-xl shadow-lg z-20 py-1">
                    {[
                      { f: 'pdf', t: 'PDF year planner', d: 'Print ready' },
                      { f: 'csv', t: 'Excel (CSV)', d: 'All events as a sheet' },
                      { f: 'ics', t: 'Calendar file (.ics)', d: 'Google, Apple, Outlook' },
                    ].map((o) => (
                      <button
                        key={o.f}
                        onClick={() => { setMenuOpen(false); onExport(o.f); }}
                        className="w-full text-left px-4 py-2 hover:bg-[#f8fafc]"
                      >
                        <p className="text-sm font-semibold text-[#1e293b]">{o.t}</p>
                        <p className="text-xs text-[#94a3b8]">{o.d}</p>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {legend.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {legend.map((c) => {
              const off = hidden.has(c.id);
              return (
                <button
                  key={c.id}
                  onClick={() => toggleCategory(c.id)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-opacity ${off ? 'opacity-40 border-[#e2e8f0]' : 'border-[#e2e8f0] bg-white'}`}
                >
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                  {c.name}
                </button>
              );
            })}
          </div>
        )}
      </Card>

      {canEdit && stats?.needsReviewCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-800">
          {stats.needsReviewCount} copied event(s) are marked "Check date". Festival dates change every year, so please confirm them.
        </div>
      )}

      {view === 'month' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => shiftMonth(-1)} className="p-2 rounded-lg hover:bg-[#f1f5f9] text-[#64748b]"><ChevronLeft size={18} /></button>
            <div className="text-center">
              <p className="font-bold text-lg text-[#1e293b]">{MONTHS[cursor.m - 1]} {cursor.y}</p>
              {monthStat && (
                <p className="text-xs text-[#64748b]">{monthStat.workingDays} working days, {monthStat.offDays} off</p>
              )}
            </div>
            <button onClick={() => shiftMonth(1)} className="p-2 rounded-lg hover:bg-[#f1f5f9] text-[#64748b]"><ChevronRight size={18} /></button>
          </div>

          <div className="grid grid-cols-7 mb-1">
            {DOW.map((d) => (
              <div key={d} className="text-center text-[10px] sm:text-xs font-semibold text-[#94a3b8] py-1">
                <span className="sm:hidden">{d[0]}</span><span className="hidden sm:inline">{d}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1">
            {monthCells(cursor.y, cursor.m).map((s, i) => {
              if (!s) return <div key={`e${i}`} />;
              const list = eventsOnDay(events, s);
              const inSession = s >= session.startDate && s <= session.endDate;
              const off = isWeeklyOff(s, settings);
              const isSel = selected === s;
              return (
                <div
                  key={s}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(s)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelected(s); }}
                  className={`min-h-[58px] sm:min-h-[96px] p-1 rounded-lg border cursor-pointer transition-colors ${
                    isSel ? 'border-[#f97316] bg-orange-50' : off && inSession ? 'bg-[#f8fafc] border-[#eef2f7]' : 'bg-white border-[#eef2f7] hover:border-[#cbd5e1]'
                  } ${!inSession ? 'opacity-50' : ''}`}
                >
                  <span className={`inline-flex items-center justify-center text-[11px] sm:text-xs w-6 h-6 rounded-full font-semibold ${s === today ? 'bg-[#f97316] text-white' : off ? 'text-[#94a3b8]' : 'text-[#475569]'}`}>
                    {Number(s.slice(8, 10))}
                  </span>
                  <div className="hidden sm:block space-y-0.5 mt-0.5">
                    {list.slice(0, 3).map((ev) => <EventPill key={ev.id} ev={ev} onClick={setDetail} />)}
                    {list.length > 3 && <p className="text-[10px] text-[#64748b] pl-1">+{list.length - 3} more</p>}
                  </div>
                  <div className="sm:hidden flex flex-wrap gap-0.5 mt-1">
                    {list.slice(0, 4).map((ev) => (
                      <span key={ev.id} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: ev.color }} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {selected && (
            <div className="mt-5 border-t border-[#eef2f7] pt-4">
              <div className="flex items-center justify-between gap-3 mb-3">
                <div>
                  <p className="font-bold text-[#1e293b]">{fmtDate(selected)}</p>
                  {isWeeklyOff(selected, settings) && <p className="text-xs text-[#94a3b8]">Weekly off</p>}
                </div>
                {canEdit && <Button size="sm" variant="outline" icon={Plus} onClick={() => onAddEvent(selected)}>Add on this date</Button>}
              </div>
              {selectedEvents.length === 0 ? (
                <p className="text-sm text-[#94a3b8]">Nothing scheduled.</p>
              ) : (
                <div className="space-y-2">
                  {selectedEvents.map((ev) => (
                    <button key={ev.id} onClick={() => setDetail(ev)} style={pillStyle(ev.color)} className="w-full text-left rounded-lg px-3 py-2">
                      <p className="text-sm font-semibold text-[#1e293b]">{ev.title}</p>
                      <p className="text-xs text-[#64748b]">{ev.categoryName}{timeLabel(ev) ? `, ${timeLabel(ev)}` : ''}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {view === 'year' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {sessionMonths(session).map(({ y, m }) => (
            <MiniMonth
              key={`${y}-${m}`}
              y={y}
              m={m}
              events={events}
              settings={settings}
              session={session}
              onPick={(py, pm) => { setCursor({ y: py, m: pm }); setView('month'); }}
            />
          ))}
        </div>
      )}

      {view === 'list' && (
        <Card padding={false}>
          {listGroups.length === 0 ? (
            <p className="text-sm text-[#94a3b8] text-center py-12">No events to show.</p>
          ) : (
            listGroups.map((g) => {
              const { y, m } = parseYmd(`${g.key}-01`);
              return (
                <div key={g.key}>
                  <p className="px-4 sm:px-6 py-2 bg-[#f8fafc] text-xs font-bold uppercase tracking-wider text-[#64748b] border-y border-[#eef2f7]">
                    {MONTHS[m - 1]} {y}
                  </p>
                  {g.items.map((ev) => (
                    <button
                      key={ev.id}
                      onClick={() => setDetail(ev)}
                      className="w-full flex items-start gap-3 px-4 sm:px-6 py-3 text-left hover:bg-[#f8fafc] border-b border-[#f1f5f9]"
                    >
                      <span className="mt-1.5 w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: ev.color }} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-[#1e293b]">{ev.title}</p>
                        <p className="text-xs text-[#64748b]">
                          {fmtRange(ev.startDate, ev.endDate)}{timeLabel(ev) ? `, ${timeLabel(ev)}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ev.needsReview && canEdit && <Badge label="Check date" variant="warning" />}
                        <Badge label={ev.categoryName || KIND_LABEL[ev.kind]} />
                      </div>
                    </button>
                  ))}
                </div>
              );
            })
          )}
        </Card>
      )}

      <Modal open={!!detail} onClose={() => setDetail(null)} title={detail?.title || ''} size="sm">
        {detail && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: `${detail.color}22` }}>
                <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: detail.color }} /> {detail.categoryName}
              </span>
              <Badge label={KIND_LABEL[detail.kind]} variant="navy" />
              {detail.audience === 'staff' && <Badge label="Staff only" variant="info" />}
              {detail.needsReview && canEdit && <Badge label="Check date" variant="warning" />}
            </div>
            <p className="text-sm font-semibold text-[#1e293b]">{fmtRange(detail.startDate, detail.endDate)}</p>
            {timeLabel(detail) && <p className="text-sm text-[#475569] flex items-center gap-2"><Clock size={14} /> {timeLabel(detail)}</p>}
            {detail.location && <p className="text-sm text-[#475569] flex items-center gap-2"><MapPin size={14} /> {detail.location}</p>}
            {detail.classIds.length > 0 && (
              <p className="text-sm text-[#475569]">
                Classes: {detail.classIds.map((id) => data.classNames?.[id]).filter(Boolean).join(', ')}
              </p>
            )}
            {detail.description && <p className="text-sm text-[#64748b] whitespace-pre-wrap">{detail.description}</p>}
            {canEdit && (
              <div className="flex justify-end pt-2">
                <Button size="sm" icon={Pencil} onClick={() => { const ev = detail; setDetail(null); onEditEvent(ev); }}>Edit</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}