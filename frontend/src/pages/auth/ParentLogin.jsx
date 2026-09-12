import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Mail, KeyRound, Users } from 'lucide-react';
import { parentRequestOtp, parentVerifyOtp } from '../../api/auth.api';
import useAuthStore from '../../store/auth.store';
import Input from '../../components/ui/Input';
import Button from '../../components/ui/Button';

const emailSchema = z.object({ email: z.string().email('Valid email required') });
const otpSchema   = z.object({ otp:   z.string().length(6, 'OTP must be 6 digits') });

export default function ParentLogin() {
  const navigate = useNavigate();
  const setAuth  = useAuthStore((s) => s.setAuth);
  const [step, setStep]   = useState('email');
  const [email, setEmail] = useState('');

  const emailForm = useForm({ resolver: zodResolver(emailSchema) });
  const otpForm   = useForm({ resolver: zodResolver(otpSchema) });

  const requestOtp = useMutation({
    mutationFn: parentRequestOtp,
    onSuccess: (_, vars) => { setEmail(vars.email); setStep('otp'); },
  });

  const verifyOtp = useMutation({
    mutationFn: parentVerifyOtp,
    onSuccess: (res) => {
      setAuth({ ...res.data.data, role: 'parent' });
      navigate('/parent/dashboard');
    },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#1e293b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-[#f97316] rounded-xl flex items-center justify-center shadow-lg">
              <Users size={26} className="text-white" />
            </div>
            <span className="text-3xl font-extrabold text-white">CampusSafar</span>
          </div>
          <p className="text-[#94a3b8] text-sm">Parent Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {step === 'email' ? (
            <>
              <div className="mb-6">
                <h2 className="text-xl font-bold text-[#1e293b]">Parent Login</h2>
                <p className="text-sm text-[#64748b] mt-1">Enter your registered email to receive an OTP</p>
              </div>
              <form onSubmit={emailForm.handleSubmit((d) => requestOtp.mutate(d))} className="space-y-4">
                <Input label="Registered Email" name="email" type="email" placeholder="parent@email.com" register={emailForm.register} error={emailForm.formState.errors.email} icon={Mail} required />

                {requestOtp.isError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                    {requestOtp.error?.response?.data?.message || 'Email not found. Contact your school.'}
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" loading={requestOtp.isPending} className="w-full">
                  Send OTP
                </Button>
              </form>
            </>
          ) : (
            <>
              <div className="mb-6">
                <div className="w-12 h-12 bg-orange-100 rounded-xl flex items-center justify-center mb-4">
                  <KeyRound size={24} className="text-[#f97316]" />
                </div>
                <h2 className="text-xl font-bold text-[#1e293b]">Enter OTP</h2>
                <p className="text-sm text-[#64748b] mt-1">
                  We sent a 6-digit code to <span className="font-semibold text-[#1e293b]">{email}</span>
                </p>
              </div>

              <form onSubmit={otpForm.handleSubmit((d) => verifyOtp.mutate({ email, code: d.otp }))} className="space-y-4">
                <Input label="OTP Code" name="otp" type="text" placeholder="Enter 6-digit OTP" register={otpForm.register} error={otpForm.formState.errors.otp} icon={KeyRound} required />

                {verifyOtp.isError && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
                    {verifyOtp.error?.response?.data?.message || 'Invalid or expired OTP.'}
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" loading={verifyOtp.isPending} className="w-full">
                  Verify & Login
                </Button>

                <button type="button" onClick={() => setStep('email')} className="w-full text-sm text-[#64748b] hover:text-[#1e293b] transition-colors py-2">
                  ← Use different email
                </button>
              </form>
            </>
          )}
        </div>

        <div className="flex justify-center gap-6 mt-6">
          <a href="/login" className="text-sm text-[#94a3b8] hover:text-[#f97316] transition-colors">Admin Login</a>
          <span className="text-[#475569]">·</span>
          <a href="/faculty/login" className="text-sm text-[#94a3b8] hover:text-[#f97316] transition-colors">Faculty Login</a>
        </div>
      </div>
    </div>
  );
}