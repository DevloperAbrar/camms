import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  LayoutDashboard, BarChart3, Layers, Building2, Rows3, Trophy, AlertTriangle,
  Activity, UserX, UserCheck, FileText, TrendingUp, TrendingDown, Users, Percent,
  Download, Search,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ComposedChart,
} from 'recharts';
import {
  getSessions, getClasses, getSubjects, getExamTypes, getStudents,
  getExamStats, getMarksDefaulters, getAttendanceDefaulters,
  getAnalyticsOverview, getClassComparison, getSectionComparison, getSubjectComparison,
  getAttendanceTrend, getPerformers, getStudentProgress,
  getReportCard, downloadReportCard,
} from '../../api/schooladmin.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Spinner from '../../components/ui/Spinner';

const MENU = [
  { key: 'overview', label: 'Overview', icon: LayoutDashboard },
  { key: 'exam-stats', label: 'Exam Performance', icon: BarChart3 },
  { key: 'subject-comparison', label: 'Subject Comparison', icon: Layers },
  { key: 'class-comparison', label: 'Class Comparison', icon: Building2 },
  { key: 'section-comparison', label: 'Section Comparison', icon: Rows3 },
  { key: 'performers', label: 'Top & Bottom Performers', icon: Trophy },
  { key: 'marks-defaulters', label: 'Marks Defaulters', icon: AlertTriangle },
  { key: 'attendance-trend', label: 'Attendance Trends', icon: Activity },
  { key: 'attendance-defaulters', label: 'Attendance Defaulters', icon: UserX },
  { key: 'student-progress', label: 'Student Progress', icon: UserCheck },
  { key: 'report-card', label: 'Student Report Card', icon: FileText },
];

const PIE_COLORS = ['#f97316', '#3b82f6', '#16a34a', '#a855f7', '#ef4444', '#f59e0b'];

