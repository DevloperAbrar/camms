export default function Card({ children, className = '', padding = true }) {
  return (
    <div className={`bg-white rounded-xl border border-[#e2e8f0] shadow-sm ${padding ? 'p-4 sm:p-6' : ''} ${className}`}>
      {children}
    </div>
  );
}