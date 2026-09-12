import { Menu, Bell } from 'lucide-react';

// Sticky top bar for mobile — shows the page title, a hamburger to open the
// sidebar drawer (see Sidebar.jsx's `open`/`onClose` props), and a slot for
// right-side actions (notifications, avatar, etc).
export default function Topbar({ title, onMenuClick, notificationCount = 0, rightSlot }) {
  return (
    <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-[#e2e8f0] lg:hidden sticky top-0 z-20">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="p-2 -ml-2 rounded-lg text-[#1e293b] hover:bg-[#f1f5f9] transition-colors"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        {title && <h1 className="text-base font-bold text-[#1e293b] truncate">{title}</h1>}
      </div>

      <div className="flex items-center gap-3">
        {rightSlot}
        {notificationCount > 0 && (
          <button className="relative p-2 rounded-lg text-[#64748b] hover:bg-[#f1f5f9] transition-colors">
            <Bell size={18} />
            <span className="absolute top-1 right-1 w-2 h-2 bg-[#f97316] rounded-full" />
          </button>
        )}
      </div>
    </header>
  );
}