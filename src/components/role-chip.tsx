export function RoleChip({ name, color }: { name: string; color: string }) {
  return (
    <span
      className="inline-flex items-center rounded px-1.5 py-0.5 text-[0.65rem] font-medium whitespace-nowrap"
      style={{ backgroundColor: `${color}25`, color }}
    >
      {name}
    </span>
  );
}
