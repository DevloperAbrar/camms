import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText, Download, FileSpreadsheet, Calendar, Users, BookOpen,
  BarChart3, Clock, Filter, ChevronRight, Printer, TrendingUp,
  AlertTriangle, UserCheck, ClipboardList, Activity, Search,
} from 'lucide-react';
import {
  getSessions, getClasses, getSubjects, getExamTypes, getStudents,
  getAttendanceReport, getMarksReport,
  getAttendanceDefaulters, getMarksDefaulters,
  getClassComparison, getSectionComparison, getStudentProgress,
  getReportCard, downloadReportCard,
  downloadAttendanceReportPDF, downloadMarksReportPDF,
  downloadMarksDefaultersPDF, downloadAttendanceDefaultersPDF,
  downloadClassPerformancePDF, downloadStudentProgressPDF, downloadBulkReportCardsZip,
} from '../../api/schooladmin.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Spinner from '../../components/ui/Spinner';

// ─── MENU ────────────────────────────────────────────────────────────────────
const MENU = [
  { key: 'attendance', label: 'Attendance Report', icon: Calendar, desc: 'Day-wise, weekly, custom-range attendance with filters' },
  { key: 'marks', label: 'Marks Report', icon: BarChart3, desc: 'Subject & exam-wise marks with pass/fail breakdown' },
  { key: 'student-report', label: 'Student Report Card', icon: FileText, desc: 'Individual student full report card PDF / Excel' },
  { key: 'class-performance', label: 'Class Performance', icon: TrendingUp, desc: 'Class & section-wise comparison and export' },
  { key: 'marks-defaulters', label: 'Marks Defaulters', icon: AlertTriangle, desc: 'Students below passing marks list with export' },
  { key: 'attendance-defaulters', label: 'Attendance Defaulters', icon: UserCheck, desc: 'Low attendance students filterable by threshold' },
  { key: 'student-progress', label: 'Student Progress', icon: Activity, desc: 'Individual student exam trend + attendance history' },
  { key: 'bulk-download', label: 'Bulk Download', icon: Download, desc: 'Download all class report cards in one click' },
];

// ─── SHARED HELPERS ───────────────────────────────────────────────────────────
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

function useSessionClass() {
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('');
  const [sectionId, setSectionId] = useState('');

  const { data: sessions } = useQuery({
    queryKey: ['rep-sessions'],
    queryFn: () => getSessions().then((r) => r.data.data),
  });

  useEffect(() => {
    if (!sessionId && sessions?.length) {
      const active = sessions.find((s) => s.isActive) || sessions[0];
      setSessionId(active.id);
    }
  }, [sessions]); // eslint-disable-line

  const { data: allClasses } = useQuery({
    queryKey: ['rep-classes'],
    queryFn: () => getClasses().then((r) => r.data.data),
  });

  const classesForSession = (allClasses || []).filter((c) => c.sessionId === sessionId);
  const selectedClass = classesForSession.find((c) => c.id === classId);

  useEffect(() => { setClassId(''); setSectionId(''); }, [sessionId]);
  useEffect(() => { setSectionId(''); }, [classId]);

  return { sessions: sessions || [], sessionId, setSessionId, allClasses: allClasses || [], classesForSession, classId, setClassId, sectionId, setSectionId, selectedClass };
}

// ─── PDF / EXCEL CLIENT-SIDE HELPERS ─────────────────────────────────────────
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

