'use client'

import { useCart } from '@/lib/cart/context'

/** The badge on the header cart icon. Reads the browser-held cart (§5.1). */
export function CartCount() {
  const { count, hydrated } = useCart()
  if (!hydrated || count === 0) return null
  return (
    <span
      className="absolute -right-1.5 -top-1.5 flex h-[1.1rem] min-w-[1.1rem] items-center justify-center rounded-full bg-accent px-1 text-[0.65rem] font-bold text-white tnum"
      aria-hidden="true"
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}
