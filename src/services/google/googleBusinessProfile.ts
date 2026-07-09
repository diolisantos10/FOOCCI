/**
 * googleBusinessProfile — Google Business Profile (Meu Negócio) reads via the
 * official REST APIs, called with fetch + a valid OAuth access token:
 *
 *   accounts   → https://mybusinessaccountmanagement.googleapis.com/v1/accounts
 *   locations  → https://mybusinessbusinessinformation.googleapis.com/v1/{account}/locations
 *   reviews    → https://mybusiness.googleapis.com/v4/{account}/{location}/reviews
 *
 * Reviews live on the legacy v4 surface which Google gates behind per-project
 * approval; calls degrade gracefully (returns `available: false`) when the
 * project is not yet allowlisted, so the UI never hard-fails.
 *
 * Writes: replyToReview() publishes/updates the owner reply to a review
 *   PUT https://mybusiness.googleapis.com/v4/{review.name}/reply
 */

const ACCOUNTS_URL  = "https://mybusinessaccountmanagement.googleapis.com/v1/accounts";
const BUSINESS_INFO = "https://mybusinessbusinessinformation.googleapis.com/v1";
const LEGACY_V4     = "https://mybusiness.googleapis.com/v4";

export interface BusinessAccount { name: string; accountName: string }
export interface BusinessLocation {
  name: string;            // "locations/123"
  title: string;           // display name
  accountName: string;     // parent "accounts/123"
  address: string | null;
}

async function gget(url: string, accessToken: string): Promise<{ ok: boolean; status: number; json: unknown }> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

/** List the Business Profile accounts the connected Google user manages. */
export async function listAccounts(accessToken: string): Promise<BusinessAccount[]> {
  const out: BusinessAccount[] = [];
  let pageToken: string | undefined;
  do {
    const url = pageToken ? `${ACCOUNTS_URL}?pageToken=${encodeURIComponent(pageToken)}` : ACCOUNTS_URL;
    const { ok, json } = await gget(url, accessToken);
    if (!ok) break;
    const data = json as { accounts?: Array<{ name?: string; accountName?: string }>; nextPageToken?: string };
    for (const a of data.accounts ?? []) {
      if (a.name) out.push({ name: a.name, accountName: a.accountName ?? a.name });
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

/** List locations under every account the user manages (flattened). */
export async function listLocations(accessToken: string): Promise<BusinessLocation[]> {
  const accounts = await listAccounts(accessToken);
  const out: BusinessLocation[] = [];
  const readMask = "name,title,storefrontAddress";
  for (const acc of accounts) {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ readMask, pageSize: "100" });
      if (pageToken) params.set("pageToken", pageToken);
      const url = `${BUSINESS_INFO}/${acc.name}/locations?${params.toString()}`;
      const { ok, json } = await gget(url, accessToken);
      if (!ok) break;
      const data = json as {
        locations?: Array<{ name?: string; title?: string; storefrontAddress?: { addressLines?: string[]; locality?: string; administrativeArea?: string } }>;
        nextPageToken?: string;
      };
      for (const loc of data.locations ?? []) {
        if (!loc.name) continue;
        const addr = loc.storefrontAddress;
        const address = addr
          ? [addr.addressLines?.join(", "), addr.locality, addr.administrativeArea].filter(Boolean).join(" · ")
          : null;
        out.push({
          name: loc.name,
          title: loc.title ?? loc.name,
          accountName: acc.name,
          address: address || null,
        });
      }
      pageToken = data.nextPageToken;
    } while (pageToken);
  }
  return out;
}

export interface ReviewSummary {
  available: boolean;
  averageRating: number | null;
  totalReviewCount: number | null;
  reviews: Array<{
    name: string | null;        // "accounts/../locations/../reviews/.." — needed to reply
    reviewer: string;
    starRating: number | null;
    comment: string | null;
    createTime: string | null;
    reply: string | null;
  }>;
  reason?: string;
}

const STAR_MAP: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };

/** Fetch recent reviews for a location. Degrades gracefully when v4 is gated. */
export async function fetchReviews(
  accessToken: string,
  accountName: string,   // "accounts/123"
  locationName: string,  // "locations/456"
): Promise<ReviewSummary> {
  const url = `${LEGACY_V4}/${accountName}/${locationName}/reviews?pageSize=20`;
  const { ok, status, json } = await gget(url, accessToken);
  if (!ok) {
    return {
      available: false,
      averageRating: null,
      totalReviewCount: null,
      reviews: [],
      reason: status === 403
        ? "A API de avaliações do Google (v4) requer aprovação do projeto. Conexão e seleção funcionam; avaliações ficam disponíveis após a liberação pela Google."
        : `Não foi possível carregar avaliações (HTTP ${status}).`,
    };
  }
  const data = json as {
    averageRating?: number;
    totalReviewCount?: number;
    reviews?: Array<{
      name?: string;
      reviewer?: { displayName?: string };
      starRating?: string;
      comment?: string;
      createTime?: string;
      reviewReply?: { comment?: string };
    }>;
  };
  return {
    available: true,
    averageRating: data.averageRating ?? null,
    totalReviewCount: data.totalReviewCount ?? null,
    reviews: (data.reviews ?? []).map((r) => ({
      name:      r.name ?? null,
      reviewer:  r.reviewer?.displayName ?? "Cliente",
      starRating: r.starRating ? (STAR_MAP[r.starRating] ?? null) : null,
      comment:   r.comment ?? null,
      createTime: r.createTime ?? null,
      reply:     r.reviewReply?.comment ?? null,
    })),
  };
}

/**
 * Reply to (or update the reply on) a Google review. Real v4 write:
 *   PUT https://mybusiness.googleapis.com/v4/{review.name}/reply  body { comment }
 * `reviewName` is the full resource path returned by fetchReviews (review.name).
 * Degrades gracefully (never throws) — returns { ok:false, reason } on failure.
 */
export async function replyToReview(
  accessToken: string,
  reviewName: string,   // "accounts/123/locations/456/reviews/789"
  comment: string,
): Promise<{ ok: boolean; reason?: string }> {
  const res = await fetch(`${LEGACY_V4}/${reviewName}/reply`, {
    method:  "PUT",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body:    JSON.stringify({ comment }),
  });
  if (!res.ok) {
    return {
      ok: false,
      reason: res.status === 403
        ? "A API de avaliações do Google (v4) requer aprovação do projeto para responder."
        : `Não foi possível enviar a resposta (HTTP ${res.status}).`,
    };
  }
  return { ok: true };
}
