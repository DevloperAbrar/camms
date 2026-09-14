import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Lock, Unlock, AlertTriangle, CheckCircle, ChevronDown, ChevronUp, Shield, Layers, Globe } from 'lucide-react';
import {
  getSessions, getClasses, getSubjects, getExamTypes,
  getMarksLockOverview, setMarksLockStatus, bulkLockByClass, bulkLockBySession,
} from '../../api/schooladmin.api';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import Badge from '../../components/ui/Badge';

const STATUS_CONFIG = {
  locked:   { label: 'Locked',   variant: 'danger',  icon: Lock,          cls: 'text-red-600'   },
  unlocked: { label: 'Unlocked', variant: 'success',  icon: Unlock,        cls: 'text-green-600' },
  partial:  { label: 'Partial',  variant: 'warning',  icon: Shield,        cls: 'text-amber-600' },
  no_marks: { label: 'No Marks', variant: 'default',  icon: AlertTriangle, cls: 'text-[#94a3b8]' },
};

// Reusable confirm modal for single, class-bulk, and session-bulk actions
function ConfirmModal({ action, scope, label, onConfirm, onCancel, loading }) {
  const [reason, setReason] = useState('');
  const isUnlock = action === 'unlock';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md">
        <div className={`p-5 rounded-t-2xl ${isUnlock ? 'bg-amber-50 border-b border-amber-100' : 'bg-red-50 border-b border-red-100'}`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isUnlock ? 'bg-amber-100' : 'bg-red-100'}`}>
              {isUnlock ? <Unlock size={18} className="text-amber-600" /> : <Lock size={18} className="text-red-600" />}
            </div>
            <div>
              <p className="font-bold text-[#1e293b]">{isUnlock ? 'Unlock' : 'Lock'} Marks</p>
              <p className="text-xs text-[#64748b]">{label}</p>
            </div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {scope === 'session' && (
            <div className="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2.5">
              <AlertTriangle size={15} className="text-orange-500 shrink-0 mt-0.5" />
              <p className="text-xs text-orange-700 font-medium">This will affect ALL classes and ALL exam subjects in the selected session.</p>
            </div>
          )}
          {scope === 'class' && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5">
              <AlertTriangle size={15} className="text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 font-medium">This will affect ALL exam subjects for every student in the selected class.</p>
            </div>
          )}

          <p className="text-sm text-[#64748b]">
            {isUnlock
              ? 'Faculty will be able to edit and re-save marks. Marks will NOT auto-lock — admin must lock again manually after corrections.'
              : 'Faculty will no longer be able to edit marks until an admin unlocks them.'}
          </p>

          {isUnlock && (
            <div>
              <label className="block text-sm font-semibold text-[#1e293b] mb-1.5">
                Reason for unlocking <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Faculty reported data entry error in Periodic Test 1"
                rows={3}
                className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm text-[#1e293b] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#f97316] resize-none"
              />
              {reason.length > 0 && reason.length < 5 && (
                <p className="text-xs text-red-500 mt-1">Reason must be at least 5 characters</p>
              )}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-[#e2e8f0] text-sm font-semibold text-[#64748b] hover:bg-[#f8fafc] transition-colors">
              Cancel
            </button>
            <button
              onClick={() => onConfirm(reason)}
              disabled={loading || (isUnlock && reason.length < 5)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed
                ${isUnlock ? 'bg-amber-500 hover:bg-amber-600' : 'bg-red-500 hover:bg-red-600'}`}
            >
              {loading ? 'Processing...' : isUnlock ? 'Yes, Unlock' : 'Yes, Lock'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExamSubjectRow({ item, onAction }) {
  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.no_marks;
  const StatusIcon = cfg.icon;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 py-4 border-b border-[#f1f5f9] last:border-0">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          item.status === 'locked' ? 'bg-red-50' : item.status === 'unlocked' ? 'bg-green-50' :
          item.status === 'partial' ? 'bg-amber-50' : 'bg-[#f1f5f9]'
        }`}>
          <StatusIcon size={15} className={cfg.cls} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-[#1e293b] text-sm truncate">{item.subject?.name}</p>
          <p className="text-xs text-[#64748b]">Max: {item.maxMarks} · Pass: {item.passingMarks} · {item.totalMarksEntered} students entered</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-center hidden sm:block">
          <p className="text-xs text-[#94a3b8]">Locked</p>
          <p className="text-sm font-bold text-red-600">{item.lockedCount}</p>
        </div>
        <div className="text-center hidden sm:block">
          <p className="text-xs text-[#94a3b8]">Unlocked</p>
          <p className="text-sm font-bold text-green-600">{item.unlockedCount}</p>
        </div>
        <Badge label={cfg.label} variant={cfg.variant} />

        {item.status !== 'no_marks' && (
          <div className="flex gap-2">
            {item.status !== 'locked' && (
              <button onClick={() => onAction('lock', 'single', item)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors">
                <Lock size={12} /> Lock
              </button>
            )}
            {item.status !== 'unlocked' && (
              <button onClick={() => onAction('unlock', 'single', item)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-600 text-xs font-semibold hover:bg-green-100 transition-colors">
                <Unlock size={12} /> Unlock
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ExamTypeGroup({ examTypeName, items, onAction }) {
  const [open, setOpen] = useState(true);
  const lockedAll   = items.every((i) => i.status === 'locked');
  const unlockedAll = items.every((i) => i.status === 'unlocked' || i.status === 'no_marks');

  return (
    <Card padding={false} className="overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 sm:px-5 py-4 hover:bg-[#f8fafc] transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center shrink-0">
            <Shield size={16} className="text-[#f97316]" />
          </div>
          <div className="text-left">
            <p className="font-bold text-[#1e293b]">{examTypeName}</p>
            <p className="text-xs text-[#64748b]">{items.length} subject(s)</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lockedAll   && <span className="text-xs font-semibold text-red-600   bg-red-50   px-2 py-1 rounded-full">All Locked</span>}
          {unlockedAll && <span className="text-xs font-semibold text-green-600 bg-green-50 px-2 py-1 rounded-full">All Unlocked</span>}
          {open ? <ChevronUp size={16} className="text-[#94a3b8]" /> : <ChevronDown size={16} className="text-[#94a3b8]" />}
        </div>
      </button>

      {open && (
        <div className="border-t border-[#e2e8f0] px-4 sm:px-5">
          {items.map((item) => (
            <ExamSubjectRow key={item.examSubjectId} item={item} onAction={onAction} />
          ))}
        </div>
      )}
    </Card>
  );
}

export default function MarksLock() {
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState({ sessionId: '', classId: '', subjectId: '', examTypeId: '' });
  const [modal, setModal]     = useState(null); // { action, scope, item?, label }
  const [toast, setToast]     = useState(null);

  const showToast = (type, msg) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 3500);
  };

  const { data: sessions  = [] } = useQuery({ queryKey: ['sessions'],  queryFn: () => getSessions().then((r) => r.data.data ?? []) });
  const { data: classes   = [] } = useQuery({ queryKey: ['classes'],   queryFn: () => getClasses().then((r) => r.data.data ?? []) });
  const { data: subjects  = [] } = useQuery({ queryKey: ['subjects', filters.classId],  queryFn: () => getSubjects({ classId: filters.classId || undefined }).then((r) => r.data.data ?? []) });
  const { data: examTypes = [] } = useQuery({ queryKey: ['exam-types', filters.sessionId, filters.classId], queryFn: () => getExamTypes({ sessionId: filters.sessionId || undefined, classId: filters.classId || undefined }).then((r) => r.data.data ?? []) });

  const activeSession = sessions.find((s) => s.isActive);

  const { data: overview = [], isLoading, isError, refetch } = useQuery({
    queryKey: ['marks-lock-overview', filters],
    queryFn: () => getMarksLockOverview({
      sessionId: filters.sessionId || activeSession?.id || undefined,
      classId:   filters.classId   || undefined,
      subjectId: filters.subjectId || undefined,
      examTypeId: filters.examTypeId || undefined,
    }).then((r) => r.data.data ?? []),
  });

  // Single exam-subject lock/unlock
  const singleMutation = useMutation({
    mutationFn: ({ examSubjectId, locked, reason }) => setMarksLockStatus(examSubjectId, { locked, reason }),
    onSuccess: (_, vars) => { queryClient.invalidateQueries({ queryKey: ['marks-lock-overview'] }); setModal(null); showToast('success', `Marks ${vars.locked ? 'locked' : 'unlocked'} successfully`); },
    onError: (err) => { showToast('error', err?.response?.data?.message || 'Something went wrong'); },
  });

  // Class-level bulk
  const classMutation = useMutation({
    mutationFn: (data) => bulkLockByClass(data),
    onSuccess: (_, vars) => { queryClient.invalidateQueries({ queryKey: ['marks-lock-overview'] }); setModal(null); showToast('success', `All marks in class ${vars.locked ? 'locked' : 'unlocked'}`); },
    onError: (err) => { showToast('error', err?.response?.data?.message || 'Something went wrong'); },
  });

  // Session-level bulk
  const sessionMutation = useMutation({
    mutationFn: (data) => bulkLockBySession(data),
    onSuccess: (_, vars) => { queryClient.invalidateQueries({ queryKey: ['marks-lock-overview'] }); setModal(null); showToast('success', `All marks in session ${vars.locked ? 'locked' : 'unlocked'}`); },
    onError: (err) => { showToast('error', err?.response?.data?.message || 'Something went wrong'); },
  });

  const anyLoading = singleMutation.isPending || classMutation.isPending || sessionMutation.isPending;

  function handleAction(action, scope, item) {
    const sessionLabel = sessions.find((s) => s.id === (filters.sessionId || activeSession?.id))?.label || 'Current session';
    const classLabel   = classes.find((c) => c.id === filters.classId)?.name || 'Selected class';
    setModal({
      action, scope, item,
      label: scope === 'session' ? `All classes · ${sessionLabel}`
           : scope === 'class'   ? `All exams · ${classLabel}`
           : `${item.examType?.name} · ${item.subject?.name}`,
    });
  }

  function handleConfirm(reason) {
    const { action, scope, item } = modal;
    const locked = action === 'lock';
    const sessionId = filters.sessionId || activeSession?.id;

    if (scope === 'single') {
      singleMutation.mutate({ examSubjectId: item.examSubjectId, locked, reason });
    } else if (scope === 'class') {
      classMutation.mutate({ locked, reason, classId: filters.classId, sessionId });
    } else if (scope === 'session') {
      sessionMutation.mutate({ locked, reason, sessionId });
    }
  }

  const grouped = overview.reduce((acc, item) => {
    const key = item.examType?.name || 'Unknown';
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  const totalLocked   = overview.filter((i) => i.status === 'locked').length;
  const totalUnlocked = overview.filter((i) => i.status === 'unlocked').length;
  const totalPartial  = overview.filter((i) => i.status === 'partial').length;
  const selectedSessionId = filters.sessionId || activeSession?.id;
  const selectedSession   = sessions.find((s) => s.id === selectedSessionId);
  const selectedClass     = classes.find((c) => c.id === filters.classId);

  return (
    <div className="space-y-5 sm:space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-extrabold text-[#1e293b]">Marks Lock / Unlock</h1>
        <p className="text-sm text-[#64748b] mt-1">Control which exam results faculty can edit. Marks do NOT auto-lock on save — lock manually when corrections are done.</p>
      </div>

      {/* Filters */}
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Session', key: 'sessionId', options: sessions, getLabel: (s) => `${s.label}${s.isActive ? ' ✓' : ''}`, placeholder: `All Sessions${activeSession ? ` (Active: ${activeSession.label})` : ''}` },
            { label: 'Class',   key: 'classId',   options: classes,  getLabel: (c) => c.name, placeholder: 'All Classes', onChangeClear: ['subjectId', 'examTypeId'] },
            { label: 'Subject', key: 'subjectId', options: subjects, getLabel: (s) => s.name, placeholder: 'All Subjects' },
            { label: 'Exam Type', key: 'examTypeId', options: examTypes, getLabel: (e) => e.name, placeholder: 'All Exam Types' },
          ].map(({ label, key, options, getLabel, placeholder, onChangeClear }) => (
            <div key={key}>
              <label className="block text-xs font-semibold text-[#64748b] mb-1.5 uppercase">{label}</label>
              <select
                value={filters[key]}
                onChange={(e) => {
                  const update = { [key]: e.target.value };
                  if (onChangeClear) onChangeClear.forEach((k) => { update[k] = ''; });
                  setFilters((f) => ({ ...f, ...update }));
                }}
                className="w-full border border-[#e2e8f0] rounded-xl px-3 py-2.5 text-sm text-[#1e293b] focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white"
              >
                <option value="">{placeholder}</option>
                {options.map((o) => <option key={o.id} value={o.id}>{getLabel(o)}</option>)}
              </select>
            </div>
          ))}
        </div>
      </Card>

      {/* Bulk Action Buttons */}
      <Card>
        <p className="text-xs font-semibold text-[#64748b] uppercase mb-3">Bulk Actions</p>
        <div className="flex flex-wrap gap-3">
          {/* Session-level */}
          <div className="flex gap-2 items-center">
            <Globe size={14} className="text-[#94a3b8]" />
            <span className="text-xs text-[#64748b] font-medium">{selectedSession?.label || 'Active session'}:</span>
            <button
              onClick={() => handleAction('lock', 'session', null)}
              disabled={!selectedSessionId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Lock size={12} /> Lock All
            </button>
            <button
              onClick={() => handleAction('unlock', 'session', null)}
              disabled={!selectedSessionId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-600 text-xs font-semibold hover:bg-green-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Unlock size={12} /> Unlock All
            </button>
          </div>

          <div className="w-px bg-[#e2e8f0] hidden sm:block" />

          {/* Class-level */}
          <div className="flex gap-2 items-center">
            <Layers size={14} className="text-[#94a3b8]" />
            <span className="text-xs text-[#64748b] font-medium">{selectedClass?.name || 'Select a class'}:</span>
            <button
              onClick={() => handleAction('lock', 'class', null)}
              disabled={!filters.classId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-semibold hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Lock size={12} /> Lock Class
            </button>
            <button
              onClick={() => handleAction('unlock', 'class', null)}
              disabled={!filters.classId}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 text-green-600 text-xs font-semibold hover:bg-green-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Unlock size={12} /> Unlock Class
            </button>
          </div>
        </div>
        {!filters.classId && (
          <p className="text-xs text-[#94a3b8] mt-2">Select a class above to enable class-level bulk actions.</p>
        )}
      </Card>

      {/* Summary Stats */}
      {overview.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <Card><div className="text-center"><p className="text-2xl sm:text-3xl font-extrabold text-red-600">{totalLocked}</p><p className="text-xs text-[#64748b] mt-1">Locked</p></div></Card>
          <Card><div className="text-center"><p className="text-2xl sm:text-3xl font-extrabold text-green-600">{totalUnlocked}</p><p className="text-xs text-[#64748b] mt-1">Unlocked</p></div></Card>
          <Card><div className="text-center"><p className="text-2xl sm:text-3xl font-extrabold text-amber-600">{totalPartial}</p><p className="text-xs text-[#64748b] mt-1">Partial</p></div></Card>
        </div>
      )}

      {/* Overview list */}
      {isLoading ? (
        <div className="flex justify-center py-20"><Spinner size="lg" /></div>
      ) : isError ? (
        <Card>
          <div className="text-center py-10">
            <AlertTriangle size={36} className="text-red-300 mx-auto mb-2" />
            <p className="text-sm text-red-500">Failed to load. Please try again.</p>
            <button onClick={refetch} className="mt-3 text-sm text-[#f97316] font-semibold hover:underline">Retry</button>
          </div>
        </Card>
      ) : overview.length === 0 ? (
        <Card>
          <div className="text-center py-14">
            <Shield size={40} className="text-[#e2e8f0] mx-auto mb-3" />
            <p className="font-semibold text-[#1e293b]">No exam subjects found</p>
            <p className="text-sm text-[#94a3b8] mt-1">Adjust the filters above or set up exam types first.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([examTypeName, items]) => (
            <ExamTypeGroup key={examTypeName} examTypeName={examTypeName} items={items} onAction={handleAction} />
          ))}
        </div>
      )}

      {/* Confirm Modal */}
      {modal && (
        <ConfirmModal
          action={modal.action}
          scope={modal.scope}
          label={modal.label}
          onConfirm={handleConfirm}
          onCancel={() => setModal(null)}
          loading={anyLoading}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <AlertTriangle size={16} />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}