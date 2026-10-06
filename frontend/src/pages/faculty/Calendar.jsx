import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getFacultyCalendar, exportFacultyCalendar } from '../../api/faculty.api';
import CalendarView from '../../components/calendar/CalendarView';
import { saveBlob, errMsg } from '../../components/calendar/calendarUtils';

export default function FacultyCalendar() {
  const [sessionId, setSessionId] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['fa-calendar', sessionId],
    queryFn: () => getFacultyCalendar(sessionId ? { sessionId } : {}).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!sessionId && data?.session) setSessionId(data.session.id);
  }, [data, sessionId]);

  async function doExport(format) {
    setExporting(true);
    try {
      const res = await exportFacultyCalendar({ sessionId: data.session.id, format });
      saveBlob(res.data, `Academic-Calendar-${data.session.label}.${format}`);
    } catch {
      window.alert('Download failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Academic Calendar</h1>
          <p className="text-sm text-[#64748b] mt-1">School holidays, exams and events for the year.</p>
        </div>
        {data?.sessions?.length > 1 && (
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] min-w-[170px]"
          >
            {data.sessions.map((s) => <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' (Active)' : ''}</option>)}
          </select>
        )}
      </div>

      <CalendarView
        data={data}
        loading={isLoading}
        errorMessage={isError ? errMsg(error, 'Could not load the calendar.') : ''}
        exporting={exporting}
        onExport={doExport}
      />
    </div>
  );
}