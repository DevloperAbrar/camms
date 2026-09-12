import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Lock, Mail, ShieldCheck } from 'lucide-react';
import { superadminLogin } from '../../api/auth.api';
import useAuthStore from '../../store/auth.store';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const schema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});

export default function SuperAdminLogin() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  const mutation = useMutation({
    mutationFn: superadminLogin,
    onSuccess: (res) => {
      setAuth(res.data.data);
      navigate('/superadmin/dashboard');
    },
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-[#1e293b] rounded-2xl mb-4 shadow-lg">
            <ShieldCheck size={32} className="text-[#f97316]" />
          </div>
          <h1 className="text-2xl font-bold text-[#1e293b]">CampusSafar</h1>
          <p className="text-sm text-[#64748b] mt-1">Super Admin Portal</p>
        </div>

        <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#1e293b]">Welcome back</h2>
            <p className="text-sm text-[#64748b] mt-1">Sign in to manage all schools on the platform</p>
          </div>

          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <Input label="Email Address" name="email" type="email" placeholder="admin@campussafar.com" register={register} error={errors.email} icon={Mail} required />
            <Input label="Password" name="password" type="password" placeholder="Enter your password" register={register} error={errors.password} icon={Lock} required />

            {mutation.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                {mutation.error?.response?.data?.message || 'Invalid credentials'}
              </div>
            )}

            <Button type="submit" variant="secondary" size="lg" loading={mutation.isPending} className="w-full mt-2">
              Sign In
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-[#94a3b8] mt-6">
          School login? <a href="/login" className="text-[#f97316] hover:underline font-medium">Go here</a>
        </p>
      </div>
    </div>
  );
}