# RAIO-X: Foocci Delivery Fee Architecture Audit

**Date:** 2026-05-24  
**Branch:** `claude/remove-legacy-runner-q8iXa`  
**Restaurant under audit:** `sushi-cazza`  
**Status:** CRITICAL — all distance-mode delivery orders are currently blocked in production

---

## 1. Executive Summary

The delivery fee system went through two distinct states:

- **Before commit `a80b0dd`:** All distance-mode orders silently charged only the base fee (R$ 5,00). No geocoding occurred. `calcDeliveryFeeFromConfig(cfg, null)` treated `distanceKm=null` as 0 km, so the per-km component was always zero. The restaurant was undercharging on every delivery order.

- **After commit `a80b0dd` (current production):** Real geocoding was added. The resolver now correctly blocks checkout when distance cannot be determined and no safe minimum fee fallback is configured. However, geocoding requires the restaurant's GPS coordinates (`StoreProfile.latitude` / `StoreProfile.longitude`), which are `NULL` in production. Because no `distanceMinFee` is configured either, every distance-mode delivery order returns `distance_blocked` and gets a 422 from `/finalize`. The restaurant **cannot accept any delivery orders right now**.

The root cause of the current regression: the new implementation requires restaurant GPS coordinates, but the system has never auto-populated them from the restaurant's existing address data — and no admin action was taken to fill them after deploy.

---

## 2. Current Delivery Architecture Map

```
[Restaurant Admin UI]
  settings/delivery/page.tsx           ← Configure mode, fees, zones
  settings/store/page.tsx              ← Configure address + lat/lng (manual input)
        │
        ▼ PUT /api/settings/delivery
  prisma.deliveryConfig                ← mode, fee, distanceBaseFee, distancePricePerKm,
                                          distanceMinFee, distanceMinFeeKm, distanceMaxFee,
                                          freeDeliveryAbove, minOrderValue
        │
        ▼ (separate, manual)
  prisma.storeProfile                  ← cep, street, city, state… latitude?, longitude?
                                          (lat/lng are NULL for sushi-cazza)

[Customer Ordering Flow]
  GET /pedido/[slug]/page.tsx          ← SSR: loads deliveryConfig, computes floor fee
        │                                 via calcDeliveryFeeFromConfig(cfg, null)
        │                                 (always = baseFee, ignores per-km)
        ▼
  PedidoClient.tsx                     ← prop: deliveryFee = baseFee (R$ 5)
        │
        ▼ [user confirms address]
  POST /api/pedido/[slug]/delivery-quote
        │   Loads storeProfile.latitude/longitude → NULL
        │   restaurantCoords = null → geocoding never tried
        │   distanceKm = null, distanceMinFee = null
        │   → calculationStatus = "distance_blocked"
        │   → PedidoClient shows error banner, blocks checkout button
        │
        ▼ [if not blocked — would reach]
  POST /api/pedido/[slug]/finalize
        │   Same resolver call, same result
        │   if distance_blocked → 422 (hard block before $transaction)
        │   if ok → prisma.$transaction saves Order, processes Pix
        ▼
  Order saved + Pix QR generated
```

---

## 3. Previous Working Behavior / Git History Findings

| Commit | Message | Delivery behavior |
|--------|---------|-------------------|
| `a80b0dd` | feat(delivery): real geocoded distance-based fee with checkout guard | **REGRESSION** — blocks all orders when lat/lng missing |
| `c4e8343` | fix(ci): Railway deploy service rename | No delivery change |
| `e9091e1` | fix(delivery): full config dump + per-km warning + freeDeliveryAbove safety guard | Last known "working" state (undercharging) |
| `f0f8857` | debug: delivery fee diagnostic logging | Added diagnostic logs |
| `96fe26c` | fix(delivery): correct delivery fee display | UI display fix only |

### Pre-geocoding behavior (commit `e9091e1`, `finalize/route.ts`)

