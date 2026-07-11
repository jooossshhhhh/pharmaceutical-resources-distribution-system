export default function MiniBarChart({ rows }) {
  const maxValue = Math.max(...rows.map((row) => row.value), 1);

  return (
    <div className="flex h-44 items-end gap-4 px-1 pt-4">
      {rows.map((row) => (
        <div key={row.label} className="flex flex-1 flex-col items-center gap-2">
          <div
            className="w-full max-w-8 rounded-t-sm bg-emerald-600"
            style={{
              height: `${Math.max(16, (row.value / maxValue) * 140)}px`,
              opacity: 0.35 + (row.value / maxValue) * 0.65,
            }}
            title={`${row.label}: ${row.value}`}
          />
          <span className="text-[10px] font-bold uppercase text-slate-500">
            {row.label}
          </span>
        </div>
      ))}
    </div>
  );
}
