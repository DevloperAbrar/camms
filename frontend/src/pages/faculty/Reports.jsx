import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  FileText, Download, FileSpreadsheet, Calendar, BarChart3,
  Printer, Search, ShieldCheck, BookOpen, Users, TrendingUp,
  ChevronRight, Info,
} from 'lucide-react';
import {
  getMyAssignments,
  getMyReportsAttendance,
  getMyReportsExamTypes,
  getMyReportsSubjects,
  getMyReportsMarks,
  getMyReportsStudents,
  getMyReportCard,
  downloadMyReportCard,
} from '../../api/faculty.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

// ─── MENU ────────────────────────────────────────────────────────────────────
const MENU = [
  {
    key: 'attendance',
    label: 'Attendance Report',
    icon: Calendar,
    desc: 'Day-wise, weekly, custom-range attendance. Class teachers also get subject-wise view.',
  },
  {
    key: 'marks',
    label: 'Marks Report',
    icon: BarChart3,
    desc: 'Subject & exam-wise marks with pass/fail breakdown.',
  },
  {
    key: 'report-card',
    label: 'Student Report Card',
    icon: FileText,
    desc: 'Individual student full report card — export as PDF or Excel.',
  },
];

// ─── CSV / PRINT ─────────────────────────────────────────────────────────────
function tableToCSV(columns, rows) {
  const header = columns.map((c) => `"${c.label}"`).join(',');
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const val = typeof c.value === 'function' ? c.value(row) : (row[c.key] ?? '');
          return `"${String(val).replace(/"/g, '""')}"`;
        })
        .join(',')
    )
    .join('\n');
  return header + '\n' + body;
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function printSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>CampusSafar — Report</title>
    <style>
      body { font-family: -apple-system, sans-serif; font-size: 12px; color: #1e293b; padding: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 11px;
           text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
      td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
      h2 { font-size: 16px; margin: 0 0 4px; }
      .meta { color: #64748b; font-size: 11px; margin: 0 0 16px; }
      .badge { display: inline-block; padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
      .success { background: #dcfce7; color: #166534; }
      .danger  { background: #fee2e2; color: #991b1b; }
      .default { background: #f1f5f9; color: #475569; }
      @media print { body { padding: 0; } }
    </style>
    </head><body>${el.innerHTML}</body></html>
  `);
  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
const todayStr   = () => new Date().toISOString().split('T')[0];
const weekAgoStr = () => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; };
const monthAgoStr= () => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]; };

// ─── SHARED UI ────────────────────────────────────────────────────────────────
function FilterSelect({ label, value, onChange, options, disabled, placeholder = 'Select', badge }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">{label}</label>
        {badge && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-orange-100 text-orange-700 uppercase tracking-wide">
            {badge}
          </span>
        )}
      </div>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]
                   disabled:bg-[#f1f5f9] disabled:cursor-not-allowed
                   focus:outline-none focus:ring-2 focus:ring-[#f97316]/30 transition-all"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function EmptyState({ icon: Icon = FileText, title, subtitle, step }) {
  return (
    <Card className="flex flex-col items-center justify-center py-14 text-center">
      <div className="w-14 h-14 bg-[#f1f5f9] rounded-2xl flex items-center justify-center mb-4">
        <Icon size={26} className="text-[#94a3b8]" />
      </div>
      {step && (
        <p className="text-[10px] font-bold uppercase tracking-widest text-[#f97316] mb-1">Step {step}</p>
      )}
      <p className="text-sm font-semibold text-[#1e293b]">{title}</p>
      {subtitle && <p className="text-xs text-[#94a3b8] mt-1 max-w-xs leading-relaxed">{subtitle}</p>}
    </Card>
  );
}

function InfoBanner({ icon: Icon = Info, color = 'blue', children }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
    green:  'bg-green-50 border-green-200 text-green-700',
  };
  return (
    <div className={`flex items-start gap-2 border rounded-lg px-3 py-2.5 text-xs ${colors[color]}`}>
      <Icon size={14} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function SectionHeader({ title, subtitle }) {
  return (
    <div className="px-5 py-4 border-b border-[#e2e8f0]">
      <h2 className="font-bold text-[#1e293b] text-sm">{title}</h2>
      {subtitle && <p className="text-xs text-[#64748b] mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── SCOPE HOOK ──────────────────────────────────────────────────────────────
function useFacultyScope() {
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId]     = useState('');
  const [sectionId, setSectionId] = useState('');

  const { data: assignments = [], isLoading } = useQuery({
    queryKey: ['faculty-assignments'],
    queryFn: () => getMyAssignments().then((r) => r.data.data ?? []),
  });

  const uniqueSessions = [...new Map(assignments.map((a) => [a.sessionId, a.session])).values()];

  const classesForSession = [...new Map(
    assignments.filter((a) => a.sessionId === sessionId).map((a) => [a.class.id, a.class])
  ).values()];

  const sectionsForClass = [...new Map(
    assignments
      .filter((a) => a.sessionId === sessionId && a.class.id === classId)
      .map((a) => [a.section.id, { ...a.section, isClassTeacher: a.isClassTeacher }])
  ).values()];

  const isClassTeacherOfSection = assignments.some(
    (a) =>
      a.sessionId === sessionId &&
      a.class.id === classId &&
      a.section.id === sectionId &&
      a.isClassTeacher
  );

  // Own subjects from assignments (only what this faculty personally teaches)
  const ownSubjectsForSection = assignments
    .filter(
      (a) =>
        a.sessionId === sessionId &&
        a.class.id === classId &&
        a.section.id === sectionId &&
        a.subject !== null
    )
    .map((a) => a.subject)
    .filter((s, i, arr) => arr.findIndex((x) => x.id === s.id) === i);

  // For class teachers: fetch ALL subjects of the class from the API
  // (getMyReportsSubjects returns all subjects for class teachers, not just their own)
  const { data: allClassSubjects = [] } = useQuery({
    queryKey: ['faculty-scope-subjects', sessionId, classId],
    queryFn: () => getMyReportsSubjects({ sessionId, classId }).then((r) => r.data.data ?? []),
    enabled: !!(isClassTeacherOfSection && sessionId && classId),
  });

  // Final subject list:
  // - Class teacher of this section → all subjects in the class (from API)
  // - Regular faculty → only their personally assigned subjects
  const subjectsForSection = isClassTeacherOfSection ? allClassSubjects : ownSubjectsForSection;

  // Auto-select active session
  useEffect(() => {
    if (!sessionId && uniqueSessions.length) {
      const active = uniqueSessions.find((s) => s.isActive) || uniqueSessions[0];
      setSessionId(active.id);
    }
  }, [assignments]); // eslint-disable-line

  useEffect(() => { setClassId('');   setSectionId(''); }, [sessionId]);
  useEffect(() => { setSectionId(''); }, [classId]);

  return {
    isLoading, assignments,
    uniqueSessions, classesForSession, sectionsForClass, subjectsForSection,
    sessionId, setSessionId,
    classId,   setClassId,
    sectionId, setSectionId,
    isClassTeacherOfSection,
  };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────
export default function FacultyReports() {
  const [tab, setTab] = useState('attendance');
  const active = MENU.find((m) => m.key === tab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Reports</h1>
        <p className="text-sm text-[#64748b] mt-1">
          Generate and download reports for the classes you teach or lead as class teacher.
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Sidebar Nav */}
        <Card padding={false} className="w-full lg:w-60 shrink-0 overflow-hidden">
          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-visible">
            {MENU.map((m) => {
              const Icon = m.icon;
              const isActive = tab === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setTab(m.key)}
                  className={`flex items-center gap-3 px-4 py-3.5 text-sm font-semibold text-left
                    whitespace-nowrap border-l-4 transition-colors shrink-0 lg:shrink w-full
                    ${isActive
                      ? 'border-[#f97316] bg-[#fff7ed] text-[#f97316]'
                      : 'border-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#1e293b]'
                    }`}
                >
                  <Icon size={17} className="shrink-0" />
                  <span>{m.label}</span>
                  {isActive && <ChevronRight size={14} className="ml-auto" />}
                </button>
              );
            })}
          </nav>
        </Card>

        {/* Content area */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          <div className="flex items-center gap-2">
            <active.icon size={15} className="text-[#f97316]" />
            <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">{active.label}</p>
          </div>
          <p className="text-xs text-[#64748b] -mt-2 leading-relaxed">{active.desc}</p>

          {tab === 'attendance'  && <AttendanceReport />}
          {tab === 'marks'       && <MarksReport />}
          {tab === 'report-card' && <StudentReportCard />}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 1. ATTENDANCE REPORT
// Class Teacher upgrade: toggle between Overall (daily null) and Subject-wise
// ════════════════════════════════════════════════════════════════════════════
function AttendanceReport() {
  const {
    isLoading: loadingScope,
    uniqueSessions, classesForSession, sectionsForClass, subjectsForSection,
    sessionId, setSessionId,
    classId,   setClassId,
    sectionId, setSectionId,
    isClassTeacherOfSection,
  } = useFacultyScope();

  const [viewMode, setViewMode]   = useState('overall');  // 'overall' | 'subject'
  const [subjectId, setSubjectId] = useState('');
  const [rangeType, setRangeType] = useState('monthly');
  const [fromDate, setFromDate]   = useState(monthAgoStr());
  const [toDate, setToDate]       = useState(todayStr());
  const printId = 'print-attendance';

  // Reset subject when section changes or mode toggles
  useEffect(() => { setSubjectId(''); }, [sectionId, viewMode]);

  // Range presets
  useEffect(() => {
    if (rangeType === 'daily')   { setFromDate(todayStr());    setToDate(todayStr()); }
    if (rangeType === 'weekly')  { setFromDate(weekAgoStr());  setToDate(todayStr()); }
    if (rangeType === 'monthly') { setFromDate(monthAgoStr()); setToDate(todayStr()); }
  }, [rangeType]);

  const canFetch = !!(sessionId && (viewMode === 'overall' || (viewMode === 'subject' && subjectId)));

  const { data, isLoading } = useQuery({
    queryKey: ['fac-rep-att', sessionId, classId, sectionId, viewMode, subjectId, fromDate, toDate],
    queryFn: () =>
      getMyReportsAttendance({
        sessionId,
        classId:   classId   || undefined,
        sectionId: sectionId || undefined,
        subjectId: viewMode === 'subject' ? subjectId : undefined,
        fromDate,
        toDate,
      }).then((r) => r.data.data),
    enabled: canFetch,
  });

  const rows = data || [];

  const columns = [
    { key: 'studentName',          label: 'Student Name' },
    { key: 'enrollmentNumber',     label: 'Enr. No.' },
    { key: 'className',            label: 'Class' },
    { key: 'sectionName',          label: 'Section' },
    { key: 'presentDays',          label: 'Present' },
    { key: 'absentDays',           label: 'Absent' },
    { key: 'totalDays',            label: 'Total' },
    {
      key: 'attendancePercentage',
      label: 'Attendance %',
      value: (r) => r.attendancePercentage != null ? `${r.attendancePercentage}%` : 'No data',
    },
    {
      key: 'status',
      label: 'Status',
      value: (r) =>
        r.attendancePercentage == null
          ? 'No Data'
          : r.attendancePercentage >= 75
          ? 'Regular'
          : 'Low Attendance',
    },
  ];

  function handleCSV() {
    const suffix = viewMode === 'subject' && subjectId ? `-subject` : '';
    downloadCSV(tableToCSV(columns, rows), `attendance-report${suffix}-${fromDate}-to-${toDate}.csv`);
  }

  const stats = {
    regular:    rows.filter((r) => r.attendancePercentage != null && r.attendancePercentage >= 75).length,
    low:        rows.filter((r) => r.attendancePercentage != null && r.attendancePercentage < 75).length,
    noData:     rows.filter((r) => r.attendancePercentage == null).length,
  };

  return (
    <div className="space-y-4">
      {/* Filters card */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterSelect
            label="Session"
            value={sessionId}
            onChange={setSessionId}
            disabled={loadingScope}
            options={uniqueSessions.map((s) => ({
              value: s.id,
              label: `${s.label}${s.isActive ? ' (Current)' : ''}`,
            }))}
          />
          <FilterSelect
            label="Class"
            value={classId}
            onChange={setClassId}
            disabled={!sessionId}
            placeholder="All your classes"
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))}
          />
          <FilterSelect
            label="Section"
            value={sectionId}
            onChange={setSectionId}
            disabled={!classId}
            placeholder="All your sections"
            options={sectionsForClass.map((s) => ({
              value: s.id,
              label: s.isClassTeacher ? `${s.name} (Class Teacher)` : s.name,
            }))}
          />
          <FilterSelect
            label="Date Range"
            value={rangeType}
            onChange={setRangeType}
            options={[
              { value: 'daily',   label: 'Today' },
              { value: 'weekly',  label: 'This Week' },
              { value: 'monthly', label: 'This Month' },
              { value: 'custom',  label: 'Custom Range' },
            ]}
          />
        </div>

        {/* Custom date range */}
        {rangeType === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 pt-4 border-t border-[#f1f5f9]">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">From Date</label>
              <input
                type="date" value={fromDate} max={toDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]/30"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">To Date</label>
              <input
                type="date" value={toDate} min={fromDate} max={todayStr()}
                onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]/30"
              />
            </div>
          </div>
        )}

        {/* Class Teacher: view mode toggle + subject picker */}
        {isClassTeacherOfSection && sectionId && (
          <div className="mt-4 pt-4 border-t border-[#f1f5f9] space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck size={14} className="text-[#f97316] shrink-0" />
              <p className="text-xs font-semibold text-[#374151]">Class Teacher View</p>
            </div>

            {/* Toggle */}
            <div className="inline-flex rounded-lg border border-[#e2e8f0] overflow-hidden text-xs font-semibold">
              {[
                { key: 'overall', label: 'Overall Attendance' },
                { key: 'subject', label: 'Subject-wise Attendance' },
              ].map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setViewMode(key)}
                  className={`px-4 py-2 transition-colors ${
                    viewMode === key
                      ? 'bg-[#f97316] text-white'
                      : 'bg-white text-[#64748b] hover:bg-[#f8fafc]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {/* Subject picker — appears only in subject mode */}
            {viewMode === 'subject' && (
              <div className="max-w-xs">
                <FilterSelect
                  label="Select Subject"
                  value={subjectId}
                  onChange={setSubjectId}
                  badge="Required"
                  options={subjectsForSection.map((s) => ({ value: s.id, label: s.name }))}
                  placeholder="Choose a subject…"
                />
                {subjectsForSection.length === 0 && (
                  <p className="text-xs text-amber-600 mt-1">
                    No subject assignments found for this section.
                  </p>
                )}
              </div>
            )}

            {viewMode === 'subject' && !subjectId && (
              <InfoBanner icon={BookOpen} color="orange">
                Subject-wise attendance is recorded separately per subject. Select a subject above to view its records.
              </InfoBanner>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4 pt-4 border-t border-[#f1f5f9] flex-wrap">
          <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleCSV} disabled={!rows.length}>
            Export Excel/CSV
          </Button>
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => printSection(printId)} disabled={!rows.length}>
            Print / PDF
          </Button>
        </div>
      </Card>

      {/* Status summary chips */}
      {sessionId && canFetch && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge label={`${fromDate} → ${toDate}`} variant="navy" />
          {!isLoading && rows.length > 0 && (
            <>
              <Badge label={`${rows.length} students`} variant="default" />
              {stats.regular > 0 && <Badge label={`${stats.regular} Regular`} variant="success" />}
              {stats.low > 0     && <Badge label={`${stats.low} Low Attendance`} variant="danger" />}
              {stats.noData > 0  && <Badge label={`${stats.noData} No Records`} variant="default" />}
            </>
          )}
        </div>
      )}

      {/* Content */}
      {!sessionId ? (
        <EmptyState icon={Calendar} step="1" title="Select a session" subtitle="Choose a session to generate the attendance report." />
      ) : viewMode === 'subject' && !subjectId ? (
        <EmptyState icon={BookOpen} step="2" title="Select a subject" subtitle="Choose a subject above to view subject-wise attendance records." />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Calendar} title="No data found" subtitle="No attendance records match your current filters." />
      ) : (
        <Card padding={false}>
          <div id={printId}>
            <SectionHeader
              title={`Attendance Report${viewMode === 'subject' && subjectId ? ' — Subject-wise' : ''}`}
              subtitle={`${fromDate} to ${toDate} · ${rows.length} students`}
            />
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f8fafc]">
                    {columns.map((c) => (
                      <th key={c.key} className="px-4 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide whitespace-nowrap">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {rows.map((row, i) => {
                    const pct = row.attendancePercentage;
                    const statusLabel = pct == null ? 'No Data' : pct >= 75 ? 'Regular' : 'Low Attendance';
                    const statusVariant = pct == null ? 'default' : pct >= 75 ? 'success' : 'danger';
                    return (
                      <tr key={i} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="px-4 py-3 font-medium text-[#1e293b]">{row.studentName}</td>
                        <td className="px-4 py-3 text-[#64748b] text-xs font-mono">{row.enrollmentNumber}</td>
                        <td className="px-4 py-3 text-[#374151]">{row.className}</td>
                        <td className="px-4 py-3 text-[#374151]">{row.sectionName}</td>
                        <td className="px-4 py-3 text-green-700 font-semibold">{row.presentDays}</td>
                        <td className="px-4 py-3 text-red-600">{row.absentDays}</td>
                        <td className="px-4 py-3 text-[#374151]">{row.totalDays}</td>
                        <td className="px-4 py-3">
                          {pct == null ? (
                            <span className="text-[#94a3b8] text-xs">—</span>
                          ) : (
                            <span className={`font-semibold ${pct < 75 ? 'text-red-600' : 'text-green-700'}`}>
                              {pct}%
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Badge label={statusLabel} variant={statusVariant} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 2. MARKS REPORT
// ════════════════════════════════════════════════════════════════════════════
function MarksReport() {
  const {
    isLoading: loadingScope,
    uniqueSessions, classesForSession, sectionsForClass,
    sessionId, setSessionId,
    classId,   setClassId,
    sectionId, setSectionId,
    isClassTeacherOfSection,
  } = useFacultyScope();

  const [examTypeId, setExamTypeId] = useState('');
  const [subjectId,  setSubjectId]  = useState('');
  const printId = 'print-marks';

  const { data: examTypes } = useQuery({
    queryKey: ['fac-rep-exam-types', sessionId, classId],
    queryFn: () => getMyReportsExamTypes({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  const { data: subjects } = useQuery({
    queryKey: ['fac-rep-subjects', sessionId, classId],
    queryFn: () => getMyReportsSubjects({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  useEffect(() => { setExamTypeId(''); setSubjectId(''); }, [classId]);

  const { data: marksRows, isLoading } = useQuery({
    queryKey: ['fac-rep-marks', examTypeId, subjectId, sectionId],
    queryFn: () =>
      getMyReportsMarks({
        examTypeId,
        subjectId: subjectId   || undefined,
        sectionId: sectionId   || undefined,
      }).then((r) => r.data.data),
    enabled: !!examTypeId,
  });

  const rows = marksRows || [];

  const columns = [
    { key: 'studentName',      label: 'Student' },
    { key: 'enrollmentNumber', label: 'Enr. No.' },
    { key: 'sectionName',      label: 'Section' },
    { key: 'subject',          label: 'Subject' },
    { key: 'marksObtained',    label: 'Marks' },
    { key: 'maxMarks',         label: 'Max' },
    { key: 'passingMarks',     label: 'Pass' },
    { key: 'result',           label: 'Result', value: (r) => r.marksObtained >= r.passingMarks ? 'Pass' : 'Fail' },
  ];

  function handleCSV() {
    downloadCSV(tableToCSV(columns, rows), `marks-report-${examTypeId}.csv`);
  }

  const passed = rows.filter((r) => r.marksObtained >= r.passingMarks).length;
  const failed = rows.length - passed;

  return (
    <div className="space-y-4">
      {/* Class-teacher banner */}
      {(subjects || []).length > 1 && (
        <InfoBanner icon={ShieldCheck}>
          You're the <strong>Class Teacher</strong> here — you can view and report on{' '}
          <strong>all subjects</strong>, not just your own.
        </InfoBanner>
      )}

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <FilterSelect
            label="Session"
            value={sessionId}
            onChange={setSessionId}
            disabled={loadingScope}
            options={uniqueSessions.map((s) => ({
              value: s.id,
              label: `${s.label}${s.isActive ? ' (Current)' : ''}`,
            }))}
          />
          <FilterSelect
            label="Class"
            value={classId}
            onChange={setClassId}
            disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))}
          />
          <FilterSelect
            label="Section"
            value={sectionId}
            onChange={setSectionId}
            disabled={!classId}
            placeholder="All sections"
            options={sectionsForClass.map((s) => ({
              value: s.id,
              label: s.isClassTeacher ? `${s.name} (Class Teacher)` : s.name,
            }))}
          />
          <FilterSelect
            label="Exam Type"
            value={examTypeId}
            onChange={setExamTypeId}
            disabled={!classId}
            options={(examTypes || []).map((e) => ({ value: e.id, label: e.name }))}
          />
          <FilterSelect
            label="Subject"
            value={subjectId}
            onChange={setSubjectId}
            disabled={!classId}
            placeholder="All subjects"
            options={(subjects || []).map((s) => ({ value: s.id, label: s.name }))}
          />
        </div>

        <div className="flex gap-2 mt-4 pt-4 border-t border-[#f1f5f9] flex-wrap">
          <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleCSV} disabled={!rows.length}>
            Export Excel/CSV
          </Button>
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => printSection(printId)} disabled={!rows.length}>
            Print / PDF
          </Button>
        </div>
      </Card>

      {!examTypeId ? (
        <EmptyState icon={BarChart3} title="Select exam type" subtitle="Choose session → class → exam type to view the marks report." />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={BarChart3} title="No marks data" subtitle="No marks entries found for this filter." />
      ) : (
        <Card padding={false}>
          <div id={printId}>
            <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between flex-wrap gap-3">
              <div>
                <h2 className="font-bold text-[#1e293b] text-sm">Marks Report</h2>
                <p className="text-xs text-[#64748b] mt-0.5">{rows.length} entries</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge label={`${passed} Passed`} variant="success" />
                <Badge label={`${failed} Failed`} variant="danger" />
                {rows.length > 0 && (
                  <Badge
                    label={`${((passed / rows.length) * 100).toFixed(0)}% pass rate`}
                    variant={passed / rows.length >= 0.5 ? 'success' : 'warning'}
                  />
                )}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f8fafc]">
                    {columns.map((c) => (
                      <th key={c.key} className="px-4 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide whitespace-nowrap">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {rows.map((row, i) => {
                    const passed = row.marksObtained >= row.passingMarks;
                    return (
                      <tr key={i} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="px-4 py-3 font-medium text-[#1e293b]">{row.studentName}</td>
                        <td className="px-4 py-3 text-[#64748b] text-xs font-mono">{row.enrollmentNumber}</td>
                        <td className="px-4 py-3 text-[#374151]">{row.sectionName}</td>
                        <td className="px-4 py-3 text-[#374151]">{row.subject}</td>
                        <td className="px-4 py-3 font-semibold">
                          <span className={passed ? 'text-[#1e293b]' : 'text-red-600'}>{row.marksObtained}</span>
                        </td>
                        <td className="px-4 py-3 text-[#64748b]">{row.maxMarks}</td>
                        <td className="px-4 py-3 text-[#64748b]">{row.passingMarks}</td>
                        <td className="px-4 py-3">
                          <Badge label={passed ? 'Pass' : 'Fail'} variant={passed ? 'success' : 'danger'} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 3. STUDENT REPORT CARD
// ════════════════════════════════════════════════════════════════════════════
function StudentReportCard() {
  const {
    isLoading: loadingScope,
    uniqueSessions, classesForSession, sectionsForClass,
    sessionId, setSessionId,
    classId,   setClassId,
    sectionId, setSectionId,
    isClassTeacherOfSection,
  } = useFacultyScope();

  const [search,    setSearch]    = useState('');
  const [studentId, setStudentId] = useState('');
  const printId = 'print-report-card';

  useEffect(() => { setStudentId(''); setSearch(''); }, [sectionId]);

  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ['fac-rep-students', sessionId, classId, sectionId, search],
    queryFn: () =>
      getMyReportsStudents({
        sessionId,
        classId,
        sectionId,
        search: search || undefined,
      }).then((r) => r.data.data),
    enabled: !!(sessionId && classId && sectionId),
  });

  const { data: reportCard, isLoading: loadingReport } = useQuery({
    queryKey: ['fac-rep-report-card', studentId, sessionId],
    queryFn: () => getMyReportCard({ studentId, sessionId }).then((r) => r.data.data),
    enabled: !!(studentId && sessionId),
  });

  const downloadPdf = useMutation({
    mutationFn: () => downloadMyReportCard({ studentId, sessionId }),
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

  function handleExcelExport() {
    if (!reportCard) return;
    const rows = [];
    reportCard.reportCard.forEach((et) => {
      et.subjects.forEach((sub) => {
        rows.push({
          examType: et.examType,
          subject: sub.subject,
          marksObtained: sub.marksObtained ?? 'N/A',
          maxMarks: sub.maxMarks,
          passingMarks: sub.passingMarks,
          result:
            sub.marksObtained != null
              ? sub.marksObtained >= sub.passingMarks ? 'Pass' : 'Fail'
              : 'N/A',
        });
      });
    });
    const cols = [
      { key: 'examType',      label: 'Exam Type' },
      { key: 'subject',       label: 'Subject' },
      { key: 'marksObtained', label: 'Marks Obtained' },
      { key: 'maxMarks',      label: 'Max Marks' },
      { key: 'passingMarks',  label: 'Passing Marks' },
      { key: 'result',        label: 'Result' },
    ];
    downloadCSV(
      tableToCSV(cols, rows),
      `report-card-${reportCard.student?.replace(/\s/g, '-')}-${sessionId}.csv`
    );
  }

  const selectedStudent = (students || []).find((s) => s.id === studentId);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterSelect
            label="Session"
            value={sessionId}
            onChange={setSessionId}
            disabled={loadingScope}
            options={uniqueSessions.map((s) => ({
              value: s.id,
              label: `${s.label}${s.isActive ? ' (Current)' : ''}`,
            }))}
          />
          <FilterSelect
            label="Class"
            value={classId}
            onChange={setClassId}
            disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))}
          />
          <FilterSelect
            label="Section"
            value={sectionId}
            onChange={setSectionId}
            disabled={!classId}
            options={sectionsForClass.map((s) => ({
              value: s.id,
              label: s.isClassTeacher ? `${s.name} (Class Teacher)` : s.name,
            }))}
          />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Search Student</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name…"
                disabled={!sectionId}
                className="w-full pl-8 pr-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white
                           disabled:bg-[#f1f5f9] disabled:cursor-not-allowed
                           focus:outline-none focus:ring-2 focus:ring-[#f97316]/30"
              />
            </div>
          </div>
        </div>

        {isClassTeacherOfSection && sectionId && (
          <div className="mt-4 pt-4 border-t border-[#f1f5f9]">
            <InfoBanner icon={ShieldCheck} color="orange">
              You're the <strong>Class Teacher</strong> of this section — you can view report cards for all students.
            </InfoBanner>
          </div>
        )}
      </Card>

      {/* Student list */}
      {!sectionId ? (
        <EmptyState icon={Users} step="1" title="Select class & section" subtitle="Choose a session, class and section to browse students." />
      ) : (
        <Card padding={false}>
          <SectionHeader
            title="Select a Student"
            subtitle={students ? `${students.length} students in this section` : undefined}
          />
          <div className="max-h-56 overflow-y-auto divide-y divide-[#f1f5f9]">
            {loadingStudents ? (
              <div className="py-10 flex justify-center"><Spinner /></div>
            ) : (students || []).length === 0 ? (
              <p className="text-center text-sm text-[#94a3b8] py-10">No students found.</p>
            ) : (
              (students || []).map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStudentId(s.id)}
                  className={`w-full text-left flex items-center justify-between px-4 py-3 transition-colors ${
                    studentId === s.id ? 'bg-[#fff7ed]' : 'hover:bg-[#f8fafc]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#f97316] to-[#ea6c0a] flex items-center justify-center shrink-0 text-xs font-bold text-white">
                      {s.name?.[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#1e293b] truncate">{s.name}</p>
                      <p className="text-xs text-[#94a3b8]">
                        {s.enrollmentNumber}{s.rollNumber ? ` · Roll ${s.rollNumber}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <Badge label={`${s.className} - ${s.sectionName}`} variant="navy" />
                    {studentId === s.id && (
                      <div className="w-2 h-2 rounded-full bg-[#f97316]" />
                    )}
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>
      )}

      {/* Report card */}
      {studentId && (
        loadingReport ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !reportCard ? null : (
          <Card>
            {/* Header */}
            <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#f97316] to-[#ea6c0a] flex items-center justify-center text-lg font-bold text-white shrink-0">
                  {reportCard.student?.[0]?.toUpperCase()}
                </div>
                <div>
                  <p className="font-bold text-lg text-[#1e293b]">{reportCard.student}</p>
                  <p className="text-xs text-[#64748b] mt-0.5">
                    {reportCard.enrollmentNumber} · {reportCard.class} — {reportCard.section}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button
                  size="sm"
                  variant="primary"
                  icon={Download}
                  loading={downloadPdf.isPending}
                  onClick={() => downloadPdf.mutate()}
                >
                  Download PDF
                </Button>
                <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleExcelExport}>
                  Export Excel
                </Button>
                <Button size="sm" variant="ghost" icon={Printer} onClick={() => printSection(printId)}>
                  Print
                </Button>
              </div>
            </div>

            <div id={printId}>
              <div className="mb-4 pb-4 border-b border-[#f1f5f9]">
                <h2 className="font-bold text-[#1e293b]">Student Report Card</h2>
                <p className="text-xs text-[#64748b] mt-0.5">
                  {reportCard.enrollmentNumber} · {reportCard.class} — {reportCard.section}
                </p>
              </div>

              {reportCard.reportCard.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center">
                  <TrendingUp size={32} className="text-[#e2e8f0] mb-3" />
                  <p className="text-sm text-[#94a3b8]">No exam types configured for this class yet.</p>
                </div>
              ) : (
                <>
                  {/* Overall summary */}
                  {(() => {
                    const allSubs = reportCard.reportCard.flatMap((et) => et.subjects);
                    const attempted = allSubs.filter((s) => s.marksObtained != null);
                    const totalObt = attempted.reduce((sum, s) => sum + s.marksObtained, 0);
                    const totalMax = attempted.reduce((sum, s) => sum + s.maxMarks, 0);
                    const overallPct = totalMax > 0 ? ((totalObt / totalMax) * 100).toFixed(1) : null;
                    const allPassed = attempted.length > 0 && attempted.every((s) => s.marksObtained >= s.passingMarks);
                    return overallPct ? (
                      <div className="flex items-center gap-3 mb-4 p-3 rounded-xl bg-[#f8fafc] border border-[#e2e8f0]">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-[#64748b] font-semibold uppercase tracking-wide">Overall</span>
                          <span className={`text-xl font-extrabold ${parseFloat(overallPct) >= 40 ? 'text-green-600' : 'text-red-600'}`}>
                            {overallPct}%
                          </span>
                        </div>
                        <Badge label={allPassed ? 'Promoted' : 'Review Required'} variant={allPassed ? 'success' : 'danger'} />
                        <span className="text-xs text-[#94a3b8] ml-auto">{totalObt} / {totalMax} marks</span>
                      </div>
                    ) : null;
                  })()}

                  {/* Per-exam-type tables */}
                  {reportCard.reportCard.map((et) => {
                    const attempted = et.subjects.filter((s) => s.marksObtained != null);
                    const total = attempted.reduce((s, x) => s + x.marksObtained, 0);
                    const max   = attempted.reduce((s, x) => s + x.maxMarks, 0);
                    const pct   = max > 0 ? ((total / max) * 100).toFixed(1) : null;

                    return (
                      <div key={et.examType} className="border border-[#e2e8f0] rounded-xl overflow-hidden mb-4">
                        <div className="bg-[#f8fafc] px-4 py-3 flex items-center justify-between">
                          <p className="text-sm font-bold text-[#1e293b]">{et.examType}</p>
                          <div className="flex items-center gap-2">
                            {et.weightagePercent != null && (
                              <Badge label={`${et.weightagePercent}% weightage`} variant="navy" />
                            )}
                            {pct != null && (
                              <Badge
                                label={`${pct}%`}
                                variant={parseFloat(pct) >= 40 ? 'success' : 'danger'}
                              />
                            )}
                          </div>
                        </div>

                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-[#fafafa]">
                              <th className="px-4 py-2.5 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide">Subject</th>
                              <th className="px-4 py-2.5 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Obtained</th>
                              <th className="px-4 py-2.5 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Max</th>
                              <th className="px-4 py-2.5 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Pass</th>
                              <th className="px-4 py-2.5 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Result</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[#f1f5f9]">
                            {et.subjects.map((sub) => {
                              const passed     = sub.marksObtained != null && sub.marksObtained >= sub.passingMarks;
                              const notEntered = sub.marksObtained == null;
                              return (
                                <tr key={sub.subject} className="hover:bg-[#f8fafc]">
                                  <td className="px-4 py-2.5 text-[#374151] font-medium">{sub.subject}</td>
                                  <td className="px-4 py-2.5 text-right font-semibold">
                                    {notEntered ? (
                                      <span className="text-[#94a3b8]">—</span>
                                    ) : (
                                      <span className={passed ? 'text-[#1e293b]' : 'text-red-600'}>
                                        {sub.marksObtained}
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-4 py-2.5 text-right text-[#64748b]">{sub.maxMarks}</td>
                                  <td className="px-4 py-2.5 text-right text-[#64748b]">{sub.passingMarks}</td>
                                  <td className="px-4 py-2.5 text-right">
                                    {notEntered ? (
                                      <Badge label="Pending" variant="default" />
                                    ) : (
                                      <Badge label={passed ? 'Pass' : 'Fail'} variant={passed ? 'success' : 'danger'} />
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </Card>
        )
      )}
    </div>
  );
}