export default function AdminAnalytics() {
  const [tab, setTab] = useState('overview');
  const active = MENU.find((m) => m.key === tab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Analytics</h1>
        <p className="text-sm text-[#64748b] mt-1">Attendance and marks insights across sessions, classes and subjects</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <Card padding={false} className="w-full lg:w-64 shrink-0 overflow-hidden">
          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-visible">
            {MENU.map((m) => {
              const Icon = m.icon;
              const isActive = tab === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setTab(m.key)}
                  className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left whitespace-nowrap border-l-4 transition-colors shrink-0 lg:shrink ${
                    isActive
                      ? 'border-[#f97316] bg-[#fff7ed] text-[#f97316]'
                      : 'border-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#1e293b]'
                  }`}
                >
                  <Icon size={17} />
                  {m.label}
                </button>
              );
            })}
          </nav>
        </Card>

        <div className="flex-1 min-w-0 w-full space-y-2">
          <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">{active?.label}</p>
          {tab === 'overview' && <OverviewTab />}
          {tab === 'exam-stats' && <ExamStatsTab />}
          {tab === 'subject-comparison' && <SubjectComparisonTab />}
          {tab === 'class-comparison' && <ClassComparisonTab />}
          {tab === 'section-comparison' && <SectionComparisonTab />}
          {tab === 'performers' && <PerformersTab />}
          {tab === 'marks-defaulters' && <MarksDefaultersTab />}
          {tab === 'attendance-trend' && <AttendanceTrendTab />}
          {tab === 'attendance-defaulters' && <AttendanceDefaultersTab />}
          {tab === 'student-progress' && <StudentProgressTab />}
          {tab === 'report-card' && <ReportCardTab />}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------
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

function ChartCard({ title, subtitle, children, height = 300 }) {
  return (
    <Card>
      <div className="mb-4">
        <p className="text-sm font-bold text-[#1e293b]">{title}</p>
        {subtitle && <p className="text-xs text-[#94a3b8] mt-0.5">{subtitle}</p>}
      </div>
      <div style={{ width: '100%', height }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </Card>
  );
}

function EmptyState({ children }) {
  return <Card className="bg-[#f8fafc]"><p className="text-sm text-[#64748b] text-center py-6">{children}</p></Card>;
}

function passVariant(pct) {
  return pct >= 75 ? 'success' : pct >= 40 ? 'warning' : 'danger';
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

// ---------------------------------------------------------------------------
// Overview: school-wide KPIs + class performance + attendance trend
// ---------------------------------------------------------------------------
function OverviewTab() {
  const { sessions, sessionId, setSessionId } = useSessionClass();

  const { data: overview, isLoading } = useQuery({
    queryKey: ['ad-overview', sessionId],
    queryFn: () => getAnalyticsOverview({ sessionId }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const { data: classPerf } = useQuery({
    queryKey: ['ad-overview-class-perf', sessionId],
    queryFn: () => getClassComparison({ sessionId }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const { data: attendanceTrend } = useQuery({
    queryKey: ['ad-overview-attendance-trend', sessionId],
    queryFn: () => getAttendanceTrend({ sessionId }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  return (
    <div className="space-y-6">
      <Card>
        <div className="max-w-xs">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
      </Card>

      {!sessionId ? (
        <EmptyState>Select a session to view the overview.</EmptyState>
      ) : isLoading || !overview ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <StatCard label="Total Students" value={overview.totalStudents} icon={Users} color="navy" />
            <StatCard label="Total Classes" value={overview.totalClasses} icon={Building2} color="navy" />
            <StatCard label="Total Faculty" value={overview.totalFaculty} icon={UserCheck} color="navy" />
            <StatCard label="Avg Attendance" value={`${overview.avgAttendancePercent}%`} icon={Activity} color="green" />
            <StatCard label="Avg Score" value={`${overview.avgScorePercent}%`} icon={BarChart3} color="orange" />
            <StatCard label="Avg Pass Rate" value={`${overview.avgExamPassPercent}%`} icon={Percent} color="orange" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Class-wise Average Score" subtitle="Average % score across all exams, per class">
              <BarChart data={classPerf || []}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="className" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
                <Tooltip />
                <Bar dataKey="avgScorePercent" name="Avg Score %" fill="#f97316" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Attendance Trend" subtitle="School-wide attendance % by month">
              {(attendanceTrend || []).length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-[#94a3b8]">No attendance marked yet.</div>
              ) : (
                <LineChart data={attendanceTrend || []}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="attendancePercent" name="Attendance %" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              )}
            </ChartCard>
          </div>

          {overview.genderDistribution?.length > 0 && (
            <ChartCard title="Student Gender Distribution" height={280}>
              <PieChart>
                <Pie data={overview.genderDistribution} dataKey="count" nameKey="gender" cx="50%" cy="50%" outerRadius={90} label>
                  {overview.genderDistribution.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ChartCard>
          )}
        </>
      )}
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

  const passCount = stats ? Math.round((stats.passPercentage / 100) * stats.totalEntries) : 0;
  const failCount = stats ? stats.totalEntries - passCount : 0;

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
        <EmptyState>Select a session, class, exam type and subject to view performance stats.</EmptyState>
      ) : loadingStats ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : stats.totalEntries === 0 ? (
        <EmptyState>No marks entered for this subject yet.</EmptyState>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Average" value={stats.average} icon={BarChart3} color="navy" />
            <StatCard label="Highest" value={stats.highest} icon={TrendingUp} color="green" />
            <StatCard label="Lowest" value={stats.lowest} icon={TrendingDown} color="red" />
            <StatCard label="Pass %" value={`${stats.passPercentage}%`} icon={Percent} color="orange" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChartCard title="Average vs Highest vs Lowest">
              <BarChart data={[{ name: 'Marks', Average: stats.average, Highest: stats.highest, Lowest: stats.lowest }]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Average" fill="#3b82f6" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Highest" fill="#16a34a" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Lowest" fill="#ef4444" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ChartCard>

            <ChartCard title="Pass vs Fail" subtitle={`${stats.totalEntries} students appeared`}>
              <PieChart>
                <Pie data={[{ name: 'Passed', value: passCount }, { name: 'Failed', value: failCount }]}
                  dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                  <Cell fill="#16a34a" />
                  <Cell fill="#ef4444" />
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subject Comparison: how each subject performed within one exam type
// ---------------------------------------------------------------------------
function SubjectComparisonTab() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId } = useSessionClass();
  const [examTypeId, setExamTypeId] = useState('');

  const { data: examTypes } = useQuery({
    queryKey: ['ad-sc-exam-types', sessionId, classId],
    queryFn: () => getExamTypes({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });
  useEffect(() => { setExamTypeId(''); }, [classId]);

  const { data: subjects, isLoading } = useQuery({
    queryKey: ['ad-subject-comparison', examTypeId],
    queryFn: () => getSubjectComparison({ examTypeId }).then((r) => r.data.data),
    enabled: !!examTypeId,
  });

  const columns = [
    { key: 'subject', label: 'Subject' },
    { key: 'average', label: 'Average' },
    { key: 'highest', label: 'Highest' },
    { key: 'lowest', label: 'Lowest' },
    { key: 'passPercentage', label: 'Pass %', render: (r) => <Badge label={`${r.passPercentage}%`} variant={passVariant(r.passPercentage)} /> },
  ];

  const chartData = (subjects || []).map((s) => ({
    ...s,
    avgPercent: s.maxMarks ? Number(((s.average / s.maxMarks) * 100).toFixed(2)) : 0,
  }));

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Exam Type" value={examTypeId} onChange={setExamTypeId} disabled={!classId}
            options={(examTypes || []).map((e) => ({ value: e.id, label: e.name }))} />
        </div>
      </Card>

      {!examTypeId ? (
        <EmptyState>Select an exam type to compare subjects.</EmptyState>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !subjects?.length ? (
        <EmptyState>No subjects configured for this exam type yet.</EmptyState>
      ) : (
        <>
          <ChartCard title="Average % Score vs Pass % by Subject">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="subject" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgPercent" name="Avg %" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              <Bar dataKey="passPercentage" name="Pass %" fill="#16a34a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartCard>
          <Table columns={columns} data={subjects} loading={false} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Class Comparison: avg score %, pass %, attendance % across classes
// ---------------------------------------------------------------------------
function ClassComparisonTab() {
  const { sessions, sessionId, setSessionId } = useSessionClass();

  const { data: classes, isLoading } = useQuery({
    queryKey: ['ad-class-comparison', sessionId],
    queryFn: () => getClassComparison({ sessionId }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const columns = [
    { key: 'className', label: 'Class' },
    { key: 'avgScorePercent', label: 'Avg Score %', render: (r) => `${r.avgScorePercent}%` },
    { key: 'passPercent', label: 'Pass %', render: (r) => <Badge label={`${r.passPercent}%`} variant={passVariant(r.passPercent)} /> },
    { key: 'attendancePercent', label: 'Attendance %', render: (r) => `${r.attendancePercent}%` },
    { key: 'totalMarksEntries', label: 'Marks Entries' },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <div className="max-w-xs">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
        </div>
      </Card>

      {!sessionId ? (
        <EmptyState>Select a session to compare classes.</EmptyState>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !classes?.length ? (
        <EmptyState>No classes found for this session.</EmptyState>
      ) : (
        <>
          <ChartCard title="Class-wise Performance" subtitle="Average score %, pass % and attendance % per class" height={340}>
            <ComposedChart data={classes}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="className" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgScorePercent" name="Avg Score %" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              <Bar dataKey="attendancePercent" name="Attendance %" fill="#16a34a" radius={[6, 6, 0, 0]} />
              <Line type="monotone" dataKey="passPercent" name="Pass %" stroke="#f97316" strokeWidth={2} />
            </ComposedChart>
          </ChartCard>
          <Table columns={columns} data={classes} loading={false} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section Comparison: same metrics, broken down by section within a class
// ---------------------------------------------------------------------------
function SectionComparisonTab() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId } = useSessionClass();

  const { data: sections, isLoading } = useQuery({
    queryKey: ['ad-section-comparison', sessionId, classId],
    queryFn: () => getSectionComparison({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  const columns = [
    { key: 'sectionName', label: 'Section' },
    { key: 'avgScorePercent', label: 'Avg Score %', render: (r) => `${r.avgScorePercent}%` },
    { key: 'passPercent', label: 'Pass %', render: (r) => <Badge label={`${r.passPercent}%`} variant={passVariant(r.passPercent)} /> },
    { key: 'attendancePercent', label: 'Attendance %', render: (r) => `${r.attendancePercent}%` },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} />
        </div>
      </Card>

      {!classId ? (
        <EmptyState>Select a class to compare its sections.</EmptyState>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !sections?.length ? (
        <EmptyState>No sections found for this class.</EmptyState>
      ) : (
        <>
          <ChartCard title="Section-wise Performance">
            <BarChart data={sections}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="sectionName" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
              <Tooltip />
              <Legend />
              <Bar dataKey="avgScorePercent" name="Avg Score %" fill="#3b82f6" radius={[6, 6, 0, 0]} />
              <Bar dataKey="attendancePercent" name="Attendance %" fill="#16a34a" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ChartCard>
          <Table columns={columns} data={sections} loading={false} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top & Bottom Performers for a chosen exam type
// ---------------------------------------------------------------------------
function PerformersTab() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId } = useSessionClass();
  const selectedClass = classesForSession.find((c) => c.id === classId);
  const [sectionId, setSectionId] = useState('');
  const [examTypeId, setExamTypeId] = useState('');

  const { data: examTypes } = useQuery({
    queryKey: ['ad-perf-exam-types', sessionId, classId],
    queryFn: () => getExamTypes({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });
  useEffect(() => { setSectionId(''); setExamTypeId(''); }, [classId]);

  const { data: performers, isLoading } = useQuery({
    queryKey: ['ad-performers', examTypeId, sectionId],
    queryFn: () => getPerformers({ examTypeId, sectionId: sectionId || undefined, limit: 5 }).then((r) => r.data.data),
    enabled: !!examTypeId,
  });

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Section (optional)" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={(selectedClass?.sections || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All sections" />
          <FilterSelect label="Exam Type" value={examTypeId} onChange={setExamTypeId} disabled={!classId}
            options={(examTypes || []).map((e) => ({ value: e.id, label: e.name }))} />
        </div>
      </Card>

      {!examTypeId ? (
        <EmptyState>Select an exam type to see top and bottom performers.</EmptyState>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PerformerList title="Top Performers" icon={Trophy} color="green" list={performers?.top || []} />
          <PerformerList title="Needs Attention" icon={TrendingDown} color="red" list={performers?.bottom || []} />
        </div>
      )}
    </div>
  );
}

function PerformerList({ title, icon: Icon, color, list }) {
  const styles = {
    green: { iconClass: 'text-green-600', badge: 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-green-600 bg-green-50', variant: 'success' },
    red:   { iconClass: 'text-red-600',   badge: 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-red-600 bg-red-50',     variant: 'danger' },
  };
  const s = styles[color];
  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={18} className={s.iconClass} />
        <p className="text-sm font-bold text-[#1e293b]">{title}</p>
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-[#94a3b8] text-center py-8">No data yet.</p>
      ) : (
        <div className="space-y-2">
          {list.map((st, i) => (
            <div key={st.studentId} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[#f8fafc]">
              <div className="flex items-center gap-3">
                <span className={s.badge}>{i + 1}</span>
                <div>
                  <p className="text-sm font-semibold text-[#1e293b]">{st.studentName}</p>
                  <p className="text-xs text-[#94a3b8]">{st.enrollmentNumber}</p>
                </div>
              </div>
              <Badge label={`${st.averagePercent}%`} variant={s.variant} />
            </div>
          ))}
        </div>
      )}
    </Card>
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
        <EmptyState>Select an exam type to see students below passing marks.</EmptyState>
      ) : (
        <>
          {!isLoading && (
            <div className="flex items-center gap-2">
              <Badge label={`${defaulters?.length || 0} defaulter${defaulters?.length === 1 ? '' : 's'}`}
                variant={defaulters?.length ? 'danger' : 'success'} />
              <span className="text-xs text-[#94a3b8]">for the selected exam type / subject</span>
            </div>
          )}
          <Table columns={columns} data={defaulters || []} loading={isLoading} emptyMessage="No defaulters found. Everyone passed." />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attendance Trends: month-by-month attendance % line chart
// ---------------------------------------------------------------------------
function AttendanceTrendTab() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId } = useSessionClass();
  const selectedClass = classesForSession.find((c) => c.id === classId);
  const [sectionId, setSectionId] = useState('');
  useEffect(() => { setSectionId(''); }, [classId]);

  const { data: trend, isLoading } = useQuery({
    queryKey: ['ad-attendance-trend', sessionId, classId, sectionId],
    queryFn: () => getAttendanceTrend({ sessionId, classId: classId || undefined, sectionId: sectionId || undefined }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  return (
    <div className="space-y-6">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class (optional)" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} placeholder="All classes" />
          <FilterSelect label="Section (optional)" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={(selectedClass?.sections || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All sections" />
        </div>
      </Card>

      {!sessionId ? (
        <EmptyState>Select a session to view the attendance trend.</EmptyState>
      ) : isLoading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !trend?.length ? (
        <EmptyState>No attendance has been marked yet for this filter.</EmptyState>
      ) : (
        <ChartCard title="Attendance % Over Time" height={360}>
          <LineChart data={trend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
            <Tooltip />
            <Line type="monotone" dataKey="attendancePercent" name="Attendance %" stroke="#16a34a" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ChartCard>
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
        <EmptyState>Select a session to see attendance defaulters.</EmptyState>
      ) : (
        <>
          {!isLoading && (
            <div className="flex items-center gap-2">
              <Badge label={`${defaulters?.length || 0} student${defaulters?.length === 1 ? '' : 's'} below ${threshold}%`}
                variant={defaulters?.length ? 'danger' : 'success'} />
            </div>
          )}
          <Table columns={columns} data={defaulters || []} loading={isLoading} emptyMessage={`No students below ${threshold}% attendance.`} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Student Progress: individual trend across exams + subject breakdown + attendance
// ---------------------------------------------------------------------------
function StudentProgressTab() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId } = useSessionClass();
  const [sectionId, setSectionId] = useState('');
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');

  useEffect(() => { setSectionId(''); setStudentId(''); }, [classId]);
  const selectedClass = classesForSession.find((c) => c.id === classId);

  const { data: studentsData, isLoading: loadingStudents } = useQuery({
    queryKey: ['ad-progress-students', sessionId, classId, sectionId, search],
    queryFn: () => getStudents({ sessionId, classId: classId || undefined, sectionId: sectionId || undefined, search: search || undefined, limit: 20 }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const { data: progress, isLoading: loadingProgress } = useQuery({
    queryKey: ['ad-student-progress', studentId, sessionId],
    queryFn: () => getStudentProgress({ studentId, sessionId }).then((r) => r.data.data),
    enabled: !!(studentId && sessionId),
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
        loadingProgress ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !progress ? null : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <ChartCard title="Exam-wise Progress" subtitle="Average % score across exam types this session">
                {progress.examTrend.every((e) => e.averagePercent === null) ? (
                  <div className="h-full flex items-center justify-center text-sm text-[#94a3b8]">No marks entered yet.</div>
                ) : (
                  <LineChart data={progress.examTrend}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="examType" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
                    <Tooltip />
                    <Line type="monotone" dataKey="averagePercent" name="Avg %" stroke="#f97316" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  </LineChart>
                )}
              </ChartCard>

              <ChartCard title="Subject Breakdown" subtitle={progress.latestExamType ? `Latest graded exam: ${progress.latestExamType}` : 'No marks entered yet'}>
                {!progress.subjectBreakdown.length ? (
                  <div className="h-full flex items-center justify-center text-sm text-[#94a3b8]">No marks entered yet.</div>
                ) : (
                  <BarChart data={progress.subjectBreakdown} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis type="number" tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
                    <YAxis type="category" dataKey="subject" tick={{ fontSize: 12 }} width={90} />
                    <Tooltip />
                    <Bar dataKey="percent" name="Score %" fill="#3b82f6" radius={[0, 6, 6, 0]} />
                  </BarChart>
                )}
              </ChartCard>
            </div>

            <ChartCard title="Attendance Trend" subtitle="This student's monthly attendance %">
              {!progress.attendanceTrend?.length ? (
                <div className="h-full flex items-center justify-center text-sm text-[#94a3b8]">No attendance marked yet.</div>
              ) : (
                <LineChart data={progress.attendanceTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} unit="%" domain={[0, 100]} />
                  <Tooltip />
                  <Line type="monotone" dataKey="attendancePercent" name="Attendance %" stroke="#16a34a" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              )}
            </ChartCard>
          </div>
        )
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

  const { data: reportCard, isLoading: loadingReport } = useQuery({
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