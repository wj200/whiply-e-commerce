export function PageHeader({ title, blurb }: { title: string; blurb?: string }) {
  return (
    <div className="border-b border-line bg-shell">
      <div className="wrap py-10 md:py-14">
        <h1 className="font-display text-4xl font-bold tracking-tight text-ink md:text-5xl">
          {title}
        </h1>
        {blurb ? <p className="mt-3 max-w-2xl text-[1.05rem] leading-relaxed text-muted">{blurb}</p> : null}
      </div>
    </div>
  )
}
