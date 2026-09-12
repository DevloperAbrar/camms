import Spinner from './Spinner';

export default function Table({ columns, data, loading, emptyMessage = 'No data found.' }) {
  return (
    <div className="w-full overflow-x-auto rounded-xl border border-[#e2e8f0]">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
            {columns.map((col) => (
              <th key={col.key} className="px-4 py-3 text-left text-xs font-semibold text-[#64748b] uppercase tracking-wider whitespace-nowrap">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={columns.length} className="py-16 text-center">
                <div className="flex justify-center"><Spinner /></div>
              </td>
            </tr>
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="py-16 text-center text-[#94a3b8]">{emptyMessage}</td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={row.id || i} className="border-b border-[#f1f5f9] hover:bg-[#f8fafc] transition-colors">
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-[#374151] whitespace-nowrap">
                    {col.render ? col.render(row) : row[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}