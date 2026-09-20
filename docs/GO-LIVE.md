# WHIPLY — Go-live runbook

Written against the build as it stands on 20 Sept 2026: Tracks 0, A, B, C, D, E and F
complete, 213 tests passing. This is the ordered list of what remains between here and
taking real money.

**Nothing below can be done by an engineer alone.** Every step needs your identity
documents, your bank account, your card or your decision. The code is waiting on these,
not the other way round.

---

## Critical path — start these on day one

Three things have human review queues and set the launch date. Everything else fits
around them.

| # | Item | Who reviews | Typical wait | Blocks |
|---|------|-------------|--------------|--------|
| 1 | HitPay merchant verification (KYB) | HitPay compliance | **days** | Taking any payment |
| 2 | Lalamove Partner API access | Lalamove business team | **days** | Real courier bookings |
| 3 | **Written carrier confirmation for pressurised N₂O** | Lalamove (a person, not a form) | **days–weeks** | Turning auto-dispatch on |

Item 3 is a conversation, not a form submission, and it is the one most likely to come
back "no". The build already works without it — dispatch stays off and you book couriers
by hand — so it does not block launch. It blocks *automation*.

---

## Phase 1 — Business prerequisites

- [ ] **1.1 ACRA registration and UEN.** You need the business profile PDF, not just the
      number. Every provider below asks for it.
- [ ] **1.2 Business bank account** in the business name. A personal account in a
      different name fails HitPay's verification — discovering that after the integration
      is built is an avoidable week.
- [ ] **1.3 Decide the GST position.** Prices in this build are displayed tax-inclusive.
      If you register for GST later, every displayed price changes meaning. **Settle this
      before the catalogue is final** — changing tax treatment after taking orders is an
      accounting problem, not a code change.
- [ ] **1.4 Confirm the regulatory position** for selling food-grade N₂O cream chargers
      in Singapore — licensing, labelling, age restrictions, import and sale conditions.
      This document takes no position on it. The answer may constrain product copy, who
      you may sell to, and how the goods may be transported.
- [ ] **1.5 Resolve the 3.3 L price.** The original specification says **S$90** in the
      catalogue and **S$85** in the shop grid. The build seeds **S$90**. Confirm it —
      afterwards it is a one-field edit in Admin → Products, not a code change.
- [ ] **1.6 Write the policy copy.** Four pages render whatever text you supply and
      currently carry an "awaiting final copy" notice: delivery, returns, terms, privacy,
      plus the culinary usage agreement. The *behaviour* described on them is accurate;
      the wording is yours.
- [ ] **1.7 Fix the warehouse address** and a contact phone that will be answered during
      pickup hours. Goes into Admin → Settings.

---

## Phase 2 — Payments (HitPay)

- [ ] **2.1 Create the merchant account** with the business email. Enable 2FA the same
      day and store the recovery codes.
- [ ] **2.2 Submit verification.** Expect: ACRA profile, UEN, director's NRIC or passport,
      proof of business address, bank details, description of goods.
      **Describe the products accurately, including that they are pressurised food-grade
      N₂O cylinders.** A processor that discovers your real product line after onboarding
      can freeze settlement; one that approved it knowing everything cannot.
- [ ] **2.3 Enable payment methods** — PayNow, cards, wallets. This dashboard screen *is*
      the payment-method configuration: the storefront offers whatever is enabled and
      nothing is hard-coded. Note the per-method fees while you are there.
- [ ] **2.4 Set the settlement account and payout schedule.**
- [ ] **2.5 Collect sandbox credentials** → `HITPAY_API_KEY`, `HITPAY_API_BASE`.
- [ ] **2.6 Collect the webhook signing salt** → `HITPAY_WEBHOOK_SALT`.
      This is the most sensitive secret in the system. The deploy **fails** without it,
      deliberately — a webhook handler with no salt to verify against would accept forged
      payment confirmations.
- [ ] **2.7 Register the webhook URL**: `https://<domain>/api/webhooks/hitpay`.
- [ ] **2.8 Read the current API reference** and check it against
      `lib/payments/hitpay.ts`. Field names and the callback shape were written from the
      documented pattern; providers revise them. Twenty minutes here saves a day
      debugging a 422.
- [ ] **2.9 Collect live credentials** once verification completes. Production only.

> **Stripe is not needed.** HitPay covers PayNow, cards and wallets in one merchant
> account. A second processor doubles reconciliation for no gain at this size.

