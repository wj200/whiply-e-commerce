import type { Metadata } from 'next'
import Link from 'next/link'
import { Prose, PageHeader } from '@/components/store/prose'
import { ButtonLink } from '@/components/ui/button'

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with WHIPLY.',
}

export default function ContactPage() {
  return (
    <>
      <PageHeader
        eyebrow="Good to know"
        title="Get in touch."
        blurb="Questions about an order, a product, or trade volume."
      />
      <Prose>
        <h2>Bulk and trade orders</h2>
        <p>
          If you are ordering for a kitchen, the fastest route is the bulk order enquiry — leave
          your name, number and email and we will contact you.
        </p>
        <p>
          <ButtonLink href="/bulk-orders" arrow className="mt-2 sm:min-w-[16rem]">
            Bulk order enquiry
          </ButtonLink>
        </p>

        <h2>An existing order</h2>
        <p>
          Quote your order reference — it begins <code>WHP-</code> and appears on your confirmation
          page after payment. Keep it: because WHIPLY does not use customer accounts, the reference
          is how we find your order.
        </p>

        <h2>Contact details</h2>
        <p>
          Contact email and phone number are to be supplied by WHIPLY before launch (§16.1). Until
          then, the <Link href="/bulk-orders">enquiry form</Link> reaches us directly.
        </p>
      </Prose>
    </>
  )
}
