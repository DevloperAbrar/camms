import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, UserCheck2, Link2 } from 'lucide-react';
import {
  getFaculty, createFaculty,
  getFacultyAssignments, assignFaculty, removeFacultyAssignment,
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

export default function AdminFaculty() {
  const qc = useQueryClient();
  const [showAddFaculty, setShowAddFaculty] = useState(false);
  const [showAssign, setShowAssign]         = useState(false);
  const [assignForm, setAssignForm] = useState({ sessionId: '', classId: '', sectionId: '', subjectId: '', facultyId: '' });

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
    if (showAssign && !assignForm.sessionId && sessions?.length) {
      const active = sessions.find((s) => s.isActive) || sessions[0];
      setAssignForm((f) => ({ ...f, sessionId: active.id }));
    }
  }, [showAssign, sessions]); // eslint-disable-line react-hooks/exhaustive-deps

  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm({ resolver: zodResolver(facultySchema) });
  const usePasswordLogin = watch('usePasswordLogin');

  const createFacultyMutation = useMutation({
    mutationFn: (data) => {
      const payload = { name: data.name, email: data.email, usePasswordLogin: !!data.usePasswordLogin };
      if (payload.usePasswordLogin && data.password) payload.password = data.password;
      return createFaculty(payload);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-faculty'] }); setShowAddFaculty(false); reset(); },
  });

  const assignMutation = useMutation({
    mutationFn: assignFaculty,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-faculty-assignments'] });
      setAssignForm((f) => ({ ...f, classId: '', sectionId: '', subjectId: '', facultyId: '' }));
    },
  });

  const removeMutation = useMutation({
    mutationFn: removeFacultyAssignment,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ad-faculty-assignments'] }),
  });

  const selectedClass = (classes || []).find((c) => c.id === assignForm.classId);
  const classesForSession = (classes || []).filter((c) => c.sessionId === assignForm.sessionId);

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
    { key: 'actions', label: '', render: (r) => (
      <button onClick={() => removeMutation.mutate(r.id)} className="p-1.5 rounded-lg text-[#94a3b8] hover:bg-red-50 hover:text-red-500 transition-colors">
        <Trash2 size={16} />
      </button>
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

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-[#1e293b]">Assignments</h2>
          <p className="text-sm text-[#64748b] mt-1">One faculty member can hold any number of class, section and subject combinations</p>
        </div>
        <Button icon={Link2} variant="outline" onClick={() => setShowAssign(true)}>New Assignment</Button>
      </div>

      <Table columns={assignmentColumns} data={assignments || []} loading={loadingAssignments} emptyMessage="No assignments yet." />

      {/* Add Faculty Modal */}
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

      {/* Assign Modal */}
      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="New Faculty Assignment" size="md">
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

          {assignMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {assignMutation.error?.response?.data?.message || 'Failed to create assignment.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => setShowAssign(false)}>Close</Button>
            <Button
              icon={UserCheck2}
              loading={assignMutation.isPending}
              disabled={!(assignForm.sessionId && assignForm.classId && assignForm.sectionId && assignForm.subjectId && assignForm.facultyId)}
              onClick={() => assignMutation.mutate(assignForm)}
            >
              Assign
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}