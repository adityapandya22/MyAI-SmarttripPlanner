export default function LegChip({ active, color, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border bg-white/95 px-3 py-1.5 text-[11.5px] font-bold shadow-sm backdrop-blur transition ${
        active ? 'text-ink-900' : 'border-ink-200 text-ink-500 hover:text-ink-800'
      }`}
      style={active ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : {}}
    >
      {children}
    </button>
  )
}
