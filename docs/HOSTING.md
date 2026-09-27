# WHIPLY — hosting, step by step

Exact commands and clicks to get `wj200/whiply-e-commerce` running on a real
domain. Assumes Vercel + Neon, which is what the build is written for. Roughly
two hours of work, spread across whatever Stripe KYB and Meta business
verification take — Meta's is the long pole, so start it on day one.

> **Before anything else, read the box at the top of `docs/CREDENTIALS.md`.**
> Stripe PayNow settles to a Stripe balance and then to a business bank
> account. It cannot pay out to a personal PayNow number, and nothing in these
> steps changes that.

Order matters: the database must exist before the first deploy, because the
build runs `prisma generate` and the app reads rows on the first request.

---

## Step 1 — Database (Neon)

1. Sign up at **neon.tech**. Create a project, region **Singapore (ap-southeast-1)**.
   Region matters: the database should sit near the functions that read it.
2. Name the database `whiply`.
3. From **Connection Details**, copy **both** strings:
   - **Pooled** (contains `-pooler`) → this is `DATABASE_URL`
   - **Direct** (no `-pooler`) → this is `DIRECT_DATABASE_URL`

   Getting these the wrong way round causes connection exhaustion under mild
   load. The pooled one is for the app; the direct one is for migrations.
4. **Settings → enable point-in-time restore.** Note the retention window.

---

## Step 2 — Domain and DNS

1. Register the domain. Enable auto-renew **and** registrar two-factor auth.
2. Leave DNS alone for now — Vercel will tell you exactly which records to add
   in Step 4. Adding them early just means doing it twice.

> Both webhook URLs and your email sender identity are derived from this name.
> Changing it later means reconfiguring three providers. Decide now.

---

## Step 3 — Cloudflare Turnstile

Do this before the first deploy: production **refuses to start** without it.

1. Sign up at **cloudflare.com**, go to **Turnstile**.
2. **Add Site** → name `WHIPLY`, hostname your domain, widget type **Managed**.
3. Copy the **Site Key** → `TURNSTILE_SITE_KEY`
4. Copy the **Secret Key** → `TURNSTILE_SECRET_KEY`

---

## Step 3b — Stripe, PayNow only

1. Sign up at **stripe.com**, choose **Singapore** as the country. This cannot
   be changed later without a new account.
2. Complete **KYB**: UEN / ACRA business profile, director identity, and the
   **business** bank account that payouts land in.
3. **Settings → Payment methods → enable PayNow.** The integration asks for
   `paynow` and nothing else, so what else is enabled in the dashboard does not
   change what customers are offered — but turning cards off keeps the
   dashboard honest about what you take.
4. **Developers → API keys** → reveal the **live secret key** →
   `STRIPE_SECRET_KEY`. It starts `sk_live_`; the deploy rejects `sk_test_` in
   production.
5. The webhook signing secret comes later, in Step 9 — it does not exist until
   the endpoint does.

---

## Step 3c — WhatsApp Business Platform

Start this first in wall-clock time; it finishes last.

1. **business.facebook.com** → create a Business account for the shop.
2. **Business verification** — upload the ACRA profile and proof of address.
   This is the step that takes days.
3. **developers.facebook.com** → Create App → **Business** → add the
   **WhatsApp** product.
4. **API Setup** → register the sending phone number. It must not already be on
   a consumer WhatsApp or WhatsApp Business app account; if it is, delete that
   account first, which cannot be undone.
5. Copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
6. **Business settings → System users** → create one, assign the app with
   `whatsapp_business_messaging`, and **generate a permanent token** →
   `WHATSAPP_ACCESS_TOKEN`. The 24-hour token on the API Setup page will expire
   mid-week and the alerts will stop with no other symptom.
7. Set `WHATSAPP_BUSINESS_NUMBER` to the shop's **receiving** number in E.164,
   e.g. `+6591234567`. It may be the same number as the sender or a different
   one; either works.
8. **Submit the message template.** The exact body and its four parameters are
   in `docs/CREDENTIALS.md`. Without an approved template the API returns 200
   and delivers nothing.

---

## Step 4 — Vercel project

1. Sign up at **vercel.com** with the business email; enable 2FA.
2. **Add New → Project → Import Git Repository** → `wj200/whiply-e-commerce`.
   (If it does not appear, install the Vercel GitHub App on the repo.)
