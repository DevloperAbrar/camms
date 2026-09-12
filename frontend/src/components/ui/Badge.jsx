export default function Badge({ label, variant = 'default' }) {
    const variants = {
      default:  'bg-[#f1f5f9] text-[#475569]',
      success:  'bg-green-100 text-green-700',
      warning:  'bg-amber-100 text-amber-700',
      danger:   'bg-red-100 text-red-700',
      info:     'bg-blue-100 text-blue-700',
      orange:   'bg-orange-100 text-orange-700',
      navy:     'bg-[#1e293b] text-white',
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${variants[variant]}`}>
        {label}
      </span>
    );
  }