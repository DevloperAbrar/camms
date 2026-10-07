import { useState } from 'react';
import { AlertTriangle, Bell, CheckCircle2, ChevronDown, ChevronRight, X } from 'lucide-react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import { fmtRange } from '../calendar/calendarUtils';
import { PACE_META, RISK_META, STATUS_OPTIONS, fmtPct, examDaysLabel, teacherNames } from './syllabusUtils';

export function ProgressBar({ pct = 0, expected = null, color = '#f97316', height = 'h-2.5' }) {
  const w = Math.max(0, Math.min(100, pct));
  return (
    <div className={`relative w-full ${height} bg-[#e2e8f0] rounded-full overflow-visible`}>
      <div className={`${height} rounded-full transition-all`} style={{ width: `${w}%`, background: color }} />
      {expected !== null && expected !== undefined && (
        <div
          className="absolute -top-1 -bottom-1 w-0.5 bg-[#1e293b] rounded"
          style={{ left: `${Math.max(0, Math.min(100, expected))}%` }}
          title={`Plan says ${fmtPct(expected)} by today`}
        />
      )}
    </div>
  );
}

export const PaceBadge = ({ pace }) => <Badge label={(PACE_META[pace] || PACE_META.no_plan).label} variant={(PACE_META[pace] || PACE_META.no_plan).variant} />;
export const RiskBadge = ({ risk }) => <Badge label={(RISK_META[risk] || RISK_META.ok).label} variant={(RISK_META[risk] || RISK_META.ok).variant} />;