3. Framework preset: **Next.js**. Leave build and output settings at defaults —
   `package.json` already runs `prisma generate && next build`.
4. **Do not deploy yet.** Open **Environment Variables** first.

### Add the variables

Set these for **Production** (and a sandbox-keyed copy for Preview). Full list
and where each comes from: `docs/CREDENTIALS.md`.

```
DATABASE_URL              <Neon pooled>
DIRECT_DATABASE_URL       <Neon direct>
NEXT_PUBLIC_SITE_URL      https://<your-domain>
AUTH_SECRET               <openssl rand -base64 32>
CRON_SECRET               <openssl rand -hex 32>
STRIPE_SECRET_KEY         <sk_live_… from step 3b>
STRIPE_WEBHOOK_SECRET     <whsec_… from step 9>
RESEND_API_KEY            <step 7>
RESEND_FROM_EMAIL         WHIPLY <orders@<your-domain>>
WHATSAPP_PHONE_NUMBER_ID  <from step 3c>
WHATSAPP_ACCESS_TOKEN     <permanent System User token>
WHATSAPP_BUSINESS_NUMBER  +65XXXXXXXX
WHATSAPP_TEMPLATE_NAME    whiply_order_alert
TURNSTILE_SITE_KEY        <from step 3>
TURNSTILE_SECRET_KEY      <from step 3>
OPERATOR_ALERT_EMAIL      <your inbox>
UPSTASH_REDIS_REST_URL    <step 6>
UPSTASH_REDIS_REST_TOKEN  <step 6>
SENTRY_DSN                <step 8>
```

`STRIPE_WEBHOOK_SECRET` does not exist until Step 9, and the deploy will not
start without it. Put any `whsec_placeholder` in for the first deploy, then
replace it with the real value and redeploy once the endpoint exists.

**Two things that bite here:**

- `NEXT_PUBLIC_SITE_URL` is inlined into the client bundle **at build time**.
  Changing it later requires a redeploy, not just an env edit.
- **Never put live keys in the Preview environment.** Preview builds from every
  branch and is the easiest place to leak a production credential. Vercel sets
  `NODE_ENV=production` on preview builds too, so the app decides which rules
  to enforce from **`VERCEL_ENV`** — a preview happily runs on `sk_test_` keys
  with no Resend or WhatsApp credentials at all, and only the real production
  deployment demands the full set.

5. **Deploy.** If it fails, read the error — the env guard names every missing or
   malformed variable at once rather than one per attempt.

### Attach the domain

6. **Settings → Domains → Add** your domain. Vercel prints the exact A / CNAME
   records. Add them at your registrar.
7. Wait for the certificate. Confirm `http://` redirects to `https://`.

---

## Step 5 — Run the migrations

Vercel's build does **not** run migrations (deliberately — a build should not
mutate a production database). Run them yourself, from your laptop, using the
**direct** connection string:

```bash
git clone https://github.com/wj200/whiply-e-commerce
cd whiply-e-commerce
npm ci

export DATABASE_URL="<Neon DIRECT string>"
export DIRECT_DATABASE_URL="<Neon DIRECT string>"

npx prisma migrate deploy     # creates 14 tables + the CHECK constraints
npx tsx prisma/seed.ts        # 13 products, 12 settings
npm run admin:create owner@whiply.sg
```

`admin:create` prints an `otpauth://` URI — scan it, then type the 6-digit code
back. It will not create the account until a code verifies.

Confirm:

```bash
npx prisma studio    # or psql: SELECT sku, price_cents FROM products;
```

You should see thirteen products and twelve settings rows, with the 640 g
single at `4000` cents and the twelve-pack at `35000`.

---

## Step 6 — Upstash Redis

1. Sign up at **upstash.com** → **Create Database**, region **Singapore**.
2. From **REST API**, copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. Add both to Vercel → redeploy.

Skippable at launch — rate limiting falls back to in-process memory, which is
correct on a single instance.

---

## Step 7 — Resend (customer receipts and operator alerts)

1. Sign up at **resend.com** → **Domains → Add Domain**.
2. Add the **SPF, DKIM and DMARC** records it gives you at your registrar.
3. Wait for **Verified**. Without this every receipt lands in spam, which a
   paying customer experiences as not getting one.