```typescript
// Server side — treated unknown distance as 0 km
const floorFee = calcDeliveryFeeFromConfig(cfg, null);
// → baseFee + max(0, 0 - includedKm) × perKm = baseFee always

// Trusted client-supplied fee as the "real" fee
const raw = (clientDeliveryFee != null && clientDeliveryFee > 0)
  ? clientDeliveryFee
  : floorFee;

// But clientDeliveryFee itself was computed in PedidoClient as:
//   computeEffectiveFee(subtotal, deliveryFee, freeAbove)
// where deliveryFee = calcDeliveryFeeFromConfig(cfg, null) = baseFee
// Both sides used baseFee → always R$ 5 charged
```

### Pre-geocoding behavior (`pedido/[slug]/page.tsx`)

```typescript
// Page never loaded storeProfile.latitude/longitude
// For distance mode, floor fee computed as:
if (deliveryConfig.mode === "distance") {
  return calcDeliveryFeeFromConfig({
    baseFee:    Number(deliveryConfig.distanceBaseFee ?? 0),
    pricePerKm: Number(deliveryConfig.distancePricePerKm ?? 0),
    // ...
  }, null);  // ← null = distance unknown = 0 km
}
// Result: always returned baseFee (R$ 5)
```

**Conclusion:** The system has never actually computed real distance-based fees. The R$ 5 shown and charged was always just the base fee, regardless of customer distance.

---

## 4. Regression Root Cause

The new geocoded resolver requires two things to calculate distance:
1. **Restaurant GPS coordinates** (`storeProfile.latitude`, `storeProfile.longitude`)
2. **Customer address** (entered at checkout)

When restaurant coords are `NULL`, `restaurantCoords = null` is passed to `resolveDeliveryFee`. The resolver logic then:

```typescript
// In delivery-fee-resolver.ts
if (mode === "distance") {
  if (!restaurantCoords || !address) {
    // Can't geocode — check for fallback
    if (deliveryConfig.distanceMinFee != null) {
      return { calculationStatus: "distance_min_fee_fallback", deliveryFee: distanceMinFee }
    }
    // No fallback → BLOCK
    return { calculationStatus: "distance_blocked", deliveryFee: 0 }
  }
  // ... geocode and calculate
}
```

For `sushi-cazza`:
- `storeProfile.latitude` = `NULL` → `restaurantCoords` = `null`
- `deliveryConfig.distanceMinFee` = `NULL` (not configured)
- Result: `distance_blocked` on every delivery attempt

This affects **both** `/delivery-quote` (blocks confirm-address button in UI) and `/finalize` (returns 422).

---

## 5. Restaurant Address / Location Data Audit

### `StoreProfile` model fields (all optional)

```prisma
model StoreProfile {
  cep            String?    // e.g. "01310-100"
  street         String?    // e.g. "Rua Exemplo"
  streetNumber   String?
  complement     String?
  neighborhood   String?
  city           String?
  state          String?    // e.g. "SP"
  country        String?    @default("Brasil")
  referencePoint String?
  latitude       Float?     // ← NULL for sushi-cazza
  longitude      Float?     // ← NULL for sushi-cazza
}
```

### Settings UI behavior (`settings/store/page.tsx`)

- **CEP lookup**: Calls ViaCEP (`viacep.com.br`) to auto-fill `street`, `neighborhood`, `city`, `state`. Fast and reliable.
- **Lat/lng fields**: Present as plain text inputs. No geocoding from the address is triggered. Completely manual entry. No auto-populate.
- **There is no backstage process** that auto-geocodes the restaurant's address when settings are saved.

### Current production state

The `sushi-cazza` restaurant has a fully structured address in `StoreProfile` (cep, street, city, state all filled based on ViaCEP), but `latitude` and `longitude` are both `NULL` because the owner never entered them manually and no auto-geocoding exists.

---

## 6. Customer Address Data Audit

### How the customer address is collected (`PedidoClient.tsx`)

The customer enters address during the `ADDRESS_CONFIRM` step:
- `cep` — required, triggers ViaCEP autofill for neighborhood/city/state
- `street`, `number` — required
- `complement` — optional
- `neighborhood`, `city`, `state` — auto-filled from ViaCEP or manual

