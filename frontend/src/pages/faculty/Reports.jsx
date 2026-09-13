import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  FileText, Download, FileSpreadsheet, Calendar, BarChart3,
  Printer, Search, ShieldCheck,
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

// ─── MENU ───────────────────────────────────────────────────────────────────
const MENU = [
  { key: 'attendance', label: 'Attendance Report', icon: Calendar,  desc: 'Day-wise, weekly, custom-range attendance for your sections' },
  { key: 'marks',      label: 'Marks Report',      icon: BarChart3, desc: 'Subject & exam-wise marks with pass/fail breakdown' },
  { key: 'report-card', label: 'Student Report Card', icon: FileText, desc: 'Individual student full report card, PDF or Excel' },
];

// ─── CSV / PRINT HELPERS ────────────────────────────────────────────────────
function tableToCSV(columns, rows) {
  const header = columns.map((c) => `"${c.label}"`).join(',');
  const body = rows.map((row) =>
    columns.map((c) => {
      const val = typeof c.value === 'function' ? c.value(row) : row[c.key] ?? '';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',')
  ).join('\n');
  return header + '\n' + body;
}

function downloadCSV(csv, filename) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function printDiv(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const win = window.open('', '_blank');
  win.document.write(`
    <html><head><title>CampusSafar Report</title>
    <style>
      body { font-family: sans-serif; font-size: 12px; color: #1e293b; padding: 24px; }
      table { width: 100%; border-collapse: collapse; margin-top: 12px; }
      th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; }
      td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
      h2 { font-size: 18px; margin-bottom: 4px; }
      p { color: #64748b; margin: 0 0 16px; font-size: 12px; }
      @media print { body { padding: 0; } }
    </style>
    </head><body>${el.innerHTML}</body></html>
  `);
  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

function todayStr() { return new Date().toISOString().split('T')[0]; }
function weekAgoStr() { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString().split('T')[0]; }
function monthAgoStr() { const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().split('T')[0]; }

// ─── SHARED UI ──────────────────────────────────────────────────────────────
function FilterSelect({ label, value, onChange, options, disabled, placeholder = 'Select' }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">{label}</label>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-[#f97316]/30">
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function EmptyState({ icon: Icon = FileText, title, subtitle }) {
  return (
    <Card className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 bg-[#f1f5f9] rounded-2xl flex items-center justify-center mb-4">
        <Icon size={26} className="text-[#94a3b8]" />
      </div>
      <p className="text-sm font-semibold text-[#1e293b]">{title}</p>
      {subtitle && <p className="text-xs text-[#94a3b8] mt-1 max-w-xs">{subtitle}</p>}
    </Card>
  );
}

// Session/class/section picker built from getMyAssignments — already includes
// pseudo-entries for sections where this faculty is only the Class Teacher.
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
    assignments.filter((a) => a.sessionId === sessionId && a.class.id === classId)
      .map((a) => [a.section.id, { ...a.section, isClassTeacher: a.isClassTeacher }])
  ).values()];

  const isClassTeacherOfSelectedSection = assignments.some(
    (a) => a.sessionId === sessionId && a.classId === classId && a.sectionId === sectionId && a.isClassTeacher
  );

  useEffect(() => {
    if (!sessionId && uniqueSessions.length) {
      const active = uniqueSessions.find((s) => s.isActive) || uniqueSessions[0];
      setSessionId(active.id);
    }
  }, [assignments]); // eslint-disable-line

  useEffect(() => { setClassId(''); setSectionId(''); }, [sessionId]);
  useEffect(() => { setSectionId(''); }, [classId]);

  return {
    isLoading, uniqueSessions, classesForSession, sectionsForClass,
    sessionId, setSessionId, classId, setClassId, sectionId, setSectionId,
    isClassTeacherOfSelectedSection,
  };
}

// ─── MAIN COMPONENT ─────────────────────────────────────────────────────────
export default function FacultyReports() {
  const [tab, setTab] = useState('attendance');
  const active = MENU.find((m) => m.key === tab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Reports</h1>
        <p className="text-sm text-[#64748b] mt-1">Generate and download reports for the classes you teach or lead as class teacher.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        <Card padding={false} className="w-full lg:w-64 shrink-0 overflow-hidden">
          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-visible">
            {MENU.map((m) => {
              const Icon = m.icon;
              const isActive = tab === m.key;
              return (
                <button key={m.key} onClick={() => setTab(m.key)}
                  className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left whitespace-nowrap border-l-4 transition-colors shrink-0 lg:shrink ${
                    isActive ? 'border-[#f97316] bg-[#fff7ed] text-[#f97316]' : 'border-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#1e293b]'
                  }`}>
                  <Icon size={17} />
                  {m.label}
                </button>
              );
            })}
          </nav>
        </Card>

        <div className="flex-1 min-w-0 w-full space-y-4">
          <div className="flex items-center gap-2">
            <active.icon size={15} className="text-[#f97316]" />
            <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">{active?.label}</p>
          </div>
          <p className="text-xs text-[#64748b] -mt-2">{active?.desc}</p>

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
// ════════════════════════════════════════════════════════════════════════════
function AttendanceReport() {
  const {
    isLoading: loadingScope, uniqueSessions, classesForSession, sectionsForClass,
    sessionId, setSessionId, classId, setClassId, sectionId, setSectionId,
  } = useFacultyScope();

  const [rangeType, setRangeType] = useState('monthly');
  const [fromDate, setFromDate] = useState(monthAgoStr());
  const [toDate, setToDate] = useState(todayStr());
  const printId = 'print-attendance';

  useEffect(() => {
    if (rangeType === 'daily')   { setFromDate(todayStr());    setToDate(todayStr()); }
    if (rangeType === 'weekly')  { setFromDate(weekAgoStr());  setToDate(todayStr()); }
    if (rangeType === 'monthly') { setFromDate(monthAgoStr()); setToDate(todayStr()); }
  }, [rangeType]);

  const { data, isLoading } = useQuery({
    queryKey: ['fac-rep-attendance', sessionId, classId, sectionId, fromDate, toDate],
    queryFn: () => getMyReportsAttendance({
      sessionId, classId: classId || undefined, sectionId: sectionId || undefined, fromDate, toDate,
    }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const rows = data || [];

  const columns = [
    { key: 'studentName',          label: 'Student Name' },
    { key: 'enrollmentNumber',     label: 'Enr. No.' },
    { key: 'className',            label: 'Class' },
    { key: 'sectionName',          label: 'Section' },
    { key: 'presentDays',          label: 'Present' },
    { key: 'totalDays',            label: 'Total Days' },
    { key: 'attendancePercentage', label: 'Attendance %', value: (r) => r.attendancePercentage != null ? `${r.attendancePercentage}%` : '-' },
    { key: 'status',               label: 'Status', value: (r) => r.attendancePercentage == null ? 'No Data' : (r.attendancePercentage >= 75 ? 'Regular' : 'Low Attendance') },
  ];

  function handleCSV() {
    downloadCSV(tableToCSV(columns, rows), `attendance-report-${fromDate}-to-${toDate}.csv`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId} disabled={loadingScope}
            options={uniqueSessions.map((s) => ({ value: s.id, label: `${s.label}${s.isActive ? ' (Current)' : ''}` }))} />
          <FilterSelect label="Class (optional)" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} placeholder="All your classes" />
          <FilterSelect label="Section (optional)" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={sectionsForClass.map((s) => ({ value: s.id, label: s.isClassTeacher ? `${s.name} (Class Teacher)` : s.name }))} placeholder="All your sections" />
          <FilterSelect label="Date Range" value={rangeType} onChange={setRangeType}
            options={[
              { value: 'daily',   label: 'Today' },
              { value: 'weekly',  label: 'This Week' },
              { value: 'monthly', label: 'This Month' },
              { value: 'custom',  label: 'Custom Range' },
            ]} />
        </div>

        {rangeType === 'custom' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">From Date</label>
              <input type="date" value={fromDate} max={toDate} onChange={(e) => setFromDate(e.target.value)}
                className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#f97316]/30" />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">To Date</label>
              <input type="date" value={toDate} min={fromDate} max={todayStr()} onChange={(e) => setToDate(e.target.value)}
                className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#f97316]/30" />
            </div>
          </div>
        )}

        <div className="flex gap-2 mt-4 flex-wrap">
          <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleCSV} disabled={!rows.length}>Export Excel/CSV</Button>
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => printDiv(printId)} disabled={!rows.length}>Print / PDF</Button>
        </div>
      </Card>

      {sessionId && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge label={`${fromDate} → ${toDate}`} variant="navy" />
          {!isLoading && <Badge label={`${rows.length} students`} variant="default" />}
        </div>
      )}

      {!sessionId ? (
        <EmptyState icon={Calendar} title="Select a session" subtitle="Choose a session to generate the attendance report." />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={Calendar} title="No data found" subtitle="No attendance records match your filters." />
      ) : (
        <Card padding={false}>
          <div id={printId}>
            <div className="px-6 py-4 border-b border-[#e2e8f0]">
              <h2 className="font-bold text-[#1e293b]">Attendance Report</h2>
              <p className="text-xs text-[#64748b] mt-0.5">{fromDate} to {toDate} · {rows.length} students</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f8fafc]">
                    {columns.map((c) => (
                      <th key={c.key} className="px-4 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-[#f8fafc] transition-colors">
                      {columns.map((c) => {
                        const val = typeof c.value === 'function' ? c.value(row) : row[c.key] ?? '-';
                        const isStatus = c.key === 'status';
                        const isPct = c.key === 'attendancePercentage';
                        return (
                          <td key={c.key} className="px-4 py-3 text-[#374151]">
                            {isStatus ? (
                              <Badge label={val} variant={val === 'Regular' ? 'success' : val === 'No Data' ? 'default' : 'danger'} />
                            ) : isPct ? (
                              <span className={parseFloat(val) < 75 ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}>{val}</span>
                            ) : val}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
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
    isLoading: loadingScope, uniqueSessions, classesForSession, sectionsForClass,
    sessionId, setSessionId, classId, setClassId, sectionId, setSectionId,
  } = useFacultyScope();

  const [examTypeId, setExamTypeId] = useState('');
  const [subjectId, setSubjectId]   = useState('');
  const printId = 'print-marks';

  const { data: examTypes } = useQuery({
    queryKey: ['fac-rep-exam-types', sessionId, classId],
    queryFn: () => getMyReportsExamTypes({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  // If this faculty is a class teacher anywhere in this class, this list will
  // include every subject taught in the class — not just their own.
  const { data: subjects } = useQuery({
    queryKey: ['fac-rep-subjects', sessionId, classId],
    queryFn: () => getMyReportsSubjects({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  useEffect(() => { setExamTypeId(''); setSubjectId(''); }, [classId]);

  const { data: marksRows, isLoading } = useQuery({
    queryKey: ['fac-rep-marks', examTypeId, subjectId, sectionId],
    queryFn: () => getMyReportsMarks({ examTypeId, subjectId: subjectId || undefined, sectionId: sectionId || undefined }).then((r) => r.data.data),
    enabled: !!examTypeId,
  });

  const rows = marksRows || [];

  const columns = [
    { key: 'studentName',      label: 'Student' },
    { key: 'enrollmentNumber', label: 'Enr. No.' },
    { key: 'sectionName',      label: 'Section' },
    { key: 'subject',          label: 'Subject' },
    { key: 'marksObtained',    label: 'Marks' },
    { key: 'passingMarks',     label: 'Passing' },
    { key: 'result',           label: 'Result', value: (r) => r.marksObtained >= r.passingMarks ? 'Pass' : 'Fail' },
  ];

  function handleCSV() {
    downloadCSV(tableToCSV(columns, rows), `marks-report-${examTypeId}.csv`);
  }

  return (
    <div className="space-y-4">
      {(subjects || []).length > 1 && (
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
          <ShieldCheck size={15} className="mt-0.5 shrink-0" />
          <span>You're the Class Teacher here, so you can see and report on <strong>all subjects</strong> for this class — not just the one you teach.</span>
        </div>
      )}

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId} disabled={loadingScope}
            options={uniqueSessions.map((s) => ({ value: s.id, label: `${s.label}${s.isActive ? ' (Current)' : ''}` }))} />
          <FilterSelect label="Class" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Section (optional)" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={sectionsForClass.map((s) => ({ value: s.id, label: s.isClassTeacher ? `${s.name} (Class Teacher)` : s.name }))} placeholder="All your sections" />
          <FilterSelect label="Exam Type" value={examTypeId} onChange={setExamTypeId} disabled={!classId}
            options={(examTypes || []).map((e) => ({ value: e.id, label: e.name }))} />
          <FilterSelect label="Subject (optional)" value={subjectId} onChange={setSubjectId} disabled={!classId}
            options={(subjects || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All subjects" />
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleCSV} disabled={!rows.length}>Export Excel/CSV</Button>
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => printDiv(printId)} disabled={!rows.length}>Print / PDF</Button>
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
            <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="font-bold text-[#1e293b]">Marks Report</h2>
                <p className="text-xs text-[#64748b] mt-0.5">{rows.length} entries</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Badge label={`${rows.filter((r) => r.marksObtained >= r.passingMarks).length} Passed`} variant="success" />
                <Badge label={`${rows.filter((r) => r.marksObtained < r.passingMarks).length} Failed`} variant="danger" />
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#f8fafc]">
                    {columns.map((c) => (
                      <th key={c.key} className="px-4 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {rows.map((row, i) => {
                    const passed = row.marksObtained >= row.passingMarks;
                    return (
                      <tr key={i} className="hover:bg-[#f8fafc] transition-colors">
                        <td className="px-4 py-3 font-medium text-[#1e293b]">{row.studentName}</td>
                        <td className="px-4 py-3 text-[#64748b] text-xs">{row.enrollmentNumber}</td>
                        <td className="px-4 py-3 text-[#374151]">{row.sectionName}</td>
                        <td className="px-4 py-3 text-[#374151]">{row.subject}</td>
                        <td className="px-4 py-3 font-semibold">
                          <span className={passed ? 'text-[#1e293b]' : 'text-red-600'}>{row.marksObtained}</span>
                        </td>
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
    isLoading: loadingScope, uniqueSessions, classesForSession, sectionsForClass,
    sessionId, setSessionId, classId, setClassId, sectionId, setSectionId,
  } = useFacultyScope();

  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const printId = 'print-report-card';

  useEffect(() => { setStudentId(''); }, [sectionId]);

  const { data: students, isLoading: loadingStudents } = useQuery({
    queryKey: ['fac-rep-students', sessionId, classId, sectionId, search],
    queryFn: () => getMyReportsStudents({ sessionId, classId, sectionId, search: search || undefined }).then((r) => r.data.data),
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
          result: sub.marksObtained != null ? (sub.marksObtained >= sub.passingMarks ? 'Pass' : 'Fail') : 'N/A',
        });
      });
    });
    const cols = [
      { key: 'examType', label: 'Exam Type' },
      { key: 'subject', label: 'Subject' },
      { key: 'marksObtained', label: 'Marks Obtained' },
      { key: 'maxMarks', label: 'Max Marks' },
      { key: 'passingMarks', label: 'Passing Marks' },
      { key: 'result', label: 'Result' },
    ];
    downloadCSV(tableToCSV(cols, rows), `report-card-${reportCard.student?.replace(/\s/g, '-')}-${sessionId}.csv`);
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId} disabled={loadingScope}
            options={uniqueSessions.map((s) => ({ value: s.id, label: `${s.label}${s.isActive ? ' (Current)' : ''}` }))} />
          <FilterSelect label="Class" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Section" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={sectionsForClass.map((s) => ({ value: s.id, label: s.isClassTeacher ? `${s.name} (Class Teacher)` : s.name }))} />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Search Student</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name" disabled={!sectionId}
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white disabled:bg-[#f1f5f9] focus:outline-none focus:ring-2 focus:ring-[#f97316]/30" />
            </div>
          </div>
        </div>
      </Card>

      {!sectionId ? (
        <EmptyState icon={FileText} title="Pick a class and section" subtitle="Select a session, class and section above to browse students." />
      ) : (
        <Card padding={false}>
          <p className="px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide border-b border-[#f1f5f9]">Select a student</p>
          <div className="max-h-52 overflow-y-auto divide-y divide-[#f1f5f9]">
            {loadingStudents ? (
              <div className="py-8 flex justify-center"><Spinner /></div>
            ) : (students || []).length === 0 ? (
              <p className="text-center text-sm text-[#94a3b8] py-8">No students found.</p>
            ) : students.map((s) => (
              <button key={s.id} onClick={() => setStudentId(s.id)}
                className={`w-full text-left flex items-center justify-between px-4 py-3 transition-colors ${studentId === s.id ? 'bg-[#fff7ed]' : 'hover:bg-[#f8fafc]'}`}>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#f0f4ff] flex items-center justify-center shrink-0 text-xs font-bold text-[#1e293b]">
                    {s.name?.[0]?.toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-[#1e293b]">{s.name}</p>
                    <p className="text-xs text-[#94a3b8]">{s.enrollmentNumber}{s.rollNumber ? ` · Roll ${s.rollNumber}` : ''}</p>
                  </div>
                </div>
                <Badge label={`${s.className} - ${s.sectionName}`} variant="navy" />
              </button>
            ))}
          </div>
        </Card>
      )}

      {studentId && (
        loadingReport ? (
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !reportCard ? null : (
          <Card>
            <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
              <div>
                <p className="font-bold text-lg text-[#1e293b]">{reportCard.student}</p>
                <p className="text-xs text-[#64748b] mt-0.5">{reportCard.enrollmentNumber} · {reportCard.class} - {reportCard.section}</p>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="primary" icon={Download} loading={downloadPdf.isPending} onClick={() => downloadPdf.mutate()}>Download PDF</Button>
                <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleExcelExport}>Export Excel</Button>
                <Button size="sm" variant="ghost" icon={Printer} onClick={() => printDiv(printId)}>Print</Button>
              </div>
            </div>

            <div id={printId}>
              <div className="mb-4">
                <h2 className="font-bold text-[#1e293b]">Student Report Card — {reportCard.student}</h2>
                <p className="text-xs text-[#64748b]">{reportCard.enrollmentNumber} · {reportCard.class} - {reportCard.section}</p>
              </div>

              {reportCard.reportCard.length === 0 ? (
                <p className="text-sm text-[#94a3b8] py-6 text-center">No exam types configured for this class yet.</p>
              ) : reportCard.reportCard.map((et) => {
                const total = et.subjects.reduce((s, x) => s + (x.marksObtained ?? 0), 0);
                const max = et.subjects.reduce((s, x) => s + (x.maxMarks ?? 0), 0);
                const pct = max > 0 ? ((total / max) * 100).toFixed(1) : null;
                return (
                  <div key={et.examType} className="border border-[#e2e8f0] rounded-xl overflow-hidden mb-4">
                    <div className="bg-[#f8fafc] px-4 py-2.5 flex items-center justify-between">
                      <p className="text-sm font-bold text-[#1e293b]">{et.examType}</p>
                      <div className="flex items-center gap-2">
                        {et.weightagePercent != null && <Badge label={`${et.weightagePercent}% weightage`} variant="navy" />}
                        {pct != null && <Badge label={`${pct}%`} variant={parseFloat(pct) >= 40 ? 'success' : 'danger'} />}
                      </div>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-[#fafafa]">
                          <th className="px-4 py-2 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide">Subject</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Obtained</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Max</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Pass</th>
                          <th className="px-4 py-2 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#f1f5f9]">
                        {et.subjects.map((sub) => {
                          const passed = sub.marksObtained != null && sub.marksObtained >= sub.passingMarks;
                          const notEntered = sub.marksObtained == null;
                          return (
                            <tr key={sub.subject} className="hover:bg-[#f8fafc]">
                              <td className="px-4 py-2 text-[#374151]">{sub.subject}</td>
                              <td className="px-4 py-2 text-right font-semibold">{sub.marksObtained ?? '—'}</td>
                              <td className="px-4 py-2 text-right text-[#64748b]">{sub.maxMarks}</td>
                              <td className="px-4 py-2 text-right text-[#64748b]">{sub.passingMarks}</td>
                              <td className="px-4 py-2 text-right">
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
            </div>
          </Card>
        )
      )}
    </div>
  );
}