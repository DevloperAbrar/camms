import { useQuery } from '@tanstack/react-query';
import { getTeacherReportDayDetail } from '../../api/schooladmin.api';
import Badge from '../ui/Badge';
import Modal from '../ui/Modal';
import Spinner from '../ui/Spinner';
import { errMsg } from '../calendar/calendarUtils';
import { Notice } from '../syllabus/SyllabusUI';

const STATUS = {
  marked:          { label: 'Marked',          variant: 'success' },
  marked_by_other: { label: 'Marked by other', variant: 'info' },
  missing:         { label: 'Missing',         variant: 'danger' },
  pending:         { label: 'Pending today',   variant: 'warning' },
  extra:           { label: 'Extra',           variant: 'success' },
  off:             { label: 'Not expected',    variant: 'default' },
};

export default function DayDetailModal({ day, sessionId, onClose }) {
  const open = !!day;
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['tr-day', day?.facultyId, day?.date, sessionId],
    queryFn: () => getTeacherReportDayDetail({ facultyId: day.facultyId, date: day.date, sessionId: sessionId || undefined }).then((r) => r.data.data),
    enabled: open,
  });

  const title = data ? `${data.teacher.name} · ${data.date}` : 'Day detail';
  return (
    <Modal open={open} onClose={onClose} title={title} size="xl">
      {isLoading ? (
        <div className="flex justify-center py-10"><Spinner /></div>
      ) : isError ? (
        <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load this day.') }} />
      ) : data && (
        <div className="space-y-3">
          {!data.isWorkingDay && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">This date is a weekly off or holiday in the school calendar.</p>}
          <div className="overflow-x-auto rounded-xl border border-[#e2e8f0]">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#f8fafc] border-b border-[#e2e8f0] text-xs uppercase text-[#64748b]">
                  {['Class', 'Subject', 'Status', 'Students', 'P / A / L', 'Marked by', 'First saved'].map((h) => (
                    <th key={h} className="px-3 py-2.5 text-left font-semibold whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((i) => (
                  <tr key={i.assignmentId} className="border-b border-[#f1f5f9]">
                    <td className="px-3 py-2.5 whitespace-nowrap text-[#374151]">{i.className} · {i.sectionName}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-[#1e293b]">{i.subjectName}</td>
                    <td className="px-3 py-2.5"><Badge label={STATUS[i.status].label} variant={STATUS[i.status].variant} /></td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-[#374151]">{i.recorded ? `${i.recorded}/${i.enrolled}` : `0/${i.enrolled}`}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                      {i.recorded ? (
                        <>
                          <span className="text-green-600 font-semibold">{i.present}</span> / <span className="text-red-600 font-semibold">{i.absent}</span> / <span className="text-amber-600 font-semibold">{i.late}</span>
                        </>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-[#64748b]">{i.markedBy.length ? i.markedBy.map((m) => m.name).join(', ') : '—'}</td>
                    <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                      {i.firstMarkedAt ? (
                        <>
                          <span className="text-[#374151]">{i.firstMarkedAt}</span>
                          {i.lateByDays > 0 && <span className="ml-1.5 text-amber-600 font-semibold">({i.lateByDays}d late)</span>}
                        </>
                      ) : <span className="text-[#94a3b8]">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}