---

## Phase 3 — Delivery (Lalamove)

- [ ] **3.1 Create a business account** for Singapore (not a consumer account — API access
      is a business feature).
- [ ] **3.2 Ask, in writing, and keep the answer:** will they transport pressurised
      food-grade N₂O cylinders of 640 g and 2,000 g; under what packaging, labelling and
      quantity conditions; on which vehicle types; with what declaration at booking?
      Until this exists, `auto_dispatch_enabled` stays **off**.
- [ ] **3.3 Request Partner API access**; collect sandbox key and secret.
- [ ] **3.4 Collect production credentials** after sandbox integration is verified.
- [ ] **3.5 Register the delivery webhook**: `https://<domain>/api/webhooks/lalamove`,
      and collect its secret.
- [ ] **3.6 Choose the vehicle type** — constrained by 3.2's answer. A motorcycle that
      suits a digital scale may be wrong for cylinders or a S$550 mixer.
- [ ] **3.7 Fund the account.** Deliveries are charged to you, not the customer. An empty
      wallet at 9am fails every booking at once, and it looks exactly like an integration
      bug.

---

## Phase 4 — Infrastructure

- [ ] **4.1 Domain.** Register, enable auto-renew and registrar 2FA. Both webhook URLs and
      the email sender identity depend on this name — changing it later means
      reconfiguring three providers.
- [ ] **4.2 DNS and HTTPS.** Apex + `www`, certificate issued, `http://` redirects.
- [ ] **4.3 Hosting (Vercel).** Project, custom domain, three environments with separate
      variable sets. **Sandbox keys must never appear in Production; live keys must never
      appear in Preview** — preview deployments build from branches and are the easiest
      place to leak a live credential.
- [ ] **4.4 Check the cron plan.** Six scheduled jobs are defined in `vercel.json`, two at
      10- and 15-minute intervals. Confirm your plan allows that frequency.
- [ ] **4.5 Database (Neon, Singapore region).** Collect **both** connection strings —
      pooled for the app, direct for migrations. Reversing them causes connection
      exhaustion under mild load.
- [ ] **4.6 Enable backups and point-in-time recovery.**
- [ ] **4.7 Rehearse a restore, once.** Restore into a scratch branch and confirm the app
      reads it. An unrehearsed backup is a hypothesis. **This is the highest-value hour in
      the whole list.**
- [ ] **4.8 Object storage (Cloudflare R2)** — bucket, scoped API token, public bucket
      domain, CORS. Add the public base to the env and the `next.config` image allow-list.
- [ ] **4.9 Redis (Upstash, Singapore).** Rate limits and idempotency locks. Losing it
      costs rate limiting, never an order.
- [ ] **4.10 Email (Resend).** Add the sending domain and the SPF, DKIM and DMARC records;
      wait for verification. Without them the enquiry alert lands in spam, which is
      indistinguishable from the feature not working.
- [ ] **4.11 Turnstile.** Site key and secret key. **The secret is the one that matters** —
      the widget alone stops nothing, and in production the code refuses to skip
      verification when the secret is absent.
- [ ] **4.12 Sentry.** DSN, source-map token, PII scrubbing on before the first real order.
      Route the four CRITICAL conditions somewhere a human reads.

---

## Phase 5 — Accounts and content

- [ ] **5.1 Generate the application secrets.**
      `openssl rand -base64 32` → `AUTH_SECRET`; `openssl rand -hex 32` → `CRON_SECRET`.
      Different values per environment.
- [ ] **5.2 Create the owner admin account**: `npm run admin:create owner@whiply.sg`
      The script generates a TOTP secret, shows the `otpauth://` URI, and **refuses to
      create the account until you enter a working code** — so a mis-scanned QR cannot
      lock you out. Store the secret somewhere that is **not the same phone** as the
      authenticator.
- [ ] **5.3 Decide who else gets access.** One role exists and it can do everything. A
      second person gets their own account and their own TOTP — never a shared login, or
      the audit log stops naming anyone.
- [ ] **5.4 Source five licensed images** (two charger contexts, scale, mixer, hero) and
      keep the licences. Crop to 4:5. Current art is branded placeholder work; the operator
      replaces it in Admin → Products.
- [ ] **5.5 Upload the images and finalise product copy.**

---

## Phase 6 — Cutover, in this order

