import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Lock, LockOpen, ClipboardList, Settings2, Copy, Pencil, Trash2 } from 'lucide-react';
import {
  getSessions, getClasses, getSubjects,
  getExamTypes, createExamType, addExamSubject, updateExamSubject, forceUnlockExamType, copyExamConfig,
  updateExamType, deleteExamType,
} from '../../api/schooladmin.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';

const examTypeSchema = z.object({
  name: z.string().min(1, 'Exam name required'),
  sortOrder: z.coerce.number().int().default(0),
  weightagePercent: z.union([z.coerce.number().min(0).max(100), z.literal('')]).optional(),
});

const examSubjectSchema = z.object({
  subjectId: z.string().min(1, 'Select a subject'),
  maxMarks: z.coerce.number().positive('Must be greater than 0'),
  passingMarks: z.coerce.number().nonnegative('Cannot be negative'),
});

const unlockSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters'),
});

export default function AdminExamTypes() {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = useState('');
  const [classId, setClassId]     = useState('');
  const [showCreate, setShowCreate]       = useState(false);
  const [showCopy, setShowCopy]           = useState(false);
  const [manageExamId, setManageExamId]   = useState(null);
  const [unlockTarget, setUnlockTarget]   = useState(null);
  const [editTarget, setEditTarget]       = useState(null);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [editingSubjectId, setEditingSubjectId] = useState(null);

  const { data: sessions } = useQuery({
    queryKey: ['ad-sessions'],
    queryFn: () => getSessions().then((r) => r.data.data),
  });

  useEffect(() => {
    if (!sessionId && sessions?.length) {
      const active = sessions.find((s) => s.isActive) || sessions[0];
      setSessionId(active.id);
    }
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: allClasses } = useQuery({
    queryKey: ['ad-classes'],
    queryFn: () => getClasses().then((r) => r.data.data),
  });

  const classesForSession = (allClasses || []).filter((c) => c.sessionId === sessionId);

  useEffect(() => { setClassId(''); }, [sessionId]);

  const { data: examTypes, isLoading: loadingExamTypes } = useQuery({
    queryKey: ['ad-exam-types', sessionId, classId],
    queryFn: () => getExamTypes({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  const { data: subjects } = useQuery({
    queryKey: ['ad-subjects', sessionId, classId],
    queryFn: () => getSubjects({ sessionId, classId }).then((r) => r.data.data),
    enabled: !!(sessionId && classId),
  });

  const manageExam = (examTypes || []).find((e) => e.id === manageExamId);

  // Subjects not yet added to the exam being managed
  const availableSubjects = (subjects || []).filter(
    (s) => !(manageExam?.examSubjects || []).some((es) => es.subjectId === s.id)
  );

  const {
    register: registerExam, handleSubmit: handleExamSubmit,
    reset: resetExam, formState: { errors: examErrors },
  } = useForm({ resolver: zodResolver(examTypeSchema), defaultValues: { sortOrder: 0 } });

  const {
    register: registerSubj, handleSubmit: handleSubjSubmit,
    reset: resetSubj, formState: { errors: subjErrors },
  } = useForm({ resolver: zodResolver(examSubjectSchema) });

  const {
    register: registerUnlock, handleSubmit: handleUnlockSubmit,
    reset: resetUnlock, formState: { errors: unlockErrors },
  } = useForm({ resolver: zodResolver(unlockSchema) });

  const {
    register: registerEditExam, handleSubmit: handleEditExamSubmit,
    reset: resetEditExam, formState: { errors: editExamErrors },
  } = useForm({ resolver: zodResolver(examTypeSchema) });

  useEffect(() => {
    if (editTarget) {
      resetEditExam({
        name: editTarget.name,
        sortOrder: editTarget.sortOrder,
        weightagePercent: editTarget.weightagePercent != null ? Number(editTarget.weightagePercent) : '',
      });
    }
  }, [editTarget]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { resetSubj(); setEditingSubjectId(null); }, [manageExamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const createExamMutation = useMutation({
    mutationFn: (data) => createExamType({
      sessionId,
      classId,
      name: data.name,
      sortOrder: data.sortOrder,
      ...(data.weightagePercent !== '' && data.weightagePercent != null ? { weightagePercent: data.weightagePercent } : {}),
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-exam-types', sessionId, classId] });
      setShowCreate(false);
      resetExam({ sortOrder: 0 });
    },
  });

  const addSubjectMutation = useMutation({
    mutationFn: (data) => addExamSubject({ examTypeId: manageExamId, ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-exam-types', sessionId, classId] });
      resetSubj();
    },
  });

  const updateSubjectMutation = useMutation({
    mutationFn: ({ id, data }) => updateExamSubject(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-exam-types', sessionId, classId] });
      setEditingSubjectId(null);
    },
  });

  const unlockMutation = useMutation({
    mutationFn: ({ id, reason }) => forceUnlockExamType(id, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-exam-types', sessionId, classId] });
      setUnlockTarget(null);
      resetUnlock();
    },
  });

  const updateExamMutation = useMutation({
    mutationFn: ({ id, data }) => updateExamType(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-exam-types', sessionId, classId] });
      setEditTarget(null);
    },
  });

  const deleteExamMutation = useMutation({
    mutationFn: (id) => deleteExamType(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-exam-types', sessionId, classId] });
      setDeleteTarget(null);
    },
  });

  const examColumns = [
    { key: 'name', label: 'Exam Type', render: (r) => (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[#f0f4ff] flex items-center justify-center shrink-0">
          <ClipboardList size={16} className="text-[#1e293b]" />
        </div>
        <p className="font-semibold text-[#1e293b]">{r.name}</p>
      </div>
    )},
    { key: 'weightage', label: 'Weightage', render: (r) => (r.weightagePercent != null ? `${r.weightagePercent}%` : '—') },
    { key: 'subjects', label: 'Subjects', render: (r) => <Badge label={`${r.examSubjects?.length || 0} subjects`} variant="navy" /> },
    { key: 'status', label: 'Status', render: (r) => (
      r.isLocked
        ? <Badge label="Locked" variant="warning" />
        : <Badge label="Open" variant="success" />
    )},
    { key: 'actions', label: 'Actions', render: (r) => (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" icon={Settings2} onClick={() => setManageExamId(r.id)}>Manage</Button>
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setEditTarget(r)}>Edit</Button>
        <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleteTarget(r)}>Delete</Button>
        {r.isLocked && (
          <Button size="sm" variant="ghost" icon={LockOpen} onClick={() => setUnlockTarget(r)}>Force Unlock</Button>
        )}
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Exams & Marks Configuration</h1>
          <p className="text-sm text-[#64748b] mt-1">Exam types and per-subject max/passing marks, defined independently for every class</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" icon={Copy} disabled={!(sessionId && classId)} onClick={() => setShowCopy(true)}>Copy From Class</Button>
          <Button icon={Plus} disabled={!(sessionId && classId)} onClick={() => setShowCreate(true)}>New Exam Type</Button>
        </div>
      </div>

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#374151]">Session</label>
            <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}
              className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
              <option value="">Select session</option>
              {(sessions || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#374151]">Class</label>
            <select value={classId} disabled={!sessionId} onChange={(e) => setClassId(e.target.value)}
              className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9]">
              <option value="">Select class</option>
              {classesForSession.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </Card>

      {!(sessionId && classId) ? (
        <Card className="bg-[#f8fafc]">
          <p className="text-sm text-[#64748b] text-center py-6">Select a session and class to view or configure exam types.</p>
        </Card>
      ) : (
        <Table columns={examColumns} data={examTypes || []} loading={loadingExamTypes} emptyMessage="No exam types yet for this class. Nothing carries over automatically between classes." />
      )}

      {/* Create Exam Type Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); resetExam({ sortOrder: 0 }); }} title="New Exam Type" size="sm">
        <form onSubmit={handleExamSubmit((d) => createExamMutation.mutate(d))} className="space-y-4">
          <Input label="Exam Name" name="name" register={registerExam} error={examErrors.name} required placeholder="e.g. Mid 1" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Sort Order" name="sortOrder" type="number" register={registerExam} error={examErrors.sortOrder} placeholder="0" />
            <Input label="Weightage %" name="weightagePercent" type="number" register={registerExam} error={examErrors.weightagePercent} placeholder="Optional" />
          </div>
          <p className="text-xs text-[#94a3b8] -mt-2">Weightage is used only if you compute a final weighted result across exam types. Leave blank to skip.</p>

          {createExamMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {createExamMutation.error?.response?.data?.message || 'Failed to create exam type.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowCreate(false); resetExam({ sortOrder: 0 }); }}>Cancel</Button>
            <Button type="submit" loading={createExamMutation.isPending}>Create Exam Type</Button>
          </div>
        </form>
      </Modal>

      {/* Manage Exam Type: subjects, max/passing marks */}
      <Modal open={!!manageExam} onClose={() => setManageExamId(null)} title={`Manage: ${manageExam?.name || ''}`} size="lg">
        {manageExam && (
          <div className="space-y-5">
            {manageExam.isLocked && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-amber-800">
                <Lock size={16} />
                This exam is locked because marks entry has begun. Use Force Unlock from the list to make structural changes.
              </div>
            )}

            <div className="divide-y divide-[#f1f5f9] border border-[#e2e8f0] rounded-xl overflow-hidden">
              {(manageExam.examSubjects || []).length === 0 ? (
                <p className="text-center text-sm text-[#94a3b8] py-8">No subjects added to this exam yet.</p>
              ) : manageExam.examSubjects.map((es) => (
                <ExamSubjectRow
                  key={es.id}
                  examSubject={es}
                  isEditing={editingSubjectId === es.id}
                  onStartEdit={() => setEditingSubjectId(es.id)}
                  onCancelEdit={() => setEditingSubjectId(null)}
                  onSave={(data) => updateSubjectMutation.mutate({ id: es.id, data })}
                  saving={updateSubjectMutation.isPending}
                  saveError={updateSubjectMutation.isError ? (updateSubjectMutation.error?.response?.data?.message || 'Update failed.') : null}
                />
              ))}
            </div>

            {availableSubjects.length > 0 ? (
              <form onSubmit={handleSubjSubmit((d) => addSubjectMutation.mutate(d))} className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-sm font-medium text-[#374151]">Subject</label>
                  <select {...registerSubj('subjectId')} className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
                    <option value="">Select subject</option>
                    {availableSubjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                  {subjErrors.subjectId && <p className="text-xs text-red-500">{subjErrors.subjectId.message}</p>}
                </div>
                <Input label="Max Marks" name="maxMarks" type="number" register={registerSubj} error={subjErrors.maxMarks} className="w-28" placeholder="25" />
                <Input label="Passing Marks" name="passingMarks" type="number" register={registerSubj} error={subjErrors.passingMarks} className="w-32" placeholder="8" />
                <Button type="submit" icon={Plus} loading={addSubjectMutation.isPending}>Add</Button>
              </form>
            ) : (
              <p className="text-xs text-[#94a3b8]">All subjects for this class have been added to this exam.</p>
            )}

            {addSubjectMutation.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                {addSubjectMutation.error?.response?.data?.message || 'Failed to add subject.'}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Force Unlock Modal */}
      <Modal open={!!unlockTarget} onClose={() => { setUnlockTarget(null); resetUnlock(); }} title={`Force Unlock: ${unlockTarget?.name || ''}`} size="sm">
        <form onSubmit={handleUnlockSubmit((d) => unlockMutation.mutate({ id: unlockTarget.id, reason: d.reason }))} className="space-y-4">
          <p className="text-sm text-[#64748b]">
            This exam's structure is locked because marks entry has already begun. Force-unlocking allows structural changes again and is permanently logged in the audit trail.
          </p>
          <Input label="Reason" name="reason" register={registerUnlock} error={unlockErrors.reason} required placeholder="e.g. Wrong max marks entered for Science" />

          {unlockMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {unlockMutation.error?.response?.data?.message || 'Failed to unlock.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setUnlockTarget(null); resetUnlock(); }}>Cancel</Button>
            <Button type="submit" variant="danger" icon={LockOpen} loading={unlockMutation.isPending}>Confirm Unlock</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Exam Type Modal */}
      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title={`Edit: ${editTarget?.name || ''}`} size="sm">
        <form
          onSubmit={handleEditExamSubmit((d) => updateExamMutation.mutate({
            id: editTarget.id,
            data: {
              name: d.name,
              sortOrder: d.sortOrder,
              weightagePercent: d.weightagePercent === '' || d.weightagePercent == null ? null : d.weightagePercent,
            },
          }))}
          className="space-y-4"
        >
          <Input label="Exam Name" name="name" register={registerEditExam} error={editExamErrors.name} required placeholder="e.g. Mid 1" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Sort Order" name="sortOrder" type="number" register={registerEditExam} error={editExamErrors.sortOrder} placeholder="0" />
            <Input label="Weightage %" name="weightagePercent" type="number" register={registerEditExam} error={editExamErrors.weightagePercent} placeholder="Optional" />
          </div>
          <p className="text-xs text-[#94a3b8] -mt-2">This only updates the exam type's name, order, and weightage — subjects and their marks stay as configured.</p>

          {updateExamMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {updateExamMutation.error?.response?.data?.message || 'Failed to update exam type.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setEditTarget(null)}>Cancel</Button>
            <Button type="submit" loading={updateExamMutation.isPending}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Exam Type Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={`Delete: ${deleteTarget?.name || ''}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#64748b]">
            This permanently deletes <span className="font-semibold text-[#1e293b]">{deleteTarget?.name}</span> along with all {deleteTarget?.examSubjects?.length || 0} subject(s) configured under it. This cannot be undone.
          </p>

          {deleteExamMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {deleteExamMutation.error?.response?.data?.message || 'Failed to delete exam type.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" icon={Trash2} loading={deleteExamMutation.isPending} onClick={() => deleteExamMutation.mutate(deleteTarget.id)}>
              Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Copy exam config from another class */}
      <CopyExamConfigModal
        open={showCopy}
        onClose={() => setShowCopy(false)}
        sessions={sessions}
        allClasses={allClasses}
        targetSessionId={sessionId}
        targetClassId={classId}
        targetSessionLabel={(sessions || []).find((s) => s.id === sessionId)?.label || ''}
        targetClassName={classesForSession.find((c) => c.id === classId)?.name || ''}
        onCopied={() => qc.invalidateQueries({ queryKey: ['ad-exam-types', sessionId, classId] })}
      />
    </div>
  );
}

function CopyExamConfigModal({
  open, onClose, sessions, allClasses,
  targetSessionId, targetClassId, targetSessionLabel, targetClassName, onCopied,
}) {
  const [sourceSessionId, setSourceSessionId] = useState('');
  const [sourceClassId, setSourceClassId]     = useState('');

  useEffect(() => {
    if (open) {
      setSourceSessionId(targetSessionId);
      setSourceClassId('');
    }
  }, [open, targetSessionId]);

  const sourceClasses = (allClasses || []).filter(
    (c) => c.sessionId === sourceSessionId && !(c.id === targetClassId && sourceSessionId === targetSessionId)
  );

  const copyMutation = useMutation({
    mutationFn: () => copyExamConfig({ sourceSessionId, sourceClassId, targetSessionId, targetClassId }),
    onSuccess: (res) => {
      onCopied(res.data.data);
      // Keep the modal open only if some subjects were skipped, so the warning is visible.
      if (!res.data.data?.skippedSubjects?.length) onClose();
    },
  });

  const handleClose = () => { copyMutation.reset(); onClose(); };

  return (
    <Modal open={open} onClose={handleClose} title="Copy Exam Configuration" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-[#64748b]">
          Copies all exam types, weightage, and per-subject max/passing marks into{' '}
          <span className="font-semibold text-[#1e293b]">{targetClassName}</span>
          {targetSessionLabel ? ` (${targetSessionLabel})` : ''}. Subjects are matched by name — anything not present in the target class is skipped.
        </p>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[#374151]">Copy From Session</label>
          <select value={sourceSessionId} onChange={(e) => { setSourceSessionId(e.target.value); setSourceClassId(''); }}
            className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
            {(sessions || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium text-[#374151]">Copy From Class</label>
          <select value={sourceClassId} onChange={(e) => setSourceClassId(e.target.value)}
            className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
            <option value="">Select class</option>
            {sourceClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        {copyMutation.isError && (
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
            {copyMutation.error?.response?.data?.message || 'Failed to copy exam configuration.'}
          </div>
        )}

        {copyMutation.isSuccess && copyMutation.data?.data?.data?.skippedSubjects?.length > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
            Copied, but these subjects don't exist in the target class so their marks were skipped:{' '}
            {copyMutation.data.data.data.skippedSubjects.join(', ')}
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <Button variant="ghost" onClick={handleClose}>Cancel</Button>
          <Button disabled={!sourceClassId} loading={copyMutation.isPending} onClick={() => copyMutation.mutate()}>
            Copy Configuration
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function ExamSubjectRow({ examSubject, isEditing, onStartEdit, onCancelEdit, onSave, saving, saveError }) {
  const [maxMarks, setMaxMarks] = useState(examSubject.maxMarks);
  const [passingMarks, setPassingMarks] = useState(examSubject.passingMarks);

  useEffect(() => {
    setMaxMarks(examSubject.maxMarks);
    setPassingMarks(examSubject.passingMarks);
  }, [examSubject.maxMarks, examSubject.passingMarks]);

  if (isEditing) {
    return (
      <div className="flex flex-col gap-2 px-4 py-3 bg-[#fffbeb]">
        <div className="flex items-center gap-3">
          <p className="text-sm font-semibold text-[#1e293b] flex-1">{examSubject.subject?.name}</p>
          <input type="number" value={maxMarks} onChange={(e) => setMaxMarks(e.target.value)}
            className="w-24 text-sm border border-[#e2e8f0] rounded-lg px-2 py-1.5" placeholder="Max" />
          <input type="number" value={passingMarks} onChange={(e) => setPassingMarks(e.target.value)}
            className="w-24 text-sm border border-[#e2e8f0] rounded-lg px-2 py-1.5" placeholder="Passing" />
          <Button size="sm" loading={saving} onClick={() => onSave({ maxMarks: Number(maxMarks), passingMarks: Number(passingMarks) })}>Save</Button>
          <Button size="sm" variant="ghost" onClick={onCancelEdit}>Cancel</Button>
        </div>
        {saveError && <p className="text-xs text-red-500">{saveError}</p>}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-white">
      <p className="text-sm font-semibold text-[#1e293b]">{examSubject.subject?.name}</p>
      <div className="flex items-center gap-4">
        <span className="text-xs text-[#64748b]">Max: <span className="font-semibold text-[#1e293b]">{examSubject.maxMarks}</span></span>
        <span className="text-xs text-[#64748b]">Pass: <span className="font-semibold text-[#1e293b]">{examSubject.passingMarks}</span></span>
        <button onClick={onStartEdit} className="p-1.5 rounded-lg text-[#94a3b8] hover:bg-[#f1f5f9] hover:text-[#1e293b] transition-colors">
          <Settings2 size={16} />
        </button>
      </div>
    </div>
  );
}