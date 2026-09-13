import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle, XCircle, Clock, AlertTriangle, Users, BookOpen } from 'lucide-react';
import {
  getMyAssignments,
  getRosterForAttendance,
  markAttendance,
} from '../../api/faculty.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';

const STATUSES = ['present', 'absent', 'late'];

const STATUS_CONFIG = {
  present: {
    icon: CheckCircle,
    active:   'bg-green-100 text-green-700 border-green-400',
    inactive: 'border-[#e2e8f0] text-[#94a3b8] hover:border-green-300 hover:text-green-600',
  },
  absent: {
    icon: XCircle,
    active:   'bg-red-100 text-red-700 border-red-400',
    inactive: 'border-[#e2e8f0] text-[#94a3b8] hover:border-red-300 hover:text-red-600',
  },
  late: {
    icon: Clock,
    active:   'bg-amber-100 text-amber-700 border-amber-400',
    inactive: 'border-[#e2e8f0] text-[#94a3b8] hover:border-amber-300 hover:text-amber-600',
  },
};

export default function FacultyAttendance() {
  const qc = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const [sessionId,  setSessionId]  = useState('');
  const [classId,    setClassId]    = useState('');
  const [sectionId,  setSectionId]  = useState('');
  const [subjectId,  setSubjectId]  = useState('');   // ← NEW: subject-wise
  const [date,       setDate]       = useState(today);
  const [attendance, setAttendance] = useState({});
  const [submitted,  setSubmitted]  = useState(false);
  const [apiError,   setApiError]   = useState('');

  // ── Assignments ───────────────────────────────────────────────────────────
  const {
    data: assignments = [],
    isLoading: loadingAssignments,
    isError: assignmentsError,
    error: assignmentsErrorObj,
  } = useQuery({
    queryKey: ['faculty-assignments'],
    queryFn: () => getMyAssignments().then((r) => r.data.data ?? []),
    retry: false,
  });

  // Unique sessions
  const uniqueSessions = [
    ...new Map(assignments.map((a) => [a.sessionId, a.session])).values(),
  ];

  // Classes for selected session
  const classesForSession = [
    ...new Map(
      assignments
        .filter((a) => a.sessionId === sessionId)
        .map((a) => [a.class.id, a.class])
    ).values(),
  ];

  // Sections for selected class — only real assignments (subject not null),
  // because class-teacher pseudo-entries have no subject to teach attendance for.
  const sectionsForClass = [
    ...new Map(
      assignments
        .filter((a) => a.sessionId === sessionId && a.class.id === classId && a.subject !== null)
        .map((a) => [a.section.id, a.section])
    ).values(),
  ];

  // Subjects THIS faculty teaches in the selected section
  // (one teacher may teach multiple subjects in the same section)
  const subjectsForSection = assignments
    .filter(
      (a) =>
        a.sessionId === sessionId &&
        a.class.id  === classId   &&
        a.section.id === sectionId &&
        a.subject !== null
    )
    .map((a) => a.subject)
    // deduplicate
    .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);

  // Auto-select active session
  useEffect(() => {
    if (!sessionId && uniqueSessions.length) {
      const active = uniqueSessions.find((s) => s.isActive) || uniqueSessions[0];
      setSessionId(active.id);
    }
  }, [assignments]); // eslint-disable-line

  useEffect(() => { setClassId('');   setSectionId(''); setSubjectId(''); resetRoster(); }, [sessionId]);
  useEffect(() => { setSectionId(''); setSubjectId(''); resetRoster(); }, [classId]);
  useEffect(() => { setSubjectId(''); resetRoster(); }, [sectionId]);
  useEffect(() => { resetRoster(); }, [subjectId, date]);

  function resetRoster() {
    setAttendance({});
    setSubmitted(false);
    setApiError('');
  }

  // Auto-select subject when only one exists in the section
  useEffect(() => {
    if (subjectsForSection.length === 1 && !subjectId) {
      setSubjectId(subjectsForSection[0].id);
    }
  }, [sectionId, assignments]); // eslint-disable-line

  // ── Roster ────────────────────────────────────────────────────────────────
  const canFetchRoster = !!(sessionId && classId && sectionId && subjectId);

  const {
    data: roster = [],
    isLoading: loadingRoster,
    isError: rosterError,
    error: rosterErrorObj,
  } = useQuery({
    queryKey: ['attendance-roster', sessionId, classId, sectionId, subjectId, date],
    queryFn: () =>
      getRosterForAttendance({ sessionId, classId, sectionId, subjectId, date })
        .then((r) => r.data.data ?? []),
    enabled: canFetchRoster,
  });

  // Initialise local attendance state from fetched roster
  useEffect(() => {
    if (!roster || roster.length === 0) return;
    const init = {};
    roster.forEach((e) => {
      init[e.id] = e.attendance?.[0]?.status || 'present';
    });
    setAttendance(init);
    setSubmitted(roster.every((e) => e.attendance?.length > 0));
    setApiError('');
  }, [roster]);

  // ── Submit ────────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: markAttendance,
    onSuccess: () => {
      setSubmitted(true);
      setApiError('');
      qc.invalidateQueries({ queryKey: ['attendance-roster'] });
    },
    onError: (err) => {
      setApiError(
        err?.response?.data?.message || 'Failed to submit attendance. Please try again.'
      );
    },
  });

  function handleMarkAll(status) {
    const all = {};
    roster.forEach((e) => { all[e.id] = status; });
    setAttendance(all);
  }

  function handleSubmit() {
    setApiError('');
    const records = roster.map((e) => ({
      enrollmentId: e.id,
      status: attendance[e.id] || 'present',
    }));
    mutation.mutate({ sessionId, classId, sectionId, subjectId, date, records });
  }

  const stats = {
    present: Object.values(attendance).filter((s) => s === 'present').length,
    absent:  Object.values(attendance).filter((s) => s === 'absent').length,
    late:    Object.values(attendance).filter((s) => s === 'late').length,
  };

  const allFilled = roster.length > 0 && roster.every((e) => attendance[e.id]);

  // Selected subject name for display
  const selectedSubject = subjectsForSection.find((s) => s.id === subjectId);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Mark Attendance</h1>
        <p className="text-sm text-[#64748b] mt-1">
          Select your subject and date, then mark each student's attendance.
        </p>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">

          {/* Session */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Session</label>
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
                  <option key={s.id} value={s.id}>
                    {s.label}{s.isActive ? ' (Current)' : ''}
                  </option>
                ))}
              </select>
            )}
            {assignmentsError && (
              <p className="text-xs text-red-600 mt-1">
                Error: {assignmentsErrorObj?.response?.data?.message || assignmentsErrorObj?.message}
              </p>
            )}
            {!assignmentsError && !loadingAssignments && assignments.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No assignments found. Contact admin.</p>
            )}
          </div>

          {/* Class */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Class</label>
            <select
              value={classId}
              onChange={(e) => setClassId(e.target.value)}
              disabled={!sessionId}
              className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white text-[#1e293b] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select class</option>
              {classesForSession.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Section */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Section</label>
            <select
              value={sectionId}
              onChange={(e) => setSectionId(e.target.value)}
              disabled={!classId}
              className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white text-[#1e293b] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select section</option>
              {sectionsForClass.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Subject ← NEW */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">
              Subject
            </label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              disabled={!sectionId || subjectsForSection.length === 0}
              className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white text-[#1e293b] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="">Select subject</option>
              {subjectsForSection.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            {sectionId && subjectsForSection.length === 0 && (
              <p className="text-xs text-amber-600 mt-1">No subject assignments for this section.</p>
            )}
          </div>

          {/* Date */}
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#64748b] uppercase tracking-wide">Date</label>
            <input
              type="date"
              value={date}
              max={today}
              onChange={(e) => { setDate(e.target.value); setApiError(''); }}
              className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white text-[#1e293b]"
            />
          </div>
        </div>

        {/* Context banner when subject is selected */}
        {selectedSubject && sectionId && (
          <div className="mt-4 flex items-center gap-2 text-xs text-[#f97316] bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            <BookOpen size={14} className="shrink-0" />
            Marking attendance for <strong>{selectedSubject.name}</strong> — only your subject's records are tracked separately.
          </div>
        )}
      </Card>

      {/* Roster */}
      {canFetchRoster && (
        <Card padding={false}>
          {loadingRoster ? (
            <div className="flex justify-center py-16"><Spinner size="lg" /></div>
          ) : rosterError ? (
            <div className="flex flex-col items-center py-16 gap-2">
              <AlertTriangle size={32} className="text-red-400" />
              <p className="text-sm text-red-600">
                {rosterErrorObj?.response?.data?.message || 'Failed to load students. Please try again.'}
              </p>
            </div>
          ) : roster.length === 0 ? (
            <div className="flex flex-col items-center py-16 gap-2">
              <Users size={36} className="text-[#e2e8f0]" />
              <p className="text-sm text-[#94a3b8]">No active students in this class/section.</p>
            </div>
          ) : (
            <>
              {/* Stats bar */}
              <div className="flex flex-wrap items-center gap-4 px-5 py-3 bg-[#f8fafc] border-b border-[#e2e8f0] rounded-t-xl">
                <span className="text-sm font-semibold text-green-700">✓ Present: {stats.present}</span>
                <span className="text-sm font-semibold text-red-700">✗ Absent: {stats.absent}</span>
                <span className="text-sm font-semibold text-amber-700">⏱ Late: {stats.late}</span>
                <span className="text-xs text-[#94a3b8] ml-auto">Total: {roster.length}</span>
              </div>

              {submitted && (
                <div className="flex items-center gap-2 mx-5 mt-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
                  <CheckCircle size={15} />
                  Already saved for this date. You can still edit and re-save anytime.
                </div>
              )}

              {/* Bulk mark */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-[#e2e8f0]">
                <span className="text-xs font-semibold text-[#64748b] uppercase">Mark all:</span>
                {STATUSES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleMarkAll(s)}
                    className={`text-xs px-3 py-1 rounded-full border font-semibold capitalize transition-all ${STATUS_CONFIG[s].active}`}
                  >
                    {s}
                  </button>
                ))}
              </div>

              {/* Student list */}
              <div className="divide-y divide-[#f1f5f9]">
                {roster.map((enrollment) => {
                  const current = attendance[enrollment.id] || 'present';
                  return (
                    <div
                      key={enrollment.id}
                      className="flex items-center justify-between px-5 py-3 hover:bg-[#fafafa]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-[#1e293b] truncate">
                          {enrollment.student.name}
                        </p>
                        <p className="text-xs text-[#94a3b8]">
                          #{enrollment.student.enrollmentNumber}
                          {enrollment.rollNumber ? ` · Roll ${enrollment.rollNumber}` : ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {STATUSES.map((s) => {
                          const cfg = STATUS_CONFIG[s];
                          const Icon = cfg.icon;
                          const isActive = current === s;
                          return (
                            <button
                              key={s}
                              onClick={() => {
                                setAttendance((prev) => ({ ...prev, [enrollment.id]: s }));
                                setSubmitted(false);
                              }}
                              className={`flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-full border font-semibold capitalize transition-all ${
                                isActive ? cfg.active : cfg.inactive
                              }`}
                            >
                              <Icon size={12} /> {s}
                            </button>
                          );
                        })}
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
                      <CheckCircle size={16} /> Attendance saved. You can still make changes anytime.
                    </p>
                  )}
                  {apiError && (
                    <p className="text-sm text-red-600 flex items-center gap-1.5">
                      <AlertTriangle size={16} /> {apiError}
                    </p>
                  )}
                </div>
                <Button
                  onClick={handleSubmit}
                  loading={mutation.isPending}
                  disabled={!allFilled}
                >
                  {mutation.isPending ? 'Saving...' : 'Save Attendance'}
                </Button>
              </div>
            </>
          )}
        </Card>
      )}

      {!canFetchRoster && !loadingAssignments && (
        <div className="flex flex-col items-center py-16 text-center text-[#94a3b8]">
          <Users size={40} className="mb-3 text-[#e2e8f0]" />
          <p className="text-sm">
            {!sessionId ? 'Select a session to begin.' :
             !classId   ? 'Now select a class.' :
             !sectionId ? 'Now select a section.' :
                          'Select a subject to load the student roster.'}
          </p>
        </div>
      )}
    </div>
  );
}