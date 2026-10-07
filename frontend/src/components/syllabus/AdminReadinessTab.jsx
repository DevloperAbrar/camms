import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { getSyllabusExamReadiness, sendSyllabusReminder, exportSyllabusCsv } from '../../api/schooladmin.api';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { saveBlob, errMsg } from '../calendar/calendarUtils';
import { Notice, Select, ReadinessPanel } from './SyllabusUI';

export default function AdminReadinessTab({ sessionId, structure }) {
  const exams = structure?.examTypes || [];
  const classNames = Object.fromEntries((structure?.classes || []).map((c) => [c.id, c.name]));
  const [examTypeId, setExamTypeId] = useState('');
  const [notice, setNotice] = useState(null);
  const [remindingKey, setRemindingKey] = useState('');
  const [exporting, setExporting] = useState(false);
  const activeId = examTypeId || exams[0]?.id || '';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['syl-readiness', activeId],
    queryFn: () => getSyllabusExamReadiness({ examTypeId: activeId }).then((r) => r.data.data),
    enabled: !!activeId,
  });

  const remind = useMutation({
    mutationFn: (row) => sendSyllabusReminder({ sessionId, sectionId: row.sectionId, subjectId: row.subjectId }),
    onSuccess: (res) => setNotice({ type: 'success', text: res.data.message }),
    onError: (e) => setNotice({ type: 'error', text: errMsg(e, 'Could not send the reminder.') }),
    onSettled: () => setRemindingKey(''),
  });

  async function doExport() {
    setExporting(true);
    try {
      const res = await exportSyllabusCsv({ examTypeId: activeId });
      saveBlob(res.data, 'Syllabus-Exam-Readiness.csv');
    } catch {
      setNotice({ type: 'error', text: 'Download failed. Please try again.' });
    } finally {
      setExporting(false);
    }
  }

  if (!exams.length) {
    return <Card><p className="text-sm text-[#94a3b8] text-center py-10">No exams have been created for this session yet. Create exams under the Exams menu first.</p></Card>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
        <Select value={activeId} onChange={setExamTypeId} className="min-w-[240px]">
          {exams.map((e) => <option key={e.id} value={e.id}>{e.name} · {classNames[e.classId] || ''}</option>)}
        </Select>
        <Button variant="outline" size="sm" icon={Download} loading={exporting} onClick={doExport}>Export CSV</Button>
      </div>
      <Notice notice={notice} onClose={() => setNotice(null)} />
      {isError ? (
        <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load exam readiness.') }} />
      ) : (
        <ReadinessPanel
          data={data}
          loading={isLoading}
          remindingKey={remindingKey}
          onRemind={(row) => { setRemindingKey(`${row.sectionId}|${row.subjectId}`); remind.mutate(row); }}
        />
      )}
    </div>
  );
}