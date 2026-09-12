import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { BarChart3, TrendingUp, TrendingDown, Users, Percent, Download, Search } from 'lucide-react';
import {
  getSessions, getClasses, getSubjects, getExamTypes, getStudents,
  getExamStats, getMarksDefaulters, getAttendanceDefaulters,
  getReportCard, downloadReportCard,
} from '../../api/schooladmin.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Spinner from '../../components/ui/Spinner';

const TABS = [
  { key: 'exam-stats', label: 'Exam Performance' },
  { key: 'marks-defaulters', label: 'Marks Defaulters' },
  { key: 'attendance-defaulters', label: 'Attendance Defaulters' },
  { key: 'report-card', label: 'Student Report Card' },
];

function StatCard({ label, value, icon: Icon, color }) {
  const colors = {
    navy:   { bg: 'bg-[#f0f4ff]', icon: 'text-[#1e293b]', val: 'text-[#1e293b]' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-600', val: 'text-green-700' },
    orange: { bg: 'bg-orange-50', icon: 'text-[#f97316]', val: 'text-[#f97316]' },
    red:    { bg: 'bg-red-50',    icon: 'text-red-600',   val: 'text-red-700' },
  };
  const c = colors[color] || colors.navy;
  return (
    <Card className="flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
        <Icon size={20} className={c.icon} />
      </div>
      <div>
        <p className="text-xs font-medium text-[#64748b] uppercase tracking-wide">{label}</p>
        <p className={`text-xl font-extrabold mt-0.5 ${c.val}`}>{value}</p>
      </div>
    </Card>
  );
}

// Shared Session -> Class filter bar used by most tabs
function useSessionClass() {
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('');

  const { data: sessions } = useQuery({
    queryKey: ['ad-sessions'],
    queryFn: () => getSessions().then((r) => r.data.data),
  });

  useEffect(() => {
    if (!sessionId && sessions?.length) {
      const active = sessions.find((s) => s.isActive) || sessions[0];
      setSessionId(active.id);
    }
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: allClasses } = useQuery({
    queryKey: ['ad-classes'],
    queryFn: () => getClasses().then((r) => r.data.data),
  });

  const classesForSession = (allClasses || []).filter((c) => c.sessionId === sessionId);

  useEffect(() => { setClassId(''); }, [sessionId]);

  return { sessions: sessions || [], sessionId, setSessionId, classesForSession, classId, setClassId };
}

export default function AdminAnalytics() {
  const [tab, setTab] = useState('exam-stats');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Analytics</h1>
        <p className="text-sm text-[#64748b] mt-1">Attendance and marks insights across sessions, classes and subjects</p>
      </div>

      <div className="flex gap-2 border-b border-[#e2e8f0] overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
              tab === t.key ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-[#94a3b8] hover:text-[#1e293b]'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'exam-stats' && <ExamStatsTab />}
      {tab === 'marks-defaulters' && <MarksDefaultersTab />}
      {tab === 'attendance-defaulters' && <AttendanceDefaultersTab />}
      {tab === 'report-card' && <ReportCardTab />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exam Performance: session -> class -> exam type -> subject -> stats
// ---------------------------------------------------------------------------
function ExamStatsTab() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId } = useSessionClass();
  const [examTypeId, setExamTypeId] = useState('');
  const [examSubjectId, setExamSubjectId] = useState('');

  const { data: examTypes } = useQuery({
    queryKey: ['ad-exam-types', sessionId, classId],
    queryFn: () => getExamTypes({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  useEffect(() => { setExamTypeId(''); setExamSubjectId(''); }, [classId]);
  useEffect(() => { setExamSubjectId(''); }, [examTypeId]);

  const selectedExamType = (examTypes || []).find((e) => e.id === examTypeId);

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ['ad-exam-stats', examSubjectId],
    queryFn: () => getExamStats(examSubjectId).then((r) => r.data.data),
    enabled: !!examSubjectId,
  });

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Exam Type" value={examTypeId} onChange={setExamTypeId} disabled={!classId}
            options={(examTypes || []).map((e) => ({ value: e.id, label: e.name }))} />
          <FilterSelect label="Subject" value={examSubjectId} onChange={setExamSubjectId} disabled={!examTypeId}
            options={(selectedExamType?.examSubjects || []).map((es) => ({ value: es.id, label: es.subject?.name }))} />
        </div>
      </Card>

      {!examSubjectId ? (
        <Card className="bg-[#f8fafc]">
          <p className="text-sm text-[#64748b] text-center py-6">Select a session, class, exam type and subject to view performance stats.</p>
        </Card>
      ) : loadingStats ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : stats.totalEntries === 0 ? (
        <Card className="bg-[#f8fafc]">
          <p className="text-sm text-[#64748b] text-center py-6">No marks entered for this subject yet.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Average" value={stats.average} icon={BarChart3} color="navy" />
          <StatCard label="Highest" value={stats.highest} icon={TrendingUp} color="green" />
          <StatCard label="Lowest" value={stats.lowest} icon={TrendingDown} color="red" />
          <StatCard label="Pass %" value={`${stats.passPercentage}%`} icon={Percent} color="orange" />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Marks Defaulters: below passing marks in a chosen exam type / subject
// ---------------------------------------------------------------------------
function MarksDefaultersTab() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId } = useSessionClass();
  const [examTypeId, setExamTypeId] = useState('');
  const [subjectId, setSubjectId] = useState('');

  const { data: examTypes } = useQuery({
    queryKey: ['ad-exam-types', sessionId, classId],
    queryFn: () => getExamTypes({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  const { data: subjects } = useQuery({
    queryKey: ['ad-subjects', sessionId, classId],
    queryFn: () => getSubjects({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  useEffect(() => { setExamTypeId(''); setSubjectId(''); }, [classId]);

  const { data: defaulters, isLoading } = useQuery({
    queryKey: ['ad-marks-defaulters', examTypeId, subjectId],
    queryFn: () => getMarksDefaulters({ examTypeId, subjectId: subjectId || undefined }).then((r) => r.data.data),
    enabled: !!examTypeId,
  });

  const columns = [
    { key: 'studentName', label: 'Student', render: (r) => (
      <div>
        <p className="font-semibold text-[#1e293b]">{r.studentName}</p>
        <p className="text-xs text-[#94a3b8]">{r.enrollmentNumber}</p>
      </div>
    )},
    { key: 'subject', label: 'Subject' },
    { key: 'marksObtained', label: 'Marks Obtained', render: (r) => <Badge label={String(r.marksObtained)} variant="danger" /> },
    { key: 'passingMarks', label: 'Passing Marks' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Exam Type" value={examTypeId} onChange={setExamTypeId} disabled={!classId}
            options={(examTypes || []).map((e) => ({ value: e.id, label: e.name }))} />
          <FilterSelect label="Subject (optional)" value={subjectId} onChange={setSubjectId} disabled={!classId}
            options={(subjects || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All subjects" />
        </div>
      </Card>

      {!examTypeId ? (
        <Card className="bg-[#f8fafc]"><p className="text-sm text-[#64748b] text-center py-6">Select an exam type to see students below passing marks.</p></Card>
      ) : (
        <Table columns={columns} data={defaulters || []} loading={isLoading} emptyMessage="No defaulters found. Everyone passed." />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attendance Defaulters: below a configurable threshold
// ---------------------------------------------------------------------------
function AttendanceDefaultersTab() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId } = useSessionClass();
  const [sectionId, setSectionId] = useState('');
  const [threshold, setThreshold] = useState(75);

  useEffect(() => { setSectionId(''); }, [classId]);

  const selectedClass = classesForSession.find((c) => c.id === classId);

  const { data: defaulters, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['ad-attendance-defaulters', sessionId, classId, sectionId, threshold],
    queryFn: () => getAttendanceDefaulters({ sessionId, classId: classId || undefined, sectionId: sectionId || undefined, threshold }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const columns = [
    { key: 'studentName', label: 'Student', render: (r) => (
      <div>
        <p className="font-semibold text-[#1e293b]">{r.studentName}</p>
        <p className="text-xs text-[#94a3b8]">{r.enrollmentNumber}</p>
      </div>
    )},
    { key: 'attendancePercentage', label: 'Attendance %', render: (r) => <Badge label={`${r.attendancePercentage}%`} variant="danger" /> },
    { key: 'presentDays', label: 'Present Days' },
    { key: 'totalDays', label: 'Total Days' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class (optional)" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} placeholder="All classes" />
          <FilterSelect label="Section (optional)" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={(selectedClass?.sections || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All sections" />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#374151]">Threshold %</label>
            <div className="flex gap-2">
              <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]" />
              <Button size="sm" onClick={() => refetch()} loading={isFetching}>Apply</Button>
            </div>
          </div>
        </div>
      </Card>

      {!sessionId ? (
        <Card className="bg-[#f8fafc]"><p className="text-sm text-[#64748b] text-center py-6">Select a session to see attendance defaulters.</p></Card>
      ) : (
        <Table columns={columns} data={defaulters || []} loading={isLoading} emptyMessage={`No students below ${threshold}% attendance.`} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Student Report Card: pick a student, view every exam type, download PDF
// ---------------------------------------------------------------------------
function ReportCardTab() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId } = useSessionClass();
  const [sectionId, setSectionId] = useState('');
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');

  useEffect(() => { setSectionId(''); setStudentId(''); }, [classId]);

  const selectedClass = classesForSession.find((c) => c.id === classId);

  const { data: studentsData, isLoading: loadingStudents } = useQuery({
    queryKey: ['ad-students-search', sessionId, classId, sectionId, search],
    queryFn: () => getStudents({ sessionId, classId: classId || undefined, sectionId: sectionId || undefined, search: search || undefined, limit: 20 }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const { data: reportCard, isLoading: loadingReport, isFetching } = useQuery({
    queryKey: ['ad-report-card', studentId, sessionId],
    queryFn: () => getReportCard({ studentId, sessionId }).then((r) => r.data.data),
    enabled: !!(studentId && sessionId),
  });

  const downloadMutation = useMutation({
    mutationFn: () => downloadReportCard({ studentId, sessionId }),
    onSuccess: (res) => {
      const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `report-card-${studentId}.pdf`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    },
  });

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class (optional)" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} placeholder="All classes" />
          <FilterSelect label="Section (optional)" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={(selectedClass?.sections || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All sections" />
          <Input label="Search Student" name="search" icon={Search} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name" />
        </div>
      </Card>

      {sessionId && (
        <Card padding={false}>
          <div className="max-h-56 overflow-y-auto divide-y divide-[#f1f5f9]">
            {loadingStudents ? (
              <div className="py-8 flex justify-center"><Spinner /></div>
            ) : (studentsData?.students || []).length === 0 ? (
              <p className="text-center text-sm text-[#94a3b8] py-8">No students found.</p>
            ) : studentsData.students.map((s) => {
              const enr = s.enrollments?.[0];
              return (
                <button key={s.id} onClick={() => setStudentId(s.id)}
                  className={`w-full text-left flex items-center justify-between px-4 py-3 transition-colors ${studentId === s.id ? 'bg-[#fff7ed]' : 'hover:bg-[#f8fafc]'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-[#f0f4ff] flex items-center justify-center shrink-0">
                      <Users size={16} className="text-[#1e293b]" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[#1e293b]">{s.name}</p>
                      <p className="text-xs text-[#94a3b8]">{s.enrollmentNumber}</p>
                    </div>
                  </div>
                  {enr && <Badge label={`${enr.class?.name} - ${enr.section?.name}`} variant="navy" />}
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {studentId && (
        <Card>
          {loadingReport ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : !reportCard ? null : (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-[#1e293b]">{reportCard.student}</p>
                  <p className="text-xs text-[#94a3b8]">{reportCard.enrollmentNumber} · {reportCard.class} - {reportCard.section}</p>
                </div>
                <Button size="sm" icon={Download} loading={downloadMutation.isPending} onClick={() => downloadMutation.mutate()}>
                  Download PDF
                </Button>
              </div>

              {reportCard.reportCard.length === 0 ? (
                <p className="text-sm text-[#94a3b8] py-6 text-center">No exam types configured for this class yet.</p>
              ) : reportCard.reportCard.map((et) => (
                <div key={et.examType} className="border border-[#e2e8f0] rounded-xl overflow-hidden">
                  <div className="bg-[#f8fafc] px-4 py-2.5 flex items-center justify-between">
                    <p className="text-sm font-semibold text-[#1e293b]">{et.examType}</p>
                    {et.weightagePercent != null && <Badge label={`${et.weightagePercent}% weightage`} variant="navy" />}
                  </div>
                  <div className="divide-y divide-[#f1f5f9]">
                    {et.subjects.map((sub) => (
                      <div key={sub.subject} className="flex items-center justify-between px-4 py-2.5">
                        <p className="text-sm text-[#374151]">{sub.subject}</p>
                        <p className="text-sm">
                          {sub.marksObtained != null ? (
                            <span className={sub.marksObtained < sub.passingMarks ? 'text-red-600 font-semibold' : 'text-[#1e293b] font-semibold'}>
                              {sub.marksObtained} / {sub.maxMarks}
                            </span>
                          ) : (
                            <span className="text-[#94a3b8]">Not entered</span>
                          )}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {downloadMutation.isError && (
                <p className="text-xs text-red-500">Failed to download report card PDF.</p>
              )}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, disabled, placeholder = 'Select' }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-[#374151]">{label}</label>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9]">
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}