# Evolution API — Railway Deployment Checklist

> Use this checklist when deploying the Evolution API service on Railway before
> enabling WhatsApp in a Foocci restaurant.
>
> **Never paste real secrets into this document.** Use placeholders like `<value>`.

---

## 1. Pre-requisites

- [ ] Railway account with access to the Foocci project (or a separate project for Evolution)
- [ ] Foocci production app already deployed and accessible at its public URL
- [ ] A WhatsApp number available to scan the QR code (a real SIM, not a virtual number)

---

## 2. Deploy Evolution API on Railway

1. In Railway, create a new service from the public Docker image:
   ```
   atendai/evolution-api:latest
   ```
   (or pin to a specific version, e.g. `atendai/evolution-api:v2.2.3`)

2. Set the service to expose port **8080** (Evolution API default).

3. Railway will generate a public URL for the service, e.g.:
   ```
   https://evolution-api-production-xxxx.up.railway.app
   ```
   Save this URL — it is needed in Foocci's advanced settings and in the environment variables below.

---

## 3. Railway Environment Variables — Evolution API Service

Set all of the following in the Evolution API Railway service **before** starting it.

| Variable | Value | Notes |
|---|---|---|
| `SERVER_URL` | `https://<evolution-railway-url>` | Public URL of this Evolution service, no trailing slash |
| `AUTHENTICATION_TYPE` | `apikey` | Use API key authentication |
| `AUTHENTICATION_API_KEY` | `<strong-random-string>` | This is the Evolution API key; must match `apiKey` saved in Foocci |
| `WEBHOOK_GLOBAL_ENABLED` | `true` | Enables global webhook delivery for all instances |
| `WEBHOOK_GLOBAL_URL` | `https://<foocci-url>/api/webhooks/evolution` | Foocci's webhook endpoint — replace `<foocci-url>` with the real production URL |
| `WEBHOOK_GLOBAL_SECRET` | `<strong-random-string>` | **Must exactly match the `webhookSecret` saved in Foocci's /integracoes/whatsapp advanced settings** |
| `WEBHOOK_EVENTS_MESSAGES_UPSERT` | `true` | Required — triggers on new incoming messages |
| `WEBHOOK_EVENTS_CONNECTION_UPDATE` | `true` | Required — triggers on connect/disconnect events |
| `DATABASE_ENABLED` | `true` (recommended) | Persists instance state across restarts |
| `DATABASE_CONNECTION_URI` | `<postgres-url>` | A dedicated PostgreSQL DB for Evolution (separate from Foocci's DB) |

> **Optional but recommended:** `WEBHOOK_EVENTS_MESSAGES_UPDATE=true` to track delivery receipts.

---

## 4. Foocci Advanced Settings — /integracoes/whatsapp

After Evolution is running, open Foocci as an OWNER and navigate to
**Integrações → WhatsApp** (`/integracoes/whatsapp`). Expand **Configurações Avançadas**.

| Field | Value |
|---|---|
| URL do servidor Evolution | `https://<evolution-railway-url>` (same as `SERVER_URL` above, no trailing slash) |
| API Key | Same value as `AUTHENTICATION_API_KEY` set in Railway |
| Nome da instância | A short slug, e.g. `restaurante-principal` (no spaces, no special chars) |
| Webhook Secret | Same value as `WEBHOOK_GLOBAL_SECRET` set in Railway |

Click **Salvar configuração**.

---

## 5. Critical Matching Rule — WEBHOOK_GLOBAL_SECRET ↔ webhookSecret

```
Railway Evolution service:   WEBHOOK_GLOBAL_SECRET = "abc123..."
Foocci /integracoes/whatsapp: webhookSecret field  = "abc123..."
                                                      ↑ must be identical
```

**If they do not match:**
- Evolution sends the webhook and receives `200 OK` from Foocci.
- Foocci's signature check fails silently and **drops the event**.
- WhatsApp messages will NOT appear in Central de Conversas (`/atendimento`).
- There is no visible error on either side — the mismatch is only detectable by the missing messages.

Generate both values at the same time from the same source (e.g. `openssl rand -hex 32`)
and paste the same string into both places.

---

## 6. Connect the WhatsApp Instance

1. In Foocci `/integracoes/whatsapp`, click **Conectar WhatsApp**.
2. A QR Code will appear (valid for ~60 seconds).
3. On the WhatsApp number for the restaurant: **Dispositivos vinculados → Vincular um dispositivo** → scan the QR.
4. Wait for the status to change to **Conectado**.
5. If the QR expires, click **Reconectar** to generate a new one.

---

## 7. End-to-End Smoke Test

After connecting, run this test before handing off to the restaurant:

| Step | Action | Expected result |
|---|---|---|
| 1 | Send **"Oi"** from any WhatsApp to the restaurant's number | — |
| 2 | Open Foocci `/atendimento` | A new conversation appears with the message "Oi" |
| 3 | Reply from the Foocci UI | The reply appears in WhatsApp on the sender's phone |
| 4 | Check the conversation status | Status shows OPEN or BOT depending on agent config |

If step 2 fails (no conversation appears):
- Check that `WEBHOOK_GLOBAL_SECRET` in Railway matches `webhookSecret` in Foocci exactly.
- Check that `WEBHOOK_GLOBAL_URL` points to the correct Foocci production URL.
- Check Railway logs on the Evolution service for outbound webhook delivery errors.
- Check Foocci application logs for `[webhook/evolution] Signature mismatch` or `Unknown instance`.

---

## 8. Webhook Authentication — How Foocci Verifies Events

Foocci's webhook endpoint (`/api/webhooks/evolution`) accepts two header strategies,
checked in this order:

### Strategy 1 — HMAC-SHA256 (preferred, not used by Evolution API v2 by default)

Header: `x-evolution-hmac-sha256`
Value: `HMAC-SHA256(rawRequestBody, webhookSecret)` as a hex string

Evolution API v2 does **not** send this header by default. This path is available
for future use (e.g. a proxy layer that adds HMAC signing).

### Strategy 2 — Plain token (used by Evolution API v2)

Header: `x-evolution-webhook-secret`
Value: the raw `webhookSecret` string (sent by Evolution when `WEBHOOK_GLOBAL_SECRET` is set)

**For the first pilot, Strategy 2 (plain token) is the active path.**
`WEBHOOK_GLOBAL_SECRET` in Evolution = `webhookSecret` in Foocci. That's the only requirement.

### What happens on mismatch

Foocci always returns `200 OK` regardless of signature result (to prevent Evolution
from retrying indefinitely). A failed signature check silently discards the event
with a server-side warning log only. The operator will not see an error — they will
only notice that messages stop appearing in `/atendimento`.

---

## 9. Post-Deploy Checklist

- [ ] Evolution Railway service running without crash loops (check Railway logs)
- [ ] `WEBHOOK_GLOBAL_SECRET` in Railway matches `webhookSecret` in Foocci **exactly**
- [ ] `WEBHOOK_GLOBAL_URL` points to the correct Foocci production URL
- [ ] Foocci advanced settings saved: URL, API Key, instanceName, webhookSecret
- [ ] QR Code scanned — status shows **Conectado** in Foocci
- [ ] Smoke test passed: send "Oi" → conversation appears in `/atendimento`
- [ ] Reply from `/atendimento` delivered to WhatsApp
