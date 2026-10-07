import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { getMyChildren, getChildSyllabus } from '../../api/parent.api';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';
import { errMsg, fmtRange } from '../../components/calendar/calendarUtils';
import { ProgressBar, Notice } from '../../components/syllabus/SyllabusUI';
import { fmtPct, examDaysLabel } from '../../components/syllabus/syllabusUtils';

const STATUS_BADGE = {
  completed:   { label: 'Completed',   variant: 'success' },
  in_progress: { label: 'In progress', variant: 'orange' },
  not_started: { label: 'Upcoming',    variant: 'default' },
};

export default function ParentSyllabus() {
  const [childId, setChildId] = useState('');
  const [open, setOpen] = useState({});

  const { data: children = [], isLoading: loadingChildren } = useQuery({
    queryKey: ['my-children'],
    queryFn: () => getMyChildren().then((r) => r.data.data ?? []),
  });
  const activeChildId = childId || children[0]?.id || '';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pa-syllabus', activeChildId],
    queryFn: () => getChildSyllabus({ studentId: activeChildId }).then((r) => r.data.data),
    enabled: !!activeChildId,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Syllabus Progress</h1>
        <p className="text-sm text-[#64748b] mt-1">How much of each subject has been taught in your child's section.</p>
      </div>

      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => { setChildId(c.id); setOpen({}); }}
              className={`px-3 sm:px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                activeChildId === c.id ? 'border-[#f97316] bg-orange-50 text-[#f97316]' : 'border-[#e2e8f0] text-[#64748b] hover:border-[#f97316]'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loadingChildren || (activeChildId && isLoading) ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !activeChildId ? (
        <Card><p className="text-sm text-[#94a3b8] text-center py-8">No children found.</p></Card>
      ) : isError ? (
        <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load the syllabus.') }} />
      ) : (
        <>
          <p className="text-sm text-[#475569]">{data.className} · Section {data.sectionName} · {data.session.label}</p>

          {data.exams.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold text-[#1e293b] uppercase tracking-wide">Exam syllabus coverage</h2>
              <div className="grid md:grid-cols-2 gap-4">
                {data.exams.map((e) => (
                  <Card key={e.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-[#1e293b]">{e.name}</p>
                        <p className="text-xs text-[#64748b]">
                          {e.examDate ? `${fmtRange(e.examDate.startDate, e.examDate.endDate)} · ${examDaysLabel(e.examDate.daysLeft)}` : 'Date to be announced'}
                        </p>
                      </div>
                      <p className="text-xl font-extrabold text-[#1e293b]">{fmtPct(e.coveragePct)}</p>
                    </div>
                    <div className="mt-3 space-y-2">
                      {e.subjects.map((s) => (
                        <div key={s.subjectName}>
                          <div className="flex justify-between text-xs text-[#64748b] mb-1">
                            <span>{s.subjectName}</span>
                            <span>{s.completedChapters}/{s.totalChapters} chapters</span>
                          </div>
                          <ProgressBar pct={s.coveragePct} color="#3b82f6" height="h-2" />
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-3">
            <h2 className="text-sm font-bold text-[#1e293b] uppercase tracking-wide">Subjects</h2>
            {data.subjects.length === 0 ? (
              <Card><p className="text-sm text-[#94a3b8] text-center py-8">No subjects found.</p></Card>
            ) : (
              data.subjects.map((s) => (
                <Card key={s.id} padding={false}>
                  <button disabled={!s.setUp} onClick={() => setOpen((o) => ({ ...o, [s.id]: !o[s.id] }))} className="w-full text-left p-4 flex items-center gap-3">
                    {s.setUp ? (open[s.id] ? <ChevronDown size={16} className="text-[#94a3b8]" /> : <ChevronRight size={16} className="text-[#94a3b8]" />) : <span className="w-4" />}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-[#1e293b]">{s.name}</p>
                        {s.setUp && <p className="text-sm font-bold text-[#1e293b]">{fmtPct(s.coveragePct)}</p>}
                      </div>
                      {s.setUp ? (
                        <>
                          <div className="mt-2"><ProgressBar pct={s.coveragePct} /></div>
                          <p className="text-xs text-[#64748b] mt-1.5">{s.completedChapters} of {s.totalChapters} chapters completed</p>
                        </>
                      ) : (
                        <p className="text-xs text-[#94a3b8] mt-1">Syllabus details not added yet.</p>
                      )}
                    </div>
                  </button>
                  {open[s.id] && (
                    <div className="border-t border-[#f1f5f9] divide-y divide-[#f1f5f9]">
                      {s.chapters.map((c, i) => (
                        <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                          <p className="text-sm text-[#1e293b]">{i + 1}. {c.title}</p>
                          <div className="flex items-center gap-1.5">
                            {c.exams.map((x) => <Badge key={x} label={x} variant="orange" />)}
                            {c.isRevised && <Badge label="Revised" variant="info" />}
                            <Badge
                              label={c.status === 'in_progress' ? `${c.percentDone}% done` : STATUS_BADGE[c.status].label}
                              variant={STATUS_BADGE[c.status].variant}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}