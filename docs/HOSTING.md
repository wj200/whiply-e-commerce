# WHIPLY — hosting, step by step

Exact commands and clicks to get `wj200/whiply-e-commerce` running on a real
domain. Assumes Vercel + Neon, which is what the build is written for. Roughly
two hours of work, spread across whatever HitPay and Lalamove verification take.

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
HITPAY_API_BASE           <live base URL>
HITPAY_API_KEY            <live key>
HITPAY_WEBHOOK_SALT       <webhook salt>
LALAMOVE_API_BASE         https://rest.lalamove.com
LALAMOVE_API_KEY          <key>
LALAMOVE_API_SECRET       <secret>
LALAMOVE_MARKET           SG
LALAMOVE_WEBHOOK_SECRET   <secret>
TURNSTILE_SITE_KEY        <from step 3>
TURNSTILE_SECRET_KEY      <from step 3>
RESEND_API_KEY            <step 7>
OPERATOR_ALERT_EMAIL      <your inbox>
UPSTASH_REDIS_REST_URL    <step 6>
UPSTASH_REDIS_REST_TOKEN  <step 6>
SENTRY_DSN                <step 8>
```

**Two things that bite here:**

- `NEXT_PUBLIC_SITE_URL` is inlined into the client bundle **at build time**.
  Changing it later requires a redeploy, not just an env edit.
- **Never put live keys in the Preview environment.** Preview builds from every
  branch and is the easiest place to leak a production credential.

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
npx tsx prisma/seed.ts        # 4 products, 8 settings
npm run admin:create owner@whiply.sg
```

`admin:create` prints an `otpauth://` URI — scan it, then type the 6-digit code
back. It will not create the account until a code verifies.

Confirm:

```bash
npx prisma studio    # or psql: SELECT sku, price_cents FROM products;
```

You should see four products and eight settings rows.

---

## Step 6 — Upstash Redis

1. Sign up at **upstash.com** → **Create Database**, region **Singapore**.
2. From **REST API**, copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. Add both to Vercel → redeploy.

Skippable at launch — rate limiting falls back to in-process memory, which is
correct on a single instance.

---

## Step 7 — Resend (the only email this system sends)

1. Sign up at **resend.com** → **Domains → Add Domain**.
2. Add the **SPF, DKIM and DMARC** records it gives you at your registrar.
3. Wait for **Verified**. Without this the alert lands in spam, which is
   indistinguishable from the feature not working.
4. **API Keys → Create** → `RESEND_API_KEY`.
5. Set `OPERATOR_ALERT_EMAIL` to an address you read on a phone.

---

## Step 8 — Sentry

1. Sign up at **sentry.io** → new **Next.js** project.
2. Copy the **DSN** → `SENTRY_DSN`.
3. Turn on PII scrubbing **before** the first real order — orders carry a name,
   phone, email and address.

---

## Step 9 — Webhooks (after the domain is live)

Both providers need a public HTTPS URL, so this comes after Step 4.

**HitPay dashboard → Webhooks:**
```
https://<your-domain>/api/webhooks/hitpay
```

**Lalamove dashboard → Webhooks:**
```
https://<your-domain>/api/webhooks/lalamove
```

Verify they respond (401 is correct — an unsigned request must be refused):

```bash
curl -i -X POST https://<your-domain>/api/webhooks/hitpay -d 'test=1'
# expect HTTP/1.1 401
```

> **If any tunnel URL from local development is still registered here, payments
> will succeed and orders will never confirm.** It is the most common launch-day
> failure. Check both dashboards.

---

## Step 10 — Cron

`vercel.json` already declares six jobs; Vercel picks them up on deploy.

| Path | Schedule | Job |
|---|---|---|
| `/api/cron/dispatch` | every 5 min | Sweep queued dispatches |
| `/api/cron/reconcile-payments` | every 10 min | Recover missed HitPay webhooks |
| `/api/cron/reconcile-deliveries` | every 15 min | Poll quiet deliveries |
| `/api/cron/expire-orders` | every 15 min | Cancel stale unpaid orders |
| `/api/cron/low-stock` | hourly | Email the operator |
| `/api/cron/prune-webhooks` | monthly | Prune de-duplication rows |

1. **Settings → Cron Jobs** — confirm all six are listed.
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

- [ ] Homepage shows four products at the agreed prices
- [ ] The delivery banner reads your configured threshold
- [ ] Add to bag → the drawer totals correctly
- [ ] `/admin/login` accepts password + TOTP
- [ ] **Admin → Settings: `auto_dispatch_enabled` is OFF**
- [ ] Bulk enquiry submits and appears in Admin → Enquiries

Finally run the **real-money smoke test** in `docs/GO-LIVE.md` Phase 7 — a live
S$1 purchase and refund. It is the only thing that proves the account
configuration is right, and none of it can be simulated.

---

## If you would rather not use Vercel

The app is a standard Next.js server — nothing in it is Vercel-specific except
`vercel.json`. On Railway, Fly or a container host:

- `npm ci && npm run build && npm start`
- Node 22, port from `$PORT`
- Replace Vercel Cron with any scheduler hitting the six routes with the
  `Authorization: Bearer $CRON_SECRET` header

Managed Postgres and the same environment variables apply unchanged.
