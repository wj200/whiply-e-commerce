# WHIPLY — Go-live runbook

Written against the build as it stands on 26 Sept 2026: Tracks 0, A, B, C, D, E and F
complete, 265 tests passing, payments on **Stripe PayNow** and fulfilment **self-managed**.
This is the ordered list of what remains between here and taking real money.

**Nothing below can be done by an engineer alone.** Every step needs your identity
documents, your bank account, your card or your decision. The code is waiting on these,
not the other way round.

---

## Critical path — start these on day one

Three things have human review queues and set the launch date. Everything else fits
around them.

| # | Item | Who reviews | Typical wait | Blocks |
|---|------|-------------|--------------|--------|
| 1 | **Meta business verification** | Meta | **days–weeks** | The WhatsApp order alert |
| 2 | Stripe KYB | Stripe compliance | **hours–days** | Taking any payment |
| 3 | WhatsApp message template approval | Meta | **minutes–1 day**, after #1 | The WhatsApp order alert |
| 4 | Resend domain verification (DNS) | Automatic, once DNS propagates | **hours** | Customer receipts |

Meta's business verification is the long pole and the one most likely to come back
needing more documents. Start it on day one, before you write a line of copy.

### The thing to settle before any of this

**Stripe PayNow cannot pay out to a personal PayNow number.** Money lands in a
Stripe balance and is paid out to one **business** bank account. There is no
setting that changes this. If receiving directly into a personal PayNow handle is a
hard requirement, this build is the wrong shape and the alternative is manual
reconciliation — no automated confirmation, no receipt, no alert, because nothing
tells the server the money arrived. The full explanation is at the top of
`docs/CREDENTIALS.md`. **Decide this first; everything below assumes the business
account.**

---

## Phase 1 — Business prerequisites

- [ ] **1.1 ACRA registration and UEN.** You need the business profile PDF, not just the
      number. Every provider below asks for it.
- [ ] **1.2 Business bank account** in the business name. A personal account in a
      different name fails Stripe's KYB, and it is where every PayNow settlement lands.
- [ ] **1.3 Decide the GST position.** Prices in this build are displayed tax-inclusive.
      If you register for GST later, every displayed price changes meaning. **Settle this
      before the catalogue is final** — changing tax treatment after taking orders is an
      accounting problem, not a code change.
- [ ] **1.4 Confirm the regulatory position** for selling food-grade N₂O cream chargers
      in Singapore — licensing, labelling, age restrictions, import and sale conditions.
      This document takes no position on it. The answer may constrain product copy, who
      you may sell to, and how the goods may be transported.
- [ ] **1.5 Confirm the finalised price list** against what is seeded. Thirteen SKUs:
      640 g at S$40 / S$190 / S$350 for 1, 6 and 12 tanks; 2.5 kg at S$120 / S$220 /
      S$400 for 1, 2 and 4; powdered cream S$25; spray S$20; cream 250 g S$10; Nestlé
      all purpose 250 g S$10; dispenser S$150; scale S$140; mixer S$600. Afterwards each
      is a one-field edit in Admin → Products, not a code change.
- [ ] **1.5b Confirm the delivery rules.** S$10 standard (2–3 working days), S$20
      express (within 2 hours), free above S$200. **The published rule says free
      *express* above S$200; the build waives BOTH speeds**, because otherwise a
      qualifying customer who picked the slower option would be the only one still
      paying. If you really want standard to keep charging above the threshold, say so —
      it is one line in `computeTotals`.
- [ ] **1.5c Confirm the slot arithmetic.** Slots run 10am–11pm, an hour each, and the
      site stops taking orders at 10pm. With an hour's notice measured from the start of
      a slot, **the last express slot closes at 9pm**, an hour before the site does;
      standard orders keep coming in until 10pm. That is the one place the three stated
      rules do not quite line up, and it is resolved in the customer's favour — they are
      told express is unavailable rather than sold a slot we cannot make. Every one of
      these numbers is a setting, changeable without a deploy.
- [ ] **1.6 Write the policy copy.** Four pages render whatever text you supply and
      currently carry an "awaiting final copy" notice: delivery, returns, terms, privacy,
      plus the culinary usage agreement. The *behaviour* described on them is accurate;
      the wording is yours.
