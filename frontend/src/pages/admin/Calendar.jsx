import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Settings2, Tags, CheckCheck } from 'lucide-react';
import {
  getCalendar, exportCalendar, createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, markCalendarReviewed,
} from '../../api/schooladmin.api';
import Button from '../../components/ui/Button';
import CalendarView from '../../components/calendar/CalendarView';
import {
  EventFormModal, CopyCalendarModal, CalendarSettingsModal, CategoriesModal,
} from '../../components/calendar/AdminCalendarModals';
import { saveBlob, errMsg } from '../../components/calendar/calendarUtils';

export default function AdminCalendar() {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState('');
  const [eventModal, setEventModal] = useState(null); // { initial, date }
  const [showCopy, setShowCopy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showCategories, setShowCategories] = useState(false);
  const [exporting, setExporting] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['ad-calendar', sessionId],
    queryFn: () => getCalendar(sessionId ? { sessionId } : {}).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  useEffect(() => {
    if (!sessionId && data?.session) setSessionId(data.session.id);
  }, [data, sessionId]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['ad-calendar'] });

  const saveMutation = useMutation({
    mutationFn: (payload) => (eventModal?.initial
      ? updateCalendarEvent(eventModal.initial.id, payload)
      : createCalendarEvent({ ...payload, sessionId: data.session.id })),
    onSuccess: () => { refresh(); setEventModal(null); },
  });

  const deleteMutation = useMutation({
    mutationFn: (ev) => deleteCalendarEvent(ev.id),
    onSuccess: () => { refresh(); setEventModal(null); },
  });

  const reviewMutation = useMutation({
    mutationFn: () => markCalendarReviewed({ sessionId: data.session.id }),
    onSuccess: refresh,
  });

  async function doExport(format) {
    setExporting(true);
    try {
      const res = await exportCalendar({ sessionId: data.session.id, format });
      saveBlob(res.data, `Academic-Calendar-${data.session.label}.${format}`);
    } catch {
      window.alert('Download failed. Please try again.');
    } finally {
      setExporting(false);
    }
  }

  const sessions = data?.sessions || [];
  const session = data?.session;
  const needsReview = data?.stats?.needsReviewCount || 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Academic Calendar</h1>
          <p className="text-sm text-[#64748b] mt-1">Holidays, exams and events for the year. Faculty and parents see this automatically.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] min-w-[170px]"
          >
            {sessions.map((s) => <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' (Active)' : ''}</option>)}
          </select>
          <Button variant="outline" size="sm" icon={Copy} disabled={!session} onClick={() => setShowCopy(true)}>Copy from session</Button>
          <Button variant="ghost" size="sm" icon={Settings2} disabled={!session} onClick={() => setShowSettings(true)}>Weekly off</Button>
          <Button variant="ghost" size="sm" icon={Tags} onClick={() => setShowCategories(true)}>Categories</Button>
          {needsReview > 0 && (
            <Button variant="ghost" size="sm" icon={CheckCheck} loading={reviewMutation.isPending} onClick={() => reviewMutation.mutate()}>
              Mark all reviewed
            </Button>
          )}
        </div>
      </div>

      <CalendarView
        data={data}
        loading={isLoading}
        errorMessage={isError ? errMsg(error, 'Could not load the calendar.') : ''}
        canEdit
        exporting={exporting}
        onExport={doExport}
        onAddEvent={(date) => setEventModal({ initial: null, date })}
        onEditEvent={(ev) => setEventModal({ initial: ev, date: null })}
      />

      {session && (
        <>
          <EventFormModal
            open={!!eventModal}
            onClose={() => { setEventModal(null); saveMutation.reset(); deleteMutation.reset(); }}
            initial={eventModal?.initial}
            defaultDate={eventModal?.date}
            session={session}
            categories={data.categories}
            classes={data.classes}
            events={data.events}
            onSave={(payload) => saveMutation.mutate(payload)}
            onDelete={(ev) => deleteMutation.mutate(ev)}
            saving={saveMutation.isPending}
            deleting={deleteMutation.isPending}
            error={errMsg(saveMutation.error, '') || errMsg(deleteMutation.error, '')}
          />
          <CopyCalendarModal open={showCopy} onClose={() => setShowCopy(false)} sessions={sessions} target={session} />
          <CalendarSettingsModal open={showSettings} onClose={() => setShowSettings(false)} session={session} settings={data.settings} />
        </>
      )}
      <CategoriesModal open={showCategories} onClose={() => setShowCategories(false)} categories={data?.categories || []} />
    </div>
  );
}