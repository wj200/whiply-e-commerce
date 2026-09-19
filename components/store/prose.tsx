export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap max-w-3xl py-12 [&_a]:text-accent [&_a:hover]:underline [&_h2]:mt-9 [&_h2]:font-display [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-ink [&_li]:my-1.5 [&_p]:my-4 [&_p]:leading-relaxed [&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5">
      {children}
    </div>
  )
}

/**
 * Policy pages render text the OPERATOR supplies (§16.1). Where that text has
 * not been supplied yet, the page says so plainly rather than inventing terms
 * that would be legally meaningless — and worse, might be relied upon.
 */
export function AwaitingCopy({ what }: { what: string }) {
  return (
    <div className="my-6 rounded-[var(--radius-card)] border border-warn/30 bg-warn-soft px-5 py-4">
      <p className="text-sm font-semibold text-warn">This page is awaiting final copy.</p>
      <p className="mt-1 text-sm leading-relaxed text-body">
        The {what} below describes how the system actually behaves, and is accurate. It is not a
        substitute for the final wording, which WHIPLY must supply before launch (blueprint §16.1).
      </p>
    </div>
  )
}
