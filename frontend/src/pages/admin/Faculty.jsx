import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, UserCheck2, Link2, Pencil, KeyRound, Ban, CheckCircle, Copy, Check, X } from 'lucide-react';
import {
  getFaculty, createFaculty, updateFaculty, deactivateFaculty, resetFacultyPassword,
  getFacultyAssignments, assignFaculty, updateFacultyAssignment, removeFacultyAssignment,
  getSessions, getClasses, getSubjects,
} from '../../api/schooladmin.api';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';

const facultySchema = z
  .object({
    name: z.string().min(2, 'Name required'),
    email: z.string().email('Valid email required'),
    usePasswordLogin: z.boolean().optional(),
    password: z.string().optional(),
  })
  .refine((d) => !d.usePasswordLogin || (d.password && d.password.length >= 6), {
    message: 'Password must be at least 6 characters',
    path: ['password'],
  });

const editFacultySchema = z.object({
  name: z.string().min(2, 'Name required'),
});

function CredentialsModal({ data, onClose }) {
  const [copied, setCopied] = useState(false);
  if (!data) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(`Email: ${data.email}\nPassword: ${data.password}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Modal open={!!data} onClose={onClose} title="Faculty Login Details" size="sm">
      <div className="space-y-4">
        <p className="text-sm text-[#64748b]">Share these with the faculty member. This password won't be shown again.</p>
        <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-4 space-y-2">
          <div>
            <p className="text-xs text-[#94a3b8] font-medium">Login Email</p>
            <p className="text-sm font-semibold text-[#1e293b]">{data.email}</p>
          </div>
          <div>
            <p className="text-xs text-[#94a3b8] font-medium">Password</p>
            <p className="text-sm font-mono font-semibold text-[#1e293b]">{data.password}</p>
          </div>
        </div>
        <Button className="w-full" icon={copied ? Check : Copy} onClick={handleCopy}>
          {copied ? 'Copied' : 'Copy credentials'}
        </Button>
      </div>
    </Modal>
  );
}

export default function AdminFaculty() {
  const qc = useQueryClient();
  const [showAddFaculty, setShowAddFaculty] = useState(false);
  const [showAssign, setShowAssign]         = useState(false);
  const [editFacultyModal, setEditFacultyModal] = useState(null);
  const [deactivateModal, setDeactivateModal]   = useState(null);
  const [credentials, setCredentials]           = useState(null);
  const [assignForm, setAssignForm] = useState({ sessionId: '', classId: '', sectionId: '', subjectId: '', facultyId: '' });

  // Editing an existing assignment reuses the same modal/form as creating one
  const [editAssignment, setEditAssignment] = useState(null);

  // Filters for the Assignments table
  const [filterClassId, setFilterClassId]     = useState('');
  const [filterSectionId, setFilterSectionId] = useState('');

  const { data: faculty, isLoading: loadingFaculty } = useQuery({
    queryKey: ['ad-faculty'],
    queryFn: () => getFaculty().then((r) => r.data.data),
  });

  const { data: assignments, isLoading: loadingAssignments } = useQuery({
    queryKey: ['ad-faculty-assignments'],
    queryFn: () => getFacultyAssignments().then((r) => r.data.data),
  });

  const { data: sessions } = useQuery({
    queryKey: ['ad-sessions'],
    queryFn: () => getSessions().then((r) => r.data.data),
  });

  const { data: classes } = useQuery({
    queryKey: ['ad-classes'],
    queryFn: () => getClasses().then((r) => r.data.data),
  });

  const { data: assignSubjects } = useQuery({
    queryKey: ['ad-subjects', assignForm.sessionId, assignForm.classId],
    queryFn: () => getSubjects({ sessionId: assignForm.sessionId, classId: assignForm.classId }).then((r) => r.data.data),
    enabled: !!(assignForm.sessionId && assignForm.classId),
  });

  useEffect(() => {
    if (showAssign && !editAssignment && !assignForm.sessionId && sessions?.length) {
      const active = sessions.find((s) => s.isActive) || sessions[0];
      setAssignForm((f) => ({ ...f, sessionId: active.id }));
    }
  }, [showAssign, sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ resolver: zodResolver(facultySchema) });
  const usePasswordLogin = watch('usePasswordLogin');

  const editForm = useForm({ resolver: zodResolver(editFacultySchema) });

  const createFacultyMutation = useMutation({
    mutationFn: (data) => {
      const payload = { name: data.name, email: data.email, usePasswordLogin: !!data.usePasswordLogin };
      if (payload.usePasswordLogin && data.password) payload.password = data.password;
      return createFaculty(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-faculty'] }); setShowAddFaculty(false); reset(); },
  });

  const updateFacultyMutation = useMutation({
    mutationFn: ({ id, data }) => updateFaculty(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-faculty'] }); setEditFacultyModal(null); editForm.reset(); },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateFaculty,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-faculty'] }); setDeactivateModal(null); },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: resetFacultyPassword,
    onSuccess: (res) => setCredentials(res.data.data),
  });

  const assignMutation = useMutation({
    mutationFn: assignFaculty,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-faculty-assignments'] });
      setAssignForm((f) => ({ ...f, classId: '', sectionId: '', subjectId: '', facultyId: '' }));
    },
  });

  const updateAssignmentMutation = useMutation({
    mutationFn: ({ id, data }) => updateFacultyAssignment(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-faculty-assignments'] });
      setShowAssign(false);
      setEditAssignment(null);
      setAssignForm({ sessionId: '', classId: '', sectionId: '', subjectId: '', facultyId: '' });
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeFacultyAssignment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ad-faculty-assignments'] }),
  });

  const selectedClass = (classes || []).find((c) => c.id === assignForm.classId);
  const classesForSession = (classes || []).filter((c) => c.sessionId === assignForm.sessionId);

  const openEditFaculty = (f) => {
    setEditFacultyModal(f);
    editForm.reset({ name: f.name });
  };

  const openAddAssignment = () => {
    setEditAssignment(null);
    setAssignForm({ sessionId: '', classId: '', sectionId: '', subjectId: '', facultyId: '' });
    setShowAssign(true);
  };

  const openEditAssignment = (a) => {
    setEditAssignment(a);
    setAssignForm({
      sessionId: a.sessionId,
      classId: a.classId,
      sectionId: a.sectionId,
      subjectId: a.subjectId,
      facultyId: a.facultyId,
    });
    setShowAssign(true);
  };

  const handleAssignSubmit = () => {
    if (editAssignment) {
      updateAssignmentMutation.mutate({ id: editAssignment.id, data: assignForm });
    } else {
      assignMutation.mutate(assignForm);
    }
  };

  // Filters for the Assignments table
  const filterClasses  = classes || [];
  const filterSections = (filterClasses.find((c) => c.id === filterClassId)?.sections) || [];

  const filteredAssignments = (assignments || []).filter((a) => {
    if (filterClassId && a.classId !== filterClassId) return false;
    if (filterSectionId && a.sectionId !== filterSectionId) return false;
    return true;
  });

  const facultyColumns = [
    { key: 'name', label: 'Faculty', render: (r) => (
      <div>
        <p className="font-semibold text-[#1e293b]">{r.name}</p>
        <p className="text-xs text-[#94a3b8]">{r.email}</p>
      </div>
    )},
    { key: 'status', label: 'Status', render: (r) => (
      <Badge label={r.status.charAt(0).toUpperCase() + r.status.slice(1)} variant={r.status === 'active' ? 'success' : 'default'} />
    )},
    { key: 'lastLogin', label: 'Last Login', render: (r) => (r.lastLogin ? new Date(r.lastLogin).toLocaleDateString('en-IN') : 'Never') },
    { key: 'assignments', label: 'Assignments', render: (r) => (assignments || []).filter((a) => a.facultyId === r.id).length },
    { key: 'actions', label: 'Actions', render: (r) => (
      <div className="flex items-center gap-1 flex-wrap">
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEditFaculty(r)}>Edit</Button>
        <Button size="sm" variant="ghost" icon={KeyRound} loading={resetPasswordMutation.isPending && resetPasswordMutation.variables === r.id}
          onClick={() => resetPasswordMutation.mutate(r.id)}>Reset Password</Button>
        {r.status === 'active' ? (
          <Button size="sm" variant="ghost" icon={Ban} onClick={() => setDeactivateModal(r)} className="text-red-500 hover:text-red-600">Deactivate</Button>
        ) : (
          <Button size="sm" variant="ghost" icon={CheckCircle} loading={deactivateMutation.isPending}
            onClick={() => deactivateMutation.mutate(r.id)}>Reactivate</Button>
        )}
      </div>
    )},
  ];

  const assignmentColumns = [
    { key: 'faculty', label: 'Faculty', render: (r) => (
      <div>
        <p className="font-semibold text-[#1e293b]">{r.faculty?.name}</p>
        <p className="text-xs text-[#94a3b8]">{r.faculty?.email}</p>
      </div>
    )},
    { key: 'class', label: 'Class', render: (r) => r.class?.name },
    { key: 'section', label: 'Section', render: (r) => <Badge label={r.section?.name} variant="navy" /> },
    { key: 'subject', label: 'Subject', render: (r) => r.subject?.name },
    { key: 'actions', label: 'Actions', render: (r) => (
      <div className="flex items-center gap-1">
        <button onClick={() => openEditAssignment(r)} className="p-1.5 rounded-lg text-[#94a3b8] hover:bg-[#f8fafc] hover:text-[#f97316] transition-colors">
          <Pencil size={16} />
        </button>
        <button onClick={() => removeMutation.mutate(r.id)} className="p-1.5 rounded-lg text-[#94a3b8] hover:bg-red-50 hover:text-red-500 transition-colors">
          <Trash2 size={16} />
        </button>
      </div>
    )},
  ];

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Faculty</h1>
          <p className="text-sm text-[#64748b] mt-1">Add faculty and assign them to class, section and subject combinations</p>
        </div>
        <Button icon={Plus} onClick={() => setShowAddFaculty(true)}>Add Faculty</Button>
      </div>

      <Table columns={facultyColumns} data={faculty || []} loading={loadingFaculty} emptyMessage="No faculty added yet." />

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#1e293b]">Assignments</h2>
          <p className="text-sm text-[#64748b] mt-1">One faculty member can hold any number of class, section and subject combinations</p>
        </div>
        <Button icon={Link2} variant="outline" onClick={openAddAssignment}>New Assignment</Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <select
          value={filterClassId}
          onChange={(e) => { setFilterClassId(e.target.value); setFilterSectionId(''); }}
          className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] w-full sm:w-56"
        >
          <option value="">All Classes</option>
          {filterClasses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select
          value={filterSectionId}
          onChange={(e) => setFilterSectionId(e.target.value)}
          disabled={!filterClassId}
          className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9] w-full sm:w-56"
        >
          <option value="">All Sections</option>
          {filterSections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {(filterClassId || filterSectionId) && (
          <button
            onClick={() => { setFilterClassId(''); setFilterSectionId(''); }}
            className="flex items-center gap-1 text-sm text-[#94a3b8] hover:text-[#1e293b] transition-colors"
          >
            <X size={14} /> Clear filters
          </button>
        )}
      </div>

      <Table columns={assignmentColumns} data={filteredAssignments} loading={loadingAssignments}
        emptyMessage={filterClassId || filterSectionId ? 'No assignments match this filter.' : 'No assignments yet.'} />

      {/* Add Faculty */}
      <Modal open={showAddFaculty} onClose={() => { setShowAddFaculty(false); reset(); }} title="Add Faculty" size="sm">
        <form onSubmit={handleSubmit((d) => createFacultyMutation.mutate(d))} className="space-y-4">
          <Input label="Full Name" name="name" register={register} error={errors.name} required placeholder="e.g. Aditya Singh" />
          <Input label="Email" name="email" type="email" register={register} error={errors.email} required placeholder="faculty@school.com" />
          <p className="text-xs text-[#94a3b8] -mt-2">They will log in with Google using this exact email.</p>

          <label className="flex items-center gap-2 text-sm text-[#374151]">
            <input type="checkbox" {...register('usePasswordLogin')} className="rounded border-[#e2e8f0] text-[#f97316] focus:ring-[#f97316]" />
            Also allow password-based login (for schools without Google Workspace)
          </label>

          {usePasswordLogin && (
            <Input label="Password" name="password" type="password" register={register} error={errors.password} required placeholder="Minimum 6 characters" />
          )}

          {createFacultyMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {createFacultyMutation.error?.response?.data?.message || 'Failed to add faculty.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowAddFaculty(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createFacultyMutation.isPending}>Add Faculty</Button>
          </div>
        </form>
      </Modal>

      {/* Edit Faculty */}
      <Modal open={!!editFacultyModal} onClose={() => { setEditFacultyModal(null); editForm.reset(); }} title={`Edit — ${editFacultyModal?.name || ''}`} size="sm">
        <form onSubmit={editForm.handleSubmit((d) => updateFacultyMutation.mutate({ id: editFacultyModal.id, data: d }))} className="space-y-4">
          <Input label="Full Name" name="name" register={editForm.register} error={editForm.formState.errors.name} required />
          <p className="text-xs text-[#94a3b8]">Email can't be changed since it's tied to their login.</p>

          {updateFacultyMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {updateFacultyMutation.error?.response?.data?.message || 'Failed to update faculty.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setEditFacultyModal(null); editForm.reset(); }}>Cancel</Button>
            <Button type="submit" loading={updateFacultyMutation.isPending}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      {/* Deactivate confirm */}
      <Modal open={!!deactivateModal} onClose={() => setDeactivateModal(null)} title={`Deactivate — ${deactivateModal?.name}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#64748b]">
            This blocks their login immediately. Past attendance and marks records stay attributed to them. You can reactivate anytime.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeactivateModal(null)}>Cancel</Button>
            <Button variant="danger" loading={deactivateMutation.isPending} onClick={() => deactivateMutation.mutate(deactivateModal.id)}>
              Confirm Deactivate
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add / Edit Assignment (shared modal) */}
      <Modal open={showAssign} onClose={() => { setShowAssign(false); setEditAssignment(null); }} title={editAssignment ? 'Edit Assignment' : 'New Faculty Assignment'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#374151]">Session</label>
              <select value={assignForm.sessionId} onChange={(e) => setAssignForm({ ...assignForm, sessionId: e.target.value, classId: '', sectionId: '', subjectId: '' })}
                className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
                <option value="">Select session</option>
                {(sessions || []).map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#374151]">Faculty</label>
              <select value={assignForm.facultyId} onChange={(e) => setAssignForm({ ...assignForm, facultyId: e.target.value })}
                className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b]">
                <option value="">Select faculty</option>
                {(faculty || []).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#374151]">Class</label>
              <select value={assignForm.classId} disabled={!assignForm.sessionId} onChange={(e) => setAssignForm({ ...assignForm, classId: e.target.value, sectionId: '', subjectId: '' })}
                className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9]">
                <option value="">Select class</option>
                {classesForSession.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#374151]">Section</label>
              <select value={assignForm.sectionId} disabled={!assignForm.classId} onChange={(e) => setAssignForm({ ...assignForm, sectionId: e.target.value })}
                className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9]">
                <option value="">Select section</option>
                {(selectedClass?.sections || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1 col-span-2">
              <label className="text-sm font-medium text-[#374151]">Subject</label>
              <select value={assignForm.subjectId} disabled={!assignForm.classId} onChange={(e) => setAssignForm({ ...assignForm, subjectId: e.target.value })}
                className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg bg-white text-[#1e293b] disabled:bg-[#f1f5f9]">
                <option value="">Select subject</option>
                {(assignSubjects || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          {(assignMutation.isError || updateAssignmentMutation.isError) && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {(assignMutation.error || updateAssignmentMutation.error)?.response?.data?.message || 'Failed to save assignment.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowAssign(false); setEditAssignment(null); }}>Close</Button>
            <Button
              icon={UserCheck2}
              loading={assignMutation.isPending || updateAssignmentMutation.isPending}
              disabled={!(assignForm.sessionId && assignForm.classId && assignForm.sectionId && assignForm.subjectId && assignForm.facultyId)}
              onClick={handleAssignSubmit}
            >
              {editAssignment ? 'Save Changes' : 'Assign'}
            </Button>
          </div>
        </div>
      </Modal>

      <CredentialsModal data={credentials} onClose={() => setCredentials(null)} />
    </div>
  );
}