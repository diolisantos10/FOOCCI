# Foocci Security Notes

Practical security hardening applied for pre-pilot production.
Last updated: 2026-04-05.

---

## What was hardened

### 1. Security HTTP headers (`next.config.js`)
Applied on every route via Next.js `headers()`:
- `X-Frame-Options: DENY` — blocks clickjacking
- `X-Content-Type-Options: nosniff` — prevents MIME sniffing
- `Referrer-Policy: strict-origin-when-cross-origin` — limits referrer leakage
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()` — disables unused browser APIs
- `X-DNS-Prefetch-Control: off`
- `X-XSS-Protection: 1; mode=block` — legacy browser fallback

CSP (Content-Security-Policy) was intentionally omitted for now — it requires
careful tuning to not break the Next.js app (inline scripts, server components,
image domains). Add it once the app is stable.

### 2. Rate limiting (`src/lib/rate-limit.ts`)
In-memory sliding window counter. Applied to the most abuse-prone public endpoints:

| Endpoint | Limit |
|---|---|
| `POST /api/auth/lookup` | 10 req / 1 min per IP |
| `POST /api/qr/[slug]/identify` | 10 req / 1 min per IP |
| `POST /api/restaurants/register` | 5 req / 15 min per IP |

**Limitation:** In-memory — resets on server restart; does not scale across
multiple instances. For horizontal scale, replace with Upstash Redis
(env vars `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are already
in `.env.example`).

### 3. Audit logging (`src/lib/audit.ts`)
Structured JSON lines written to stdout. Events logged:

| Event | Route |
|---|---|
| `user.create` | `POST /api/users` |
| `user.delete` | `POST /api/admin/reset-owner` |
| `integration.update` | `PUT /api/evolution/config` |
| `conversation.takeover / assign / resolve / reopen` | `PATCH /api/conversations/[id]` |
| `order.status_change` | `PATCH /api/orders/[id]` |
| `payment.status_change` | `POST /api/payments/stone/webhook` |
| `auth.login_failure` | `POST /api/admin/reset-owner` (invalid secret) |

Audit logs never contain secrets, passwords, tokens, or raw payment data.

### 4. Hardened `admin/reset-owner`
This endpoint deletes all users for a restaurant. It is now:
- **Disabled by default** unless `ADMIN_SECRET` env var is set
- Requires `x-admin-secret: <value>` header matching `ADMIN_SECRET`
- Logs failed access attempts

**Reforço de 13/08/2026 (irreversível = três chaves, não uma):**
- comparação do segredo passou a ser de tempo constante
  (`checkAdminSecretHeader`, em `src/lib/admin-auth.ts`) — o `!==` cru saiu;
- **só cabeçalho**: o cookie de sessão do admin NÃO abre esta rota. Apagar acesso
  não pode depender de uma aba aberta;
- **alvo explícito**: o corpo exige `restaurantSlug`. A rota escolhia sozinha com
  `findFirst({ isActive: true })` — mira aleatória num produto multi-restaurante;
- **confirmação**: `confirm: "APAGAR-USUARIOS"`;
- `dryRun: true` responde quantas contas seriam apagadas sem apagar nenhuma;
- a tela pública `/recover?force=true`, que chamava esta rota a um clique do
  lojista (e sem mandar o segredo), **foi removida**. O portão estrutural
  `src/security/recoveryPathGuard.test.ts` impede que ela volte.

### 4b. `/api/recover` — rota pública que cria conta OWNER (13/08/2026)
Ela é liberada pelo middleware antes de qualquer sessão. Passou a exigir o estado
de instalação inequívoco: **exatamente um restaurante no banco**, ativo, e sem
proprietário ativo. Antes usava `findFirst({ isActive: true })` — bastava esse
restaurante sorteado estar sem OWNER para qualquer pessoa da internet virar dona
dele. O nome do restaurante só sai na resposta quando a recuperação está liberada.
Coberto por `src/app/api/recover/recoverRoute.test.ts` (as duas metades).

### 5. Fixed internal error leakage (`src/lib/api-response.ts`)
- `serverError()` no longer forwards the `details` argument to the JSON response;
  details are only logged server-side
- `withErrorHandler()` no longer leaks `err.message` to clients — returns
  generic "Internal server error" to the client while logging full error server-side

### 6. Input validation on `auth/lookup`
Added Zod email validation before the DB query to prevent garbage input.

