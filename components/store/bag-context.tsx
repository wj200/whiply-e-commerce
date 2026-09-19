'use client'

import * as React from 'react'

type BagContextValue = {
  isOpen: boolean
  openBag: () => void
  closeBag: () => void
}

const BagContext = React.createContext<BagContextValue | null>(null)

export function BagProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setOpen] = React.useState(false)

  const closeBag = React.useCallback(() => setOpen(false), [])
  const openBag = React.useCallback(() => setOpen(true), [])

  // Escape closes; body scroll locks while the panel is open.
  React.useEffect(() => {
    if (!isOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeBag()
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', onKey)
    }
  }, [isOpen, closeBag])

  const value = React.useMemo(() => ({ isOpen, openBag, closeBag }), [isOpen, openBag, closeBag])
  return <BagContext.Provider value={value}>{children}</BagContext.Provider>
}

export function useBag(): BagContextValue {
  const ctx = React.useContext(BagContext)
  if (!ctx) throw new Error('useBag must be used inside <BagProvider>')
  return ctx
}