4. **API Keys → Create** → `RESEND_API_KEY`.
5. Set `RESEND_FROM_EMAIL` to a sender on the verified domain, e.g.
   `WHIPLY <orders@whiply.sg>`. This is what customers reply to.
6. Set `OPERATOR_ALERT_EMAIL` to an address you read on a phone.

---

## Step 8 — Sentry

1. Sign up at **sentry.io** → new **Next.js** project.
2. Copy the **DSN** → `SENTRY_DSN`.
3. Turn on PII scrubbing **before** the first real order — orders carry a name,
   phone, email and address.

---

## Step 9 — The Stripe webhook (after the domain is live)

This is the only webhook in the system, and it is the only thing that makes a
payment true. It needs a public HTTPS URL, so it comes after Step 4.

1. **Stripe → Developers → Webhooks → Add endpoint.**
2. Endpoint URL:
   ```
   https://<your-domain>/api/webhooks/stripe
   ```
3. Subscribe to exactly these three events — no more:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `payment_intent.canceled`

   The handler acknowledges anything else with a 200 and ignores it, so extra
   subscriptions cost nothing but noise.
4. **Reveal the signing secret** (`whsec_…`) → set `STRIPE_WEBHOOK_SECRET` in
   Vercel → **redeploy**. An env change alone does not take effect.

Verify it refuses an unsigned request:

```bash
curl -i -X POST https://<your-domain>/api/webhooks/stripe -d '{}'
# expect HTTP/1.1 401
```

401 is the correct answer and proves the guard is live. A 200 here means the
signing secret is wrong and **anyone on the internet can mark orders paid** —
stop and fix it before taking a real payment.

> **If a tunnel URL from local development is still registered here, payments
> will succeed and orders will never confirm.** It is the most common
> launch-day failure. Stripe lets you keep several endpoints; delete the ones
> that are not this domain.

---

## Step 10 — Cron

`vercel.json` already declares five jobs; Vercel picks them up on deploy.

| Path | Schedule | Job |
|---|---|---|
| `/api/cron/reconcile-payments` | every 10 min | Ask Stripe directly about orders stuck unpaid — recovers a missed webhook |
| `/api/cron/retry-notifications` | every 10 min | Re-send any receipt or WhatsApp alert whose stamp is still NULL |
| `/api/cron/expire-orders` | every 15 min | Cancel stale unpaid orders |
| `/api/cron/low-stock` | hourly | Email the operator |
| `/api/cron/prune-webhooks` | monthly | Prune de-duplication rows |

1. **Settings → Cron Jobs** — confirm all five are listed.
2. Confirm your plan allows 5- and 10-minute intervals (the Hobby plan does not).
3. Vercel sends `Authorization: Bearer $CRON_SECRET`; the routes verify it in
   constant time. A missing or wrong secret returns 401.

---

## Step 11 — Verify before announcing

```bash
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/           # 200
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/shop       # 200
curl -s -o /dev/null -w "%{http_code}\n" https://<domain>/admin/orders # 307 → login
curl -s https://<domain>/robots.txt | head -3
```

Then in a browser:

- [ ] Homepage shows the finalised catalogue at the published prices
- [ ] The delivery panel reads S$10 / S$20 / free at S$200 from settings
- [ ] Add to bag → the drawer totals correctly and links to `/checkout`
- [ ] Checkout offers standard and express, and a slot list for each
- [ ] Express offers nothing after 9pm SGT; the site refuses orders after 10pm
- [ ] `/admin/login` accepts password + TOTP
- [ ] **Admin → Settings**: the slot hours and both fees are what you expect
- [ ] Bulk enquiry submits and appears in Admin → Enquiries

Finally run the **real-money smoke test** in `docs/GO-LIVE.md` Phase 7 — a live
low-value purchase and refund, paid by scanning the PayNow QR in your own
banking app. It is the only thing that proves the Stripe account, the webhook
secret, the Resend sender and the WhatsApp template are all right at once, and
none of it can be simulated.

---

## If you would rather not use Vercel

The app is a standard Next.js server — nothing in it is Vercel-specific except
`vercel.json`. On Railway, Fly or a container host:

- `npm ci && npm run build && npm start`
- Node 22, port from `$PORT`
- Replace Vercel Cron with any scheduler hitting the five routes with the
  `Authorization: Bearer $CRON_SECRET` header

Managed Postgres and the same environment variables apply unchanged.
