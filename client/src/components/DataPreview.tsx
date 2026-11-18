/** Renders task data: template datasets as a table, anything else as JSON. */
export default function DataPreview({ data }: { data: Record<string, unknown> }) {
  const table = data.table as { columns?: unknown; rows?: unknown } | undefined;
  const columns = Array.isArray(table?.columns) ? table.columns.map(String) : null;
  const rows = Array.isArray(table?.rows) ? (table.rows as Record<string, unknown>[]) : null;

  if (columns && rows && rows.length > 0) {
    return (
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column} scope="col" className="whitespace-nowrap px-3 py-2">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column} className="whitespace-nowrap px-3 py-2 text-slate-700">
                    {String(row[column] ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}