- [ ] **1.7 Fix the dispatch address** and a contact phone answered during delivery
      hours. Goes into Admin → Settings; it appears on the run sheet.
- [ ] **1.8 Confirm who drives, and in what.** Fulfilment is self-managed — there is no
      courier API. Check that your vehicle, insurance and any permit cover carrying
      pressurised N₂O cylinders. This is no longer a launch *gate* (nothing in the code
      waits on it), but it is still a real question and it is now yours rather than a
      carrier's.

---

## Phase 2 — Payments (Stripe, PayNow only)

- [ ] **2.1 Create the Stripe account** with the business email, country **Singapore**.
      The country cannot be changed later without a new account. Enable 2FA the same day
      and store the recovery codes.
- [ ] **2.2 Submit KYB.** Expect: ACRA profile, UEN, director's NRIC or passport, proof
      of business address, bank details, description of goods.
      **Describe the products accurately, including that they are pressurised food-grade
      N₂O cylinders.** A processor that discovers your real product line after
      onboarding can freeze settlement; one that approved it knowing everything cannot.
- [ ] **2.3 Enable PayNow** under Settings → Payment methods. The integration requests
      `paynow` and nothing else, so the dashboard cannot widen what customers are
      offered — but turning cards off keeps the dashboard honest about what you take.
- [ ] **2.4 Set the payout bank account and schedule.** This is the answer to "where does
      the money actually go".
- [ ] **2.5 Collect the test secret key** (`sk_test_…`) for Preview →
      `STRIPE_SECRET_KEY`.
- [ ] **2.6 Create the webhook endpoint** at `https://<domain>/api/webhooks/stripe`
      subscribed to `payment_intent.succeeded`, `payment_intent.payment_failed` and
      `payment_intent.canceled`; collect its **signing secret** (`whsec_…`) →
      `STRIPE_WEBHOOK_SECRET`.
      This is the most sensitive secret in the system. The deploy **fails** without it,
      deliberately — a webhook handler with no secret to verify against would accept
      forged payment confirmations.
- [ ] **2.7 Test with Stripe's PayNow test QR** in test mode. The test QR completes
      immediately; confirm the order reaches `DELIVERY_BOOKED` and both notifications
      fire.
- [ ] **2.8 Read the current API reference** against `lib/payments/stripe.ts`. The
      PaymentIntent shape and the `paynow_display_qr_code` next-action were written from
      the documented pattern; Stripe revises them. Twenty minutes here saves a day
      debugging a 400.
- [ ] **2.9 Collect the live secret key** (`sk_live_…`) once KYB completes, and the live
      webhook's signing secret. Production only — the deploy rejects a test key there.

> **A note on refunds.** A PayNow refund is a bank transfer Stripe initiates back to the
> payer. It is not instant (expect a few business days) and the payer's bank can reject
> it. Neither is a bug; both are surfaced in the admin panel rather than retried.

---

## Phase 3 — Notifications

Two messages go out the moment a payment is verified. Both are one-shot, stamped in the
database, and retried by a cron sweep if a provider is down — so a failure here delays a
message, it never loses an order.

### 3a — Customer receipt (Resend)

- [ ] **3.1 Add and verify the sending domain** (SPF, DKIM, DMARC). Unverified mail lands
      in spam, which a paying customer experiences as not getting a receipt.
- [ ] **3.2 Create the API key** → `RESEND_API_KEY`.
- [ ] **3.3 Set `RESEND_FROM_EMAIL`** to a real, monitored sender on that domain. The
      receipt tells customers to reply to it quoting their reference, so somebody has to
      read it.
- [ ] **3.4 Send yourself one.** Check it renders in Gmail and on a phone, and that the
      slot and address are right.

### 3b — Business order alert (WhatsApp Business Platform)

- [ ] **3.5 Create a Meta Business account** and **submit business verification.** Days
      to weeks. Start first.
- [ ] **3.6 Create the app**, add the WhatsApp product, and register the sending number.
      A number already attached to a consumer WhatsApp or WhatsApp Business app must be
      deleted from it first, which cannot be undone — use a spare line if in doubt.
- [ ] **3.7 Generate a permanent System User token** with
      `whatsapp_business_messaging` → `WHATSAPP_ACCESS_TOKEN`. **Not** the 24-hour token
      on the API Setup page; that one expires mid-week and the alerts stop with no other
      symptom.
