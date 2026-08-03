/**
 * Analytics tags for Foocci's own commercial site.
 *
 * Renders nothing at all when no id is configured — an empty analytics block is worse
 * than none, because it looks installed in the page source and reports nothing.
 *
 * The ids are validated in `SiteSettingsService` against a strict whitelist before they
 * reach this component: they are interpolated into a <script>, so a malformed value
 * would be a script-injection vector on every page of the public site.
 */

import Script from "next/script";
import type { SiteSettings } from "@/services/site/SiteSettingsService";

export function SiteAnalytics({ settings }: { settings: SiteSettings }) {
  const { gaMeasurementId, metaPixelId } = settings;
  if (!gaMeasurementId && !metaPixelId) return null;

  return (
    <>
      {gaMeasurementId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${gaMeasurementId}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${gaMeasurementId}');`}
          </Script>
        </>
      ) : null}

      {metaPixelId ? (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${metaPixelId}');
fbq('track', 'PageView');`}
          </Script>
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
