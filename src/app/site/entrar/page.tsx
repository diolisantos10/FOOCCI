/**
 * /site/entrar — private preview gate page.
 *
 * Lives OUTSIDE the (gated) group, so it is reachable while every marketing page is
 * gated. Renders the branded password screen. If already authenticated, sends the
 * visitor on to the site. noindex like the rest of /site.
 */

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PreviewGate } from "@/components/marketing/preview/PreviewGate";
import { isPreviewAuthed, isPreviewConfigured } from "@/components/marketing/preview/previewAuth";

export const metadata: Metadata = {
  title: { absolute: "Prévia privada | Foocci" },
  robots: { index: false, follow: true },
};

export const dynamic = "force-dynamic";

/** Only allow returning to internal /site paths (no open redirect). */
function safeNext(next?: string): string {
  if (next && next.startsWith("/site") && !next.startsWith("/site/entrar")) return next;
  return "/site";
}

export default function EntrarPage({ searchParams }: { searchParams: { next?: string } }) {
  if (isPreviewAuthed()) {
    redirect(safeNext(searchParams?.next));
  }
  return <PreviewGate configured={isPreviewConfigured()} next={safeNext(searchParams?.next)} />;
}
