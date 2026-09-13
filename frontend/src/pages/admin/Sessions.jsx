import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, CheckCircle2, CalendarDays, Pencil, Trash2 } from 'lucide-react';
import { getSessions, createSession, updateSession, activateSession, deleteSession } from '../../api/schooladmin.api';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';

const schema = z.object({
  label:     z.string().min(4, 'e.g. 2026-2027'),
  startDate: z.string().min(1, 'Start date required'),
  endDate:   z.string().min(1, 'End date required'),
});

export default function AdminSessions() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate]       = useState(false);
  const [editSession, setEditSession]     = useState(null);
  const [activateModal, setActivateModal] = useState(null);
  const [deleteModal, setDeleteModal]     = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['ad-sessions'],
    queryFn: () => getSessions().then((r) => r.data.data),
  });

  const createForm = useForm({ resolver: zodResolver(schema) });
  const editForm   = useForm({ resolver: zodResolver(schema) });

  const createMutation = useMutation({
    mutationFn: createSession,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-sessions'] }); setShowCreate(false); createForm.reset(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => updateSession(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-sessions'] }); setEditSession(null); editForm.reset(); },
  });

  const activateMutation = useMutation({
    mutationFn: activateSession,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ad-sessions'] });
      qc.invalidateQueries({ queryKey: ['ad-classes'] });
      setActivateModal(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteSession,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['ad-sessions'] }); setDeleteModal(null); },
  });

  const sessions = data || [];

  const toDateInput = (d) => new Date(d).toISOString().slice(0, 10);

  const openEdit = (session) => {
    setEditSession(session);
    editForm.reset({
      label: session.label,
      startDate: toDateInput(session.startDate),
      endDate: toDateInput(session.endDate),
    });
  };

  const columns = [
    { key: 'label', label: 'Session', render: (r) => (
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-[#f0f4ff] flex items-center justify-center shrink-0">
          <CalendarDays size={16} className="text-[#1e293b]" />
        </div>
        <p className="font-semibold text-[#1e293b]">{r.label}</p>
      </div>
    )},
    { key: 'startDate', label: 'Start Date', render: (r) => new Date(r.startDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
    { key: 'endDate',   label: 'End Date',   render: (r) => new Date(r.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
    { key: 'status', label: 'Status', render: (r) => (
      r.isActive ? <Badge label="Active" variant="success" /> : <Badge label="Read-only" variant="default" />
    )},
    { key: 'actions', label: 'Actions', render: (r) => (
      <div className="flex items-center gap-1 flex-wrap">
        <Button size="sm" variant="ghost" icon={Pencil} onClick={() => openEdit(r)}>Edit</Button>
        {!r.isActive && (
          <>
            <Button size="sm" variant="ghost" icon={CheckCircle2} onClick={() => setActivateModal(r)}>Activate</Button>
            <Button size="sm" variant="ghost" icon={Trash2} onClick={() => setDeleteModal(r)} className="text-red-500 hover:text-red-600">Delete</Button>
          </>
        )}
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Academic Sessions</h1>
          <p className="text-sm text-[#64748b] mt-1">Exactly one session is active at a time, older sessions stay read-only but fully visible in reports</p>
        </div>
        <Button icon={Plus} onClick={() => setShowCreate(true)}>New Session</Button>
      </div>

      <Table columns={columns} data={sessions} loading={isLoading} emptyMessage="No academic sessions yet. Create one to get started." />

      {/* Create */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); createForm.reset(); }} title="Create Academic Session" size="sm">
        <form onSubmit={createForm.handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
          <Input label="Session Label" name="label" register={createForm.register} error={createForm.formState.errors.label} required placeholder="e.g. 2026-2027" />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" name="startDate" type="date" register={createForm.register} error={createForm.formState.errors.startDate} required />
            <Input label="End Date"   name="endDate"   type="date" register={createForm.register} error={createForm.formState.errors.endDate}   required />
          </div>

          {createMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {createMutation.error?.response?.data?.message || 'Failed to create session.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowCreate(false); createForm.reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create Session</Button>
          </div>
        </form>
      </Modal>

      {/* Edit */}
      <Modal open={!!editSession} onClose={() => { setEditSession(null); editForm.reset(); }} title={`Edit — ${editSession?.label || ''}`} size="sm">
        <form onSubmit={editForm.handleSubmit((d) => updateMutation.mutate({ id: editSession.id, data: d }))} className="space-y-4">
          <Input label="Session Label" name="label" register={editForm.register} error={editForm.formState.errors.label} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" name="startDate" type="date" register={editForm.register} error={editForm.formState.errors.startDate} required />
            <Input label="End Date"   name="endDate"   type="date" register={editForm.register} error={editForm.formState.errors.endDate}   required />
          </div>

          {updateMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {updateMutation.error?.response?.data?.message || 'Failed to update session.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setEditSession(null); editForm.reset(); }}>Cancel</Button>
            <Button type="submit" loading={updateMutation.isPending}>Save Changes</Button>
          </div>
        </form>
      </Modal>

      {/* Activate */}
      <Modal open={!!activateModal} onClose={() => setActivateModal(null)} title={`Activate: ${activateModal?.label}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#64748b]">
            This will make <span className="font-semibold text-[#1e293b]">{activateModal?.label}</span> the active session.
            The current active session will automatically become read-only, no new attendance or marks can be entered against it, but all its data stays fully visible in reports.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setActivateModal(null)}>Cancel</Button>
            <Button loading={activateMutation.isPending} onClick={() => activateMutation.mutate(activateModal.id)}>
              Confirm Activate
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete */}
      <Modal open={!!deleteModal} onClose={() => setDeleteModal(null)} title={`Delete — ${deleteModal?.label}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#64748b]">
            This can only be removed if it has no classes or enrolled students yet. This action cannot be undone.
          </p>
          {deleteMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {deleteMutation.error?.response?.data?.message || 'Failed to delete session.'}
            </div>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => setDeleteModal(null)}>Cancel</Button>
            <Button variant="danger" loading={deleteMutation.isPending} onClick={() => deleteMutation.mutate(deleteModal.id)}>
              Confirm Delete
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}