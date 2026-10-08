import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/admin/reception/dashboard',  label: 'Dashboard' },
  { to: '/admin/reception/enquiries',  label: 'Enquiries' },
  { to: '/admin/reception/follow-ups', label: 'Follow-ups' },
  { to: '/admin/reception/visitors',   label: 'Visitors' },
  { to: '/admin/reception/fields',     label: 'Form Fields' },
  { to: '/admin/reception/staff',      label: 'Reception Staff' },
];

export default function ReceptionShell() {
  return (
    <div className="space-y-5">
      <div className="flex gap-1 overflow-x-auto border-b border-[#e2e8f0]">
        {tabs.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              `px-4 py-2.5 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                isActive ? 'border-[#f97316] text-[#f97316]' : 'border-transparent text-[#64748b] hover:text-[#1e293b]'
              }`
            }
          >
            {t.label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}