### How address reaches the API

`handleAddressConfirm` passes the address object to `POST /api/pedido/[slug]/delivery-quote`:
```json
{
  "deliveryType": "delivery",
  "subtotal": 85.00,
  "address": {
    "cep": "01310-100",
    "street": "Rua Exemplo",
    "number": "123",
    "neighborhood": "Centro",
    "city": "São Paulo",
    "state": "SP"
  }
}
```

This is then passed to `geocodeAddress()` in `delivery-fee-resolver.ts`. The customer address data is **sufficient for geocoding** (Nominatim can resolve from CEP + street + city alone). The customer side is not the problem.

### `Address` model (for saved addresses, not inline checkout)

```prisma
model Address {
  zipCode      String   // CEP
  street       String
  number       String
  complement   String?
  neighborhood String
  city         String
  state        String
}
```

Inline checkout uses a transient address object (not saved to `Address` table). Geocoding works on this transient data fine.

---

## 7. Geocoding / Provider Audit

### Architecture (`src/lib/geocoding.ts`)

```
geocodeAddress(address)
  → if GOOGLE_MAPS_API_KEY env var set:
      geocodeWithGoogleMaps(address, key)   ← 5s timeout, region=br, language=pt-BR
      if result: return it
  → fallback: geocodeWithNominatim(address) ← 6s timeout, countrycodes=br
                                              User-Agent: FOOCCI-Restaurant-System/1.0
```

### Provider comparison

| Provider | Cost | Rate limit | Brazilian coverage | Accuracy | Auth |
|----------|------|------------|-------------------|----------|------|
| Nominatim | Free | 1 req/s | Good | CEP-level, some gaps in small cities | None (User-Agent required) |
| Google Maps Geocoding | ~$5/1000 req | Very high | Excellent | Address-level, rooftop | `GOOGLE_MAPS_API_KEY` env var |

### Distance calculation

Uses **Haversine straight-line formula** (not road distance). Returns km. Typically 15–25% shorter than actual road distance. This means the fee is likely to be **slightly lower than actual delivery cost** for curved routes.

### Current status in production

- `GOOGLE_MAPS_API_KEY` env var: **unknown** (not audited, but not required — Nominatim is the fallback)
- Nominatim is accessible from Railway: **confirmed** (free, no auth)
- Geocoding of customer address: **would work** IF restaurant coords were available
- Restaurant geocoding: **never happens** — coords are not auto-populated

### Critical design flaw

`resolveDeliveryFee` only geocodes the **customer address** to get `customerCoords`, then computes Haversine distance between `restaurantCoords` and `customerCoords`. It does NOT geocode the restaurant address — it only reads pre-stored GPS coordinates from `StoreProfile`. If `StoreProfile.latitude/longitude` is NULL, geocoding of the customer address is completely skipped and distance remains unknown.

---

## 8. Checkout vs Finalize vs Pix Data Flow

### Current flow (post-`a80b0dd`)

```
[1] Page load (SSR) — pedido/[slug]/page.tsx
    • Loads deliveryConfig (mode, fees)
    • Computes checkoutDeliveryFee = calcDeliveryFeeFromConfig(cfg, null)
      → Always = baseFee for distance mode (R$ 5 for sushi-cazza)
    • Passes as prop: deliveryFee={checkoutDeliveryFee}

[2] PedidoClient — user adds items, selects delivery
    • Shows "Taxa de entrega: R$ 5,00" from the prop
    • deliveryMode prop = "distance"

[3] User confirms address → handleAddressConfirm (async)
    • Calls POST /delivery-quote
    • Gets back: { calculationStatus: "distance_blocked", deliveryFee: 0 }
    • Sets quoteError = "Não foi possível calcular a taxa de entrega..."
    • BLOCKS confirm button — user cannot proceed

[4] Finalize (would-be, if unblocked)
    • POST /api/pedido/[slug]/finalize
    • Loads storeProfile.latitude/longitude
    • Calls resolveDeliveryFee → distance_blocked → returns 422
    • Order NOT created, Pix NOT generated

[5] Pix amount (if order got through)
    • Pix QR = subtotal + finalDeliveryFee (from resolver result)
    • Cannot be reached currently
```

