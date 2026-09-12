import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Users, UserCheck, BookOpen, IndianRupee, Trash2 } from 'lucide-react';
import { getPlans, createPlan } from '../../api/superadmin.api';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';

const schema = z.object({
  name:        z.string().min(1, 'Name required'),
  maxStudents: z.coerce.number().min(1),
  maxFaculty:  z.coerce.number().min(1),
  maxClasses:  z.coerce.number().min(1),
  price:       z.coerce.number().min(0),
  billingCycle: z.enum(['monthly', 'yearly']),
});

function PlanCard({ plan }) {
  return (
    <Card className="flex flex-col gap-4 hover:border-[#f97316] hover:shadow-md transition-all">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-lg font-bold text-[#1e293b]">{plan.name}</h3>
          <p className="text-sm text-[#64748b] capitalize">{plan.billingCycle} billing</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-extrabold text-[#f97316]">₹{Number(plan.price).toLocaleString('en-IN')}</p>
          <p className="text-xs text-[#94a3b8]">per {plan.billingCycle === 'yearly' ? 'year' : 'month'}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#f8fafc] rounded-lg p-3 text-center border border-[#e2e8f0]">
          <Users size={16} className="text-[#f97316] mx-auto mb-1" />
          <p className="text-lg font-bold text-[#1e293b]">{plan.maxStudents}</p>
          <p className="text-xs text-[#64748b]">Students</p>
        </div>
        <div className="bg-[#f8fafc] rounded-lg p-3 text-center border border-[#e2e8f0]">
          <UserCheck size={16} className="text-[#f97316] mx-auto mb-1" />
          <p className="text-lg font-bold text-[#1e293b]">{plan.maxFaculty}</p>
          <p className="text-xs text-[#64748b]">Faculty</p>
        </div>
        <div className="bg-[#f8fafc] rounded-lg p-3 text-center border border-[#e2e8f0]">
          <BookOpen size={16} className="text-[#f97316] mx-auto mb-1" />
          <p className="text-lg font-bold text-[#1e293b]">{plan.maxClasses}</p>
          <p className="text-xs text-[#64748b]">Classes</p>
        </div>
      </div>

      {/* Feature flags */}
      {plan.features && typeof plan.features === 'object' && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(plan.features).map(([key, val]) => (
            <span key={key} className={`text-xs px-2 py-1 rounded-full font-medium ${val ? 'bg-green-100 text-green-700' : 'bg-[#f1f5f9] text-[#94a3b8] line-through'}`}>
              {key.replace(/([A-Z])/g, ' $1').trim()}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

export default function SAPlans() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ['sa-plans'],
    queryFn: () => getPlans().then((r) => r.data.data),
  });

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { billingCycle: 'yearly' },
  });

  const createMutation = useMutation({
    mutationFn: createPlan,
    onSuccess: () => { qc.invalidateQueries(['sa-plans']); setShowCreate(false); reset(); },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1e293b]">Subscription Plans</h1>
          <p className="text-sm text-[#64748b] mt-1">Define pricing tiers and feature limits</p>
        </div>
        <Button icon={Plus} onClick={() => setShowCreate(true)}>New Plan</Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1,2,3].map((i) => <div key={i} className="h-52 bg-[#e2e8f0] animate-pulse rounded-xl" />)}
        </div>
      ) : plans.length === 0 ? (
        <Card>
          <div className="py-16 text-center">
            <IndianRupee size={40} className="text-[#e2e8f0] mx-auto mb-3" />
            <p className="text-[#64748b] font-medium">No plans yet</p>
            <p className="text-sm text-[#94a3b8] mt-1">Create your first subscription plan to start onboarding schools</p>
            <Button className="mt-4" icon={Plus} onClick={() => setShowCreate(true)}>Create Plan</Button>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((plan) => <PlanCard key={plan.id} plan={plan} />)}
        </div>
      )}

      {/* Create Plan Modal */}
      <Modal open={showCreate} onClose={() => { setShowCreate(false); reset(); }} title="Create Subscription Plan" size="md">
        <form onSubmit={handleSubmit((d) => createMutation.mutate(d))} className="space-y-4">
          <Input label="Plan Name"       name="name"        register={register} error={errors.name}        required placeholder="e.g. Standard" />
          <Input label="Price (₹)"       name="price"       register={register} error={errors.price}       required type="number" placeholder="9999" />

          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-[#374151]">Billing Cycle</label>
            <select {...register('billingCycle')} className="px-3 py-2.5 text-sm border border-[#e2e8f0] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#f97316] bg-white">
              <option value="yearly">Yearly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Input label="Max Students" name="maxStudents" register={register} error={errors.maxStudents} required type="number" placeholder="500" />
            <Input label="Max Faculty"  name="maxFaculty"  register={register} error={errors.maxFaculty}  required type="number" placeholder="30"  />
            <Input label="Max Classes"  name="maxClasses"  register={register} error={errors.maxClasses}  required type="number" placeholder="15"  />
          </div>

          {createMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
              {createMutation.error?.response?.data?.message || 'Failed to create plan.'}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <Button variant="ghost" onClick={() => { setShowCreate(false); reset(); }}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create Plan</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}