# WHIPLY — every credential, audited against the code

Not a generic vendor list. Every entry below was verified against
`lib/config/env.ts` and its consumers on 26 Sept 2026. Where a key is optional
in the schema but breaks something in practice, that is stated.

**Tiers**

| Tier | Meaning |
|---|---|
| **A — Blocks deploy** | `parseEnv()` throws and the deploy fails. No silent degradation. |
| **B — Blocks a feature** | Deploy succeeds; something users touch is broken or invisible. |
| **C — Degrades quietly** | Works without it, worse. |
| **D — Not needed yet** | Declared in the schema, no runtime code reads it. |

---

## Read this before you register anything

**Stripe PayNow does not pay out to a personal PayNow number.**

This is the single most important thing on the page, and it is the opposite of
what "PayNow tied to a personal Singapore number" suggests. When a customer
scans a Stripe PayNow QR:

1. The money goes to **Stripe's** collection account, not to a phone number.
2. Stripe credits it to **your Stripe balance**, minus fees.
3. Stripe pays out on a schedule to **one bank account**, which must be a
   Singapore business account in the name of the verified business.

There is no configuration, and no API field, that routes a Stripe PayNow
payment to a personal mobile number or NRIC-linked PayNow handle. If receiving
straight into a personal PayNow is a requirement, Stripe is the wrong tool and
the honest options are:

- **Register the business and take payouts to a business bank account.** This
  is what the code assumes and what these steps describe.
- **Take PayNow manually** — display a static personal QR, have customers
  upload a screenshot, and reconcile by hand. That is a different product: no
  automated confirmation, no automated receipt, no automated WhatsApp alert,
  because nothing tells the server the money arrived. Everything in §6.4 of the
  architecture document exists precisely to avoid this.

Nothing below works around this. Decide it first.

---

## Tier A — the deploy will not start without these (14)

| Variable | Where it comes from | Notes |
|---|---|---|
| `DATABASE_URL` | Neon → **pooled** connection string | App queries. Must be the pooled one on serverless. |
| `NEXT_PUBLIC_SITE_URL` | Your domain | Must be `https://` in production. **Also inlined at build time** — set it before the first build, not after. |
| `AUTH_SECRET` | `openssl rand -base64 32` | Min 32 chars. Signs admin sessions. Rejected if it contains `dev-only`. |
| `CRON_SECRET` | `openssl rand -hex 32` | Min 8 chars. Guards the five cron routes. Rejected if it contains `dev-only`. |
| `STRIPE_SECRET_KEY` | Stripe → Developers → API keys | Must start `sk_live_` in production; the deploy rejects `sk_test_`. |
| `STRIPE_WEBHOOK_SECRET` | Stripe → Developers → Webhooks → your endpoint → *Signing secret* | Starts `whsec_`. **The single most sensitive value.** Without it a forged payment confirmation would be indistinguishable from a real one, which is exactly why the deploy refuses to start. |
| `RESEND_API_KEY` | Resend → API keys | Receipts. See the note below. |
| `RESEND_FROM_EMAIL` | You | e.g. `WHIPLY <orders@whiply.sg>`. Domain must be verified in Resend. |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta → WhatsApp → API Setup | The number that **sends**. |
| `WHATSAPP_ACCESS_TOKEN` | Meta → System user → permanent token | A 24-hour test token will expire mid-week. Use a permanent System User token. |
| `WHATSAPP_BUSINESS_NUMBER` | You | The number that **receives** the alert — the shop's own line, in E.164 (`+6591234567`). Validated as E.164 by the deploy. |
| `TURNSTILE_SITE_KEY` | Cloudflare → Turnstile | |
| `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile | |
| `WHATSAPP_TEMPLATE_NAME` | You (must match Meta) | Defaults to `whiply_order_alert`. Empty string is rejected in production. |

> **Why Resend and WhatsApp block the deploy rather than degrading.**
> Both fail *silently*: without a Resend key, every paying customer gets no
> invoice; without WhatsApp credentials, no one is told an order came in. In
> both cases the deploy would report success and the shop would look fine. The
> same reasoning already applied to Turnstile, which fails closed and would
> reject every bulk enquiry. A refused deploy is a better outcome than a green
> one that quietly does nothing.

Defaults you only set if they change: `STRIPE_API_BASE`
(`https://api.stripe.com`), `WHATSAPP_API_BASE`
(`https://graph.facebook.com/v21.0`), `WHATSAPP_TEMPLATE_LANGUAGE` (`en`).

---

## The WhatsApp message template

This is the part of the integration that most often looks configured and is
not, so it gets its own section.

Meta only allows **free-form** text to a number inside a 24-hour "customer
service window", which opens when that number messages your business first. An
order alert is business-initiated and there is no such window. Free-form text
will be **accepted by the API with a 200 and then never delivered.**