export function StatCard({ label, value, hint, tone = 'default' }) {
  const tones = { default: 'text-[#1e293b]', danger: 'text-red-600', warning: 'text-amber-600', success: 'text-green-600' };
  return (
    <Card className="!p-4">
      <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-extrabold mt-1 ${tones[tone]}`}>{value}</p>
      {hint && <p className="text-xs text-[#94a3b8] mt-0.5">{hint}</p>}
    </Card>
  );
}

export function Notice({ notice, onClose }) {
  if (!notice) return null;
  const ok = notice.type === 'success';
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-sm ${ok ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
      {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
      <p className="flex-1">{notice.text}</p>
      {onClose && <button onClick={onClose} className="shrink-0 opacity-60 hover:opacity-100"><X size={14} /></button>}
    </div>
  );
}

export const Select = ({ value, onChange, children, className = '' }) => (
  <select
    value={value}
    onChange={(e) => onChange(e.target.value)}
    className={`px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#f97316] ${className}`}
  >
    {children}
  </select>
);

export function TabBar({ tabs, value, onChange }) {
  return (
    <div className="flex gap-1 border-b border-[#e2e8f0] overflow-x-auto">
      {tabs.map((t) => (
        <button
          key={t.value}
          onClick={() => onChange(t.value)}
          className={`px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
            value === t.value ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-[#64748b] hover:text-[#1e293b]'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

// Chapter-by-chapter progress editor. Used by faculty (own sections) and admin (override).
export function ChapterTracker({ chapters, editable, saving, onSave }) {
  const [draft, setDraft] = useState({});
  const [openNotes, setOpenNotes] = useState({});

  const merged = (c) => ({ ...c, ...(draft[c.id] || {}) });
  const patch = (id, p) => setDraft((d) => ({ ...d, [id]: { ...(d[id] || {}), ...p } }));
  const dirtyIds = Object.keys(draft);

  const setStatus = (c, status) => {
    const cur = merged(c);
    if (status === 'completed') patch(c.id, { status, percentDone: 100 });
    else if (status === 'not_started') patch(c.id, { status, percentDone: 0 });
    else patch(c.id, { status, percentDone: cur.percentDone > 0 && cur.percentDone < 100 ? cur.percentDone : 50 });
  };
  const setPct = (c, pct) => patch(c.id, { percentDone: pct, status: pct >= 100 ? 'completed' : pct <= 0 ? 'not_started' : 'in_progress' });

  async function save() {
    const updates = dirtyIds.map((id) => {
      const c = merged(chapters.find((x) => x.id === id));
      return {
        chapterId: id,
        status: c.status,
        percentDone: c.percentDone,
        isRevised: !!c.isRevised,
        ...(draft[id].remarks !== undefined ? { remarks: c.remarks || '' } : {}),
      };
    });
    if (await onSave(updates)) setDraft({});
  }

  if (!chapters.length) {
    return <Card><p className="text-sm text-[#94a3b8] text-center py-8">No chapters have been added for this subject yet.</p></Card>;
  }

  let lastUnit = null;
  return (
    <div className="space-y-3">
      <Card padding={false} className="divide-y divide-[#f1f5f9]">
        {chapters.map((raw, i) => {
          const c = merged(raw);
          const showUnit = c.unitName && c.unitName !== lastUnit;
          lastUnit = c.unitName || lastUnit;
          const changed = !!draft[c.id];
          return (
            <div key={c.id} className={changed ? 'bg-orange-50/40' : ''}>
              {showUnit && <p className="px-4 pt-3 text-xs font-bold uppercase tracking-wide text-[#64748b]">{c.unitName}</p>}
              <div className="p-4 space-y-3">
                <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[#1e293b]">
                      {i + 1}. {c.title}
                      {c.isRevised && <span className="ml-2"><Badge label="Revised" variant="info" /></span>}
                    </p>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-[#64748b]">
                      {c.plannedStart && c.plannedEnd && <span>Plan: {fmtRange(c.plannedStart, c.plannedEnd)}</span>}
                      {c.expectedPct !== null && c.expectedPct !== undefined && <span>Plan says {c.expectedPct}% by today</span>}
                      {c.exams?.map((e) => <Badge key={e} label={e} variant="orange" />)}
                    </div>
                  </div>

                  <div className="flex rounded-lg border border-[#e2e8f0] overflow-hidden shrink-0">
                    {STATUS_OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        disabled={!editable}
                        onClick={() => setStatus(raw, o.value)}
                        className={`px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-default ${
                          c.status === o.value
                            ? o.value === 'completed' ? 'bg-green-600 text-white' : o.value === 'in_progress' ? 'bg-[#f97316] text-white' : 'bg-[#64748b] text-white'
                            : 'bg-white text-[#64748b] enabled:hover:bg-[#f1f5f9]'
                        }`}
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>

                {c.status === 'in_progress' && (
                  <div className="flex items-center gap-3">
                    <input
                      type="range" min={1} max={99} step={5} value={c.percentDone} disabled={!editable}
                      onChange={(e) => setPct(raw, Number(e.target.value))}
                      className="flex-1 accent-[#f97316]"
                    />
                    <span className="w-12 text-right text-sm font-bold text-[#1e293b]">{c.percentDone}%</span>
                  </div>
                )}

                {editable && (
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs text-[#475569] cursor-pointer">
                      <input type="checkbox" checked={!!c.isRevised} onChange={(e) => patch(c.id, { isRevised: e.target.checked })} className="accent-[#f97316]" />
                      Revision done
                    </label>
                    <button onClick={() => setOpenNotes((n) => ({ ...n, [c.id]: !n[c.id] }))} className="text-xs font-semibold text-[#f97316] hover:underline">
                      {c.remarks || openNotes[c.id] ? 'Hide note' : 'Add note'}
                    </button>
                  </div>
                )}
                {(openNotes[c.id] || (!editable && c.remarks)) && (
                  <input
                    value={c.remarks || ''} disabled={!editable} maxLength={300}
                    onChange={(e) => patch(c.id, { remarks: e.target.value })}
                    placeholder="Note (e.g. exercise 3 pending, doubt-clearing needed)"
                    className="w-full px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316] disabled:bg-[#f8fafc]"
                  />
                )}
              </div>
            </div>
          );
        })}
      </Card>

      {editable && dirtyIds.length > 0 && (
        <div className="sticky bottom-2 z-10 flex items-center justify-between gap-3 bg-[#1e293b] text-white rounded-xl px-4 py-3 shadow-lg">
          <p className="text-sm font-medium">{dirtyIds.length} chapter(s) changed</p>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" className="!text-white/80 hover:!bg-white/10" onClick={() => setDraft({})}>Discard</Button>
            <Button size="sm" loading={saving} onClick={save}>Save progress</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// "Half Yearly: how much of the course is left" view, for principal / admin / teachers
export function ReadinessPanel({ data, loading, onRemind, remindingKey }) {
  const [open, setOpen] = useState({});
  if (loading) return <div className="flex justify-center py-16"><Spinner /></div>;
  if (!data) return null;

  const { exam, examDate, rows, summary, scopeDefined, subjectsWithoutScope } = data;
  const bySection = rows.reduce((acc, r) => {
    (acc[r.sectionId] = acc[r.sectionId] || { name: r.sectionName, rows: [] }).rows.push(r);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-lg font-extrabold text-[#1e293b]">{exam.name} <span className="text-[#64748b] font-semibold">· {exam.className}</span></p>
            <p className="text-sm text-[#64748b] mt-0.5">
              {examDate ? `${examDate.title}: ${fmtRange(examDate.startDate, examDate.endDate)} (${examDaysLabel(examDate.daysLeft)})` : 'No exam date found on the academic calendar'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-3xl font-extrabold text-[#1e293b]">{fmtPct(summary.coveragePct)}</p>
            <p className="text-xs text-[#64748b]">of exam syllabus covered</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          <Badge label={`${summary.high} at risk`} variant={summary.high ? 'danger' : 'default'} />
          <Badge label={`${summary.watch} need attention`} variant={summary.watch ? 'warning' : 'default'} />
          <Badge label={`${summary.ready} fully covered`} variant={summary.ready ? 'success' : 'default'} />
        </div>
      </Card>

      {!scopeDefined && (
        <Notice notice={{ type: 'error', text: 'No syllabus has been set for this exam yet. Set it under "Exam syllabus" so coverage can be tracked.' }} />
      )}
      {scopeDefined && subjectsWithoutScope?.length > 0 && (
        <Notice notice={{ type: 'error', text: `Exam syllabus is missing for: ${subjectsWithoutScope.join(', ')}` }} />
      )}

      {Object.entries(bySection).map(([sectionId, sec]) => (
        <Card key={sectionId} padding={false}>
          <div className="px-4 py-3 border-b border-[#e2e8f0] bg-[#f8fafc] rounded-t-xl">
            <p className="text-sm font-bold text-[#1e293b]">Section {sec.name}</p>
          </div>
          <div className="divide-y divide-[#f1f5f9]">
            {sec.rows.map((r) => {
              const key = `${r.sectionId}|${r.subjectId}`;
              const isOpen = !!open[key];
              return (
                <div key={key} className="p-4">
                  <div className="flex flex-col lg:flex-row lg:items-center gap-3">
                    <button onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))} className="flex items-center gap-2 text-left lg:w-64 shrink-0">
                      {isOpen ? <ChevronDown size={16} className="text-[#94a3b8]" /> : <ChevronRight size={16} className="text-[#94a3b8]" />}
                      <span>
                        <span className="block text-sm font-semibold text-[#1e293b]">{r.subjectName}</span>
                        <span className="block text-xs text-[#64748b]">{teacherNames(r.teachers)}</span>
                      </span>
                    </button>
                    <div className="flex-1 min-w-0">
                      <ProgressBar pct={r.coveragePct} color={(RISK_META[r.risk] || RISK_META.ok).bar} />
                      <p className="text-xs text-[#64748b] mt-1.5">
                        {r.completedChapters} of {r.totalChapters} chapters done · {fmtPct(100 - r.coveragePct)} course left
                        {r.remainingPeriods > 0 && ` · about ${r.remainingPeriods} period(s) of teaching remaining`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-sm font-bold text-[#1e293b] w-14 text-right">{fmtPct(r.coveragePct)}</span>
                      <RiskBadge risk={r.risk} />
                      {onRemind && r.risk !== 'ready' && r.teachers.length > 0 && (
                        <Button variant="ghost" size="sm" icon={Bell} loading={remindingKey === key} onClick={() => onRemind(r)}>Remind</Button>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="mt-3 ml-6 space-y-1.5">
                      {r.pending.length === 0 ? (
                        <p className="text-xs text-green-600 font-medium">All chapters for this exam are completed.</p>
                      ) : (
                        r.pending.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-3 text-xs bg-[#f8fafc] rounded-lg px-3 py-2">
                            <span className="text-[#1e293b] font-medium">{p.title}</span>
                            <span className="text-[#64748b] shrink-0">{p.percentDone > 0 ? `${p.percentDone}% done` : 'Not started'}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {scopeDefined && rows.length === 0 && (
        <Card><p className="text-sm text-[#94a3b8] text-center py-8">No sections to show for this exam.</p></Card>
      )}
    </div>
  );
}