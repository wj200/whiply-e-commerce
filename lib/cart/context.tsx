'use client'

import * as React from 'react'
import {
  CART_STORAGE_KEY,
  EMPTY_CART,
  addLine,
  itemCount,
  parseStoredCart,
  removeLine,
  replaceWithSingle,
  setLineQty,
  type Cart,
} from './types'

type CartContextValue = {
  cart: Cart
  count: number
  hydrated: boolean
  add: (sku: string, qty: number) => void
  setQty: (sku: string, qty: number) => void
  remove: (sku: string) => void
  buyNow: (sku: string, qty: number) => void
  clear: () => void
}

const CartContext = React.createContext<CartContextValue | null>(null)

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [cart, setCart] = React.useState<Cart>(EMPTY_CART)
  const [hydrated, setHydrated] = React.useState(false)

  // Read once on mount. Server-rendered HTML is identical for everyone, so
  // the cart is applied after hydration rather than during render.
  React.useEffect(() => {
    setCart(parseStoredCart(safeRead()))
    setHydrated(true)
  }, [])

  // Keep other tabs in step.
  React.useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === CART_STORAGE_KEY) setCart(parseStoredCart(e.newValue))
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const persist = React.useCallback((next: Cart) => {
    setCart(next)
    safeWrite(next)
  }, [])

  const value = React.useMemo<CartContextValue>(
    () => ({
      cart,
      count: itemCount(cart),
      hydrated,
      add: (sku, qty) => persist(addLine(cart, sku, qty)),
      setQty: (sku, qty) => persist(setLineQty(cart, sku, qty)),
      remove: (sku) => persist(removeLine(cart, sku)),
      buyNow: (sku, qty) => persist(replaceWithSingle(sku, qty)),
      clear: () => persist(EMPTY_CART),
    }),
    [cart, hydrated, persist],
  )

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const ctx = React.useContext(CartContext)
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>')
  return ctx
}

// localStorage throws in some privacy modes; a cart is never worth a crash.
function safeRead(): string | null {
  try {
    return window.localStorage.getItem(CART_STORAGE_KEY)
  } catch {
    return null
  }
}

function safeWrite(cart: Cart): void {
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart))
  } catch {
    /* ignore — the cart simply will not survive a reload */
  }
}
