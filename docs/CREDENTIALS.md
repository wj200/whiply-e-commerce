# WHIPLY — every credential, audited against the code

Not a generic vendor list. Every entry below was verified against
`lib/config/env.ts` and its consumers on 20 Sept 2026. Where a key is optional
in the schema but breaks something in practice, that is stated.

**Tiers**

| Tier | Meaning |
|---|---|
| **A — Blocks deploy** | `parseEnv()` throws and the deploy fails. No silent degradation. |
| **B — Blocks a feature** | Deploy succeeds; something users touch is broken or invisible. |
| **C — Degrades quietly** | Works without it, worse. |
| **D — Not needed yet** | Declared in the schema, no runtime code reads it. |

---

## Tier A — the deploy will not start without these (11)

| Variable | Where it comes from | Notes |
|---|---|---|
| `DATABASE_URL` | Neon → **pooled** connection string | App queries. Must be the pooled one on serverless. |
| `NEXT_PUBLIC_SITE_URL` | Your domain | Must be `https://` in production. **Also inlined at build time** — set it before the first build, not after. |
| `AUTH_SECRET` | `openssl rand -base64 32` | Min 32 chars. Signs admin sessions. Rejected if it contains `dev-only`. |
| `CRON_SECRET` | `openssl rand -hex 32` | Min 8 chars. Guards the six cron routes. Rejected if it contains `dev-only`. |
| `HITPAY_API_BASE` | HitPay docs | Must **not** contain `sandbox` in production — the deploy checks. |
| `HITPAY_API_KEY` | HitPay dashboard → API keys | |
| `HITPAY_WEBHOOK_SALT` | HitPay dashboard → webhooks | **The single most sensitive value.** Without it a forged payment confirmation would be indistinguishable from a real one, which is exactly why the deploy refuses to start. |
| `LALAMOVE_API_BASE` | Lalamove | Must not contain `sandbox` in production. |
| `LALAMOVE_API_KEY` | Lalamove Partner API | |
| `LALAMOVE_API_SECRET` | Lalamove Partner API | |
| `LALAMOVE_WEBHOOK_SECRET` | Lalamove | Verifies delivery status callbacks. |

> **If Lalamove approval has not come through yet:** you still cannot deploy
> without these four, because the courier client reads them at module load.
> Workaround — set them to any non-empty placeholder and a base URL that does
> **not** contain the word `sandbox` (e.g. `https://rest.lalamove.com`). Keep
> `auto_dispatch_enabled` off and use **Record an off-platform delivery** on each
> order; that path never calls Lalamove. Swap in real keys when they arrive.
> Tell me if you'd rather I made these four genuinely optional instead.

`LALAMOVE_MARKET` defaults to `SG` — set it only if that changes.

---

## Tier B — deploy succeeds, something is broken (2)

| Variable | Where | What breaks without it |
|---|---|---|
| `TURNSTILE_SITE_KEY` | Cloudflare → Turnstile | The widget cannot render. |
| `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile | **Every bulk order enquiry is rejected.** `verifyTurnstile()` fails closed in production by design. |

> I found this while auditing and **changed the code**: production now refuses to
> start without both, rather than launching with a silently dead lead form. Two
> tests cover it. Development is unaffected.

---

## Tier C — works without, worse (6)

| Variable | Where | Without it |
|---|---|---|
| `DIRECT_DATABASE_URL` | Neon → **direct** (unpooled) string | Prisma falls back to `DATABASE_URL`. Migrations through a pooler can fail on advisory locks — set it. |
| `RESEND_API_KEY` | Resend → API keys | No operator email. Enquiries still save; **you simply never hear about them** unless you open the admin panel. Low-stock alerts also stop. |
| `OPERATOR_ALERT_EMAIL` | You | Same as above. Use an address you read on a phone. |
| `OPERATOR_EMAIL_FROM` | You | Defaults to `WHIPLY <alerts@whiply.sg>`. Must be on a domain verified in Resend. |
| `UPSTASH_REDIS_REST_URL` | Upstash | Rate limiting falls back to in-process memory — correct on one instance, not across several. Checkout and enquiry still fail closed. |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash | As above. |
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

1. **ACRA / UEN** — business profile PDF. Required by HitPay and Lalamove.
2. **Business bank account** in the business name. A personal account fails HitPay KYB.
3. **HitPay merchant account** + verification (days).
4. **Lalamove business account** + Partner API access (days).
5. **Written carrier confirmation for pressurised N₂O** — no key, no form. A
   conversation with a person. Gates turning auto-dispatch on; does not gate launch.
6. **Domain registrar** account.
7. **Vercel** account.
8. **Neon** account.
9. **Cloudflare** account (Turnstile — and later R2).
10. **Resend** account + DNS verification of your sending domain.
11. **Sentry** account.
12. **Stock image licence** — Unsplash/Pexels (free) or Adobe Stock. Keep the licences.

**Not needed:** Stripe. HitPay covers PayNow, cards and wallets in one account;
a second processor doubles reconciliation for nothing at this size.

---

## Generate these yourself

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -hex 32      # CRON_SECRET
```

Different values per environment. Never reuse a development secret in production.

---

## The admin account is not an env var

```bash
npm run admin:create owner@whiply.sg
```

Prompts for a password (min 12), generates a TOTP secret, prints the
`otpauth://` URI, and **refuses to create the account until you type a working
code back** — so a mis-scanned QR cannot lock you out. Store the secret
somewhere that is not the same phone as the authenticator app.
