import '../globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: { default: 'WHIPLY Admin', template: '%s · WHIPLY Admin' },
  robots: { index: false, follow: false },
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper">{children}</div>
}
