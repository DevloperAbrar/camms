import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Search, RefreshCw, Ban, CheckCircle, Eye } from 'lucide-react';
import { getSchools, createSchool, suspendSchool, reactivateSchool, getPlans } from '../../api/superadmin.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Badge from '../../components/ui/Badge';
import Table from '../../components/ui/Table';
import Modal from '../../components/ui/Modal';

const statusVariant = { active: 'success', trial: 'info', expired: 'danger', suspended: 'warning' };

const schema = z.object({
  name:         z.string().min(2, 'Name required'),
  code:         z.string().min(2, 'Code required').toUpperCase(),
  address:      z.string().optional(),
  contactEmail: z.string().email('Valid email required'),
  contactPhone: z.string().optional(),
  planId:       z.string().min(1, 'Select a plan'),
  startDate:    z.string().min(1, 'Start date required'),
  endDate:      z.string().min(1, 'End date required'),
  timezone:     z.string().default('Asia/Kolkata'),
});

export default function SASchools() {
  const qc = useQueryClient();
  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showCreate, setShowCreate]   = useState(false);
  const [suspendModal, setSuspendModal] = useState(null);
  const [suspendReason, setSuspendReason] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['sa-schools', search, statusFilter],
    queryFn: () => getSchools({ search, status: statusFilter }).then((r) => r.data.data),
  });

  const { data: plansData } = useQuery({
    queryKey: ['sa-plans'],
    queryFn: () => getPlans().then((r) => r.data.data),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const createMutation = useMutation({
    mutationFn: createSchool,
    onSuccess: () => { qc.invalidateQueries(['sa-schools']); setShowCreate(false); reset(); },
  });

  const suspendMutation = useMutation({
    mutationFn: ({ id, reason }) => suspendSchool(id, { reason }),
    onSuccess: () => { qc.invalidateQueries(['sa-schools']); setSuspendModal(null); setSuspendReason(''); },
  });

  const reactivateMutation = useMutation({
    mutationFn: reactivateSchool,
    onSuccess: () => qc.invalidateQueries(['sa-schools']),
  });

  const schools = data?.schools || data || [];

  const columns = [
    { key: 'name',  label: 'School Name', render: (r) => (
      <div>
        <p className="font-semibold text-[#1e293b]">{r.name}</p>
        <p className="text-xs text-[#94a3b8]">{r.code}</p>
      </div>
    )},
    { key: 'contactEmail', label: 'Contact' },
    { key: 'status', label: 'Status', render: (r) => (
      <Badge label={r.status.charAt(0).toUpperCase() + r.status.slice(1)} variant={statusVariant[r.status] || 'default'} />
    )},
    { key: 'actions', label: 'Actions', render: (r) => (
      <div className="flex items-center gap-2">
        {r.status === 'suspended' ? (
          <Button size="sm" variant="ghost" icon={CheckCircle} loading={reactivateMutation.isPending}
            onClick={() => reactivateMutation.mutate(r.id)}>Reactivate</Button>
        ) : r.status !== 'expired' ? (
          <Button size="sm" variant="ghost" icon={Ban}
            onClick={() => setSuspendModal(r)} className="text-red-500 hover:text-red-600">Suspend</Button>
        ) : null}
      </div>
    )},
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Schools</h1>
          <p className="text-sm text-[#64748b] mt-1">All schools on the platform</p>
        </div>
        <Button icon={Plus} onClick={() => setShowCreate(true)}>Onboard School</Button>
      </div>

      {/* Filters */}
      <Card>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94a3b8]" />
            <input
              placeholder="Search by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white text-[#1e293b]"
          >
            <option value="">All Statuses</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="expired">Expired</option>
            <option value="suspended">Suspended</option>
          </select>
        </div>
      </Card>

      <Table columns={columns} data={schools} loading={isLoading} emptyMessage="No schools found." />

      {/* Create School Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Onboard New School" size="lg">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="School Name"    name="name"         register={register} error={errors.name}         required placeholder="e.g. Delhi Public School" />
            <Input label="School Code"    name="code"         register={register} error={errors.code}         required placeholder="e.g. DPS001" />
            <Input label="Contact Email"  name="contactEmail" register={register} error={errors.contactEmail} required type="email" placeholder="admin@school.com" />
            <Input label="Contact Phone"  name="contactPhone" register={register} error={errors.contactPhone} placeholder="+91 9999999999" />
            <Input label="Address"        name="address"      register={register} error={errors.address}      placeholder="City, State" />
            <div className="flex flex-col gap-1">
              <label className="text-sm font-medium text-[#374151]">Plan <span className="text-red-500">*</span></label>
              <select {...register('planId')} className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white text-[#1e293b]">
                <option value="">Select a plan</option>
                {(plansData || []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name} — ₹{Number(p.price).toLocaleString('en-IN')}</option>
                ))}
              </select>
              {errors.planId && <p className="text-xs text-red-500">{errors.planId.message}</p>}
            </div>
            <Input label="Subscription Start" name="startDate" type="date" register={register} error={errors.startDate} required />
            <Input label="Subscription End"   name="endDate"   type="date" register={register} error={errors.endDate}   required />
          </div>

          {createMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {createMutation.error?.response?.data?.message || 'Failed to create school.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Onboard School</Button>
          </div>
        </form>
      </Modal>

      {/* Suspend Modal */}
      <Modal open={!!suspendModal} onClose={() => { setSuspendModal(null); setSuspendReason(''); }} title={`Suspend — ${suspendModal?.name}`} size="sm">
        <div className="space-y-4">
          <p className="text-sm text-[#64748b]">This will block all access for this school immediately. Please provide a reason.</p>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#374151]">Reason <span className="text-red-500">*</span></label>
            <textarea
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              rows={3}
              placeholder="Non-payment, policy violation, etc."
              className="w-full px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316] resize-none"
            />
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={() => { setSuspendModal(null); setSuspendReason(''); }}>Cancel</Button>
            <Button variant="danger" loading={suspendMutation.isPending}
              onClick={() => suspendMutation.mutate({ id: suspendModal.id, reason: suspendReason })}
              disabled={!suspendReason.trim()}>
              Confirm Suspend
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}