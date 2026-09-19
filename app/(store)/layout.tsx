import { CartProvider } from '@/lib/cart/context'
import { Header } from '@/components/store/header'
import { Footer } from '@/components/store/footer'
import { getPricingSettings } from '@/lib/domain/settings'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPricingSettings()

  return (
    <CartProvider>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>
      <Header />
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <Footer
        deliveryFeeCents={settings.deliveryFeeCents}
        freeDeliveryThresholdCents={settings.freeDeliveryThresholdCents}
      />
    </CartProvider>
  )
}
