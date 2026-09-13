import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, AlertTriangle, BookOpen, Lock } from 'lucide-react';
import {
  getMyAssignments,
  getMyExamSubjects,
  getRosterForMarks,
  enterMarks,
} from '../../api/faculty.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';

export default function FacultyMarks() {
  const qc = useQueryClient();

  const [sessionId, setSessionId]       = useState('');
  const [classId, setClassId]           = useState('');
  const [subjectId, setSubjectId]       = useState('');
  const [examSubjectId, setExamSubjectId] = useState('');
  const [marksMap, setMarksMap]         = useState({});
  const [submitted, setSubmitted]       = useState(false);
  const [apiError, setApiError]         = useState('');

  // ── Assignments ──────────────────────────────────────────────────────────
  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ['faculty-assignments'],
    queryFn: () => getMyAssignments().then((r) => r.data.data ?? []),
  });

  const uniqueSessions = [...new Map(assignments.map((a) => [a.sessionId, a.session])).values()];
  const classesForSession = [...new Map(
    assignments.filter((a) => a.sessionId === sessionId).map((a) => [a.class.id, a.class])
  ).values()];
  const subjectsForClass = [...new Map(
    assignments.filter((a) => a.sessionId === sessionId && a.class.id === classId).map((a) => [a.subject.id, a.subject])
  ).values()];

  // Cascade resets
  useEffect(() => { setClassId(''); setSubjectId(''); setExamSubjectId(''); setMarksMap({}); setSubmitted(false); setApiError(''); }, [sessionId]);
  useEffect(() => { setSubjectId(''); setExamSubjectId(''); setMarksMap({}); setSubmitted(false); setApiError(''); }, [classId]);
  useEffect(() => { setExamSubjectId(''); setMarksMap({}); setSubmitted(false); setApiError(''); }, [subjectId]);
  useEffect(() => { setMarksMap({}); setSubmitted(false); setApiError(''); }, [examSubjectId]);

  // ── Exam Subjects ────────────────────────────────────────────────────────
  const canFetchExams = !!(sessionId && classId && subjectId);

  const { data: examSubjects = [], isLoading: loadingExams } = useQuery({
    queryKey: ['faculty-exam-subjects', sessionId, classId, subjectId],
    queryFn: () => getMyExamSubjects({ sessionId, classId, subjectId }).then((r) => r.data.data ?? []),
    enabled: canFetchExams,
  });

  // ── Roster for Marks ─────────────────────────────────────────────────────
  const { data: rosterData, isLoading: loadingRoster, isError: rosterError } = useQuery({
    queryKey: ['marks-roster', examSubjectId],
    queryFn: () => getRosterForMarks({ examSubjectId }).then((r) => r.data.data),
    enabled: !!examSubjectId,
  });

  // React Query v5 removed onSuccess from useQuery — sync local state via effect instead
  useEffect(() => {
    if (!rosterData) return;
    const init = {};
    (rosterData.enrollments ?? []).forEach((e) => {
      init[e.id] = e.marks?.[0] ? String(e.marks[0].marksObtained) : '';
    });
    setMarksMap(init);
    setSubmitted(false);
    setApiError('');
  }, [rosterData]);

  const maxMarks  = rosterData ? Number(rosterData.maxMarks)  : null;
  const passMarks = rosterData ? Number(rosterData.passingMarks) : null;
  const enrollments = rosterData?.enrollments ?? [];
  const alreadyAllSubmitted = enrollments.length > 0 && enrollments.every((e) => e.marks?.length > 0);

  // ── Submit ───────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: enterMarks,
    onSuccess: () => {
      setSubmitted(true);
      setApiError('');
      qc.invalidateQueries(['marks-roster']);
    },
    onError: (err) => {
      setApiError(err?.response?.data?.message || 'Failed to submit marks. Please try again.');
    },
  });

  function handleSubmit() {
    setApiError('');
    const records = enrollments
      .filter((e) => !e.marks?.length && marksMap[e.id] !== '' && marksMap[e.id] !== undefined)
      .map((e) => ({ enrollmentId: e.id, marksObtained: parseFloat(marksMap[e.id]) }));

    if (records.length === 0) {
      setApiError('No new marks to submit.');
      return;
    }

    // Client-side max marks validation
    const invalid = records.filter((r) => maxMarks !== null && r.marksObtained > maxMarks);
    if (invalid.length > 0) {
      setApiError(`Marks cannot exceed max marks (${maxMarks}). Please correct highlighted fields.`);
      return;
    }

    mutation.mutate({ examSubjectId, records });
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Enter Marks</h1>
        <p className="text-sm text-[#64748b] mt-1">Select subject and exam, then enter marks for each student.</p>
      </div>

      {/* Step 1 – Filters */}
      <Card>
        <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-3">Step 1 — Select Subject</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#64748b]">Session</label>
            {loadingAssignments ? (
              <div className="h-10 bg-[#f1f5f9] rounded-lg animate-pulse" />
            ) : (
              <select
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
                className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white text-[#1e293b]"
              >
                <option value="">Select session</option>
                {uniqueSessions.map((s) => (
                  <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' (Current)' : ''}</option>
                ))}
              </select>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#64748b]">Class</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={!sessionId}
              className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white text-[#1e293b] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select class</option>
              {classesForSession.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#64748b]">Subject</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={!classId}
              className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white text-[#1e293b] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select subject</option>
              {subjectsForClass.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {/* Step 2 – Select Exam */}
      {canFetchExams && (
        <Card>
          <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-3">Step 2 — Select Exam</p>
          {loadingExams ? (
            <div className="flex gap-3">
              {[1, 2, 3].map((i) => <div key={i} className="h-14 w-32 bg-[#f1f5f9] rounded-xl animate-pulse" />)}
            </div>
          ) : examSubjects.length === 0 ? (
            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <AlertTriangle size={16} />
              No exams configured for this subject yet. Ask your school admin to set up exam types.
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {examSubjects.map((es) => (
                <button
                  key={es.id}
                  onClick={() => setExamSubjectId(es.id)}
                  className={`flex flex-col items-start px-4 py-3 rounded-xl border-2 text-left transition-all ${
                    examSubjectId === es.id
                      ? 'border-[#f97316] bg-orange-50'
                      : 'border-[#e2e8f0] hover:border-[#f97316] hover:bg-orange-50/50'
                  }`}
                >
                  <span className="text-sm font-bold text-[#1e293b]">{es.examType.name}</span>
                  <span className="text-xs text-[#64748b] mt-0.5">Max: {es.maxMarks} · Pass: {es.passingMarks}</span>
                </button>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Step 3 – Marks entry */}
      {examSubjectId && (
        <Card padding={false}>
          {loadingRoster ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : rosterError ? (
            <div className="flex flex-col items-center py-16 gap-2">
              <AlertTriangle size={32} className="text-red-400" />
              <p className="text-sm text-red-600">Failed to load students. Please try again.</p>
            </div>
          ) : enrollments.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-2">
              <BookOpen size={36} className="text-[#e2e8f0]" />
              <p className="text-sm text-[#94a3b8]">No students found for this exam.</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="flex flex-wrap items-center gap-3 px-5 py-3 bg-[#f8fafc] border-b border-[#e2e8f0] rounded-t-xl">
                <span className="text-sm font-semibold text-[#1e293b]">Max Marks: {maxMarks}</span>
                <span className="text-sm text-[#64748b]">·</span>
                <span className="text-sm text-[#64748b]">Passing: {passMarks}</span>
                <span className="text-xs text-[#94a3b8] ml-auto">{enrollments.length} students</span>
              </div>

              {alreadyAllSubmitted && (
                <div className="flex items-center gap-2 mx-5 mt-4 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
                  <Lock size={15} />
                  Marks for all students are already submitted. To make changes, raise a correction request.
                </div>
              )}

              {/* Students */}
              <div className="divide-y divide-[#f1f5f9]">
                {enrollments.map((enrollment) => {
                  const alreadyDone = enrollment.marks?.length > 0;
                  const val = marksMap[enrollment.id] ?? '';
                  const numVal = val !== '' ? parseFloat(val) : null;
                  const overMax = maxMarks !== null && numVal !== null && numVal > maxMarks;
                  const isPassing = numVal !== null && passMarks !== null && numVal >= passMarks;

                  return (
                    <div key={enrollment.id} className="flex items-center justify-between px-5 py-3 hover:bg-[#fafafa]">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1e293b] truncate">{enrollment.student.name}</p>
                        <p className="text-xs text-[#94a3b8]">#{enrollment.student.enrollmentNumber}</p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {alreadyDone ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-[#1e293b]">{enrollment.marks[0].marksObtained}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                              Number(enrollment.marks[0].marksObtained) >= passMarks
                                ? 'bg-green-100 text-green-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {Number(enrollment.marks[0].marksObtained) >= passMarks ? 'Pass' : 'Fail'}
                            </span>
                            <Lock size={14} className="text-[#94a3b8]" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min={0}
                              max={maxMarks ?? undefined}
                              step="0.5"
                              placeholder="—"
                              value={val}
                              disabled={submitted}
                              onChange={(e) => setMarksMap((prev) => ({ ...prev, [enrollment.id]: e.target.value }))}
                              className={`w-24 border rounded-lg px-3 py-1.5 text-sm text-center focus:outline-none focus:ring-2 transition-all disabled:bg-[#f1f5f9] disabled:cursor-not-allowed ${
                                overMax
                                  ? 'border-red-400 focus:ring-red-400 bg-red-50'
                                  : 'border-[#e2e8f0] focus:ring-[#f97316]'
                              }`}
                            />
                            {numVal !== null && !overMax && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isPassing ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {isPassing ? 'Pass' : 'Fail'}
                              </span>
                            )}
                            {overMax && <span className="text-xs text-red-600 font-semibold">Over max</span>}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-5 py-4 border-t border-[#e2e8f0] bg-[#f8fafc] rounded-b-xl">
                <div>
                  {submitted && (
                    <p className="text-sm font-semibold text-green-600 flex items-center gap-1.5">
                      <CheckCircle size={16} /> Marks submitted and locked successfully.
                    </p>
                  )}
                  {apiError && (
                    <p className="text-sm text-red-600 flex items-center gap-1.5">
                      <AlertTriangle size={16} /> {apiError}
                    </p>
                  )}
                </div>
                {!alreadyAllSubmitted && (
                  <Button
                    onClick={handleSubmit}
                    loading={mutation.isPending}
                    disabled={submitted}
                  >
                    {submitted ? 'Submitted' : 'Submit Marks'}
                  </Button>
                )}
              </div>
            </>
          )}
        </Card>
      )}

      {!canFetchExams && !loadingAssignments && (
        <div className="flex flex-col items-center py-16 text-center text-[#94a3b8]">
          <BookOpen size={40} className="mb-3 text-[#e2e8f0]" />
          <p className="text-sm">Select session, class and subject above to begin.</p>
        </div>
      )}
    </div>
  );
}