async function downloadPDF(apiCall, filename, setLoading) {
  try {
    setLoading?.(true);
    const res = await apiCall();
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert('Could not generate the PDF. Please try again.');
  } finally {
    setLoading?.(false);
  }
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
      .badge-danger { color: #dc2626; font-weight: 600; }
      .badge-success { color: #16a34a; font-weight: 600; }
      @media print { body { padding: 0; } }
    </style>
    </head><body>${el.innerHTML}</body></html>
  `);
  win.document.close();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────
function todayStr() { return new Date().toISOString().split('T')[0]; }
function weekAgoStr() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return d.toISOString().split('T')[0];
}
function monthAgoStr() {
  const d = new Date(); d.setMonth(d.getMonth() - 1);
  return d.toISOString().split('T')[0];
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function AdminReports() {
  const [tab, setTab] = useState('attendance');
  const active = MENU.find((m) => m.key === tab);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1e293b]">Reports</h1>
        <p className="text-sm text-[#64748b] mt-1">Download PDF, Excel or print — all reports run client-side, no server load</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Sidebar menu */}
        <Card padding={false} className="w-full lg:w-64 shrink-0 overflow-hidden">
          <nav className="flex lg:flex-col overflow-x-auto lg:overflow-visible">
            {MENU.map((m) => {
              const Icon = m.icon;
              const isActive = tab === m.key;
              return (
                <button key={m.key} onClick={() => setTab(m.key)}
                  className={`flex items-center gap-3 px-4 py-3 text-sm font-semibold text-left whitespace-nowrap border-l-4 transition-colors shrink-0 lg:shrink ${isActive ? 'border-[#f97316] bg-[#fff7ed] text-[#f97316]' : 'border-transparent text-[#64748b] hover:bg-[#f8fafc] hover:text-[#1e293b]'
                    }`}>
                  <Icon size={17} />
                  {m.label}
                  {isActive && <ChevronRight size={14} className="ml-auto" />}
                </button>
              );
            })}
          </nav>
        </Card>

        {/* Content */}
        <div className="flex-1 min-w-0 w-full space-y-4">
          <div className="flex items-center gap-2">
            <active.icon size={15} className="text-[#f97316]" />
            <p className="text-xs font-semibold text-[#94a3b8] uppercase tracking-wide">{active?.label}</p>
          </div>
          <p className="text-xs text-[#64748b] -mt-2">{active?.desc}</p>

          {tab === 'attendance' && <AttendanceReport />}
          {tab === 'marks' && <MarksReport />}
          {tab === 'student-report' && <StudentReportCard />}
          {tab === 'class-performance' && <ClassPerformanceReport />}
          {tab === 'marks-defaulters' && <MarksDefaultersReport />}
          {tab === 'attendance-defaulters' && <AttendanceDefaultersReport />}
          {tab === 'student-progress' && <StudentProgressReport />}
          {tab === 'bulk-download' && <BulkDownload />}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// 1. ATTENDANCE REPORT
// ════════════════════════════════════════════════════════════════════════════════
function AttendanceReport() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId, sectionId, setSectionId, selectedClass } = useSessionClass();
  const [rangeType, setRangeType] = useState('monthly');
  const [fromDate, setFromDate] = useState(monthAgoStr());
  const [toDate, setToDate] = useState(todayStr());
  const [pdfLoading, setPdfLoading] = useState(false);
  const printId = 'print-attendance';

  // Derive from/to from rangeType
  useEffect(() => {
    if (rangeType === 'daily') { setFromDate(todayStr()); setToDate(todayStr()); }
    if (rangeType === 'weekly') { setFromDate(weekAgoStr()); setToDate(todayStr()); }
    if (rangeType === 'monthly') { setFromDate(monthAgoStr()); setToDate(todayStr()); }
  }, [rangeType]);

  const { data, isLoading } = useQuery({
    queryKey: ['rep-attendance', sessionId, classId, sectionId, fromDate, toDate],
    queryFn: () => getAttendanceReport({
      sessionId,
      classId: classId || undefined,
      sectionId: sectionId || undefined,
      fromDate,
      toDate,
    }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const rows = data || [];

  const columns = [
    { key: 'studentName', label: 'Student Name' },
    { key: 'enrollmentNumber', label: 'Enr. No.' },
    { key: 'presentDays', label: 'Present', value: (r) => r.presentDays ?? '-' },
    { key: 'totalDays', label: 'Total Days', value: (r) => r.totalDays ?? '-' },
    { key: 'attendancePercentage', label: 'Attendance %', value: (r) => r.attendancePercentage != null ? `${r.attendancePercentage}%` : '-' },
    { key: 'status', label: 'Status', value: (r) => r.attendancePercentage == null ? 'No Data' : (r.attendancePercentage >= 75 ? 'Regular' : 'Low Attendance') },
  ];

  function handleCSV() {
    downloadCSV(tableToCSV(columns, rows), `attendance-report-${fromDate}-to-${toDate}.csv`);
  }

  function handlePDF() {
    downloadPDF(
      () => downloadAttendanceReportPDF({ sessionId, classId: classId || undefined, sectionId: sectionId || undefined, fromDate, toDate }),
      `attendance-report-${fromDate}-to-${toDate}.pdf`,
      setPdfLoading,
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class (optional)" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} placeholder="All classes" />
          <FilterSelect label="Section (optional)" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={(selectedClass?.sections || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All sections" />
          <FilterSelect label="Date Range" value={rangeType} onChange={setRangeType}
            options={[
              { value: 'daily', label: 'Today' },
              { value: 'weekly', label: 'This Week' },
              { value: 'monthly', label: 'This Month' },
              { value: 'custom', label: 'Custom Range' },
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
          <Button size="sm" icon={Download} onClick={handlePDF} loading={pdfLoading} disabled={!sessionId}>Download PDF</Button>
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => printDiv(printId)} disabled={!rows.length}>Print / PDF</Button>
        </div>
      </Card>

      {/* Range info */}
      {sessionId && (
        <div className="flex items-center gap-2 flex-wrap">
          <Badge label={`${fromDate} → ${toDate}`} variant="navy" />
          {!isLoading && <Badge label={`${rows.length} students`} variant="default" />}
        </div>
      )}

      {/* Table */}
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

// ════════════════════════════════════════════════════════════════════════════════
// 2. MARKS REPORT
// ════════════════════════════════════════════════════════════════════════════════
function MarksReport() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId, sectionId, setSectionId, selectedClass } = useSessionClass();
  const [examTypeId, setExamTypeId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const printId = 'print-marks';

  const { data: examTypes } = useQuery({
    queryKey: ['rep-exam-types', sessionId, classId],
    queryFn: () => getExamTypes({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  const { data: subjects } = useQuery({
    queryKey: ['rep-subjects', sessionId, classId],
    queryFn: () => getSubjects({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  useEffect(() => { setExamTypeId(''); setSubjectId(''); }, [classId]);

  const { data: marksRows, isLoading } = useQuery({
    queryKey: ['rep-marks', examTypeId, subjectId, sectionId],
    queryFn: () => getMarksReport({ examTypeId, subjectId: subjectId || undefined, sectionId: sectionId || undefined }).then((r) => r.data.data),
    enabled: !!examTypeId,
  });

  const rows = marksRows || [];

  const columns = [
    { key: 'studentName', label: 'Student' },
    { key: 'enrollmentNumber', label: 'Enr. No.' },
    { key: 'subject', label: 'Subject' },
    { key: 'marksObtained', label: 'Marks', value: (r) => r.marksObtained },
    { key: 'passingMarks', label: 'Passing', value: (r) => r.passingMarks },
    { key: 'result', label: 'Result', value: (r) => r.marksObtained >= r.passingMarks ? 'Pass' : 'Fail' },
  ];

  function handleCSV() {
    downloadCSV(tableToCSV(columns, rows), `marks-report-${examTypeId}.csv`);
  }

  function handlePDF() {
    downloadPDF(
      () => downloadMarksReportPDF({ examTypeId, subjectId: subjectId || undefined, sectionId: sectionId || undefined }),
      `marks-report-${examTypeId}.pdf`,
      setPdfLoading,
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} />
          <FilterSelect label="Section (optional)" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={(selectedClass?.sections || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All sections" />
          <FilterSelect label="Exam Type" value={examTypeId} onChange={setExamTypeId} disabled={!classId}
            options={(examTypes || []).map((e) => ({ value: e.id, label: e.name }))} />
          <FilterSelect label="Subject (optional)" value={subjectId} onChange={setSubjectId} disabled={!classId}
            options={(subjects || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All subjects" />
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleCSV} disabled={!rows.length}>Export Excel/CSV</Button>
          <Button size="sm" icon={Download} onClick={handlePDF} loading={pdfLoading} disabled={!examTypeId}>Download PDF</Button>
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => printDiv(printId)} disabled={!rows.length}>Print / PDF</Button>
        </div>
      </Card>

      {!examTypeId ? (
        <EmptyState icon={BarChart3} title="Select exam type" subtitle="Choose session → class → exam type to view marks report." />
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

// ════════════════════════════════════════════════════════════════════════════════
// 3. STUDENT REPORT CARD
// ════════════════════════════════════════════════════════════════════════════════
function StudentReportCard() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId, sectionId, setSectionId, selectedClass } = useSessionClass();
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const printId = 'print-report-card';

  useEffect(() => { setStudentId(''); setSelectedStudent(null); }, [classId]);

  const { data: studentsData, isLoading: loadingStudents } = useQuery({
    queryKey: ['rep-rc-students', sessionId, classId, sectionId, search],
    queryFn: () => getStudents({ sessionId, classId: classId || undefined, sectionId: sectionId || undefined, search: search || undefined, limit: 30 }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const { data: reportCard, isLoading: loadingReport } = useQuery({
    queryKey: ['rep-report-card', studentId, sessionId],
    queryFn: () => getReportCard({ studentId, sessionId }).then((r) => r.data.data),
    enabled: !!(studentId && sessionId),
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

  function handlePDF() {
    downloadPDF(
      () => downloadReportCard({ studentId, sessionId }),
      `report-card-${reportCard?.student?.replace(/\s/g, '-') || studentId}.pdf`,
      setPdfLoading,
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class (optional)" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} placeholder="All classes" />
          <FilterSelect label="Section (optional)" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={(selectedClass?.sections || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All sections" />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Search Student</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]/30" />
            </div>
          </div>
        </div>
      </Card>

      {/* Student picker */}
      {sessionId && (
        <Card padding={false}>
          <p className="px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide border-b border-[#f1f5f9]">Select a student</p>
          <div className="max-h-52 overflow-y-auto divide-y divide-[#f1f5f9]">
            {loadingStudents ? (
              <div className="py-8 flex justify-center"><Spinner /></div>
            ) : (studentsData?.students || []).length === 0 ? (
              <p className="text-center text-sm text-[#94a3b8] py-8">No students found.</p>
            ) : studentsData.students.map((s) => {
              const enr = s.enrollments?.[0];
              return (
                <button key={s.id} onClick={() => { setStudentId(s.id); setSelectedStudent(s); }}
                  className={`w-full text-left flex items-center justify-between px-4 py-3 transition-colors ${studentId === s.id ? 'bg-[#fff7ed]' : 'hover:bg-[#f8fafc]'}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#f0f4ff] flex items-center justify-center shrink-0 text-xs font-bold text-[#1e293b]">
                      {s.name?.[0]?.toUpperCase()}
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

      {/* Report card */}
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
                <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleExcelExport}>Export Excel</Button>
                <Button size="sm" icon={Download} onClick={handlePDF} loading={pdfLoading}>Download PDF</Button>
                <Button size="sm" variant="ghost" icon={Printer} onClick={() => printDiv(printId)}>Print / PDF</Button>
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
                              <td className="px-4 py-2.5 text-[#374151]">{sub.subject}</td>
                              <td className="px-4 py-2.5 text-right font-semibold">
                                {notEntered ? <span className="text-[#94a3b8]">–</span>
                                  : <span className={passed ? 'text-[#1e293b]' : 'text-red-600'}>{sub.marksObtained}</span>}
                              </td>
                              <td className="px-4 py-2.5 text-right text-[#64748b]">{sub.maxMarks}</td>
                              <td className="px-4 py-2.5 text-right text-[#64748b]">{sub.passingMarks}</td>
                              <td className="px-4 py-2.5 text-right">
                                {notEntered ? <Badge label="Pending" variant="default" />
                                  : <Badge label={passed ? 'Pass' : 'Fail'} variant={passed ? 'success' : 'danger'} />}
                              </td>
                            </tr>
                          );
                        })}
                        {/* Total row */}
                        <tr className="bg-[#f8fafc] font-bold">
                          <td className="px-4 py-2.5 text-[#1e293b]">Total</td>
                          <td className="px-4 py-2.5 text-right text-[#1e293b]">{total}</td>
                          <td className="px-4 py-2.5 text-right text-[#1e293b]">{max}</td>
                          <td colSpan={2} className="px-4 py-2.5 text-right text-[#64748b] text-xs font-normal">{pct != null ? `${pct}%` : ''}</td>
                        </tr>
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

