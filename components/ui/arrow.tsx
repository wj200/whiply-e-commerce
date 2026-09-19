/** The ↗ motif. Repeated on buttons, cards and links throughout. */
export function ArrowUpRight({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M3.5 10.5L10.5 3.5M10.5 3.5H4.9M10.5 3.5V9.1"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="square"
      />
    </svg>
  )
}

/** Circular outlined arrow button used on image cards. */
export function ArrowDisc({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-10 w-10 items-center justify-center rounded-full border border-ink/25 bg-pure/70 text-ink backdrop-blur-sm transition-colors group-hover:border-ink group-hover:bg-ink group-hover:text-pure ${className ?? ''}`}
    >
      <ArrowUpRight size={15} />
    </span>
  )
}
