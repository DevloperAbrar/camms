import { NavLink, Outlet } from 'react-router-dom';

const tabs = [
  { to: '/admin/fees/dashboard', label: 'Dashboard' },
  { to: '/admin/fees/collect',   label: 'Collect Fees' },
  { to: '/admin/fees/receipts',  label: 'Receipts' },
  { to: '/admin/fees/dues',      label: 'Due / Remaining' },
  { to: '/admin/fees/analytics', label: 'Analytics' },
  { to: '/admin/fees/setup',     label: 'Fee Setup' },
  { to: '/admin/fees/settings',  label: 'Receipt Settings' },
  { to: '/admin/fees/staff',     label: 'Fee Collectors' },
];

export default function FeeShell() {
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