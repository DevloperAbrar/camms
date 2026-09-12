import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, Copy, Settings2 } from 'lucide-react';
import {
  getSessions, getClasses, createClass, deleteClass,
  createSection, updateSection, deleteSection,
  getSubjects, createSubject, deleteSubject, copySubjects,
  getFaculty,
} from '../../api/schooladmin.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';
import Spinner from '../../components/ui/Spinner';

const classSchema = z.object({
  name: z.string().min(1, 'Class name required'),
  sortOrder: z.coerce.number().int().default(0),
});

const sectionSchema = z.object({
  name: z.string().min(1, 'Section name required'),
  classTeacherId: z.string().optional(),
});

const subjectSchema = z.object({
  name: z.string().min(1, 'Subject name required'),
  code: z.string().optional(),
});

export default function AdminClasses() {
  const qc = useQueryClient();
  const [sessionId, setSessionId]         = useState('');
  const [showCreate, setShowCreate]       = useState(false);
  const [deleteTarget, setDeleteTarget]   = useState(null);
  const [manageClassId, setManageClassId] = useState(null);
  const [manageTab, setManageTab]         = useState('sections');
  const [copyForm, setCopyForm]           = useState({ fromSessionId: '', fromClassId: '' });

  const { data: sessions, isLoading: loadingSessions } = useQuery({
    queryKey: ['ad-sessions'],
    queryFn: () => getSessions().then((r) => r.data.data),
  });

  useEffect(() => {
    if (!sessionId && sessions?.length) {
      const active = sessions.find((s) => s.isActive) || sessions[0];
      setSessionId(active.id);
    }
  }, [sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: allClasses, isLoading: loadingClasses } = useQuery({
    queryKey: ['ad-classes'],
    queryFn: () => getClasses().then((r) => r.data.data),
  });

  const { data: faculty } = useQuery({
    queryKey: ['ad-faculty'],
    queryFn: () => getFaculty().then((r) => r.data.data),
  });

  const classes = (allClasses || [])
    .filter((c) => c.sessionId === sessionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const manageClass = (allClasses || []).find((c) => c.id === manageClassId);

  const { data: subjects, isLoading: loadingSubjects } = useQuery({
    queryKey: ['ad-subjects', manageClass?.sessionId, manageClass?.id],
    queryFn: () => getSubjects({ sessionId: manageClass.sessionId, classId: manageClass.id }).then((r) => r.data.data),
    enabled: !!manageClass,
  });

  const {
    register: registerClass, handleSubmit: handleClassSubmit,
    reset: resetClass, formState: { errors: classErrors },
  } = useForm({ resolver: zodResolver(classSchema), defaultValues: { sortOrder: 0 } });

  const {
    register: registerSection, handleSubmit: handleSectionSubmit,
    reset: resetSection, formState: { errors: sectionErrors },
  } = useForm({ resolver: zodResolver(sectionSchema) });

  const {
    register: registerSubject, handleSubmit: handleSubjectSubmit,
    reset: resetSubject, formState: { errors: subjectErrors },
  } = useForm({ resolver: zodResolver(subjectSchema) });

  useEffect(() => {
    resetSection();
    resetSubject();
    setCopyForm({ fromSessionId: '', fromClassId: '' });
    setManageTab('sections');
  }, [manageClassId]); // eslint-disable-line react-hooks/exhaustive-deps

  const createClassMutation = useMutation({
    mutationFn: (data) => createClass({ ...data, sessionId }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-classes'] }); setShowCreate(false); resetClass({ sortOrder: 0 }); },
  });

  const deleteClassMutation = useMutation({
    mutationFn: deleteClass,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-classes'] }); setDeleteTarget(null); },
  });

  const createSectionMutation = useMutation({
    mutationFn: (data) => createSection({
      classId: manageClass.id,
      name: data.name,
      classTeacherId: data.classTeacherId || undefined,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-classes'] }); resetSection(); },
  });

  const updateSectionMutation = useMutation({
    mutationFn: ({ id, classTeacherId }) => updateSection(id, { classTeacherId: classTeacherId || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ad-classes'] }),
  });

  const deleteSectionMutation = useMutation({
    mutationFn: deleteSection,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ad-classes'] }),
  });

  const createSubjectMutation = useMutation({
    mutationFn: (data) => createSubject({ ...data, sessionId: manageClass.sessionId, classId: manageClass.id }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-subjects', manageClass.sessionId, manageClass.id] }); resetSubject(); },
  });

  const deleteSubjectMutation = useMutation({
    mutationFn: deleteSubject,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ad-subjects', manageClass.sessionId, manageClass.id] }),
  });

  const copySubjectsMutation = useMutation({
    mutationFn: () => copySubjects({
      fromSessionId: copyForm.fromSessionId,
      fromClassId: copyForm.fromClassId,
      toSessionId: manageClass.sessionId,
      toClassId: manageClass.id,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-subjects', manageClass.sessionId, manageClass.id] });
      setCopyForm({ fromSessionId: '', fromClassId: '' });
    },
  });

  const classColumns = [
    { key: 'name', label: 'Class', render: (r) => <p className="font-semibold text-[#1e293b]">{r.name}</p> },
    { key: 'sortOrder', label: 'Sort Order' },
    { key: 'sections', label: 'Sections', render: (r) => <Badge label={`${r.sections?.length || 0} sections`} variant="navy" /> },
    { key: 'actions', label: 'Actions', render: (r) => (
      <div className="flex items-center gap-2">
        <Button size="sm" variant="ghost" icon={Settings2} onClick={() => setManageClassId(r.id)}>Manage</Button>
        <Button size="sm" variant="ghost" icon={Trash2} className="text-red-500 hover:text-red-600" onClick={() => setDeleteTarget(r)}>Delete</Button>
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Classes & Sections</h1>
          <p className="text-sm text-[#64748b] mt-1">Manage classes, sections, class teachers and subjects for a session</p>
        </div>
        <Button icon={Plus} onClick={() => setShowCreate(true)} disabled={!sessionId}>Add Class</Button>
      </div>

      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <label className="text-sm font-medium text-[#374151] shrink-0">Session</label>
          <select value={sessionId} onChange={(e) => setSessionId(e.target.value)}
            className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] w-full sm:w-64">
            <option value="">Select session</option>
            {(sessions || []).map((s) => <option key={s.id} value={s.id}>{s.label}{s.isActive ? ' (Active)' : ''}</option>)}
          </select>
        </div>
      </Card>

      <Table
        columns={classColumns}
        data={classes}
        loading={loadingClasses || loadingSessions}
        emptyMessage={sessionId ? 'No classes in this session yet.' : 'Select a session to view classes.'}
      />

      {/* Add Class Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); resetClass({ sortOrder: 0 }); }} title="Add Class" size="sm">
        <form onSubmit={handleClassSubmit((d) => createClassMutation.mutate(d))} className="space-y-4">
          <Input label="Class Name" name="name" register={registerClass} error={classErrors.name} required placeholder="e.g. Class 7" />
          <Input label="Sort Order" name="sortOrder" type="number" register={registerClass} error={classErrors.sortOrder} placeholder="0" />

          {createClassMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {createClassMutation.error?.response?.data?.message || 'Failed to create class.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowCreate(false); resetClass({ sortOrder: 0 }); }}>Cancel</Button>
            <Button type="submit" loading={createClassMutation.isPending}>Add Class</Button>
          </div>
        </form>
      </Modal>

      {/* Delete Class Modal */}
      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title={`Delete Class: ${deleteTarget?.name}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#64748b]">This cannot be undone. Classes with enrolled students cannot be deleted.</p>
          {deleteClassMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {deleteClassMutation.error?.response?.data?.message || 'Failed to delete class.'}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" loading={deleteClassMutation.isPending} onClick={() => deleteClassMutation.mutate(deleteTarget.id)}>
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manage Sections and Subjects Modal */}
      <Modal open={!!manageClass} onClose={() => setManageClassId(null)} title={`Manage: ${manageClass?.name}`} size="lg">
        {manageClass && (
          <div className="space-y-5">
            <div className="flex gap-2 border-b border-[#e2e8f0]">
              <button onClick={() => setManageTab('sections')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${manageTab === 'sections' ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-[#94a3b8] hover:text-[#1e293b]'}`}>
                Sections
              </button>
              <button onClick={() => setManageTab('subjects')}
                className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${manageTab === 'subjects' ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-[#94a3b8] hover:text-[#1e293b]'}`}>
                Subjects
              </button>
            </div>

            {manageTab === 'sections' && (
              <div className="space-y-4">
                <form onSubmit={handleSectionSubmit((d) => createSectionMutation.mutate(d))} className="flex flex-col sm:flex-row gap-3 items-end">
                  <Input label="Section Name" name="name" register={registerSection} error={sectionErrors.name} placeholder="e.g. 7-A" className="flex-1" />
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-sm font-medium text-[#374151]">Class Teacher</label>
                    <select {...registerSection('classTeacherId')} className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white text-[#1e293b]">
                      <option value="">Unassigned</option>
                      {(faculty || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                  <Button type="submit" icon={Plus} loading={createSectionMutation.isPending}>Add</Button>
                </form>

                {createSectionMutation.isError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                    {createSectionMutation.error?.response?.data?.message || 'Failed to add section.'}
                  </div>
                )}

                <div className="divide-y divide-[#f1f5f9] border border-[#e2e8f0] rounded-xl overflow-hidden">
                  {(manageClass.sections || []).length === 0 ? (
                    <p className="text-center text-sm text-[#94a3b8] py-8">No sections yet.</p>
                  ) : manageClass.sections.map((sec) => (
                    <div key={sec.id} className="flex items-center justify-between px-4 py-3 bg-white">
                      <div className="flex items-center gap-3">
                        <Badge label={sec.name} variant="navy" />
                        <select
                          value={sec.classTeacherId || ''}
                          onChange={(e) => updateSectionMutation.mutate({ id: sec.id, classTeacherId: e.target.value })}
                          className="text-sm border border-[#e2e8f0] rounded-lg px-2 py-1.5 bg-white text-[#374151]"
                        >
                          <option value="">No class teacher</option>
                          {(faculty || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </div>
                      <button onClick={() => deleteSectionMutation.mutate(sec.id)} className="p-1.5 rounded-lg text-[#94a3b8] hover:bg-red-50 hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {manageTab === 'subjects' && (
              <div className="space-y-4">
                <form onSubmit={handleSubjectSubmit((d) => createSubjectMutation.mutate(d))} className="flex flex-col sm:flex-row gap-3 items-end">
                  <Input label="Subject Name" name="name" register={registerSubject} error={subjectErrors.name} placeholder="e.g. Mathematics" className="flex-1" />
                  <Input label="Code" name="code" register={registerSubject} placeholder="e.g. MATH" className="w-32" />
                  <Button type="submit" icon={Plus} loading={createSubjectMutation.isPending}>Add</Button>
                </form>

                <div className="divide-y divide-[#f1f5f9] border border-[#e2e8f0] rounded-xl overflow-hidden">
                  {loadingSubjects ? (
                    <div className="py-8 flex justify-center"><Spinner /></div>
                  ) : (subjects || []).length === 0 ? (
                    <p className="text-center text-sm text-[#94a3b8] py-8">No subjects yet.</p>
                  ) : subjects.map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between px-4 py-3 bg-white">
                      <div>
                        <p className="text-sm font-semibold text-[#1e293b]">{sub.name}</p>
                        {sub.code && <p className="text-xs text-[#94a3b8]">{sub.code}</p>}
                      </div>
                      <button onClick={() => deleteSubjectMutation.mutate(sub.id)} className="p-1.5 rounded-lg text-[#94a3b8] hover:bg-red-50 hover:text-red-500 transition-colors">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>

                <Card className="bg-[#f8fafc]">
                  <p className="text-xs font-semibold text-[#64748b] uppercase tracking-wide mb-3">Copy Subjects From a Previous Session</p>
                  <div className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-sm font-medium text-[#374151]">From Session</label>
                      <select value={copyForm.fromSessionId} onChange={(e) => setCopyForm({ fromSessionId: e.target.value, fromClassId: '' })}
                        className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
                        <option value="">Select session</option>
                        {(sessions || []).filter((s) => s.id !== manageClass.sessionId).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                      </select>
                    </div>
                    <div className="flex flex-col gap-1 flex-1">
                      <label className="text-sm font-medium text-[#374151]">From Class</label>
                      <select value={copyForm.fromClassId} onChange={(e) => setCopyForm({ ...copyForm, fromClassId: e.target.value })} disabled={!copyForm.fromSessionId}
                        className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9]">
                        <option value="">Select class</option>
                        {(allClasses || []).filter((c) => c.sessionId === copyForm.fromSessionId).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </div>
                    <Button icon={Copy} variant="outline" disabled={!copyForm.fromClassId} loading={copySubjectsMutation.isPending}
                      onClick={() => copySubjectsMutation.mutate()}>
                      Copy
                    </Button>
                  </div>
                  {copySubjectsMutation.isError && (
                    <p className="text-xs text-red-500 mt-2">{copySubjectsMutation.error?.response?.data?.message || 'Copy failed.'}</p>
                  )}
                </Card>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}