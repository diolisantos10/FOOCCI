/**
 * googleAnalytics — Google Analytics 4 reads via the official REST APIs, called
 * with fetch + a valid OAuth access token (analytics.readonly scope):
 *
 *   properties → https://analyticsadmin.googleapis.com/v1beta/accountSummaries
 *   report     → https://analyticsdata.googleapis.com/v1beta/{property}:runReport
 *
 * This is the SERVER-SIDE Data API (real metrics), distinct from the existing
 * client-side gtag.js measurement-id tag stored in RestaurantBrandConfig.
 */

const ADMIN_SUMMARIES = "https://analyticsadmin.googleapis.com/v1beta/accountSummaries";
const DATA_API        = "https://analyticsdata.googleapis.com/v1beta";

export interface Ga4Property {
  property: string;     // "properties/123456789"
  displayName: string;
  account: string;      // parent account display name
}

/** List the GA4 properties the connected Google user can read. */
export async function listGa4Properties(accessToken: string): Promise<Ga4Property[]> {
  const out: Ga4Property[] = [];
  let pageToken: string | undefined;
  do {
    const url = pageToken
      ? `${ADMIN_SUMMARIES}?pageSize=200&pageToken=${encodeURIComponent(pageToken)}`
      : `${ADMIN_SUMMARIES}?pageSize=200`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!res.ok) break;
    const data = (await res.json().catch(() => ({}))) as {
      accountSummaries?: Array<{
        displayName?: string;
        propertySummaries?: Array<{ property?: string; displayName?: string }>;
      }>;
      nextPageToken?: string;
    };
    for (const acc of data.accountSummaries ?? []) {
      for (const p of acc.propertySummaries ?? []) {
        if (p.property) {
          out.push({
            property: p.property,
            displayName: p.displayName ?? p.property,
            account: acc.displayName ?? "—",
          });
        }
      }
    }
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

export interface Ga4Snapshot {
  ok: boolean;
  rangeDays: number;
  totals: {
    activeUsers: number;
    sessions: number;
    screenPageViews: number;
    conversions: number;
  };
  topPages: Array<{ path: string; views: number }>;
  byDay: Array<{ date: string; activeUsers: number; sessions: number }>;
  error?: string;
}

interface RunReportResponse {
  rows?: Array<{ dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> }>;
  error?: { message?: string };
}

async function runReport(accessToken: string, propertyId: string, body: unknown): Promise<RunReportResponse> {
  const res = await fetch(`${DATA_API}/${propertyId}:runReport`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await res.json().catch(() => ({}))) as RunReportResponse;
}

const num = (v?: string) => (v ? Number(v) || 0 : 0);

/** Pull a compact dashboard snapshot for the selected GA4 property. */
export async function fetchSnapshot(
  accessToken: string,
  propertyId: string,
  rangeDays = 28,
): Promise<Ga4Snapshot> {
  const dateRanges = [{ startDate: `${rangeDays}daysAgo`, endDate: "today" }];
  try {
    // 1) Totals
    const totalsResp = await runReport(accessToken, propertyId, {
      dateRanges,
      metrics: [
        { name: "activeUsers" }, { name: "sessions" },
        { name: "screenPageViews" }, { name: "conversions" },
      ],
    });
    if (totalsResp.error) {
      return emptySnapshot(rangeDays, totalsResp.error.message ?? "Falha ao consultar o GA4.");
    }
    const t = totalsResp.rows?.[0]?.metricValues ?? [];
    const totals = {
      activeUsers:     num(t[0]?.value),
      sessions:        num(t[1]?.value),
      screenPageViews: num(t[2]?.value),
      conversions:     num(t[3]?.value),
    };

    // 2) Top pages + 3) By day (best-effort; totals already succeeded)
    const [pagesResp, dayResp] = await Promise.all([
      runReport(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: "pagePath" }],
        metrics: [{ name: "screenPageViews" }],
        orderBys: [{ metric: { metricName: "screenPageViews" }, desc: true }],
        limit: 5,
      }),
      runReport(accessToken, propertyId, {
        dateRanges,
        dimensions: [{ name: "date" }],
        metrics: [{ name: "activeUsers" }, { name: "sessions" }],
        orderBys: [{ dimension: { dimensionName: "date" } }],
      }),
    ]);

    const topPages = (pagesResp.rows ?? []).map((r) => ({
      path: r.dimensionValues?.[0]?.value ?? "—",
      views: num(r.metricValues?.[0]?.value),
    }));
    const byDay = (dayResp.rows ?? []).map((r) => {
      const raw = r.dimensionValues?.[0]?.value ?? ""; // YYYYMMDD
      const date = raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}` : raw;
      return {
        date,
        activeUsers: num(r.metricValues?.[0]?.value),
        sessions:    num(r.metricValues?.[1]?.value),
      };
    });

    return { ok: true, rangeDays, totals, topPages, byDay };
  } catch (e) {
    return emptySnapshot(rangeDays, e instanceof Error ? e.message : "Falha ao consultar o GA4.");
  }
}

function emptySnapshot(rangeDays: number, error: string): Ga4Snapshot {
  return {
    ok: false,
    rangeDays,
    totals: { activeUsers: 0, sessions: 0, screenPageViews: 0, conversions: 0 },
    topPages: [],
    byDay: [],
    error,
  };
}
