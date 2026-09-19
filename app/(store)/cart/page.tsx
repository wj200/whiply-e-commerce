import type { Metadata } from 'next'
import { CartRedirect } from '@/components/store/cart-redirect'

export const metadata: Metadata = {
  title: 'Your bag',
  robots: { index: false, follow: false },
}

/**
 * The bag is a drawer (§3.4), so /cart exists only as a durable URL — a
 * bookmark, a shared link, or a browser that arrives here directly. It opens
 * the drawer and steps aside rather than duplicating it as a second cart
 * surface that could drift from the first.
 */
export default function CartPage() {
  return <CartRedirect />
}