// ════════════════════════════════════════════════════════════════════════════════
// 4. CLASS PERFORMANCE REPORT
// ════════════════════════════════════════════════════════════════════════════════
function ClassPerformanceReport() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId } = useSessionClass();
  const [view, setView] = useState('class'); // class | section
  const [pdfLoading, setPdfLoading] = useState(false);
  const printId = 'print-class-perf';

  const { data: classData, isLoading: loadingClass } = useQuery({
    queryKey: ['rep-class-comparison', sessionId],
    queryFn: () => getClassComparison({ sessionId }).then((r) => r.data.data),
    enabled: !!sessionId && view === 'class',
  });

  const { data: sectionData, isLoading: loadingSection } = useQuery({
    queryKey: ['rep-section-comparison', sessionId, classId],
    queryFn: () => getSectionComparison({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!sessionId && !!classId && view === 'section',
  });

  const rows = view === 'class' ? (classData || []) : (sectionData || []);
  const isLoading = view === 'class' ? loadingClass : loadingSection;

  const classColumns = [
    { key: 'className', label: 'Class' },
    { key: 'avgScorePercent', label: 'Avg Score %', value: (r) => `${r.avgScorePercent}%` },
    { key: 'passPercent', label: 'Pass %', value: (r) => `${r.passPercent}%` },
    { key: 'attendancePercent', label: 'Attendance %', value: (r) => `${r.attendancePercent}%` },
    { key: 'totalMarksEntries', label: 'Marks Entries' },
  ];

  const sectionColumns = [
    { key: 'sectionName', label: 'Section' },
    { key: 'avgScorePercent', label: 'Avg Score %', value: (r) => `${r.avgScorePercent}%` },
    { key: 'passPercent', label: 'Pass %', value: (r) => `${r.passPercent}%` },
    { key: 'attendancePercent', label: 'Attendance %', value: (r) => `${r.attendancePercent}%` },
  ];

  const columns = view === 'class' ? classColumns : sectionColumns;

  function handleCSV() {
    downloadCSV(tableToCSV(columns, rows), `${view}-performance-${sessionId}.csv`);
  }

  function handlePDF() {
    downloadPDF(
      () => downloadClassPerformancePDF({ sessionId, classId: view === 'section' ? classId : undefined, view }),
      `${view}-performance-${sessionId}.pdf`,
      setPdfLoading,
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="View" value={view} onChange={setView}
            options={[{ value: 'class', label: 'Class-wise' }, { value: 'section', label: 'Section-wise' }]} />
          {view === 'section' && (
            <FilterSelect label="Class" value={classId} onChange={setClassId} disabled={!sessionId}
              options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} />
          )}
        </div>
        <div className="flex gap-2 mt-4">
          <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleCSV} disabled={!rows.length}>Export Excel/CSV</Button>
          <Button size="sm" icon={Download} onClick={handlePDF} loading={pdfLoading} disabled={!sessionId || (view === 'section' && !classId)}>Download PDF</Button>
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => printDiv(printId)} disabled={!rows.length}>Print / PDF</Button>
        </div>
      </Card>

      {!sessionId ? (
        <EmptyState icon={TrendingUp} title="Select a session" subtitle="Choose session to compare class or section performance." />
      ) : view === 'section' && !classId ? (
        <EmptyState icon={TrendingUp} title="Select a class" subtitle="Choose a class to view section-wise performance." />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No data" subtitle="No performance data found." />
      ) : (
        <Card padding={false}>
          <div id={printId}>
            <div className="px-6 py-4 border-b border-[#e2e8f0]">
              <h2 className="font-bold text-[#1e293b]">{view === 'class' ? 'Class' : 'Section'} Performance Report</h2>
              <p className="text-xs text-[#64748b] mt-0.5">{rows.length} {view === 'class' ? 'classes' : 'sections'}</p>
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
                        const isPct = c.key === 'passPercent';
                        const pctNum = isPct ? parseFloat(row.passPercent) : null;
                        return (
                          <td key={c.key} className="px-4 py-3 text-[#374151]">
                            {isPct
                              ? <Badge label={val} variant={pctNum >= 75 ? 'success' : pctNum >= 40 ? 'warning' : 'danger'} />
                              : val}
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

// ════════════════════════════════════════════════════════════════════════════════
// 5. MARKS DEFAULTERS REPORT
// ════════════════════════════════════════════════════════════════════════════════
function MarksDefaultersReport() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId } = useSessionClass();
  const [examTypeId, setExamTypeId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const printId = 'print-marks-defaulters';

  const { data: examTypes } = useQuery({
    queryKey: ['rep-md-exam-types', sessionId, classId],
    queryFn: () => getExamTypes({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  const { data: subjects } = useQuery({
    queryKey: ['rep-md-subjects', sessionId, classId],
    queryFn: () => getSubjects({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  useEffect(() => { setExamTypeId(''); setSubjectId(''); }, [classId]);

  const { data: defaulters, isLoading } = useQuery({
    queryKey: ['rep-marks-defaulters', examTypeId, subjectId],
    queryFn: () => getMarksDefaulters({ examTypeId, subjectId: subjectId || undefined }).then((r) => r.data.data),
    enabled: !!examTypeId,
  });

  const rows = defaulters || [];
  const columns = [
    { key: 'studentName', label: 'Student' },
    { key: 'enrollmentNumber', label: 'Enr. No.' },
    { key: 'subject', label: 'Subject' },
    { key: 'marksObtained', label: 'Obtained' },
    { key: 'passingMarks', label: 'Passing Marks' },
    { key: 'deficit', label: 'Deficit', value: (r) => (r.passingMarks - r.marksObtained).toFixed(1) },
  ];

  function handleCSV() {
    downloadCSV(tableToCSV(columns, rows), `marks-defaulters-${examTypeId}.csv`);
  }

  function handlePDF() {
    downloadPDF(
      () => downloadMarksDefaultersPDF({ examTypeId, subjectId: subjectId || undefined }),
      `marks-defaulters-${examTypeId}.pdf`,
      setPdfLoading,
    );
  }

  return (
    <div className="space-y-4">
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
        <div className="flex gap-2 mt-4">
          <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleCSV} disabled={!rows.length}>Export Excel/CSV</Button>
          <Button size="sm" icon={Download} onClick={handlePDF} loading={pdfLoading} disabled={!examTypeId}>Download PDF</Button>
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => printDiv(printId)} disabled={!rows.length}>Print / PDF</Button>
        </div>
      </Card>

      {!examTypeId ? (
        <EmptyState icon={AlertTriangle} title="Select exam type" subtitle="Choose session → class → exam type to list marks defaulters." />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={AlertTriangle} title="No defaulters" subtitle="All students have passed in this exam type." />
      ) : (
        <Card padding={false}>
          <div id={printId}>
            <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[#1e293b]">Marks Defaulters</h2>
                <p className="text-xs text-[#64748b] mt-0.5">Students below passing marks</p>
              </div>
              <Badge label={`${rows.length} students`} variant="danger" />
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
                    <tr key={i} className="hover:bg-[#f8fafc]">
                      <td className="px-4 py-3 font-medium text-[#1e293b]">{row.studentName}</td>
                      <td className="px-4 py-3 text-xs text-[#64748b]">{row.enrollmentNumber}</td>
                      <td className="px-4 py-3 text-[#374151]">{row.subject}</td>
                      <td className="px-4 py-3 font-bold text-red-600">{row.marksObtained}</td>
                      <td className="px-4 py-3 text-[#64748b]">{row.passingMarks}</td>
                      <td className="px-4 py-3">
                        <Badge label={`-${(row.passingMarks - row.marksObtained).toFixed(1)}`} variant="danger" />
                      </td>
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

// ════════════════════════════════════════════════════════════════════════════════
// 6. ATTENDANCE DEFAULTERS REPORT
// ════════════════════════════════════════════════════════════════════════════════
function AttendanceDefaultersReport() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId, sectionId, setSectionId, selectedClass } = useSessionClass();
  const [threshold, setThreshold] = useState(75);
  const [appliedThreshold, setAppliedThreshold] = useState(75);
  const [pdfLoading, setPdfLoading] = useState(false);
  const printId = 'print-att-defaulters';

  const { data: defaulters, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['rep-att-defaulters', sessionId, classId, sectionId, appliedThreshold],
    queryFn: () => getAttendanceDefaulters({
      sessionId,
      classId: classId || undefined,
      sectionId: sectionId || undefined,
      threshold: appliedThreshold,
    }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const rows = defaulters || [];
  const columns = [
    { key: 'studentName', label: 'Student' },
    { key: 'enrollmentNumber', label: 'Enr. No.' },
    { key: 'presentDays', label: 'Present Days' },
    { key: 'totalDays', label: 'Total Days' },
    { key: 'attendancePercentage', label: 'Attendance %', value: (r) => `${r.attendancePercentage}%` },
    {
      key: 'shortage', label: 'Shortage', value: (r) => {
        const needed = Math.ceil((appliedThreshold / 100) * r.totalDays) - r.presentDays;
        return needed > 0 ? `${needed} days` : '—';
      }
    },
  ];

  function handleCSV() {
    downloadCSV(tableToCSV(columns, rows), `attendance-defaulters-${appliedThreshold}pct.csv`);
  }

  function handlePDF() {
    downloadPDF(
      () => downloadAttendanceDefaultersPDF({ sessionId, classId: classId || undefined, sectionId: sectionId || undefined, threshold: appliedThreshold }),
      `attendance-defaulters-${appliedThreshold}pct.pdf`,
      setPdfLoading,
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class (optional)" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} placeholder="All classes" />
          <FilterSelect label="Section (optional)" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={(selectedClass?.sections || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All sections" />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Threshold %</label>
            <div className="flex gap-2">
              <input type="number" min={0} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))}
                className="w-full px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#f97316]/30" />
              <Button size="sm" onClick={() => setAppliedThreshold(threshold)} loading={isFetching}>Apply</Button>
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleCSV} disabled={!rows.length}>Export Excel/CSV</Button>
          <Button size="sm" icon={Download} onClick={handlePDF} loading={pdfLoading} disabled={!sessionId}>Download PDF</Button>
          <Button size="sm" variant="ghost" icon={Printer} onClick={() => printDiv(printId)} disabled={!rows.length}>Print / PDF</Button>
        </div>
      </Card>

      {!sessionId ? (
        <EmptyState icon={UserCheck} title="Select a session" subtitle="Choose session to view attendance defaulters." />
      ) : isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : rows.length === 0 ? (
        <EmptyState icon={UserCheck} title="No defaulters" subtitle={`No students below ${appliedThreshold}% attendance.`} />
      ) : (
        <Card padding={false}>
          <div id={printId}>
            <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between">
              <div>
                <h2 className="font-bold text-[#1e293b]">Attendance Defaulters — Below {appliedThreshold}%</h2>
                <p className="text-xs text-[#64748b] mt-0.5">{rows.length} students</p>
              </div>
              <div className="flex gap-2">
                <Badge label={`< ${appliedThreshold}% threshold`} variant="warning" />
                <Badge label={`${rows.length} students`} variant="danger" />
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
                  {rows.map((row, i) => (
                    <tr key={i} className="hover:bg-[#f8fafc]">
                      <td className="px-4 py-3 font-medium text-[#1e293b]">{row.studentName}</td>
                      <td className="px-4 py-3 text-xs text-[#64748b]">{row.enrollmentNumber}</td>
                      <td className="px-4 py-3 text-green-700 font-semibold">{row.presentDays}</td>
                      <td className="px-4 py-3 text-[#374151]">{row.totalDays}</td>
                      <td className="px-4 py-3">
                        <Badge label={`${row.attendancePercentage}%`} variant="danger" />
                      </td>
                      <td className="px-4 py-3 text-xs text-[#64748b]">
                        {(() => {
                          const needed = Math.ceil((appliedThreshold / 100) * row.totalDays) - row.presentDays;
                          return needed > 0 ? <Badge label={`${needed} days short`} variant="warning" /> : '—';
                        })()}
                      </td>
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

// ════════════════════════════════════════════════════════════════════════════════
// 7. STUDENT PROGRESS REPORT
// ════════════════════════════════════════════════════════════════════════════════
function StudentProgressReport() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId, sectionId, setSectionId, selectedClass } = useSessionClass();
  const [search, setSearch] = useState('');
  const [studentId, setStudentId] = useState('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const printId = 'print-progress';

  useEffect(() => { setStudentId(''); }, [classId]);

  const { data: studentsData, isLoading: loadingStudents } = useQuery({
    queryKey: ['rep-prog-students', sessionId, classId, sectionId, search],
    queryFn: () => getStudents({ sessionId, classId: classId || undefined, sectionId: sectionId || undefined, search: search || undefined, limit: 20 }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const { data: progress, isLoading: loadingProgress } = useQuery({
    queryKey: ['rep-progress', studentId, sessionId],
    queryFn: () => getStudentProgress({ studentId, sessionId }).then((r) => r.data.data),
    enabled: !!(studentId && sessionId),
  });

  function handleCSVExamTrend() {
    if (!progress) return;
    const cols = [
      { key: 'examType', label: 'Exam Type' },
      { key: 'averagePercent', label: 'Average %', value: (r) => r.averagePercent ?? 'N/A' },
    ];
    downloadCSV(tableToCSV(cols, progress.examTrend), `student-exam-trend-${studentId}.csv`);
  }

  function handleCSVAttendance() {
    if (!progress) return;
    const cols = [
      { key: 'month', label: 'Month' },
      { key: 'attendancePercent', label: 'Attendance %', value: (r) => `${r.attendancePercent}%` },
    ];
    downloadCSV(tableToCSV(cols, progress.attendanceTrend), `student-attendance-trend-${studentId}.csv`);
  }

  function handlePDF() {
    downloadPDF(
      () => downloadStudentProgressPDF({ studentId, sessionId }),
      `student-progress-${studentId}.pdf`,
      setPdfLoading,
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FilterSelect label="Session" value={sessionId} onChange={setSessionId}
            options={sessions.map((s) => ({ value: s.id, label: s.label }))} />
          <FilterSelect label="Class (optional)" value={classId} onChange={setClassId} disabled={!sessionId}
            options={classesForSession.map((c) => ({ value: c.id, label: c.name }))} placeholder="All classes" />
          <FilterSelect label="Section (optional)" value={sectionId} onChange={setSectionId} disabled={!classId}
            options={(selectedClass?.sections || []).map((s) => ({ value: s.id, label: s.name }))} placeholder="All sections" />
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold text-[#374151] uppercase tracking-wide">Search Student</label>
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name"
                className="w-full pl-9 pr-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]/30" />
            </div>
          </div>
        </div>
      </Card>

      {sessionId && (
        <Card padding={false}>
          <div className="max-h-52 overflow-y-auto divide-y divide-[#f1f5f9]">
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
                    <div className="w-8 h-8 rounded-full bg-[#f0f4ff] flex items-center justify-center shrink-0 text-xs font-bold text-[#1e293b]">
                      {s.name?.[0]?.toUpperCase()}
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
          <div className="flex justify-center py-16"><Spinner /></div>
        ) : !progress ? null : (
          <div className="space-y-4" id={printId}>
            {/* Download full progress report as one branded PDF */}
            <div className="flex justify-end">
              <Button size="sm" icon={Download} onClick={handlePDF} loading={pdfLoading}>Download Full PDF</Button>
            </div>

            {/* Exam Trend Table */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-[#1e293b]">Exam-wise Progress</p>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleCSVExamTrend}>Export CSV</Button>
                  <Button size="sm" variant="ghost" icon={Printer} onClick={() => printDiv(printId)}>Print</Button>
                </div>
              </div>
              {progress.examTrend.length === 0 ? (
                <p className="text-sm text-[#94a3b8] text-center py-4">No exam data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#f8fafc]">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide">Exam Type</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Average %</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {progress.examTrend.map((et, i) => (
                        <tr key={i} className="hover:bg-[#f8fafc]">
                          <td className="px-4 py-3 text-[#374151]">{et.examType}</td>
                          <td className="px-4 py-3 text-right font-semibold text-[#1e293b]">
                            {et.averagePercent != null ? `${et.averagePercent}%` : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {et.averagePercent != null && (
                              <Badge label={et.averagePercent >= 40 ? 'Pass' : 'Fail'} variant={et.averagePercent >= 40 ? 'success' : 'danger'} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Attendance Trend Table */}
            <Card>
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-[#1e293b]">Monthly Attendance</p>
                <Button size="sm" variant="outline" icon={FileSpreadsheet} onClick={handleCSVAttendance}>Export CSV</Button>
              </div>
              {!progress.attendanceTrend?.length ? (
                <p className="text-sm text-[#94a3b8] text-center py-4">No attendance data yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#f8fafc]">
                        <th className="px-4 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wide">Month</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Attendance %</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-[#64748b] uppercase tracking-wide">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#f1f5f9]">
                      {progress.attendanceTrend.map((m, i) => (
                        <tr key={i} className="hover:bg-[#f8fafc]">
                          <td className="px-4 py-3 text-[#374151]">{m.month}</td>
                          <td className="px-4 py-3 text-right font-semibold">
                            <span className={m.attendancePercent < 75 ? 'text-red-600' : 'text-green-700'}>{m.attendancePercent}%</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Badge label={m.attendancePercent >= 75 ? 'Regular' : 'Low'} variant={m.attendancePercent >= 75 ? 'success' : 'danger'} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>

            {/* Subject Breakdown */}
            {progress.subjectBreakdown?.length > 0 && (
              <Card>
                <p className="font-bold text-[#1e293b] mb-4">Subject Breakdown — {progress.latestExamType || 'Latest Exam'}</p>
                <div className="space-y-3">
                  {progress.subjectBreakdown.map((sub, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <p className="text-sm text-[#374151] w-32 shrink-0 truncate">{sub.subject}</p>
                      <div className="flex-1 bg-[#f1f5f9] rounded-full h-2">
                        <div className="h-2 rounded-full transition-all"
                          style={{ width: `${Math.min(sub.percent, 100)}%`, background: sub.percent >= 40 ? '#16a34a' : '#dc2626' }} />
                      </div>
                      <p className="text-sm font-semibold text-[#1e293b] w-12 text-right">{sub.percent}%</p>
                      <Badge label={sub.percent >= 40 ? 'Pass' : 'Fail'} variant={sub.percent >= 40 ? 'success' : 'danger'} />
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        )
      )}

      {!studentId && !sessionId && (
        <EmptyState icon={Activity} title="Select a student" subtitle="Choose session and student to view their progress report." />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// 8. BULK DOWNLOAD
// ════════════════════════════════════════════════════════════════════════════════
function BulkDownload() {
  const { sessions, sessionId, setSessionId, classesForSession, classId, setClassId, sectionId, setSectionId, selectedClass } = useSessionClass();
  const [generating, setGenerating] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [zipLoading, setZipLoading] = useState(false);

  const { data: studentsData, isLoading: loadingStudents } = useQuery({
    queryKey: ['rep-bulk-students', sessionId, classId, sectionId],
    queryFn: () => getStudents({ sessionId, classId: classId || undefined, sectionId: sectionId || undefined, limit: 500 }).then((r) => r.data.data),
    enabled: !!sessionId,
  });

  const students = studentsData?.students || [];

  async function handleBulkPDF() {
    if (!students.length) return;
    setZipLoading(true);
    try {
      const res = await downloadBulkReportCardsZip({ sessionId, classId: classId || undefined, sectionId: sectionId || undefined });
      const blob = new Blob([res.data], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `report-cards-${sessionId}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Could not generate the ZIP. Please try again.');
    } finally {
      setZipLoading(false);
    }
  }

  async function handleBulkExcel() {
    if (!students.length) return;
    setGenerating(true);
    setDone(0);
    setTotal(students.length);

    const allRows = [];
    for (let i = 0; i < students.length; i++) {
      const s = students[i];
      try {
        const res = await getReportCard({ studentId: s.id, sessionId });
        const rc = res.data.data;
        if (rc) {
          rc.reportCard.forEach((et) => {
            et.subjects.forEach((sub) => {
              allRows.push({
                student: rc.student,
                enrollmentNumber: rc.enrollmentNumber,
                class: rc.class,
                section: rc.section,
                examType: et.examType,
                subject: sub.subject,
                marksObtained: sub.marksObtained ?? 'N/A',
                maxMarks: sub.maxMarks,
                passingMarks: sub.passingMarks,
                result: sub.marksObtained != null ? (sub.marksObtained >= sub.passingMarks ? 'Pass' : 'Fail') : 'Pending',
              });
            });
          });
        }
      } catch (_) { /* skip */ }
      setDone(i + 1);
    }

    const cols = [
      { key: 'student', label: 'Student' },
      { key: 'enrollmentNumber', label: 'Enr. No.' },
      { key: 'class', label: 'Class' },
      { key: 'section', label: 'Section' },
      { key: 'examType', label: 'Exam Type' },
      { key: 'subject', label: 'Subject' },
      { key: 'marksObtained', label: 'Marks Obtained' },
      { key: 'maxMarks', label: 'Max Marks' },
      { key: 'passingMarks', label: 'Passing Marks' },
      { key: 'result', label: 'Result' },
    ];

    downloadCSV(tableToCSV(cols, allRows), `bulk-report-cards-${sessionId}.csv`);
    setGenerating(false);
  }

  return (
    <div className="space-y-4">
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
        <EmptyState icon={Download} title="Select session" subtitle="Choose a session, optionally filter by class and section, then bulk export." />
      ) : loadingStudents ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : (
        <Card>
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div>
              <p className="font-bold text-[#1e293b]">Bulk Export — All Report Cards</p>
              <p className="text-xs text-[#64748b] mt-0.5">{students.length} student{students.length !== 1 ? 's' : ''} will be exported</p>
            </div>
            <div className="flex gap-2">
              <Button icon={FileSpreadsheet} onClick={handleBulkExcel} loading={generating} disabled={!students.length}>
                {generating ? `Generating ${done}/${total}...` : 'Download All as Excel/CSV'}
              </Button>
              <Button icon={Download} onClick={handleBulkPDF} loading={zipLoading} disabled={!students.length}>
                {zipLoading ? 'Zipping PDFs...' : 'Download All as PDF (ZIP)'}
              </Button>
            </div>
          </div>

          {generating && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs text-[#64748b]">Processing students…</p>
                <p className="text-xs font-semibold text-[#f97316]">{done}/{total}</p>
              </div>
              <div className="w-full bg-[#f1f5f9] rounded-full h-2">
                <div className="h-2 bg-[#f97316] rounded-full transition-all"
                  style={{ width: `${(done / total) * 100}%` }} />
              </div>
            </div>
          )}

          {/* Student list preview */}
          <div className="border border-[#e2e8f0] rounded-xl overflow-hidden">
            <div className="bg-[#f8fafc] px-4 py-2.5 text-xs font-semibold text-[#64748b] uppercase tracking-wide">
              Students to be exported
            </div>
            <div className="max-h-64 overflow-y-auto divide-y divide-[#f1f5f9]">
              {students.length === 0 ? (
                <p className="text-center text-sm text-[#94a3b8] py-8">No students found.</p>
              ) : students.map((s) => {
                const enr = s.enrollments?.[0];
                return (
                  <div key={s.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#f0f4ff] flex items-center justify-center text-xs font-bold text-[#1e293b]">
                        {s.name?.[0]?.toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-[#1e293b]">{s.name}</p>
                        <p className="text-xs text-[#94a3b8]">{s.enrollmentNumber}</p>
                      </div>
                    </div>
                    {enr && <Badge label={`${enr.class?.name} - ${enr.section?.name}`} variant="default" />}
                  </div>
                );
              })}
            </div>
          </div>

          <p className="text-xs text-[#94a3b8] mt-4">
            ℹ️ Export runs fully in your browser — no server load. For large classes it may take a few seconds.
          </p>
        </Card>
      )}
    </div>
  );
}