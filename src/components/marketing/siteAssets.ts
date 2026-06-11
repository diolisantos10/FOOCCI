/**
 * Official site asset slots — server-only helper.
 *
 * The approved mockup uses real photography (restaurant ambience + journey
 * lifestyle shots). Those files are delivered by the founder and dropped into
 * `public/brand/foocci/site/` with the EXACT names below. Components check the
 * slot at request time (/site is force-dynamic): when a file exists it renders
 * automatically — no code change needed. Until then, faithful structural
 * fallbacks (official mascot/anagram + warm tones) keep the layout identical.
 *
 * Do NOT import from client components (uses fs).
 */

import fs from "fs";
import path from "path";

const PUBLIC_DIR = path.join(process.cwd(), "public");

/** True when a file exists under /public (path relative, no leading slash). */
export function hasAsset(rel: string): boolean {
  try {
    return fs.existsSync(path.join(PUBLIC_DIR, rel));
  } catch {
    return false;
  }
}

/** Canonical asset slots (relative to /public). */
export const SITE_ASSETS = {
  /** Empty warm restaurant scene w/ curved counter (hero background, ~16:9). */
  heroRestaurant: "brand/foocci/site/hero-restaurant.jpg",
  /** Journey medallions (square/circular crops). */
  journey: [
    "brand/foocci/site/journey-1-cliente.jpg",   // mulher sorrindo com celular
    "brand/foocci/site/journey-2-pedido.jpg",    // mão com app Foocci
    "brand/foocci/site/journey-3-crm.jpg",       // homem com celular
    "brand/foocci/site/journey-4-campanha.jpg",  // prato premium
    "brand/foocci/site/journey-5-volta.jpg",     // casal jantando
  ],
  /** Owner/chef with tablet (institutional). */
  ownerTablet: "brand/foocci/site/owner-tablet.jpg",
  /** Foocci app on phone in restaurant (product shot). */
  appPhone: "brand/foocci/site/app-phone.jpg",
} as const;
