import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Lock, Mail, GraduationCap, Users } from 'lucide-react';
import { schoolPasswordLogin } from '../../api/auth.api';
import useAuthStore from '../../store/auth.store';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const schema = z.object({
  email: z.string().email('Valid email required'),
  password: z.string().min(1, 'Password required'),
});

const URL_ERRORS = {
  google_failed: 'Google sign-in failed. Make sure this email is registered with your school.',
  no_children: 'No student is linked to this email as parent email. Please contact your school.',
};

export default function AdminLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });
  const urlError = URL_ERRORS[params.get('error')];

  const mutation = useMutation({
    mutationFn: schoolPasswordLogin,
    onSuccess: (res) => {
      const user = res.data.data;
      setAuth(user);
      navigate(user.role === 'fee_collector' ? '/fees/dashboard' : '/admin/dashboard');
    },
  });

  const handleGoogle = (asParent = false) => {
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/school/google${asParent ? '?as=parent' : ''}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#1e293b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-[#f97316] rounded-xl flex items-center justify-center shadow-lg">
              <GraduationCap size={28} className="text-white" />
            </div>
            <span className="text-3xl font-extrabold text-white">CampusSafar</span>
          </div>
          <p className="text-[#94a3b8] text-sm">Attendance & Marks Management System</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#1e293b]">School Login</h2>
            <p className="text-sm text-[#64748b] mt-1">Sign in to manage your school</p>
          </div>

          {urlError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600 mb-4">{urlError}</div>
          )}

          {/* Google Button */}
          <button
            onClick={() => handleGoogle(false)}
            className="w-full flex items-center justify-center gap-3 border-2 border-[#e2e8f0] rounded-lg px-4 py-2.5 text-sm font-semibold text-[#1e293b] hover:bg-[#f8fafc] hover:border-[#cbd5e1] transition-all mb-3"
          >
            <svg width="18" height="18" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>

          <button
            onClick={() => handleGoogle(true)}
            className="w-full flex items-center justify-center gap-3 border-2 border-orange-200 bg-orange-50 rounded-lg px-4 py-2.5 text-sm font-semibold text-[#f97316] hover:bg-orange-100 transition-all mb-5"
          >
            <Users size={18} />
            Continue as Parent
          </button>

          <div className="flex items-center gap-3 mb-5">
            <div className="flex-1 h-px bg-[#e2e8f0]" />
            <span className="text-xs text-[#94a3b8] font-medium">or use password</span>
            <div className="flex-1 h-px bg-[#e2e8f0]" />
          </div>

          <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
            <Input label="Email Address" name="email" type="email" placeholder="admin@school.com" register={register} error={errors.email} icon={Mail} required />
            <Input label="Password" name="password" type="password" placeholder="Enter your password" register={register} error={errors.password} icon={Lock} required />

            {mutation.isError && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                {mutation.error?.response?.data?.message || 'Invalid credentials. Please try again.'}
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" loading={mutation.isPending} className="w-full">
              Sign In
            </Button>
          </form>
        </div>

        <div className="flex justify-center gap-6 mt-6">
          <a href="/superadmin/login" className="text-sm text-[#94a3b8] hover:text-[#f97316] transition-colors">Super Admin</a>
        </div>
      </div>
    </div>
  );
}