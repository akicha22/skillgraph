import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

/** The share of each skill's marks that this attempt earned, as a percentage. */
export default function SkillChart({ rows }: { rows: { name: string; percent: number }[] }) {
  if (rows.length === 0) return null;

  return (
    <figure className="min-w-0">
      <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 8, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-slate-200)" />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} unit="%" />
          <Tooltip formatter={(value) => `${value}%`} cursor={{ fill: "var(--color-brand-50)" }} contentStyle={{ borderRadius: "var(--radius-control)", borderColor: "var(--color-slate-200)", boxShadow: "var(--shadow-raised)" }} />
          <Bar dataKey="percent" name="Marks awarded" fill="var(--color-brand-600)" radius={[6, 6, 0, 0]} maxBarSize={48} isAnimationActive={false}>
            {rows.map((row, index) => <Cell key={row.name} fill={index % 2 === 0 ? "var(--color-brand-600)" : "var(--color-accent-600)"} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-sm text-slate-600 tabular-nums wrap-break-word">
        Marks awarded by skill: {rows.map(({ name, percent }) => `${name} ${percent}%`).join(" · ")}.
      </figcaption>
    </figure>
  );
}
