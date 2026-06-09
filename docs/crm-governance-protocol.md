# CRM Governance Protocol

The contract that keeps Foocci CRM from becoming spam — and the rulebook a future
**CRM Brain/Agent** must obey. This foundation is additive and safe-by-default: it
strengthens the current CRM without a CRM Department, Simulation Lab or Library.

## 1. Goals

The CRM must be a relationship/retention/conversion machine, not a message
cannon. It must always know **who** was contacted, **what** (campaign + concept +
message), **when**, the outcome, whether the customer should not be contacted
again, and when they may be again.

## 2. The three identities of a contact

| Identity | Field | Purpose |
| --- | --- | --- |
| Campaign | `campaignId` | This specific campaign run (lost if deleted). |
| **Concept** | `Campaign.campaignFamilyKey` (e.g. `pascoa-2026`) | Stable concept — survives delete/recreate. |
| **Message** | `Campaign.messageFingerprint` | Normalized hash of the text — recognises the same message under a new id. |

`campaignFamilyKey` is auto-suggested from the name (`"Páscoa 2026"` →
`pascoa-2026`) and editable. `messageFingerprint` is computed by
`generateMessageFingerprint` (case/accents/spacing/template-vars/urls stripped),
so the same template recreated as a new campaign collapses to the same
fingerprint.

## 3. Impact ledger (memory)

`CRMContactLedger` is an **immutable** record of every relevant decision (SENT /
BLOCKED / FAILED / SKIPPED) with restaurantId, customerId, campaignId,
campaignFamilyKey, messageFingerprint, reasonCode, override flag. It has **no
foreign keys**: deleting a campaign or customer NEVER erases it. It stores no full
message text. The runner writes `SENT`; dedupe + preflight read it.

## 4. Dedupe (anti-spam, default ON)

Before sending, a customer is suppressed if (and `allowResendToImpacted` is off):
1. already SENT this **campaignId** → `BLOCKED_ALREADY_IMPACTED_CAMPAIGN`
2. already impacted by this **concept** (familyKey) within the window →
   `BLOCKED_ALREADY_IMPACTED_CONCEPT`
3. already received this **message** (fingerprint) within the window →
   `BLOCKED_DUPLICATE_MESSAGE`

Window: `dedupePolicy.dedupeWindowDays` (default 30; 0 = lifetime). Because the
ledger is empty for historical data, enabling this by default changes nothing for
live campaigns until impacts start being recorded.

## 5. Priority override (controlled exception)

`scheduleConfig.allowWeeklyCustomerCapOverride` (e.g. birthday) may exceed the
per-customer weekly cap. It is **logged** (`OVERRIDE_WEEKLY_LIMIT_USED`,
`usedPriorityOverride=true`, reason).

It can ignore: **only** `maxPerWeekPerCustomer`.
It can NOT ignore: opt-out, invalid phone, quiet hours, sending window, daily/weekly
global caps, paused campaign, same-campaign dedup, concept dedup, duplicate message.

## 6. Reason codes

`SENT`, `BLOCKED_COOLDOWN`, `BLOCKED_WEEKLY_LIMIT`, `BLOCKED_DAILY_GLOBAL_CAP`,
`BLOCKED_WEEKLY_GLOBAL_CAP`, `BLOCKED_CAMPAIGN_DAILY_LIMIT`, `BLOCKED_OPT_OUT`,
`BLOCKED_INVALID_PHONE`, `BLOCKED_ALREADY_IMPACTED_CAMPAIGN`,
`BLOCKED_ALREADY_IMPACTED_CONCEPT`, `BLOCKED_DUPLICATE_MESSAGE`,
`BLOCKED_OUTSIDE_SEND_WINDOW`, `BLOCKED_CAMPAIGN_PAUSED`, `BLOCKED_AUDIENCE_EMPTY`,
`FAILED_PROVIDER`, `FAILED_TEMPLATE`, `SKIPPED_NOT_ELIGIBLE`,
`OVERRIDE_WEEKLY_LIMIT_USED`.

## 7. Pre-send decision tree (per customer)

```
no phone?                         → BLOCKED_INVALID_PHONE
opt-out?                          → BLOCKED_OPT_OUT
already SENT this campaign?       → BLOCKED_ALREADY_IMPACTED_CAMPAIGN
dedupeByConcept & impacted?       → BLOCKED_ALREADY_IMPACTED_CONCEPT
dedupeByMessage & duplicate?      → BLOCKED_DUPLICATE_MESSAGE
weekly cap reached & no override? → BLOCKED_WEEKLY_LIMIT
cooldown active?                  → BLOCKED_COOLDOWN
global/campaign budget exhausted? → not sent today (forecast)
else                              → SENT  (+ ledger entry)
```

## 8. Preflight diagnosis

`CRMPreflightDiagnosisService.diagnosePreflight` (pure) +
`GET /api/crm/campaigns/[id]/preflight` answer, before sending: audience total,
eligible now, forecast today, and a blocked breakdown (opt-out, invalid phone,
already-impacted concept, duplicate message, weekly cap, global/campaign cap) +
warnings + recommendations.

## 9. Delete / recreate safety

- Deleting a campaign deletes its executions (FK cascade) but **NOT** the ledger.
- A recreated campaign with the same `campaignFamilyKey` (or same message →
  fingerprint) re-recognises already-impacted customers via the ledger.
- Editing the message recomputes the fingerprint on save.
- To deliberately resend to impacted customers, the operator must set
  `dedupePolicy.allowResendToImpacted = true` (default false); overrides are logged.

## 10. Human role + future CRM Brain readiness

A future CRM Agent **may** suggest: create/pause campaigns, change priority, build
segments, edit messages, raise caps.

It **must not**: ignore opt-out, ignore concept/message dedup, ignore global caps
without permission, send without preflight, delete the ledger, activate an override
without a reason, or send to an already-impacted customer without explicit
authorization. Every send must pass `ContactSafetyService.assertSendable` and be
recorded in the ledger. The human approves changes; the Agent proposes.
