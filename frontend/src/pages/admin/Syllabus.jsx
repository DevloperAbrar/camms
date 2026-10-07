import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSyllabusStructure } from '../../api/schooladmin.api';
import Spinner from '../../components/ui/Spinner';
import Card from '../../components/ui/Card';
import { errMsg } from '../../components/calendar/calendarUtils';
import { Notice, Select, TabBar } from '../../components/syllabus/SyllabusUI';
import AdminMonitorTab from '../../components/syllabus/AdminMonitorTab';
import AdminReadinessTab from '../../components/syllabus/AdminReadinessTab';
import AdminSetupTab from '../../components/syllabus/AdminSetupTab';
import AdminExamScopeTab from '../../components/syllabus/AdminExamScopeTab';

const TABS = [
  { value: 'monitor',   label: 'Monitor' },
  { value: 'readiness', label: 'Exam readiness' },
  { value: 'setup',     label: 'Chapters & setup' },
  { value: 'scope',     label: 'Exam syllabus' },
];

export default function AdminSyllabus() {
  const [tab, setTab] = useState('monitor');
  const [sessionId, setSessionId] = useState('');

  const { data: structure, isLoading, isError, error } = useQuery({
    queryKey: ['syl-structure', sessionId],
    queryFn: () => getSyllabusStructure(sessionId ? { sessionId } : {}).then((r) => r.data.data),
    placeholderData: (prev) => prev,
  });

  const activeSessionId = sessionId || structure?.session?.id || '';

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Syllabus Tracker</h1>
          <p className="text-sm text-[#64748b] mt-1">Section-wise syllabus coverage, planned vs actual, and exam readiness.</p>
        </div>
        {structure?.sessions?.length > 1 && (
          <Select value={activeSessionId} onChange={setSessionId} className="min-w-[170px]">
            {structure.sessions.map((s) => <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' (Active)' : ''}</option>)}
          </Select>
        )}
      </div>

      <TabBar tabs={TABS} value={tab} onChange={setTab} />

      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner /></div>
      ) : isError ? (
        <Notice notice={{ type: 'error', text: errMsg(error, 'Could not load the syllabus tracker.') }} />
      ) : !structure?.session ? (
        <Card><p className="text-sm text-[#94a3b8] text-center py-10">Create an academic session first.</p></Card>
      ) : (
        <>
          {tab === 'monitor' && <AdminMonitorTab sessionId={activeSessionId} structure={structure} goTo={setTab} />}
          {tab === 'readiness' && <AdminReadinessTab sessionId={activeSessionId} structure={structure} />}
          {tab === 'setup' && <AdminSetupTab sessionId={activeSessionId} structure={structure} />}
          {tab === 'scope' && <AdminExamScopeTab structure={structure} />}
        </>
      )}
    </div>
  );
}