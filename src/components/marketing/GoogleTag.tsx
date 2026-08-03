/**
 * Google tag (gtag.js) for the public marketing site.
 *
 * SCOPE — deliberately narrow. Mounted only in `app/site/layout.tsx`, which covers
 * every marketing page plus the bare domain (`/` redirects to `/site`). It is NOT
 * mounted in the root layout, and that is the point:
 *
 *   - the owner panel (`(dashboard)`) is authenticated product usage, not marketing
 *     traffic — mixing it in makes every acquisition metric on this property wrong;
 *   - the customer-facing store (`/pedido/[slug]`, `/qr/[slug]`) is **white-label**.
 *     Those visitors are the restaurant's diners, not our leads. Loading Foocci's
 *     analytics there would ship a third-party tracker onto a page that carries the
 *     restaurant's brand, without the restaurant or the diner ever agreeing to it.
 *
 * If someone later wants funnel data past the demo form, the answer is a conversion
 * event on the form — not widening this mount.
 *
 * MEASUREMENT ID is hardcoded on purpose. It is public by nature (it ships in the
 * HTML of every page), so an env var buys no secrecy — it only buys a new way to
 * fail: an unset variable would silently stop all tracking with no error anywhere,
 * and nobody notices missing analytics for weeks.
 *
 * SPA PAGE VIEWS: `config` fires one page_view on load. Navigations between
 * marketing pages are client-side, so they are counted by GA4's Enhanced
 * Measurement ("page changes based on browser history events"), which is ON by
 * default. No manual route listener here — adding one while that setting is enabled
 * double-counts every page view. If page views ever look inflated or missing, that
 * GA4 setting is the knob, not this file.
 *
 * PLAIN <script>, NOT next/script — and this was measured, not assumed. With
 * `next/script strategy="afterInteractive"` the loader is injected only after
 * hydration, so it is absent from the served HTML: verified by curling the built
 * page, which returned zero `<script src=…googletagmanager…>`. Anything that reads
 * the HTML without executing React — Google's own "Testar instalação", crawlers,
 * uptime checks — would report the tag as missing. Rendering the two tags exactly as
 * Google delivered them keeps them in the response body. `async` on the loader means
 * it still does not block rendering.
 */

export const GA_MEASUREMENT_ID = "G-VERBSTGMDV";

export function GoogleTag() {
  // Dev and preview traffic would pollute the launch numbers. `next build` always
  // sets NODE_ENV=production, so the tag is live in Railway and absent locally.
  if (process.env.NODE_ENV !== "production") return null;

  return (
    <>
      <script
        async
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_MEASUREMENT_ID}');`,
        }}
      />
    </>
  );
}
