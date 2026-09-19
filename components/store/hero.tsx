import Image from 'next/image'
import { ButtonLink } from '@/components/ui/button'
import { ArrowDisc } from '@/components/ui/arrow'

export function Hero() {
  return (
    <section className="wrap grid items-stretch gap-10 py-10 lg:grid-cols-2 lg:gap-14 lg:py-14">
      <div className="flex flex-col justify-center lg:py-6">
        <p className="mono flex items-center gap-2.5 text-ink">
          <span className="inline-block h-1.5 w-1.5 bg-ink" aria-hidden="true" />
          Precision meets possibility
        </p>

        <h1 className="display mt-8 text-[clamp(3rem,7.4vw,5.6rem)]">
          Serious tools.
          <br />
          Delightful
          <br />
          <span className="display-echo">possibilities.</span>
        </h1>

        <p className="mt-8 max-w-[34rem] text-[1.0625rem] leading-relaxed text-body">
          For the perfect peak. The precise gram. The next big batch.
          <br className="hidden sm:block" /> Thoughtfully selected essentials for kitchens that
          create.
        </p>

        <div className="mt-10">
          <ButtonLink href="/shop" size="lg" arrow className="w-full sm:w-auto sm:min-w-[17rem]">
            Equip your kitchen
          </ButtonLink>
        </div>
      </div>

      <div className="group relative min-h-[26rem] overflow-hidden bg-frame lg:min-h-[46rem]">
        <Image
          src="/images/hero.svg"
          alt="A whipped cream peak piped onto a warm neutral surface"
          fill
          sizes="(max-width: 1024px) 100vw, 50vw"
          className="object-cover"
          priority
        />

        <div className="absolute inset-x-0 top-0 flex items-start justify-between p-7">
          <p className="mono text-ink/70">The art of a little air.</p>
          <span className="text-ink/50" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M8 1v14M1 8h14" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </span>
        </div>

        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-7">
          <div>
            <p className="mono text-ink/70">WHIPLY cream chargers</p>
            <p className="display-sm mt-2.5 text-[1.75rem]">Extraordinary, by the gram.</p>
            <p className="mono-sm mt-3 text-ink/50">Fig. 01 — Aerated excellence</p>
          </div>
          <ArrowDisc className="shrink-0" />
        </div>
      </div>
    </section>
  )
}
