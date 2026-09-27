import { describe, it, expect } from 'vitest'
import {
  verifyStripeSignature,
  buildStripeSignatureHeader,
  computeHmacSha256,
  STRIPE_TOLERANCE_SECONDS,
} from '@/lib/payments/signature'

const SECRET = 'whsec_test_secret'
const BODY = JSON.stringify({ id: 'evt_1', type: 'payment_intent.succeeded' })
const NOW = 1_800_000_000

function header(overrides: { body?: string; secret?: string; timestamp?: number } = {}) {
  return buildStripeSignatureHeader({
    rawBody: overrides.body ?? BODY,
    secret: overrides.secret ?? SECRET,
    timestamp: overrides.timestamp ?? NOW,
  })
}

describe('verifyStripeSignature — GUARD-2', () => {
  it('accepts a correctly signed payload', () => {
    const result = verifyStripeSignature({
      rawBody: BODY,
      header: header(),
      secret: SECRET,
      nowSeconds: NOW,
    })
    expect(result).toEqual({ ok: true, timestamp: NOW })
  })

  it('REJECTS a payload signed with a different secret', () => {
    const result = verifyStripeSignature({
      rawBody: BODY,
      header: header({ secret: 'whsec_attacker' }),
      secret: SECRET,
      nowSeconds: NOW,
    })
    expect(result).toEqual({ ok: false, reason: 'DIGEST_MISMATCH' })
  })

  it('REJECTS a body altered after signing, even by one byte', () => {
    const tampered = BODY.replace('evt_1', 'evt_2')
    const result = verifyStripeSignature({
      rawBody: tampered,
      header: header(),
      secret: SECRET,
      nowSeconds: NOW,
    })
    expect(result).toEqual({ ok: false, reason: 'DIGEST_MISMATCH' })
  })

  it('REJECTS a missing header rather than defaulting to trust', () => {
    expect(
      verifyStripeSignature({ rawBody: BODY, header: null, secret: SECRET, nowSeconds: NOW }),
    ).toEqual({ ok: false, reason: 'MISSING_HEADER' })
  })

  it('REJECTS when there is no secret configured — never falls open', () => {
    expect(
      verifyStripeSignature({ rawBody: BODY, header: header(), secret: '', nowSeconds: NOW }),
    ).toEqual({ ok: false, reason: 'NO_SECRET' })
  })

  it('rejects a header with no timestamp or no v1', () => {
    expect(
      verifyStripeSignature({ rawBody: BODY, header: 'v1=abc', secret: SECRET, nowSeconds: NOW }),
    ).toEqual({ ok: false, reason: 'MALFORMED_HEADER' })
    expect(
      verifyStripeSignature({
        rawBody: BODY,
        header: `t=${NOW}`,
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'MALFORMED_HEADER' })
  })

  it('REJECTS a replay of a validly signed body from long ago', () => {
    // Without this, a signature captured once is valid forever.
    const old = NOW - STRIPE_TOLERANCE_SECONDS - 1
    expect(
      verifyStripeSignature({
        rawBody: BODY,
        header: header({ timestamp: old }),
        secret: SECRET,
        nowSeconds: NOW,
      }),
    ).toEqual({ ok: false, reason: 'TIMESTAMP_OUT_OF_TOLERANCE' })
  })

  it('tolerates modest clock skew in both directions', () => {
    for (const skew of [-120, 120]) {
      expect(
        verifyStripeSignature({
          rawBody: BODY,
          header: header({ timestamp: NOW + skew }),
          secret: SECRET,
          nowSeconds: NOW,
        }).ok,
      ).toBe(true)
    }
  })

  it('accepts either signature during a secret rotation', () => {
    // Stripe sends one v1 per active secret while a rotation is in flight.
    const oldSig = computeHmacSha256(`${NOW}.${BODY}`, 'whsec_previous')
    const newSig = computeHmacSha256(`${NOW}.${BODY}`, SECRET)

    for (const combined of [
      `t=${NOW},v1=${oldSig},v1=${newSig}`,
      `t=${NOW},v1=${newSig},v1=${oldSig}`,
    ]) {
      expect(
        verifyStripeSignature({
          rawBody: BODY,
          header: combined,
          secret: SECRET,
          nowSeconds: NOW,
        }).ok,
      ).toBe(true)
    }
  })

  it('signs the TIMESTAMPED payload, not the body alone', () => {
    // A signature over the bare body would be replayable with any timestamp.
    const bodyOnly = computeHmacSha256(BODY, SECRET)
    expect(
      verifyStripeSignature({
        rawBody: BODY,
        header: `t=${NOW},v1=${bodyOnly}`,
        secret: SECRET,
        nowSeconds: NOW,
      }).ok,
    ).toBe(false)
  })

  it('ignores unknown scheme parts, as Stripe reserves the right to add them', () => {
    const sig = computeHmacSha256(`${NOW}.${BODY}`, SECRET)
    expect(
      verifyStripeSignature({
        rawBody: BODY,
        header: `t=${NOW},v0=ignored,v1=${sig}`,
        secret: SECRET,
        nowSeconds: NOW,
      }).ok,
    ).toBe(true)
  })
})
