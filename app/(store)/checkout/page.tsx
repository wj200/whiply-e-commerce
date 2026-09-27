import type { Metadata } from 'next'
import { CheckoutView } from '@/components/store/checkout-view'

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
}

export default async function CheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>
}) {
  // The bag drawer carries an applied code across in the URL rather than in
  // shared state, so a customer who lands here from a link with a code gets
  // the same validation path as one who typed it — the server decides.
  const { code } = await searchParams
  return <CheckoutView initialCode={code ?? null} />
}
