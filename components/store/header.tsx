'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { Wordmark } from './wordmark'
import { useCart } from '@/lib/cart/context'
import { useBag } from './bag-context'
import { cn } from '@/lib/utils/cn'

const NAV = [
  { href: '/shop', label: 'Shop all' },
  { href: '/baking-equipment', label: 'Equipment' },
  { href: '/cream-chargers', label: 'Cream chargers' },
  { href: '/policies/delivery', label: 'Delivery' },
  { href: '/bulk-orders', label: 'Bulk orders' },
]

export function Header() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const { count, hydrated } = useCart()
  const { openBag } = useBag()

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/92 backdrop-blur-md">
      <div className="wrap flex h-[4.5rem] items-center justify-between gap-6">
        <Wordmark />

        <nav aria-label="Main" className="hidden items-center gap-9 lg:flex">
          {NAV.map((item) => {
            const active = pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'text-[0.9375rem] transition-colors',
                  active ? 'text-ink' : 'text-body hover:text-ink',
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-4">
          <span className="mono-sm hidden text-faint md:inline">SG / SGD</span>

          <button
            type="button"
            onClick={openBag}
            className="group flex items-center gap-2.5 text-ink"
            aria-label={`Open bag, ${hydrated ? count : 0} item${count === 1 ? '' : 's'}`}
          >
            <BagIcon />
            <span className="hidden text-[0.9375rem] sm:inline">Bag</span>
            <span className="flex h-6 min-w-6 items-center justify-center rounded-chip bg-frame px-1.5 text-[0.75rem] font-medium text-ink transition-colors group-hover:bg-ink group-hover:text-paper figure">
              {hydrated ? count : 0}
            </span>
          </button>

          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? 'Close menu' : 'Open menu'}
            onClick={() => setOpen((v) => !v)}
            className="-mr-1 p-1.5 text-ink lg:hidden"
          >
            <MenuIcon open={open} />
          </button>
        </div>
      </div>

      {open ? (
        <nav id="mobile-nav" aria-label="Main (mobile)" className="border-t border-line lg:hidden">
          <ul className="wrap flex flex-col py-2">
            {NAV.map((item) => (
              <li key={item.href} className="border-b border-line last:border-0">
                <Link href={item.href} className="block py-4 text-[1.0625rem] text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  )
}

function BagIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M3.4 6.5h13.2l-.9 10.2a1.4 1.4 0 0 1-1.4 1.3H5.7a1.4 1.4 0 0 1-1.4-1.3L3.4 6.5Z"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path d="M7.2 8.6V5.4a2.8 2.8 0 0 1 5.6 0v3.2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      {open ? (
        <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <path d="M3 8h18M3 16h18" stroke="currentColor" strokeWidth="1.5" />
      )}
    </svg>
  )
}
