import { GraduationCap } from 'lucide-react';

// Shared shell for any auth/login page — the exact gradient background, logo
// header, white card, and cross-portal footer links your login pages already
// use, extracted so new auth pages don't have to repeat the markup.
export default function AuthLayout({
  title,
  subtitle,
  children,
  footerLinks = [
    { to: '/login', label: 'School Admin' },
    { to: '/faculty/login', label: 'Faculty Login' },
    { to: '/parent/login', label: 'Parent Login' },
    { to: '/superadmin/login', label: 'Super Admin' },
  ],
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#1e293b] via-[#0f172a] to-[#1e293b] flex items-center justify-center p-4">
      <div className="w-full max-w-md">
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
          {(title || subtitle) && (
            <div className="mb-6">
              {title && <h2 className="text-xl font-bold text-[#1e293b]">{title}</h2>}
              {subtitle && <p className="text-sm text-[#64748b] mt-1">{subtitle}</p>}
            </div>
          )}
          {children}
        </div>

        {footerLinks.length > 0 && (
          <div className="flex justify-center flex-wrap gap-x-6 gap-y-2 mt-6">
            {footerLinks.map((l, i) => (
              <span key={l.to} className="flex items-center gap-6">
                <a href={l.to} className="text-sm text-[#94a3b8] hover:text-[#f97316] transition-colors">{l.label}</a>
                {i < footerLinks.length - 1 && <span className="text-[#475569]">·</span>}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}