### Pre-geocoding flow (commit `e9091e1`)

```
[1-2] Same — baseFee shown

[3] No delivery-quote call — address was confirmed immediately
    • User proceeded directly to REVIEW_ORDER

[4] Finalize received:
    • clientDeliveryFee = baseFee (R$ 5) from client
    • Server: calcDeliveryFeeFromConfig(cfg, null) = baseFee
    • max(clientDeliveryFee, floorFee) = baseFee
    • Order created with deliveryFee = R$ 5

[5] Pix QR = subtotal + R$ 5 (always, regardless of distance)
```

---

## 9. Fix Path Options

Four viable options, from safest/fastest to most complete:

### Option A — Emergency: Set `distanceMinFee` (fastest, 2 minutes)

**What:** Configure `distanceMinFee` in the restaurant's delivery settings dashboard. Set it to a reasonable minimum (e.g., R$ 8,00 or R$ 10,00).

**Effect:** The resolver's fallback path activates: when restaurant coords are NULL, it falls back to `distanceMinFee` instead of blocking. Orders can proceed. Customers pay a flat minimum fee regardless of distance.

**Risk:** Not distance-accurate — all delivery orders pay the same minimum. Still undercharging distant customers.

**Time to implement:** 0 code changes required. Admin action only.

---

### Option B — Backstage auto-geocode on save (correct approach, ~1 day)

**What:** When `/api/settings/store` (or `/api/settings/delivery`) saves restaurant data, and `latitude`/`longitude` are NULL but a full address exists, trigger `geocodeAddress(storeProfile)` backstage and store the result.

**Effect:** Coordinates are populated automatically the next time any admin saves the store profile. No manual lat/lng entry needed.

**Implementation touch points:**
- `src/app/api/settings/store/route.ts` — add geocoding after upsert
- Alternatively: a one-time migration script that geocodes all restaurants with NULL coords

**Risk:** Nominatim rate limit (1 req/s). For a single restaurant this is fine. For mass migration of many restaurants, needs throttling.

**Time to implement:** ~2-4 hours coding + deploy.

---

### Option C — Auto-geocode on-demand in resolver (most resilient)

**What:** In `delivery-fee-resolver.ts`, when `restaurantCoords` is null but `restaurantId` is available, query `StoreProfile` and geocode the restaurant address at query time, caching the result back to DB.

**Effect:** Self-healing. First order attempt triggers geocoding; subsequent orders use the cached coords.

**Risk:** Adds DB writes to the order hot path. Race condition if multiple concurrent orders trigger simultaneous geocode+write.

**Time to implement:** ~1 day.

---

### Option D — Full rollback to pre-geocoding (temporary, not recommended)

**What:** Revert commit `a80b0dd`. Restore the old behavior where `clientDeliveryFee` from frontend is trusted and `calcDeliveryFeeFromConfig(cfg, null)` is the floor.

**Effect:** Orders flow again. Customers are undercharged (baseFee only). Acceptable as emergency measure.

**Risk:** Reintroduces the undercharging bug. Restaurant continues losing money on distance-based orders.

**Time to implement:** `git revert a80b0dd` + deploy.

---

## 10. Emergency Operational Recommendation

**Immediate action (right now, no code deploy needed):**

Log into the Foocci admin panel for `sushi-cazza` → Settings → Delivery → Commercial Rules → set **"Taxa mínima (R$)"** (distanceMinFee) to at least `8.00` and save.

This will activate the `distance_min_fee_fallback` path in the resolver. Every delivery order will charge at least R$ 8,00, which is better than blocking all orders entirely.

**Within 1 week:**

Implement **Option B** — auto-geocode the restaurant address backstage when the store profile is saved. Once coordinates are stored, the full distance-based fee calculation activates automatically.

