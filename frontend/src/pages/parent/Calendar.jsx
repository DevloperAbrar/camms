import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMyChildren, getParentCalendar, exportParentCalendar } from '../../api/parent.api';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import CalendarView from '../../components/calendar/CalendarView';
import { saveBlob, errMsg } from '../../components/calendar/calendarUtils';

export default function ParentCalendar() {
  const [childId, setChildId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [exporting, setExporting] = useState(false);

  const { data: children = [], isLoading: loadingChildren } = useQuery({
    queryKey: ['my-children'],
    queryFn: () => getMyChildren().then((r) => r.data.data ?? []),
  });

  const activeChildId = childId || children[0]?.id || '';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pa-calendar', activeChildId, sessionId],
    queryFn: () => getParentCalendar({ studentId: activeChildId, ...(sessionId ? { sessionId } : {}) }).then((r) => r.data.data),
    enabled: !!activeChildId,
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!sessionId && data?.session) setSessionId(data.session.id);
  }, [data, sessionId]);

  async function doExport(format) {
    setExporting(true);
    try {
      const res = await exportParentCalendar({ studentId: activeChildId, sessionId: data.session.id, format });
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
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">School Calendar</h1>
          <p className="text-sm text-[#64748b] mt-1">Holidays, exams and events for your child's class.</p>
        </div>
        {data?.sessions?.length > 1 && (
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] min-w-[170px]"
          >
            {data.sessions.map((s) => <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' (Current)' : ''}</option>)}
          </select>
        )}
      </div>

      {children.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {children.map((c) => (
            <button
              key={c.id}
              onClick={() => { setChildId(c.id); setSessionId(''); }}
              className={`px-3 sm:px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-all ${
                activeChildId === c.id
                  ? 'border-[#f97316] bg-orange-50 text-[#f97316]'
                  : 'border-[#e2e8f0] text-[#64748b] hover:border-[#f97316]'
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {loadingChildren ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : !activeChildId ? (
        <Card><p className="text-sm text-[#94a3b8] text-center py-8">No children found.</p></Card>
      ) : (
        <CalendarView
          data={data}
          loading={isLoading}
          errorMessage={isError ? errMsg(error, 'Could not load the calendar.') : ''}
          exporting={exporting}
          onExport={doExport}
        />
      )}
    </div>
  );
}