So the alert is sent as a pre-approved **template**. Submit this in
**Meta Business Suite → WhatsApp Manager → Message templates**:

- **Name:** `whiply_order_alert` (must equal `WHATSAPP_TEMPLATE_NAME`)
- **Category:** Utility
- **Language:** English (`en`, matching `WHATSAPP_TEMPLATE_LANGUAGE`)
- **Body:**

  ```
  New order {{1}} — {{2}} paid.
  Delivery: {{3}}
  Items: {{4}}
  ```

The four parameters are produced by `templateParameters()` in
`lib/notify/whatsapp.ts`, in this order:

| | Contents | Example |
|---|---|---|
| `{{1}}` | Order reference | `WHP-20260926-4K7QP` |
| `{{2}}` | Total paid | `S$190.00` |
| `{{3}}` | Speed and slot | `Express (within 2 hours) — Sat 26 Sep, 3pm – 4pm` |
| `{{4}}` | Item summary | `1 × 640g N₂O Cream Charger — 6 Tanks` |

**If you change the template body, change that function too.** A template whose
parameter count does not match the call is rejected at send time, and the alert
silently stops. An integration test asserts the parameters stay single-line,
because Meta rejects a parameter containing a newline or four consecutive
spaces.

Approval takes minutes to a day. Until it lands you can set
`WHATSAPP_TEMPLATE_NAME=""` **in development only** to send free-form text.

---

## Tier C — works without, worse (5)

| Variable | Where | Without it |
|---|---|---|
| `DIRECT_DATABASE_URL` | Neon → **direct** (unpooled) string | Prisma falls back to `DATABASE_URL`. Migrations through a pooler can fail on advisory locks — set it. |
| `OPERATOR_ALERT_EMAIL` | You | No low-stock or enquiry alerts by email. Use an address you read on a phone. |
| `OPERATOR_EMAIL_FROM` | You | Defaults to `WHIPLY <alerts@whiply.sg>`. Must be on a domain verified in Resend. |
| `UPSTASH_REDIS_REST_URL` / `_TOKEN` | Upstash | Rate limiting falls back to in-process memory — correct on one instance, not across several. Checkout and enquiry still fail closed. |
| `SENTRY_DSN` | Sentry | No error tracking. Logs still go to the hosting platform. |

---

## Tier D — do NOT go and get these yet (5)

| Variable | Why not |
|---|---|
| `R2_ACCOUNT_ID` | Declared in the schema; **no runtime code reads it.** |
| `R2_BUCKET` | The admin image-upload UI is not built. |
| `R2_ACCESS_KEY_ID` | Product images currently resolve to bundled placeholder art. |
| `R2_SECRET_ACCESS_KEY` | |
| `NEXT_PUBLIC_R2_PUBLIC_BASE` | Needed only once uploads exist. |

Set product images by writing a URL into `products.image_url` directly, from any
host you like, until the upload UI is built.

---

## Accounts to register (as opposed to keys)

Some of these issue no key at all but still gate the launch.

1. **ACRA / UEN** — business profile PDF. Required by Stripe and by Meta.
2. **Business bank account** in the business name. A personal account fails
   Stripe's KYB, and it is where PayNow settlements land (see the top of this
   page).
3. **Stripe account** + KYB verification (hours to days). Then
   **Settings → Payment methods → enable PayNow**, and nothing else. Leaving
   cards enabled in the dashboard is harmless — the integration never asks for
   them — but disabling them keeps the dashboard honest about what you take.
4. **Meta Business account** + **business verification** (days), a WhatsApp
   Business Platform app, a registered sending number, and an approved message
   template. Business verification is the long pole here; start it early.
5. **Domain registrar** account.
6. **Vercel** account.
7. **Neon** account.
8. **Cloudflare** account (Turnstile — and later R2).
9. **Resend** account + DNS verification of your sending domain.
10. **Sentry** account.
11. **Stock image licence** — Unsplash/Pexels (free) or Adobe Stock. Keep the
    licences.

**No longer needed:** HitPay, Lalamove. Both integrations have been removed;
delete any keys you already issued for them.

**Carrier confirmation for pressurised N₂O** is no longer a launch gate,
because there is no courier API to hand cylinders to — WHIPLY delivers its own
orders. It remains a live question for whoever drives the van: confirm what
your own insurance and vehicle permit allow before carrying cylinders.

---

## Generate these yourself

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 32      # CRON_SECRET
```

Different values per environment. Never reuse a development secret in
production.

---

## The admin account is not an env var

```bash
npm run admin:create owner@whiply.sg
```

Prompts for a password (min 12), generates a TOTP secret, prints the
`otpauth://` URI, and **refuses to create the account until you type a working
code back** — so a mis-scanned QR cannot lock you out. Store the secret
somewhere that is not the same phone as the authenticator app.
