import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadialBarChart, RadialBar,
} from 'recharts';
import {
  Users, TrendingUp, TrendingDown, AlertTriangle, CheckCircle2,
  BarChart2, Calendar, BookOpen, Minus,
} from 'lucide-react';
import {
  getMyAssignments,
  getAnalyticsOverview,
  getWeeklyAttendance,
  getAttendanceTrend,
  getStudentStats,
  getMarksSummary,
  getSectionComparison,
} from '../../api/faculty.api';
import Spinner from '../../components/ui/Spinner';

const C = {
  orange: '#f97316', green: '#22c55e', red: '#ef4444',
  amber: '#f59e0b', blue: '#3b82f6', slate: '#64748b',
};

function Select({ value, onChange, disabled, children, className = '' }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm bg-white text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#f97316] disabled:opacity-40 disabled:cursor-not-allowed ${className}`}
    >
      {children}
    </select>
  );
}

function KpiCard({ label, value, sub, icon: Icon, color = 'orange' }) {
  const palettes = {
    orange: { ring: 'ring-orange-100', bg: 'bg-orange-50', icon: 'text-[#f97316]', val: 'text-[#f97316]' },
    green:  { ring: 'ring-green-100',  bg: 'bg-green-50',  icon: 'text-green-600',  val: 'text-green-700' },
    red:    { ring: 'ring-red-100',    bg: 'bg-red-50',    icon: 'text-red-500',    val: 'text-red-600'  },
    blue:   { ring: 'ring-blue-100',   bg: 'bg-blue-50',   icon: 'text-blue-600',   val: 'text-blue-700' },
    amber:  { ring: 'ring-amber-100',  bg: 'bg-amber-50',  icon: 'text-amber-600',  val: 'text-amber-700' },
  };
  const p = palettes[color] || palettes.orange;
  return (
    <div className={`bg-white rounded-xl border border-[#e2e8f0] p-5 ring-1 ${p.ring} flex flex-col gap-3`}>
      <div className={`w-10 h-10 rounded-xl ${p.bg} flex items-center justify-center`}>
        <Icon size={20} className={p.icon} />
      </div>
      <div>
        <p className="text-xs text-[#94a3b8] font-medium mb-1">{label}</p>
        <p className={`text-2xl font-extrabold ${p.val}`}>{value ?? '—'}</p>
        {sub && <p className="text-xs text-[#64748b] mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, sub }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 bg-[#f97316]/10 rounded-lg flex items-center justify-center">
        <Icon size={16} className="text-[#f97316]" />
      </div>
      <div>
        <h2 className="text-sm font-bold text-[#1e293b]">{title}</h2>
        {sub && <p className="text-xs text-[#94a3b8]">{sub}</p>}
      </div>
    </div>
  );
}

const RiskBadge = ({ risk }) => {
  const cfg = {
    high:   'bg-red-50 text-red-600 border border-red-200',
    medium: 'bg-amber-50 text-amber-700 border border-amber-200',
    low:    'bg-green-50 text-green-700 border border-green-200',
  };
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg[risk] || cfg.low}`}>
      {risk === 'high' ? '⚠ At Risk' : risk === 'medium' ? '△ Watch' : '✓ Good'}
    </span>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl shadow-lg px-4 py-3 text-xs">
      <p className="font-bold text-[#1e293b] mb-1">{label}</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.fill || p.stroke }} />
          <span className="text-[#64748b] capitalize">{p.dataKey}:</span>
          <span className="font-semibold text-[#1e293b]">{p.value}</span>
        </div>
      ))}
    </div>
  );
};

export default function FacultyAnalytics() {
  const today = new Date().toISOString().split('T')[0];

  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId]     = useState('');
  const [sectionId, setSectionId] = useState('');
  const [trendDays, setTrendDays] = useState('30');
  const [activeTab, setActiveTab] = useState('attendance');

  const { data: assignments = [], isLoading: loadingAssignments } = useQuery({
    queryKey: ['faculty-assignments'],
    queryFn: () => getMyAssignments().then((r) => r.data.data ?? []),
  });

  const uniqueSessions = [...new Map(assignments.map((a) => [a.sessionId, a.session])).values()];
  const classesForSession = [...new Map(
    assignments.filter((a) => a.sessionId === sessionId).map((a) => [a.class.id, a.class])
  ).values()];
  const sectionsForClass = [...new Map(
    assignments.filter((a) => a.sessionId === sessionId && a.class.id === classId)
      .map((a) => [a.section.id, { ...a.section, isClassTeacher: a.isClassTeacher }])
  ).values()];

  useEffect(() => {
    const active = uniqueSessions.find((s) => s.isActive);
    if (active && !sessionId) setSessionId(active.id);
    else if (uniqueSessions.length === 1 && !sessionId) setSessionId(uniqueSessions[0].id);
  }, [assignments]);

  useEffect(() => { setClassId(''); setSectionId(''); }, [sessionId]);
  useEffect(() => { setSectionId(''); }, [classId]);

  useEffect(() => {
    if (classesForSession.length === 1) setClassId(classesForSession[0].id);
  }, [sessionId, assignments]);
  useEffect(() => {
    if (sectionsForClass.length === 1) setSectionId(sectionsForClass[0].id);
  }, [classId, assignments]);

  const { data: overview } = useQuery({
    queryKey: ['fac-analytics-overview', sessionId],
    queryFn: () => getAnalyticsOverview({ sessionId }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const { data: weekly } = useQuery({
    queryKey: ['fac-analytics-weekly', sessionId, classId, sectionId],
    queryFn: () => getWeeklyAttendance({ sessionId, classId, sectionId, date: today }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const { data: trendData } = useQuery({
    queryKey: ['fac-analytics-trend', sessionId, classId, sectionId, trendDays],
    queryFn: () => getAttendanceTrend({ sessionId, classId, sectionId, days: trendDays }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const { data: students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ['fac-analytics-students', sessionId, classId, sectionId],
    queryFn: () => getStudentStats({ sessionId, classId, sectionId }).then((r) => r.data.data ?? []),
    enabled: !!(sessionId && classId && sectionId),
  });

  const { data: marksSummary = [], isLoading: loadingMarks } = useQuery({
    queryKey: ['fac-analytics-marks', sessionId, classId],
    queryFn: () => getMarksSummary({ sessionId, classId }).then((r) => r.data.data ?? []),
    enabled: !!(sessionId && classId),
  });

  const { data: sectionComparison = [] } = useQuery({
    queryKey: ['fac-analytics-sections', sessionId],
    queryFn: () => getSectionComparison({ sessionId }).then((r) => r.data.data ?? []),
    enabled: !!sessionId,
  });

  const atRiskStudents = students.filter((s) => s.risk === 'high');
  const trendChartData = (trendData?.trend ?? []).map((d) => ({
    ...d,
    date: d.date.slice(5),
    pct: d.present + d.late + d.absent > 0
      ? Number((((d.present + d.late) / (d.present + d.late + d.absent)) * 100).toFixed(1))
      : 0,
  }));

  const hasSection = !!(sessionId && classId && sectionId);
  const hasClass   = !!(sessionId && classId);
  const isClassTeacherOfClass = assignments.some(
    (a) => a.sessionId === sessionId && a.class.id === classId && a.isClassTeacher
  );
  const isClassTeacherOfSection = assignments.some(
    (a) => a.sessionId === sessionId && a.class.id === classId && a.section.id === sectionId && a.isClassTeacher
  );

  return (
    <div className="space-y-6 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Analytics</h1>
          <p className="text-sm text-[#64748b] mt-0.5">Attendance, marks, and student performance at a glance.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {loadingAssignments ? (
            <div className="h-9 w-36 bg-[#f1f5f9] rounded-lg animate-pulse" />
          ) : (
            <Select value={sessionId} onChange={setSessionId}>
              <option value="">All sessions</option>
              {uniqueSessions.map((s) => (
                <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' (Current)' : ''}</option>
              ))}
            </Select>
          )}
          <Select value={classId} onChange={setClassId} disabled={!sessionId}>
            <option value="">All classes</option>
            {classesForSession.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={sectionId} onChange={setSectionId} disabled={!classId}>
            <option value="">All sections</option>
            {sectionsForClass.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{s.isClassTeacher ? ' (Class Teacher)' : ''}</option>
            ))}
          </Select>
        </div>
      </div>

      {!sessionId && (
        <div className="flex flex-col items-center py-20 text-center text-[#94a3b8]">
          <BarChart2 size={40} className="mb-3 text-[#e2e8f0]" />
          <p className="text-sm">Select a session above to view analytics.</p>
        </div>
      )}

      {sessionId && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard label="Total Students" value={overview?.totalStudents} sub="in your sections" icon={Users} color="blue" />
            <KpiCard
              label="Avg Attendance"
              value={overview?.avgAttendance !== null && overview?.avgAttendance !== undefined ? `${overview.avgAttendance}%` : '—'}
              sub="across all classes"
              icon={CheckCircle2}
              color={overview?.avgAttendance >= 85 ? 'green' : overview?.avgAttendance >= 70 ? 'amber' : 'red'}
            />
            <KpiCard label="At-Risk Students" value={overview?.lowAttendanceCount} sub="below 75% attendance" icon={AlertTriangle} color="red" />
            <KpiCard label="Marks Entered" value={overview?.marksEntered} sub="by you this session" icon={BookOpen} color="orange" />
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-[#f1f5f9] p-1 rounded-xl w-fit">
            {[
              { key: 'attendance', label: 'Attendance' },
              { key: 'marks',      label: 'Marks'      },
              { key: 'students',   label: 'Students'   },
            ].map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-all ${
                  activeTab === t.key ? 'bg-white text-[#1e293b] shadow-sm' : 'text-[#64748b] hover:text-[#1e293b]'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* ── ATTENDANCE TAB ── */}
          {activeTab === 'attendance' && (
            <div className="space-y-5">
              {sectionComparison.length > 0 && (() => {
                const ctSections = sectionComparison.filter((s) => s.isClassTeacher);
                const subjSections = sectionComparison.filter((s) => !s.isClassTeacher);

                const Group = ({ title, sub, icon: Icon, items }) => (
                  <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
                    <SectionHeader icon={Icon} title={title} sub={sub} />
                    <div className="space-y-3">
                      {items.map((s) => (
                        <div key={`${s.classId}-${s.sectionId}`}>
                          <div className="flex items-center justify-between text-xs mb-1">
                            <span className="font-semibold text-[#1e293b] flex items-center gap-2">
                              {s.label}
                              {s.isClassTeacher && (
                                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#f97316]/10 text-[#f97316]">
                                  CLASS TEACHER
                                </span>
                              )}
                            </span>
                            <span className={`font-bold ${s.pct >= 85 ? 'text-green-600' : s.pct >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                              {s.pct !== null ? `${s.pct}%` : '—'}
                            </span>
                          </div>
                          <div className="h-2 bg-[#f1f5f9] rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all"
                              style={{
                                width: `${s.pct ?? 0}%`,
                                background: s.pct >= 85 ? C.green : s.pct >= 70 ? C.amber : C.red,
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-[#94a3b8] mt-0.5">{s.totalStudents} students</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );

                return (
                  <>
                    {ctSections.length > 0 && (
                      <Group
                        title="Your Class Teacher Sections"
                        sub="Full-section attendance for classes you're the class teacher of"
                        icon={Users}
                        items={ctSections}
                      />
                    )}
                    {subjSections.length > 0 && (
                      <Group
                        title="Your Subject-Wise Sections"
                        sub="Sections where you teach a subject (not class teacher)"
                        icon={BookOpen}
                        items={subjSections}
                      />
                    )}
                  </>
                );
              })()}

              {weekly && (
                <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
                  <SectionHeader icon={Calendar} title="This Week" sub="Daily present / absent / late" />
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={weekly.days} barSize={20} barGap={3}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis dataKey="day" tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 11, fill: C.slate }} axisLine={false} tickLine={false} />
                      <Tooltip content={<CustomTooltip />} />
                      <Bar dataKey="present" fill={C.green} radius={[3,3,0,0]} />
                      <Bar dataKey="absent"  fill={C.red}   radius={[3,3,0,0]} />
                      <Bar dataKey="late"    fill={C.amber} radius={[3,3,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="flex items-center gap-4 mt-2 justify-center">
                    {[['Present', C.green], ['Absent', C.red], ['Late', C.amber]].map(([l, c]) => (
                      <span key={l} className="flex items-center gap-1.5 text-xs text-[#64748b]">
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: c }} />{l}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {trendData && (
                <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
                  <div className="flex items-center justify-between mb-4">
                    <SectionHeader icon={TrendingUp} title="Attendance Trend" sub="Attendance % over time" />
                    <Select value={trendDays} onChange={setTrendDays} className="!py-1 !text-xs">
                      <option value="14">14 days</option>
                      <option value="30">30 days</option>
                      <option value="60">60 days</option>
                      <option value="90">90 days</option>
                    </Select>
                  </div>
                  {trendChartData.length === 0 ? (
                    <div className="flex items-center justify-center h-32 text-[#94a3b8] text-sm">
                      No attendance data for this period.
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <LineChart data={trendChartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10, fill: C.slate }} axisLine={false} tickLine={false} />
                        <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: C.slate }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Line type="monotone" dataKey="pct" stroke={C.orange} strokeWidth={2.5} dot={false} activeDot={{ r: 5, fill: C.orange }} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── MARKS TAB ── */}
          {activeTab === 'marks' && (
            <div className="space-y-5">
              {!hasClass && (
                <div className="flex flex-col items-center py-16 text-[#94a3b8] text-sm gap-2">
                  <BookOpen size={36} className="text-[#e2e8f0]" />
                  <p>Select a class to see marks analytics.</p>
                </div>
              )}
              {hasClass && loadingMarks && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
              {hasClass && !loadingMarks && (
                <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
                  isClassTeacherOfClass ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'
                }`}>
                  {isClassTeacherOfClass ? (
                    <Users size={16} className="text-[#f97316] mt-0.5 shrink-0" />
                  ) : (
                    <BookOpen size={16} className="text-blue-500 mt-0.5 shrink-0" />
                  )}
                  <p className={`text-xs ${isClassTeacherOfClass ? 'text-orange-700' : 'text-blue-700'}`}>
                    {isClassTeacherOfClass
                      ? "You're the Class Teacher for this class — showing marks for every subject taught."
                      : 'Showing marks for the subject(s) you personally teach in this class.'}
                  </p>
                </div>
              )}
              {hasClass && !loadingMarks && marksSummary.length === 0 && (
                <div className="flex flex-col items-center py-16 text-[#94a3b8] text-sm gap-2">
                  <BookOpen size={36} className="text-[#e2e8f0]" />
                  <p>No exam marks data yet for this class.</p>
                </div>
              )}
              {hasClass && !loadingMarks && marksSummary.length > 0 && (
                <>
                  <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
                    <SectionHeader icon={BarChart2} title="Pass Rate by Exam & Subject" sub="How many students cleared each exam" />
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={marksSummary.map((m) => ({ name: `${m.examType} – ${m.subject}`, passRate: m.passRate ?? 0 }))}
                        layout="vertical" barSize={16}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10, fill: C.slate }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 10, fill: C.slate }} axisLine={false} tickLine={false} />
                        <Tooltip content={<CustomTooltip />} />
                        <Bar dataKey="passRate" radius={[0,3,3,0]}>
                          {marksSummary.map((m, i) => (
                            <Cell key={i} fill={(m.passRate ?? 0) >= 80 ? C.green : (m.passRate ?? 0) >= 60 ? C.amber : C.red} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {marksSummary.map((m) => (
                      <div key={m.examSubjectId} className="bg-white border border-[#e2e8f0] rounded-xl p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <p className="text-sm font-bold text-[#1e293b]">{m.subject}</p>
                            <p className="text-xs text-[#94a3b8]">{m.examType}</p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            (m.passRate ?? 0) >= 80 ? 'bg-green-50 text-green-700' :
                            (m.passRate ?? 0) >= 60 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
                          }`}>
                            {m.passRate !== null ? `${m.passRate}% pass` : 'No data'}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-3 text-center">
                          {[
                            { label: 'Average', val: m.avg !== null ? m.avg : '—' },
                            { label: 'Highest', val: m.highest !== null ? m.highest : '—' },
                            { label: 'Lowest',  val: m.lowest !== null ? m.lowest : '—' },
                          ].map(({ label, val }) => (
                            <div key={label} className="bg-[#f8fafc] rounded-lg py-2">
                              <p className="text-xs text-[#94a3b8]">{label}</p>
                              <p className="text-base font-bold text-[#1e293b]">{val}</p>
                            </div>
                          ))}
                        </div>
                        <p className="text-[10px] text-[#94a3b8] mt-2 text-right">
                          Max: {m.maxMarks} · Pass: {m.passingMarks} · {m.totalEntered} entries
                        </p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── STUDENTS TAB ── */}
          {activeTab === 'students' && (
            <div className="space-y-5">
              {!hasSection && (
                <div className="flex flex-col items-center py-16 text-[#94a3b8] text-sm gap-2">
                  <Users size={36} className="text-[#e2e8f0]" />
                  <p>Select a class and section to view per-student stats.</p>
                </div>
              )}
              {hasSection && loadingStudents && <div className="flex justify-center py-16"><Spinner size="lg" /></div>}
              {hasSection && !loadingStudents && students.length === 0 && (
                <div className="flex flex-col items-center py-16 text-[#94a3b8] text-sm gap-2">
                  <Users size={36} className="text-[#e2e8f0]" />
                  <p>No students or attendance data found for this section.</p>
                </div>
              )}
              {hasSection && !loadingStudents && students.length > 0 && (
                <>
                  <div className={`flex items-start gap-3 rounded-xl px-4 py-3 border ${
                    isClassTeacherOfSection ? 'bg-orange-50 border-orange-200' : 'bg-blue-50 border-blue-200'
                  }`}>
                    {isClassTeacherOfSection ? (
                      <Users size={16} className="text-[#f97316] mt-0.5 shrink-0" />
                    ) : (
                      <BookOpen size={16} className="text-blue-500 mt-0.5 shrink-0" />
                    )}
                    <p className={`text-xs ${isClassTeacherOfSection ? 'text-orange-700' : 'text-blue-700'}`}>
                      {isClassTeacherOfSection
                        ? "You're the Class Teacher of this section — full attendance visibility."
                        : "You view this section's overall attendance as a subject-assigned faculty."}
                    </p>
                  </div>
                  {atRiskStudents.length > 0 && (
                    <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                      <AlertTriangle size={16} className="text-red-500 mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold text-red-700">
                          {atRiskStudents.length} student{atRiskStudents.length > 1 ? 's' : ''} below 75% attendance
                        </p>
                        <p className="text-xs text-red-600 mt-0.5">{atRiskStudents.map((s) => s.studentName).join(', ')}</p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'Good (≥85%)',    count: students.filter((s) => s.risk === 'low').length,    color: 'bg-green-50 text-green-700 border-green-200' },
                      { label: 'Watch (75–85%)', count: students.filter((s) => s.risk === 'medium').length, color: 'bg-amber-50 text-amber-700 border-amber-200' },
                      { label: 'At Risk (<75%)', count: students.filter((s) => s.risk === 'high').length,   color: 'bg-red-50 text-red-700 border-red-200' },
                    ].map(({ label, count, color }) => (
                      <div key={label} className={`border rounded-xl p-3 text-center ${color}`}>
                        <p className="text-2xl font-extrabold">{count}</p>
                        <p className="text-xs font-medium mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>
                  <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
                    <div className="px-5 py-3 bg-[#f8fafc] border-b border-[#e2e8f0] flex items-center justify-between">
                      <p className="text-sm font-bold text-[#1e293b]">Per-Student Breakdown</p>
                      <p className="text-xs text-[#94a3b8]">{students.length} students · sorted by attendance</p>
                    </div>
                    <div className="divide-y divide-[#f1f5f9]">
                      {students.map((s) => (
                        <div key={s.enrollmentId} className="flex items-center gap-4 px-5 py-3 hover:bg-[#fafafa] transition-colors">
                          <div className="w-8 h-8 rounded-full bg-[#f1f5f9] flex items-center justify-center shrink-0">
                            <span className="text-xs font-bold text-[#64748b]">{s.studentName.charAt(0).toUpperCase()}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[#1e293b] truncate">{s.studentName}</p>
                            <p className="text-xs text-[#94a3b8]">#{s.enrollmentNumber}{s.rollNumber ? ` · Roll ${s.rollNumber}` : ''}</p>
                          </div>
                          <div className="hidden sm:flex flex-col gap-1 w-32">
                            <div className="h-1.5 bg-[#f1f5f9] rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${s.attendancePct ?? 0}%`,
                                  background: s.risk === 'high' ? C.red : s.risk === 'medium' ? C.amber : C.green,
                                }}
                              />
                            </div>
                          </div>
                          <div className="hidden md:flex gap-4 text-center">
                            {[
                              { label: 'P', val: s.present, color: 'text-green-600' },
                              { label: 'A', val: s.absent,  color: 'text-red-600'   },
                              { label: 'L', val: s.late,    color: 'text-amber-600' },
                            ].map(({ label, val, color }) => (
                              <div key={label}>
                                <p className={`text-sm font-bold ${color}`}>{val}</p>
                                <p className="text-[10px] text-[#94a3b8]">{label}</p>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-sm font-extrabold ${
                              s.risk === 'high' ? 'text-red-600' : s.risk === 'medium' ? 'text-amber-600' : 'text-green-600'
                            }`}>
                              {s.attendancePct !== null ? `${s.attendancePct}%` : '—'}
                            </span>
                            <RiskBadge risk={s.risk} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}