Do these as one sitting, not spread across a week.

1. [ ] Confirm every box above is ticked — especially 3.2 and 4.7.
2. [ ] Put **live** keys into Production only. Preview and Development keep sandbox keys.
3. [ ] Update **both** webhook URLs in both provider dashboards to the production domain.
       **Check no tunnel URL remains.** This is the most common launch-day failure and it
       presents as payments that succeed but orders that never confirm.
4. [ ] Verify `auto_dispatch_enabled` is **off** unless 3.2 is in hand.
5. [ ] Verify the catalogue: four products, agreed prices, correct stock, all active.
6. [ ] Verify settings: fee 20.00, threshold 200.00, pickup address set, store open.
7. [ ] Confirm admin TOTP is enrolled and recovery codes are stored off-device.
8. [ ] Confirm backups are running and the restore rehearsal is documented.
9. [ ] **Run the real-money smoke test** (below).
10. [ ] Trigger one CRITICAL alert deliberately and check it reaches a phone.
11. [ ] Only then, announce.

> The deploy enforces part of this itself: production refuses to start with a sandbox API
> base URL, a placeholder secret, a non-HTTPS site URL, or a missing webhook salt.

---

## Phase 7 — The real-money smoke test

Run on production, with live keys. This is the only test that proves the account
configuration is right, and none of it can be simulated.

1. [ ] Create a temporary S$1 product. Buy it with a real PayNow payment from a phone.
2. [ ] Confirm the webhook arrived, the order is `PAID`, stock decremented by exactly one.
3. [ ] Confirm the payment appears in the HitPay dashboard **with the WHIPLY reference
       attached**.
4. [ ] With dispatch off, confirm the order sits in `READY_FOR_DELIVERY` and **no courier
       was called**.
5. [ ] Book the courier manually; confirm the provider reference and cost are recorded.
6. [ ] Refund the S$1 from the admin panel; confirm the refund completes and the order
       reads `REFUNDED`.
7. [ ] Submit the bulk enquiry form; confirm both the row and the operator email arrive.
8. [ ] Archive the temporary product. Confirm the storefront shows exactly four products.

---

## Environment variables

| Variable | Source | Secret |
|---|---|---|
| `DATABASE_URL` | Neon — **pooled** | Yes |
| `DIRECT_DATABASE_URL` | Neon — **direct** | Yes |
| `NEXT_PUBLIC_SITE_URL` | Your domain (https in production) | No |
| `HITPAY_API_BASE` | Differs sandbox vs live | No |
| `HITPAY_API_KEY` | HitPay dashboard | Yes |
| `HITPAY_WEBHOOK_SALT` | HitPay dashboard | **Critical** |
| `LALAMOVE_API_BASE` | Differs per environment | No |
| `LALAMOVE_API_KEY` / `_API_SECRET` | Lalamove | Yes |
| `LALAMOVE_MARKET` | `SG` | No |
| `LALAMOVE_WEBHOOK_SECRET` | Lalamove | Yes |
| `R2_ACCOUNT_ID` / `R2_BUCKET` | Cloudflare | No |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare scoped token | Yes |
| `NEXT_PUBLIC_R2_PUBLIC_BASE` | R2 public domain | No |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Upstash | Yes |
| `RESEND_API_KEY` | Resend | Yes |
| `OPERATOR_ALERT_EMAIL` | You | No |
| `TURNSTILE_SITE_KEY` | Cloudflare | No |
| `TURNSTILE_SECRET_KEY` | Cloudflare | Yes |
| `AUTH_SECRET` | Generated | Yes |
| `CRON_SECRET` | Generated | Yes |
| `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Sentry | No / Yes |

---

## What is not built

Named so nothing is discovered on launch day:

- **No customer notifications.** Nobody is told when their order ships. HitPay's receipt
  covers payment. A `Notifier` interface with a no-op implementation is left at the seam —
  adding email or WhatsApp is one adapter, not a refactor.
- **No customer accounts or order lookup.** Customers must keep their reference.
- **No image upload UI yet.** The R2 pipeline and the `imageUrl` column exist; the admin
  upload control is not built. Set image URLs directly for now.
- **No Playwright end-to-end suite.** Unit and integration coverage is thorough; browser
  journeys were driven manually.
- **Product photography** is branded placeholder art.
- **Delivery is Singapore-only, one courier, no scheduled slots.**
