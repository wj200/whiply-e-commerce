export function PageHeader({ eyebrow, title, blurb }: { eyebrow?: string; title: string; blurb?: string }) {
  return (
    <div className="wrap border-b border-line pb-10 pt-12 lg:pt-16">
      {eyebrow ? <p className="mono text-faint">{eyebrow}</p> : null}
      <h1 className="display-sm mt-5 max-w-3xl text-[clamp(1.9rem,4.2vw,3rem)]">{title}</h1>
      {blurb ? <p className="mt-5 max-w-xl text-[1rem] leading-relaxed text-muted">{blurb}</p> : null}
    </div>
  )
}

export function Prose({ children }: { children: React.ReactNode }) {
  return (
    <div className="wrap max-w-3xl py-14 text-[1rem] leading-relaxed text-body [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-4 [&_code]:font-mono [&_code]:text-[0.9em] [&_h2]:mt-11 [&_h2]:text-[1.25rem] [&_h2]:font-semibold [&_h2]:tracking-[-0.02em] [&_h2]:text-ink [&_li]:my-2 [&_p]:my-5 [&_strong]:font-medium [&_strong]:text-ink [&_ul]:my-5 [&_ul]:list-disc [&_ul]:pl-5">
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
    <div className="my-8 border-l-2 border-line-strong bg-veil px-5 py-4">
      <p className="mono text-muted">Awaiting final copy</p>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-body">
        The {what} below describes how the system actually behaves, and is accurate. It is not a
        substitute for the final wording, which WHIPLY must supply before launch (§16.1).
      </p>
    </div>
  )
}
