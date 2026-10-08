import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, KeyRound, Ban, CheckCircle, Trash2, Copy, Check } from 'lucide-react';
import {
  getReceptionStaff, createReceptionStaff, updateReceptionStaff, setReceptionStaffPassword, deleteReceptionStaff,
} from '../../api/reception.api';
import { fmtDate, errMsg, inputCls, Field, StatusBadge } from '../fees/feeUtils';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';

export default function ReceptionStaff() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [modal, setModal] = useState(null); // { mode: 'create' | 'edit' | 'password', user? }
  const [pwd, setPwd] = useState('');
  const [creds, setCreds] = useState(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState('');

  const { data, isLoading } = useQuery({ queryKey: ['reception-staff'], queryFn: () => getReceptionStaff().then((r) => r.data.data) });
  const refresh = () => { qc.invalidateQueries({ queryKey: ['reception-staff'] }); qc.invalidateQueries({ queryKey: ['reception-meta'] }); };
  const fail = (e) => setErr(errMsg(e));

  const create = useMutation({
    mutationFn: () => createReceptionStaff({ name: form.name, email: form.email, password: form.password || undefined }),
    onSuccess: (r) => { setModal(null); setCreds({ email: r.data.data.email, password: r.data.data.password }); refresh(); },
    onError: fail,
  });
  const edit = useMutation({
    mutationFn: () => updateReceptionStaff(modal.user.id, { name: form.name, email: form.email }),
    onSuccess: () => { setModal(null); refresh(); }, onError: fail,
  });
  const setPassword = useMutation({
    mutationFn: () => setReceptionStaffPassword(modal.user.id, { password: pwd || undefined }),
    onSuccess: (r) => { setModal(null); setCreds({ email: r.data.data.email, password: r.data.data.password }); },
    onError: fail,
  });
  const toggle = useMutation({
    mutationFn: (u) => updateReceptionStaff(u.id, { status: u.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: refresh, onError: (e) => window.alert(errMsg(e)),
  });
  const remove = useMutation({ mutationFn: (u) => deleteReceptionStaff(u.id), onSuccess: refresh, onError: (e) => window.alert(errMsg(e)) });

  const open = (mode, user) => {
    setErr(''); setPwd('');
    setForm(user ? { name: user.name, email: user.email, password: '' } : { name: '', email: '', password: '' });
    setModal({ mode, user });
  };
  const copy = () => {
    navigator.clipboard.writeText(`Email: ${creds.email}\nPassword: ${creds.password}`);
    setCopied(true); setTimeout(() => setCopied(false), 1500);
  };

  const columns = [
    { key: 'name', label: 'Name', render: (u) => (<div><p className="font-semibold text-[#1e293b]">{u.name}</p><p className="text-xs text-[#94a3b8]">{u.email}</p></div>) },
    { key: 'status', label: 'Status', render: (u) => <StatusBadge status={u.status} /> },
    { key: 'last', label: 'Last login', render: (u) => (u.lastLogin ? fmtDate(u.lastLogin) : 'Never') },
    { key: 'enq', label: 'Enquiries logged', render: (u) => u.enquiryCount },
    { key: 'vis', label: 'Visitors checked in', render: (u) => u.visitorCount },
    {
      key: 'act', label: '', render: (u) => (
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" icon={Pencil} onClick={() => open('edit', u)} />
          <Button size="sm" variant="ghost" icon={KeyRound} onClick={() => open('password', u)} />
          <Button size="sm" variant="ghost" icon={u.status === 'active' ? Ban : CheckCircle} onClick={() => toggle.mutate(u)} />
          <Button size="sm" variant="ghost" icon={Trash2} onClick={() => window.confirm(`Delete ${u.name}? Their past records stay on file.`) && remove.mutate(u)} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Reception Staff</h1>
          <p className="text-sm text-[#64748b] mt-1">Front-desk logins for enquiries and the visitor log. They sign in on the normal login page with email and password.</p>
        </div>
        <Button icon={Plus} onClick={() => open('create')}>Add receptionist</Button>
      </div>

      <Card padding={false}><div className="p-4"><Table columns={columns} data={data || []} loading={isLoading} emptyMessage="No receptionists yet" /></div></Card>

      <Modal open={modal?.mode === 'create' || modal?.mode === 'edit'} onClose={() => setModal(null)} title={modal?.mode === 'edit' ? 'Edit receptionist' : 'Add receptionist'} size="sm">
        <div className="space-y-3">
          <Field label="Full name"><input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Login email"><input type="email" className={inputCls} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          {modal?.mode === 'create' && (
            <Field label="Password" hint="Leave empty to auto-generate a secure password (min 8 characters if you set one)">
              <input type="text" className={inputCls} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            </Field>
          )}
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button className="w-full" loading={create.isPending || edit.isPending} disabled={form.name.trim().length < 2 || !form.email}
            onClick={() => (modal.mode === 'edit' ? edit.mutate() : create.mutate())}>{modal?.mode === 'edit' ? 'Save changes' : 'Create account'}</Button>
        </div>
      </Modal>

      <Modal open={modal?.mode === 'password'} onClose={() => setModal(null)} title={`Set password: ${modal?.user?.name || ''}`} size="sm">
        <div className="space-y-3">
          <Field label="New password" hint="Leave empty to generate one automatically">
            <input type="text" className={inputCls} value={pwd} onChange={(e) => setPwd(e.target.value)} />
          </Field>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <Button className="w-full" loading={setPassword.isPending} disabled={pwd.length > 0 && pwd.length < 8} onClick={() => setPassword.mutate()}>Update password</Button>
        </div>
      </Modal>

      <Modal open={!!creds} onClose={() => setCreds(null)} title="Login details" size="sm">
        {creds && (
          <div className="space-y-4">
            <p className="text-sm text-[#64748b]">Share these with the receptionist. The password will not be shown again.</p>
            <div className="bg-[#f8fafc] border border-[#e2e8f0] rounded-lg p-4 space-y-2">
              <div><p className="text-xs text-[#94a3b8]">Login email</p><p className="text-sm font-semibold text-[#1e293b]">{creds.email}</p></div>
              <div><p className="text-xs text-[#94a3b8]">Password</p><p className="text-sm font-mono font-semibold text-[#1e293b]">{creds.password}</p></div>
            </div>
            <Button className="w-full" icon={copied ? Check : Copy} onClick={copy}>{copied ? 'Copied' : 'Copy credentials'}</Button>
          </div>
        )}
      </Modal>
    </div>
  );
}