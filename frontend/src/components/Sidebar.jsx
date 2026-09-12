import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';

// Generic sidebar used by any role layout. Pass navItems + branding, it renders
// the exact same look as your SchoolAdmin/Faculty/Parent/SuperAdmin sidebars.
export default function Sidebar({
  brandLabel = 'CampusSafar',
  portalLabel,
  brandIcon: BrandIcon,
  navItems = [],
  user,
  onLogout,
  open = true,
  onClose,
}) {
  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/40 z-30 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed lg:static inset-y-0 left-0 z-40 w-64 bg-[#1e293b] flex flex-col shrink-0 transform transition-transform duration-200 lg:translate-x-0
          ${open ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="px-6 py-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            {BrandIcon && (
              <div className="w-9 h-9 bg-[#f97316] rounded-lg flex items-center justify-center shrink-0">
                <BrandIcon size={20} className="text-white" />
              </div>
            )}
            <div>
              <p className="text-white font-bold text-sm leading-none">{brandLabel}</p>
              {portalLabel && <p className="text-[#94a3b8] text-xs mt-0.5">{portalLabel}</p>}
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${isActive
                  ? 'bg-[#f97316] text-white'
                  : 'text-[#94a3b8] hover:bg-white/10 hover:text-white'}`
              }
            >
              {Icon && <Icon size={18} />}
              {label}
            </NavLink>
          ))}
        </nav>

        {(user || onLogout) && (
          <div className="px-3 py-4 border-t border-white/10">
            {user && (
              <div className="px-3 py-2 mb-2">
                <p className="text-white text-sm font-medium truncate">{user.name}</p>
                <p className="text-[#64748b] text-xs truncate">{user.email}</p>
              </div>
            )}
            {onLogout && (
              <button
                onClick={onLogout}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium text-[#94a3b8] hover:bg-red-500/10 hover:text-red-400 transition-all"
              >
                <LogOut size={18} />
                Sign Out
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}