### 7. Production warning for missing `STONE_WEBHOOK_SECRET`
Stone webhook now logs a `CRITICAL` error in production if the secret is not set,
making this misconfiguration immediately visible in Railway logs.

### 8. Server actions allowed origins
`next.config.js` now dynamically includes the production domain from
`NEXTAUTH_URL` in `serverActions.allowedOrigins` instead of only `localhost:3000`.

---

## What was already solid (do not break)

- **Multi-tenant isolation**: `getTenantContext()` + middleware header injection
  is used consistently across all authenticated routes. `restaurantId` is always
  sourced from the JWT/session, never from the client request body.
- **Route protection**: middleware validates JWT on every non-public path and
  injects tenant headers; dashboard layout also checks session server-side.
- **Zod validation**: comprehensive validators exist in `src/validators/` and
  are applied before every DB write across all routes.
- **Webhook HMAC verification**: Evolution and Stone webhooks both verify
  signatures with `timingSafeEqual`.
- **Evolution credential encryption**: AES-256-GCM applied via `ENCRYPTION_KEY`.
- **Password hashing**: bcryptjs with max 72-char truncation protection.
- **No raw card data**: Stone integration only stores `providerReference`,
  `paymentUrl`, `amount`, and `status` — no card numbers anywhere.

---

## Required environment variables

New variables introduced by this hardening:

| Variable | Required | Description |
|---|---|---|
| `ADMIN_SECRET` | No | If set, enables and protects `POST /api/admin/reset-owner`. Use a strong random string (≥ 32 chars). |
| `NEXT_PUBLIC_SUPPORT_WHATSAPP` | No | Número (só dígitos, com DDI) do canal de socorro mostrado na tela de login para quem não consegue entrar. Não é segredo — é público de propósito. |
| `NEXT_PUBLIC_SUPPORT_EMAIL` | No | Caixa de e-mail do mesmo canal de socorro. Sem nenhum dos dois, o login cai no formulário do site. |

Existing variables that must be set in production:

| Variable | Notes |
|---|---|
| `NEXTAUTH_SECRET` | Strong random secret (≥ 32 chars). Never reuse dev value. |
| `ENCRYPTION_KEY` | 64 hex chars (32 bytes). Never use the all-zeros dev default. Generate with `openssl rand -hex 32`. |
| `STONE_WEBHOOK_SECRET` | Required for Stone payment webhook signature verification. |
| `DATABASE_URL` | Must use SSL in production (`?sslmode=require`). |

---

## Future work (not yet implemented)

1. **Content-Security-Policy** — Add once app is stable; requires auditing all
   inline styles/scripts and `next/image` domains.

2. **Redis-backed rate limiting** — Replace in-memory `rate-limit.ts` with
   Upstash Redis for multi-instance deployments. Env vars already in
   `.env.example`.

3. **RBAC enforcement audit** — Role checks (OWNER/MANAGER/STAFF) exist in some
   routes (`users`, `evolution/config`, `settings/store`) but not all. Audit
   remaining routes (`/api/menu/*`, `/api/orders/drafts/*`) to ensure STAFF
   cannot perform owner-only operations.

4. **Password reset flow** — `/api/recover` exists but review it for
   time-limited token expiry and single-use enforcement.

5. **Audit log persistence** — Currently logs to stdout only (Railway collects
   these). For compliance, consider persisting to an `AuditLog` DB table or
   shipping to an external log sink.

6. **Session revocation** — JWT is stateless (30-day max age). If a user is
   deactivated or a credential is compromised, the token remains valid until
   expiry. Consider short-lived access tokens + refresh rotation, or a token
   blocklist in Redis.

7. **E2E bypass hardening** — The `E2E_SECRET` bypass in middleware is safe
   when the env var is absent. Ensure it is never set in production Railway
   environments.

8. **`/api/setup` and `/api/recover` review** — These are openly accessible
   (no auth). Confirm they self-disable after first use or add explicit
   protection.

9. **Media upload endpoint** — `/api/menu/upload` stores binary in DB.
   Add file-type validation and a maximum file size guard.

---

## Areas needing manual review

- **`/api/chat-sim/*` and `/api/qa-e2e/*`** — Test/simulation endpoints.
  Ensure these are not reachable in production (via Railway env: unset `E2E_SECRET`
  and confirm no direct access without the bypass header).
- **`/api/seed-menu`** — Menu seeding endpoint. Should be disabled or
  protected in production.
- **`OPENAI_API_KEY`** — Confirm it is only read in server-side code; never
  passed to `NEXT_PUBLIC_*` vars.
