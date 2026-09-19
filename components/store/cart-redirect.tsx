'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { useBag } from './bag-context'

export function CartRedirect() {
  const { openBag } = useBag()

  useEffect(() => {
    openBag()
  }, [openBag])

  return (
    <div className="wrap py-28 text-center">
      <p className="mono text-faint">Your next possibility</p>
      <h1 className="display-sm mt-5 text-[2rem]">The bag is open.</h1>
      <p className="mt-4 text-muted">
        If it did not open,{' '}
        <button type="button" onClick={openBag} className="text-ink underline underline-offset-4">
          open it here
        </button>
        .
      </p>
      <p className="mt-8">
        <Link href="/shop" className="mono text-faint underline underline-offset-4 hover:text-ink">
          Continue shopping
        </Link>
      </p>
    </div>
  )
}
