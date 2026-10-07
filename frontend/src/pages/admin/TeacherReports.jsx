import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { exportTeacherReport, getTeacherReportFilters } from '../../api/schooladmin.api';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import { errMsg } from '../../components/calendar/calendarUtils';
import { Notice, Select, TabBar } from '../../components/syllabus/SyllabusUI';
import OverviewTab from '../../components/teacherReports/OverviewTab';
import DayGridTab from '../../components/teacherReports/DayGridTab';
import PendingTab from '../../components/teacherReports/PendingTab';
import MarksTab from '../../components/teacherReports/MarksTab';
import TeacherDetailModal from '../../components/teacherReports/TeacherDetailModal';
import DayDetailModal from '../../components/teacherReports/DayDetailModal';
import { PRESETS, downloadFromResponse, rangeForPreset } from '../../components/teacherReports/trUtils';

const TABS = [
  { value: 'overview', label: 'Overview matrix' },
  { value: 'grid',     label: 'Day-wise grid' },
  { value: 'pending',  label: 'Pending attendance' },
  { value: 'marks',    label: 'Marks tracker' },
];

const EXPORT_TYPE = { overview: 'summary', grid: 'daily', pending: 'pending', marks: 'marks' };

export default function AdminTeacherReports() {
  const [tab, setTab] = useState('overview');
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId] = useState('');
  const [preset, setPreset] = useState('last7');
  const [custom, setCustom] = useState(() => rangeForPreset('last7'));
  const [teacherId, setTeacherId] = useState(null);
  const [day, setDay] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState(null);

  const { data: filters, isLoading, isError, error } = useQuery({
    queryKey: ['tr-filters', sessionId],
    queryFn: () => getTeacherReportFilters(sessionId ? { sessionId } : {}).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  const range = useMemo(() => (preset === 'custom' ? custom : rangeForPreset(preset)), [preset, custom]);
  const activeSessionId = sessionId || filters?.session?.id || '';
  const params = useMemo(() => ({
    sessionId: activeSessionId || undefined,
    classId: classId || undefined,
    from: range.from,
    to: range.to,
  }), [activeSessionId, classId, range]);

  const onExport = async () => {
    setExporting(true);
    try {
      const res = await exportTeacherReport({ ...params, type: EXPORT_TYPE[tab] });
      downloadFromResponse(res, `teacher-${EXPORT_TYPE[tab]}.csv`);
    } catch (err) {
      setNotice({
        type: 'error',
        text: tab === 'grid' ? 'Export failed. The day-wise export supports up to 62 days.' : 'Export failed. Please try again.',
      });
    } finally {
      setExporting(false);
    }
  };

  const openDay = (facultyId, date) => setDay({ facultyId, date });

  return (
    <div className="space-y-5">
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Teacher Reports</h1>
          <p className="text-sm text-[#64748b] mt-1">See who is marking attendance, entering marks and updating the syllabus, day by day.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {filters?.sessions?.length > 1 && (
            <Select value={activeSessionId} onChange={(v) => { setSessionId(v); setClassId(''); }} className="min-w-[150px]">
              {filters.sessions.map((s) => <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' (Active)' : ''}</option>)}
            </Select>
          )}
          <Select value={classId} onChange={setClassId} className="min-w-[140px]">
            <option value="">All classes</option>
            {(filters?.classes || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
          <Select value={preset} onChange={setPreset} className="min-w-[140px]">
            {PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </Select>
          {preset === 'custom' && (
            <>
              <input
                type="date" value={custom.from} max={custom.to}
                onChange={(e) => e.target.value && setCustom((c) => ({ ...c, from: e.target.value }))}
                className="px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              />
              <span className="text-[#94a3b8] text-sm">to</span>
              <input
                type="date" value={custom.to} min={custom.from}
                onChange={(e) => e.target.value && setCustom((c) => ({ ...c, to: e.target.value }))}
                className="px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#f97316]"
              />
            </>
          )}
          <Button variant="outline" size="sm" icon={Download} loading={exporting} onClick={onExport}>Export CSV</Button>
        </div>
      </div>

      <Notice notice={notice} onClose={() => setNotice(null)} />
      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : isError ? (
        <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load teacher reports.') }} />
      ) : !filters?.session ? (
        <Card><p className="text-sm text-[#94a3b8] text-center py-10">Create an academic session first.</p></Card>
      ) : (
        <>
          {tab === 'overview' && <OverviewTab params={params} onOpenTeacher={setTeacherId} />}
          {tab === 'grid' && <DayGridTab params={params} onOpenTeacher={setTeacherId} onOpenDay={openDay} />}
          {tab === 'pending' && <PendingTab params={params} onOpenTeacher={setTeacherId} />}
          {tab === 'marks' && <MarksTab params={params} />}
        </>
      )}

      <TeacherDetailModal teacherId={teacherId} params={params} onClose={() => setTeacherId(null)} onOpenDay={openDay} />
      <DayDetailModal day={day} sessionId={activeSessionId} onClose={() => setDay(null)} />
    </div>
  );
}