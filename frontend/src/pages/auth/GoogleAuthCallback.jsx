import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe } from '../../api/auth.api';
import useAuthStore from '../../store/auth.store';

const ROLE_REDIRECTS = {
  admin: '/admin/dashboard',
  faculty: '/faculty/dashboard',
  parent: '/parent/dashboard',
  superadmin: '/superadmin/dashboard',
};

// This page is the frontend landing after any Google OAuth callback.
// Backend sets the cookie and redirects here; we call /auth/me to
// hydrate the Zustand store, then send the user to their dashboard.
export default function GoogleAuthCallback() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    getMe()
      .then((res) => {
        const user = res.data.data;
        setAuth(user);
        const dest = ROLE_REDIRECTS[user.role] || '/login';
        navigate(dest, { replace: true });
      })
      .catch(() => {
        navigate('/login?error=google_failed', { replace: true });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#1e293b] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#f97316] border-t-transparent rounded-full animate-spin" />
        <p className="text-white text-sm font-medium">Signing you in...</p>
      </div>
    </div>
  );
}