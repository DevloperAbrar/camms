import Spinner from './Spinner';

export default function Button({
  children, onClick, type = 'button', variant = 'primary',
  size = 'md', loading = false, disabled = false, className = '', icon: Icon,
}) {
  const base = 'inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';

  const variants = {
    primary:   'bg-[#f97316] hover:bg-[#ea6c0a] text-white focus:ring-[#f97316]',
    secondary: 'bg-[#1e293b] hover:bg-[#0f172a] text-white focus:ring-[#1e293b]',
    outline:   'border-2 border-[#1e293b] text-[#1e293b] hover:bg-[#1e293b] hover:text-white focus:ring-[#1e293b]',
    ghost:     'text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e293b] focus:ring-[#e2e8f0]',
    danger:    'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
  };

  const sizes = {
    sm: 'text-xs px-3 py-1.5',
    md: 'text-sm px-4 py-2',
    lg: 'text-base px-6 py-3',
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {loading ? <Spinner size="sm" /> : Icon && <Icon size={16} />}
      {children}
    </button>
  );
}