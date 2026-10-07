import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { getSyllabusMyClasses, getSyllabusTracker, saveSyllabusProgress, getSyllabusReadiness } from '../../api/faculty.api';
import Card from '../../components/ui/Card';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import { errMsg } from '../../components/calendar/calendarUtils';
import { ProgressBar, PaceBadge, Notice, Select, TabBar, ChapterTracker, ReadinessPanel } from '../../components/syllabus/SyllabusUI';
import { PACE_META, fmtPct, updatedLabel } from '../../components/syllabus/syllabusUtils';

function TrackerView({ row, sessionId, onBack }) {
  const qc = useQueryClient();
  const params = { sessionId, classId: row.classId, sectionId: row.sectionId, subjectId: row.subjectId };
  const [notice, setNotice] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['fa-syl-tracker', params],
    queryFn: () => getSyllabusTracker(params).then((r) => r.data.data),
  });

  const save = useMutation({
    mutationFn: (updates) => saveSyllabusProgress({ ...params, updates }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fa-syl-tracker'] });
      qc.invalidateQueries({ queryKey: ['fa-syl-classes'] });
    },
  });

  async function onSave(updates) {
    setNotice(null);
    try {
      await save.mutateAsync(updates);
      setNotice({ type: 'success', text: 'Progress saved.' });
      return true;
    } catch (e) {
      setNotice({ type: 'error', text: errMsg(e, 'Could not save progress.') });
      return false;
    }
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" icon={ArrowLeft} onClick={onBack}>Back to my classes</Button>
      <div>
        <h2 className="text-lg font-extrabold text-[#1e293b]">{row.className} {row.sectionName} · {row.subjectName}</h2>
        {data && !data.editable && <p className="text-xs text-[#64748b] mt-1">View only. You are the class teacher here but do not teach this subject.</p>}
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : isError ? (
        <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load the tracker.') }} />
      ) : (
        <>
          <Card>
            <div className="flex items-center gap-4">
              <div className="flex-1"><ProgressBar pct={data.summary.coveragePct} expected={data.summary.expectedPct} color={(PACE_META[data.summary.pace] || PACE_META.no_plan).bar} /></div>
              <span className="text-lg font-extrabold text-[#1e293b]">{fmtPct(data.summary.coveragePct)}</span>
              <PaceBadge pace={data.summary.pace} />
            </div>
            <p className="text-xs text-[#64748b] mt-2">
              {data.summary.completedChapters} of {data.summary.totalChapters} chapters completed
              {data.summary.expectedPct !== null && ` · plan expects ${fmtPct(data.summary.expectedPct)} by today`}
            </p>
          </Card>
          <ChapterTracker chapters={data.chapters} editable={data.editable} saving={save.isPending} onSave={onSave} />
        </>
      )}
    </div>
  );
}

function ReadinessTab({ examTypes, classNames }) {
  const [examTypeId, setExamTypeId] = useState('');
  const activeId = examTypeId || examTypes[0]?.id || '';
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['fa-syl-readiness', activeId],
    queryFn: () => getSyllabusReadiness({ examTypeId: activeId }).then((r) => r.data.data),
    enabled: !!activeId,
  });
  if (!examTypes.length) return <Card><p className="text-sm text-[#94a3b8] text-center py-10">No exams found for your classes yet.</p></Card>;
  return (
    <div className="space-y-4">
      <Select value={activeId} onChange={setExamTypeId} className="min-w-[240px]">
        {examTypes.map((e) => <option key={e.id} value={e.id}>{e.name} · {classNames[e.classId] || ''}</option>)}
      </Select>
      {isError ? <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load exam readiness.') }} /> : <ReadinessPanel data={data} loading={isLoading} />}
    </div>
  );
}

export default function FacultySyllabus() {
  const [tab, setTab] = useState('classes');
  const [selected, setSelected] = useState(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['fa-syl-classes'],
    queryFn: () => getSyllabusMyClasses().then((r) => r.data.data),
  });

  const rows = data?.rows || [];
  const classNames = Object.fromEntries(rows.map((r) => [r.classId, r.className]));

  if (selected) return <TrackerView row={selected} sessionId={data.sessionId} onBack={() => setSelected(null)} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Syllabus Tracker</h1>
        <p className="text-sm text-[#64748b] mt-1">Update how much you have covered in each class, and see how ready every exam is.</p>
      </div>
      <TabBar tabs={[{ value: 'classes', label: 'My classes' }, { value: 'readiness', label: 'Exam readiness' }]} value={tab} onChange={setTab} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : isError ? (
        <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load your classes.') }} />
      ) : tab === 'readiness' ? (
        <ReadinessTab examTypes={data.examTypes} classNames={classNames} />
      ) : rows.length === 0 ? (
        <Card><p className="text-sm text-[#94a3b8] text-center py-10">You have no class or subject assignments in the current session.</p></Card>
      ) : (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((r) => (
            <button key={`${r.sectionId}|${r.subjectId}`} onClick={() => setSelected(r)} className="text-left">
              <Card className="h-full hover:border-[#f97316] transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-[#1e293b]">{r.subjectName}</p>
                    <p className="text-xs text-[#64748b]">{r.className} {r.sectionName}</p>
                  </div>
                  {!r.editable && <Badge label="View only" variant="default" />}
                </div>
                {r.setUp ? (
                  <div className="mt-4 space-y-2">
                    <ProgressBar pct={r.coveragePct} expected={r.expectedPct} color={(PACE_META[r.pace] || PACE_META.no_plan).bar} />
                    <div className="flex items-center justify-between text-xs text-[#64748b]">
                      <span>{r.completedChapters}/{r.totalChapters} chapters · {fmtPct(r.coveragePct)}</span>
                      <PaceBadge pace={r.pace} />
                    </div>
                    <p className={`text-xs ${r.stale ? 'text-amber-600 font-semibold' : 'text-[#94a3b8]'}`}>{updatedLabel(r.daysSinceUpdate)}</p>
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-amber-600">Syllabus not set up yet. Ask the school admin to add chapters.</p>
                )}
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}