**Do not:**
- Require restaurant owners to manually type lat/lng coordinates
- Roll back to the old undercharging behavior without a clear cutover plan
- Deploy Option C (on-demand geocoding in the hot path) without a caching layer

---

## 11. Files Involved

| File | Role | Status |
|------|------|--------|
| `src/lib/delivery-fee-resolver.ts` | Central fee resolver, geocoding orchestration | **New (this session)** |
| `src/lib/geocoding.ts` | Nominatim + Google Maps geocoding + Haversine | **New (this session)** |
| `src/lib/delivery.ts` | Legacy `calcDeliveryFeeFromConfig` — still used by `pedido/page.tsx` | Existing, not modified |
| `src/app/api/pedido/[slug]/finalize/route.ts` | Order finalization — now calls resolver, blocks on `distance_blocked` | **Modified (this session)** |
| `src/app/api/pedido/[slug]/delivery-quote/route.ts` | Pre-checkout fee quote endpoint | **New (this session)** |
| `src/app/pedido/[slug]/page.tsx` | SSR page — still uses `calcDeliveryFeeFromConfig(cfg, null)` for initial display | Existing, not modified |
| `src/app/pedido/[slug]/PedidoClient.tsx` | Checkout UI — now calls delivery-quote on address confirm | **Modified (this session)** |
| `src/app/(dashboard)/settings/delivery/page.tsx` | Admin delivery settings UI | Existing, not modified |
| `src/app/(dashboard)/settings/store/page.tsx` | Admin store profile UI — has lat/lng fields (manual) | Existing, not modified |
| `src/app/api/settings/delivery/route.ts` | Saves DeliveryConfig | Existing, not modified |
| `src/app/api/settings/store/route.ts` | Saves StoreProfile — **target for Option B** | Existing, not modified |
| `prisma/schema.prisma` | `StoreProfile.latitude/longitude Float?`, `DeliveryConfig.*` | Existing, not modified |

---

## 12. Risks and TODOs

### Known risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| All distance-mode delivery orders blocked in prod | **CRITICAL** | Set distanceMinFee (Option A) immediately |
| Restaurant lat/lng never auto-populated | **HIGH** | Option B — auto-geocode on settings save |
| Haversine underestimates road distance by 15–25% | **MEDIUM** | Accept as acceptable approximation; document in UI |
| Nominatim geocoding fails for rural addresses | **MEDIUM** | distanceMinFee fallback handles this case |
| `pedido/page.tsx` still shows baseFee as initial display fee | **LOW** | After quote call, correct fee replaces it in UI |
| No geocoding cache — every order quotes geocodes the customer address | **LOW** | Nominatim 1 req/s is fine at current restaurant volume |

### TODOs (after emergency fix)

1. **Option B**: Add auto-geocoding to `POST /api/settings/store` when address changes and lat/lng is null
2. **One-time script**: Geocode all existing restaurants with full address but NULL coords
3. **`pedido/page.tsx`**: Stop passing `calcDeliveryFeeFromConfig(cfg, null)` as the initial fee for distance mode; pass `null` or a loading state instead so the UI shows "Calcular…" rather than a misleading baseFee
4. **Test**: Add integration tests for distance_blocked, distance_min_fee_fallback, and distance_calculated paths
5. **Monitoring**: Alert when `distance_blocked` occurs in finalize (restaurant likely missing coords)
6. **UI warning**: In the delivery settings UI, show a warning when mode=distance and storeProfile has no GPS coords yet

---

*Audit produced from: git log, prisma/schema.prisma, src/lib/delivery.ts, src/lib/delivery-fee-resolver.ts, src/lib/geocoding.ts, src/app/api/pedido/[slug]/finalize/route.ts, src/app/api/pedido/[slug]/delivery-quote/route.ts, src/app/pedido/[slug]/page.tsx, src/app/(dashboard)/settings/delivery/page.tsx, src/app/(dashboard)/settings/store/page.tsx*
