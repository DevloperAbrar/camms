import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTeacherReportDetail } from '../../api/schooladmin.api';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { errMsg } from '../calendar/calendarUtils';
import { Notice, PaceBadge, StatCard, TabBar } from '../syllabus/SyllabusUI';
import { CELL_META, MARKS_STATUS, MiniBar, fmtDateShort, fmtDateTime, fmtPct, pctColor, timeAgo } from './trUtils';

const TABS = [
  { value: 'assignments', label: 'Assignments' },
  { value: 'attendance',  label: 'Attendance days' },
  { value: 'marks',       label: 'Marks' },
  { value: 'activity',    label: 'Activity' },
];

export default function TeacherDetailModal({ teacherId, params, onClose, onOpenDay }) {
  const [tab, setTab] = useState('assignments');
  const open = !!teacherId;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tr-detail', teacherId, params.sessionId, params.from, params.to],
    queryFn: () => getTeacherReportDetail(teacherId, { sessionId: params.sessionId, from: params.from, to: params.to }).then((r) => r.data.data),
    enabled: open,
  });

  const t = data?.teacher;
  return (
    <Modal open={open} onClose={onClose} title={t ? t.name : 'Teacher report'} size="xl">
      {isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : isError ? (
        <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load this teacher.') }} />
      ) : t && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm text-[#64748b]">{t.email}</p>
            <Badge label={t.health.label} variant={t.health.variant} />
            {t.health.score !== null && <span className="text-xs text-[#94a3b8]">Score {t.health.score}</span>}
            {t.classTeacherOf.map((c) => <Badge key={c} label={`Class teacher · ${c}`} variant="navy" />)}
            <span className="text-xs text-[#94a3b8] ml-auto">{data.range.from} to {data.range.to} · last login {timeAgo(t.lastLogin)}</span>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <StatCard label="Attendance" value={fmtPct(t.attendance.compliancePct)} hint={`${t.attendance.marked}/${t.attendance.expected} · ${t.attendance.missing} missing`} tone={t.attendance.missing ? 'warning' : 'default'} />
            <StatCard label="Marks entered" value={fmtPct(t.marks.completionPct)} hint={`${t.marks.overdue} overdue`} tone={t.marks.overdue ? 'danger' : 'default'} />
            <StatCard label="Syllabus" value={fmtPct(t.syllabus.avgCoveragePct)} hint={`${t.syllabus.behind} behind · ${t.syllabus.stale} stale`} />
            <StatCard label="Active days" value={t.activity.activeDays} hint={`${t.corrections.pending} corrections pending`} />
          </div>

          <TabBar tabs={TABS} value={tab} onChange={setTab} />

          {tab === 'assignments' && (
            <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-xs uppercase text-[#64748b]">
                    {['Class', 'Subject', 'Students', 'Attendance', 'Marks', 'Syllabus'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {t.assignments.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-[#94a3b8]">No subjects assigned in this session.</td></tr>}
                  {t.assignments.map((a) => (
                    <tr key={a.id} className="border-b border-[#f1f5f9] align-top">
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#374151]">{a.className} · {a.sectionName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-[#1e293b]">{a.subjectName}</td>
                      <td className="px-3 py-2.5 text-[#374151]">{a.students}</td>
                      <td className="px-3 py-2.5 min-w-[140px]">
                        {a.attendance.expected === 0 ? <span className="text-xs text-[#94a3b8]">Nothing due</span> : (
                          <>
                            <p className="font-bold" style={{ color: pctColor(a.attendance.compliancePct) }}>{fmtPct(a.attendance.compliancePct)}</p>
                            <MiniBar pct={a.attendance.compliancePct} />
                            <p className="text-xs text-[#64748b] mt-1">
                              {a.attendance.marked}/{a.attendance.expected}
                              {a.attendance.missing > 0 && <span className="text-red-600 font-semibold"> · {a.attendance.missing} missing</span>}
                              {a.attendance.late > 0 && <span className="text-amber-600"> · {a.attendance.late} late</span>}
                            </p>
                          </>
                        )}
                      </td>
                      <td className="px-3 py-2.5 min-w-[170px]">
                        {a.marks.length === 0 ? <span className="text-xs text-[#94a3b8]">No exams</span> : (
                          <div className="space-y-1">
                            {a.marks.map((m) => (
                              <div key={m.key} className="flex items-center gap-1.5">
                                <span className="text-xs text-[#374151]">{m.examName} {m.entered}/{m.expected}</span>
                                <Badge label={m.overdue ? 'Overdue' : MARKS_STATUS[m.status].label} variant={m.overdue ? 'danger' : MARKS_STATUS[m.status].variant} />
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 min-w-[130px]">
                        {!a.syllabus || !a.syllabus.setUp ? <span className="text-xs text-[#94a3b8]">Not set up</span> : (
                          <>
                            <p className="font-bold text-[#1e293b]">{fmtPct(a.syllabus.coveragePct)}</p>
                            <MiniBar pct={a.syllabus.coveragePct} color="#f97316" />
                            <div className="mt-1 flex items-center gap-1.5">
                              <PaceBadge pace={a.syllabus.pace} />
                              {a.syllabus.stale && <Badge label="Stale" variant="warning" />}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'attendance' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3 text-xs text-[#64748b]">
                {['M', 'O', 'X', 'P', 'E', '-'].map((k) => (
                  <span key={k} className="inline-flex items-center gap-1.5"><span className={`w-3 h-3 rounded-sm ${CELL_META[k].cls}`} />{CELL_META[k].label}</span>
                ))}
              </div>
              {t.assignments.map((a) => (
                <div key={a.id}>
                  <p className="text-sm font-semibold text-[#1e293b] mb-1.5">{a.subjectName} <span className="font-normal text-[#94a3b8]">· {a.className} {a.sectionName}</span></p>
                  <div className="flex flex-wrap gap-1">
                    {data.days.map((d, i) => (
                      <button
                        key={d.date}
                        onClick={() => onOpenDay(t.id, d.date)}
                        title={`${fmtDateShort(d.date)} — ${CELL_META[a.attendance.cells[i]].label}`}
                        className={`w-6 h-6 rounded text-[9px] font-semibold ${CELL_META[a.attendance.cells[i]].cls} ${['M', 'O', 'X'].includes(a.attendance.cells[i]) ? 'text-white' : 'text-[#64748b]'}`}
                      >
                        {Number(d.date.slice(8, 10))}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {t.assignments.length === 0 && <p className="text-sm text-[#94a3b8] text-center py-8">No subjects assigned.</p>}
            </div>
          )}

          {tab === 'marks' && (
            <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-xs uppercase text-[#64748b]">
                    {['Exam', 'Class', 'Subject', 'Progress', 'Status', 'Exam ends', 'Last entry', 'Entered by'].map((h) => <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {t.assignments.flatMap((a) => a.marks).length === 0 && <tr><td colSpan={8} className="py-10 text-center text-[#94a3b8]">No exams configured for this teacher&apos;s subjects.</td></tr>}
                  {t.assignments.flatMap((a) => a.marks).map((m) => (
                    <tr key={m.key} className="border-b border-[#f1f5f9]">
                      <td className="px-3 py-2.5 font-semibold text-[#1e293b] whitespace-nowrap">{m.examName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#374151]">{m.className} · {m.sectionName}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-[#374151]">{m.subjectName}</td>
                      <td className="px-3 py-2.5 min-w-[120px]"><p className="text-xs text-[#64748b] mb-1">{m.entered}/{m.expected}</p><MiniBar pct={m.completionPct} /></td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Badge label={MARKS_STATUS[m.status].label} variant={MARKS_STATUS[m.status].variant} />
                          {m.overdue && <Badge label="Overdue" variant="danger" />}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-[#64748b] whitespace-nowrap">{m.examEnd ? fmtDateShort(m.examEnd) : 'No date'}</td>
                      <td className="px-3 py-2.5 text-xs text-[#64748b] whitespace-nowrap">{fmtDateTime(m.lastEntryAt)}</td>
                      <td className="px-3 py-2.5 text-xs text-[#64748b]">{m.enteredBy.length ? m.enteredBy.map((e) => e.name).join(', ') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'activity' && (
            <div className="grid lg:grid-cols-3 gap-4">
              <div className="lg:col-span-2">
                <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-2">Recent activity in this range</p>
                {data.timeline.length === 0 ? (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-6 text-center">No attendance, marks or syllabus activity in this range.</p>
                ) : (
                  <ul className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                    {data.timeline.map((e) => (
                      <li key={e.id} className="flex items-start gap-3 bg-[#f8fafc] rounded-lg px-3 py-2">
                        <span className="text-xs text-[#94a3b8] whitespace-nowrap pt-0.5 w-28 shrink-0">{e.atLocal}</span>
                        <div className="min-w-0">
                          <p className="text-sm text-[#1e293b]">{e.text}</p>
                          {e.detail && <p className="text-xs text-[#94a3b8]">{e.detail}</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-2">Correction requests</p>
                {data.corrections.length === 0 ? (
                  <p className="text-sm text-[#94a3b8]">None.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {data.corrections.map((c) => (
                      <li key={c.id} className="bg-[#f8fafc] rounded-lg px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <Badge label={c.type} variant="info" />
                          <Badge label={c.status} variant={c.status === 'pending' ? 'warning' : c.status === 'approved' ? 'success' : 'danger'} />
                        </div>
                        <p className="text-xs text-[#475569] mt-1">{c.reason}</p>
                        <p className="text-[10px] text-[#94a3b8] mt-0.5">{fmtDateTime(c.createdAt)}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}