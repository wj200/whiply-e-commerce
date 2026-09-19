import type { Metadata } from 'next'
import { Prose, AwaitingCopy } from '@/components/store/prose'
import { PageHeader } from '@/components/store/page-header'

export const metadata: Metadata = { title: 'Privacy Notice' }

export default function PrivacyPage() {
  return (
    <>
      <PageHeader title="Privacy Notice" />
      <Prose>
        <AwaitingCopy what="description of what we hold" />
        <h2>What we collect</h2>
        <p>
          When you place an order we collect your name, mobile number, email address and delivery
          address. When you submit a bulk order enquiry we collect your name, mobile number, email
          address and your message.
        </p>
        <h2>What we do not collect</h2>
        <p>
          WHIPLY does not use customer accounts. There is no password, no saved profile and no
          stored payment instrument. We never see or store your card details — payment is handled
          entirely by our payment provider.
        </p>
        <h2>Who we share it with</h2>
        <ul>
          <li>Our payment provider, to take payment.</li>
          <li>Our delivery provider, to deliver your order to the address you gave.</li>
        </ul>
        <p>We do not sell your information and we do not send marketing.</p>
        <h2>How long we keep it</h2>
        <p>
          Orders are kept as business and tax records. Enquiries are kept until we delete them.
          The retention period is to be confirmed by WHIPLY.
        </p>
        <h2>Your rights</h2>
        <p>
          Under Singapore&apos;s Personal Data Protection Act you may request access to, or
          correction of, the personal data we hold about you. Contact us with your order reference.
        </p>
      </Prose>
    </>
  )
}
