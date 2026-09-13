import { BookOpen } from 'lucide-react';

export default function FacultyLogin() {
  const handleGoogle = () => {
    window.location.href = `${import.meta.env.VITE_API_URL}/auth/faculty/google`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#1e293b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-2">
            <div className="w-12 h-12 bg-[#f97316] rounded-xl flex items-center justify-center shadow-lg">
              <BookOpen size={26} className="text-white" />
            </div>
            <span className="text-3xl font-extrabold text-white">CampusSafar</span>
          </div>
          <p className="text-[#94a3b8] text-sm">Faculty Portal</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <div className="mb-8 text-center">
            <h2 className="text-xl font-bold text-[#1e293b]">Faculty Login</h2>
            <p className="text-sm text-[#64748b] mt-1">Sign in to mark attendance & enter marks</p>
          </div>

          <button
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-[#e2e8f0] rounded-xl px-4 py-3.5 text-sm font-semibold text-[#1e293b] hover:bg-[#f8fafc] hover:border-[#cbd5e1] hover:shadow-md transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 18 18">
              <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z"/>
              <path fill="#FBBC05" d="M3.964 10.707c-.18-.54-.282-1.117-.282-1.707s.102-1.167.282-1.707V4.961H.957C.347 6.175 0 7.55 0 9s.348 2.825.957 4.039l3.007-2.332z"/>
              <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.961L3.964 7.293C4.672 5.166 6.656 3.58 9 3.58z"/>
            </svg>
            Continue with Google
          </button>

          <p className="text-center text-xs text-[#94a3b8] mt-6">
            Use your school-registered Google account to sign in.
          </p>
        </div>

        <div className="flex justify-center gap-6 mt-6">
          <a href="/login" className="text-sm text-[#94a3b8] hover:text-[#f97316] transition-colors">Admin Login</a>
          <span className="text-[#475569]">·</span>
          <a href="/parent/login" className="text-sm text-[#94a3b8] hover:text-[#f97316] transition-colors">Parent Login</a>
        </div>
      </div>
    </div>
  );
}