- [ ] **3.8 Set `WHATSAPP_PHONE_NUMBER_ID`** (the sender) and
      **`WHATSAPP_BUSINESS_NUMBER`** (the shop's own line, E.164, the recipient).
- [ ] **3.9 Submit the message template** named `whiply_order_alert`. Exact body and its
      four parameters are in `docs/CREDENTIALS.md`.
      **This is the step people skip.** Free-form WhatsApp messages to a number that has
      not messaged you in the last 24 hours are accepted by the API with a 200 and then
      never delivered. Without an approved template the alert silently does not exist.
- [ ] **3.10 Send yourself one** on the live number and confirm it arrives on the phone
      that will be watched during service.
- [ ] **3.11 If Meta is still reviewing you, set `WHATSAPP_ALERTS_DISABLED=true`** and
      launch without alerts rather than waiting. Receipts still go out; you watch the
      admin console for orders until it comes off. Exact behaviour and the near-miss
      rule are in `docs/CREDENTIALS.md`.

## Phase 4 — Infrastructure

- [ ] **4.1 Domain.** Register, enable auto-renew and registrar 2FA. Both webhook URLs and
      the email sender identity depend on this name — changing it later means
      reconfiguring three providers.
- [ ] **4.2 DNS and HTTPS.** Apex + `www`, certificate issued, `http://` redirects.
- [ ] **4.3 Hosting (Vercel).** Project, custom domain, three environments with separate
      variable sets. **Sandbox keys must never appear in Production; live keys must never
      appear in Preview** — preview deployments build from branches and are the easiest
      place to leak a live credential.
- [ ] **4.4 Check the cron plan.** Five scheduled jobs are defined in `vercel.json`, the
      fastest at 10 minutes. Confirm your plan allows that frequency — Hobby does not.
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
- [ ] **4.10 Email (Resend).** Covered by Phase 3a — do it there, not twice.
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
- [ ] **5.4 Source licensed images** — at minimum one per product family (640 g
      cylinder, 2.5 kg cylinder, cream, dispenser, scale, mixer, hero) and keep the
      licences. Crop to 4:5. Pack sizes currently share their family's placeholder, which
      a photograph should fix: a six-pack and a single should not look identical in the
      grid.
- [ ] **5.5 Upload the images and finalise product copy.**

---

## Phase 6 — Cutover, in this order

Do these as one sitting, not spread across a week.

1. [ ] Confirm every box above is ticked — especially 3.2 and 4.7.
2. [ ] Put **live** keys into Production only. Preview and Development keep sandbox keys.
3. [ ] Point the **Stripe webhook** at the production domain and **delete every other
       endpoint**, especially any tunnel URL from development. This is the most common
       launch-day failure and it presents as payments that succeed but orders that never
       confirm.
4. [ ] `curl -i -X POST https://<domain>/api/webhooks/stripe -d '{}'` → must be **401**.
       A 200 means the signing secret is wrong and anyone can mark orders paid.
5. [ ] Verify the catalogue: thirteen products, published prices, correct stock in
       **packs**, all active.
6. [ ] Verify settings: standard 10.00, express 20.00, threshold 200.00, slots 10–22,
       lead 60, cutoff 22, dispatch address set, store open.
7. [ ] Confirm admin TOTP is enrolled and recovery codes are stored off-device.
8. [ ] Confirm backups are running and the restore rehearsal is documented.
9. [ ] **Run the real-money smoke test** (below).
10. [ ] Trigger one CRITICAL alert deliberately and check it reaches a phone.
11. [ ] **Remove `WHATSAPP_ALERTS_DISABLED`** if it was ever set, and redeploy. While
        it is set, the admin console is the only thing that tells you an order arrived.
12. [ ] Only then, announce.

> The deploy enforces part of this itself: production refuses to start with a Stripe
> **test** key, a malformed signing secret, a placeholder app secret, a non-HTTPS site
> URL, or missing Resend, WhatsApp or Turnstile credentials.

---

## Phase 7 — The real-money smoke test

Run on production, with live keys, paying from a real phone. This is the only test that
proves the Stripe account, the webhook secret, the Resend sender and the WhatsApp
template are all correct at once, and none of it can be simulated.

1. [ ] Create a temporary S$1 product with one unit of stock.
2. [ ] Buy it end to end: add to bag → checkout → fill the form → pick **express** and a
       slot → scan the PayNow QR in your banking app and pay.
3. [ ] Confirm the order reaches `DELIVERY_BOOKED`, the delivery record reads
       `SCHEDULED` against the slot you picked, and stock decremented by exactly one.
4. [ ] Confirm **the receipt email arrives**, with the right total, address and slot.
5. [ ] Confirm **the WhatsApp alert arrives** on the business number, with all four
       fields populated.
6. [ ] Confirm the payment appears in the Stripe dashboard with the WHIPLY reference in
       its metadata.
7. [ ] Check the admin order page: receipt and alert both show a timestamp, not
       "Not yet".
8. [ ] Advance the delivery to **Out for delivery** and then **Delivered**; confirm the
       order status follows.
9. [ ] Refund the S$1 from the admin panel; confirm Stripe accepts it and the order reads
       `REFUNDED`. (The money itself takes days to land — that is normal for PayNow.)
10. [ ] Submit the bulk enquiry form; confirm both the row and the operator email arrive.
11. [ ] Test the closing time: after 10pm SGT, confirm checkout refuses with the
        "orders close at 10pm" notice rather than a generic error.
12. [ ] Archive the temporary product. Confirm the storefront shows exactly thirteen.

## Environment variables

| Variable | Source | Secret |
|---|---|---|
| `DATABASE_URL` | Neon — **pooled** | Yes |
| `DIRECT_DATABASE_URL` | Neon — **direct** | Yes |
| `NEXT_PUBLIC_SITE_URL` | Your domain (https in production) | No |
| `STRIPE_API_BASE` | Defaults to `https://api.stripe.com` | No |
| `STRIPE_SECRET_KEY` | Stripe → API keys (`sk_live_` in production) | Yes |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Webhooks → signing secret | **Critical** |
| `RESEND_API_KEY` | Resend | Yes |
| `RESEND_FROM_EMAIL` | You, on the verified domain | No |
| `OPERATOR_ALERT_EMAIL` | You | No |
| `WHATSAPP_API_BASE` | Defaults to `https://graph.facebook.com/v21.0` | No |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta → API Setup | No |
| `WHATSAPP_ACCESS_TOKEN` | Meta → System user, permanent | Yes |
| `WHATSAPP_BUSINESS_NUMBER` | The shop's own line, E.164 | No |
| `WHATSAPP_TEMPLATE_NAME` / `_LANGUAGE` | Must match the approved template | No |
| `WHATSAPP_ALERTS_DISABLED` | Exactly `true` waives the four rows above | No |
| `R2_ACCOUNT_ID` / `R2_BUCKET` | Cloudflare — **not needed yet** | No |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare — **not needed yet** | Yes |
| `NEXT_PUBLIC_R2_PUBLIC_BASE` | R2 public domain — **not needed yet** | No |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Upstash | Yes |
| `TURNSTILE_SITE_KEY` | Cloudflare | No |
| `TURNSTILE_SECRET_KEY` | Cloudflare | Yes |
| `AUTH_SECRET` | Generated | Yes |
| `CRON_SECRET` | Generated | Yes |
| `SENTRY_DSN` / `SENTRY_AUTH_TOKEN` | Sentry | No / Yes |

---

## What is not built

Named so nothing is discovered on launch day:

- **One customer email, and only one.** The receipt, sent when payment clears. Nobody is
  told when their order is on the way or has arrived. The adapters exist
  (`lib/notify/`), so adding a dispatch notice is one function and a stamp column, not a
  refactor.
- **No customer accounts or order lookup.** Customers must keep their reference.
- **Public holidays are not modelled.** Standard delivery counts Monday to Friday and
  will happily offer a slot on Chinese New Year. Close the store for the day instead.
- **No self-service rescheduling.** An operator can move a slot in the admin panel; a
  customer must ask.
- **No image upload UI yet.** The R2 pipeline and the `imageUrl` column exist; the admin
  upload control is not built. Set image URLs directly for now.
- **No Playwright end-to-end suite.** Unit and integration coverage is thorough; browser
  journeys were driven manually.
- **Product photography** is branded placeholder art, and pack sizes share their
  family's image.
- **Delivery is Singapore-only and self-managed.** There is no courier API, no live
  tracking and no driver app — the run sheet in Admin → Deliveries is the whole system.
