import { CartProvider } from '@/lib/cart/context'
import { BagProvider } from '@/components/store/bag-context'
import { BagDrawer } from '@/components/store/bag-drawer'
import { Header } from '@/components/store/header'
import { Footer } from '@/components/store/footer'
import { AnnouncementBar } from '@/components/store/announcement-bar'
import { getPricingSettings } from '@/lib/domain/settings'

export default async function StoreLayout({ children }: { children: React.ReactNode }) {
  const settings = await getPricingSettings()

  return (
    <CartProvider>
      <BagProvider>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:bg-ink focus:px-4 focus:py-2 focus:text-paper"
        >
          Skip to content
        </a>
        <AnnouncementBar freeDeliveryThresholdCents={settings.freeDeliveryThresholdCents} />
        <Header />
        <main id="main">{children}</main>
        <Footer />
        <BagDrawer />
      </BagProvider>
    </CartProvider>
  )
}
