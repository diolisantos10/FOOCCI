/**
 * Analytics tags for Foocci's own commercial site.
 *
 * Renders nothing at all when no id is configured — an empty analytics block is worse
 * than none, because it looks installed in the page source and reports nothing.
 *
 * The ids are validated in `SiteSettingsService` against a strict whitelist before they
 * reach this component: they are interpolated into a <script>, so a malformed value
 * would be a script-injection vector on every page of the public site.
 *
 * PLAIN <script>, NOT next/script — and this was measured, not assumed. With
 * `strategy="afterInteractive"` the loader is injected only after hydration, so it is
 * absent from the served HTML: curling the built page returned zero
 * `<script src=…googletagmanager…>`. Anything that reads HTML without executing React —
 * Google's own "Testar instalação", Meta's Pixel Helper diagnostics, crawlers — would
 * report the tag as missing. With plain tags Next hoists the loader into <head>;
 * `async` keeps it non-blocking either way.
 */

import type { SiteSettings } from "@/services/site/SiteSettingsService";

export function SiteAnalytics({ settings }: { settings: SiteSettings }) {
  const { gaMeasurementId, metaPixelId } = settings;
  if (!gaMeasurementId && !metaPixelId) return null;

  return (
    <>
      {gaMeasurementId ? (
        <>
          <script
            async
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
          />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaMeasurementId}');`,
            }}
          />
        </>
      ) : null}

      {metaPixelId ? (
        <>
          <script
            dangerouslySetInnerHTML={{
              __html: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixelId}');
fbq('track', 'PageView');`,
            }}
          />
          {/* noscript fallback — a real share of mobile traffic blocks JS */}
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${metaPixelId}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      ) : null}
    </>
  );
}
