export default function Input({
    label, name, type = 'text', placeholder, register, error,
    required, className = '', icon: Icon,
  }) {
    return (
      <div className={`flex flex-col gap-1 ${className}`}>
        {label && (
          <label htmlFor={name} className="text-sm font-medium text-[#374151]">
            {label} {required && <span className="text-red-500">*</span>}
          </label>
        )}
        <div className="relative">
          {Icon && (
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-[#94a3b8]">
              <Icon size={16} />
            </div>
          )}
          <input
            id={name}
            type={type}
            placeholder={placeholder}
            {...(register ? register(name) : {})}
            className={`w-full rounded-lg border bg-white px-4 py-2.5 text-sm text-[#1e293b] placeholder-[#94a3b8] transition-all
              focus:outline-none focus:ring-2 focus:ring-[#f97316] focus:border-transparent
              ${Icon ? 'pl-10' : ''}
              ${error ? 'border-red-400 focus:ring-red-400' : 'border-[#e2e8f0] hover:border-[#cbd5e1]'}`}
          />
        </div>
        {error && <p className="text-xs text-red-500">{error.message || error}</p>}
      </div>
    );
  }