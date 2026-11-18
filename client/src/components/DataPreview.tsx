/**
 * Renders task data the way a person reads it: a dataset as a table, and the remaining
 * fields as labelled details. Machine-only fields (grading checks) are left out, so nothing
 * the candidate never needs to read appears as code.
 */

const MACHINE_FIELDS = new Set(["checks"]);

function humanize(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function isEmpty(value: unknown): boolean {
  if (value === null || value === undefined || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return visibleEntries(value as Record<string, unknown>).length === 0;
  return false;
}

function visibleEntries(value: Record<string, unknown>) {
  return Object.entries(value).filter(([key, entry]) => !MACHINE_FIELDS.has(key) && !isEmpty(entry));
}

function Value({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    return (
      <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
        {value.map((item, index) => (
          <li key={index}>
            {typeof item === "object" && item !== null ? (
              <Fields value={item as Record<string, unknown>} />
            ) : (
              <span className="whitespace-pre-line">{String(item)}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }

  if (typeof value === "object" && value !== null) {
    return <Fields value={value as Record<string, unknown>} />;
  }

  const text = String(value);
  return text.length > 80 || text.includes("\n") ? (
    <p className="whitespace-pre-line text-sm text-slate-700">{text}</p>
  ) : (
    <span className="text-sm text-slate-700">{text}</span>
  );
}

function Fields({ value }: { value: Record<string, unknown> }) {
  const entries = visibleEntries(value);
  if (entries.length === 0) return null;
  return (
    <dl className="space-y-2">
      {entries.map(([key, entry]) => (
        <div key={key} className="sm:flex sm:gap-4">
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-500 sm:w-36 sm:shrink-0 sm:pt-0.5">
            {humanize(key)}
          </dt>
          <dd className="mt-0.5 min-w-0 sm:mt-0">
            <Value value={entry} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function DataPreview({ data }: { data: Record<string, unknown> }) {
  const table = data.table as { columns?: unknown; rows?: unknown } | undefined;
  const columns = Array.isArray(table?.columns) ? table.columns.map(String) : null;
  const rows = Array.isArray(table?.rows) ? (table.rows as Record<string, unknown>[]) : null;
  const hasTable = Boolean(columns && rows && rows.length > 0);
  const details = Object.fromEntries(Object.entries(data).filter(([key]) => key !== "table"));
  const hasDetails = visibleEntries(details).length > 0;

  if (!hasTable && !hasDetails) {
    return <p className="text-sm text-slate-600">This task uses no extra data.</p>;
  }

  return (
    <div className="space-y-3">
      {hasTable && columns && rows && (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" className="whitespace-nowrap px-3 py-2">
                    {humanize(column)}
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
      )}
      {hasDetails && (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <Fields value={details} />
        </div>
      )}
    </div>
  );
}
