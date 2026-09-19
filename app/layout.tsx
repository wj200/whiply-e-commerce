import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'WHIPLY — Professional Baking Supplies, Singapore',
    template: '%s · WHIPLY',
  },
  description:
    'Food-grade N₂O cream chargers and professional baking equipment, delivered across Singapore.',
  openGraph: {
    siteName: 'WHIPLY',
    locale: 'en_SG',
    type: 'website',
  },
  robots: { index: true, follow: true },
}

export const viewport: Viewport = {
  themeColor: '#ffffff',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-SG">
      <body>{children}</body>
    </html>
  )
}
