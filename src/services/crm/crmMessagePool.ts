/**
 * crmMessagePool — the campaign's rotating phrase pool (PURE — no DB).
 *
 * A campaign can run SEVERAL phrases at once: the owner picks which ready-made
 * variants are on, plus up to MAX_CUSTOM_PHRASES phrases of their own. Each send
 * draws one at random and records its variantKey (the phrase fingerprint) on the
 * execution, so per-phrase effectiveness (sent → converted) can be measured — the
 * data the future CRM agent uses to breed better phrases.
 *
 * Stored in Campaign.scheduleConfig.messagePool:
 *   { selected?: string[]           // variantKeys of enabled ready-made variants
 *   , custom?: { id, text, on }[] } // owner-written phrases (≤5)
 *
 * Keys are content fingerprints (generateMessageFingerprint), so they survive
 * catalog reordering; editing a phrase's text gives it a new identity (fresh stats).
 * An empty/missing pool falls back to campaign.message — the exact legacy behavior.
 */

import { generateMessageFingerprint } from "./messageFingerprint";
import { getReadyMadeMessageVariants } from "./readyMadeCampaigns";

export const MAX_CUSTOM_PHRASES = 5;

export interface CustomPhrase {
  id:   string;
  text: string;
  /** false = kept but not rotating. Missing = on. */
  on?:  boolean;
}

export interface MessagePoolConfig {
  selected?: string[];
  custom?:   CustomPhrase[];
}

export interface PoolPhrase {
  /** Stable identity for stats: generateMessageFingerprint(text). */
  key:    string;
  text:   string;
  source: "catalog" | "custom" | "fallback";
}

/** variantKey for any phrase text (what executions record). */
export function phraseKey(text: string): string {
  return generateMessageFingerprint(text);
}

/** Reads scheduleConfig.messagePool defensively (JSON from the DB). */
export function parseMessagePool(scheduleConfig: unknown): MessagePoolConfig | null {
  if (!scheduleConfig || typeof scheduleConfig !== "object") return null;
  const raw = (scheduleConfig as { messagePool?: unknown }).messagePool;
  if (!raw || typeof raw !== "object") return null;
  const o = raw as { selected?: unknown; custom?: unknown };
  const selected = Array.isArray(o.selected) ? o.selected.filter((s): s is string => typeof s === "string") : undefined;
  const custom = Array.isArray(o.custom)
    ? o.custom
        .filter((c): c is { id?: unknown; text?: unknown; on?: unknown } => !!c && typeof c === "object")
        .map((c) => ({
          id:   typeof c.id === "string" ? c.id : "",
          text: typeof c.text === "string" ? c.text : "",
          on:   c.on !== false,
        }))
        .filter((c) => c.id && c.text.trim())
        .slice(0, MAX_CUSTOM_PHRASES)
    : undefined;
  if (!selected?.length && !custom?.length) return null;
  return { selected, custom };
}

/** Every phrase the owner COULD enable: catalog variants + their custom ones. */
export function listPoolCandidates(
  templateId: string | null | undefined,
  pool:       MessagePoolConfig | null,
): PoolPhrase[] {
  const out: PoolPhrase[] = [];
  const seen = new Set<string>();
  for (const text of templateId ? getReadyMadeMessageVariants(templateId) : []) {
    const key = phraseKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, text, source: "catalog" });
  }
  for (const c of pool?.custom ?? []) {
    const key = phraseKey(c.text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, text: c.text, source: "custom" });
  }
  return out;
}

/**
 * The phrases actually rotating for a campaign. Empty pool (or nothing matching
 * the current catalog) falls back to campaign.message so a campaign NEVER goes
 * silent because of stale selections.
 */
export function resolveActivePhrases(
  campaign: { templateId: string | null; message: string },
  pool:     MessagePoolConfig | null,
): PoolPhrase[] {
  const active: PoolPhrase[] = [];
  if (pool) {
    const selected = new Set(pool.selected ?? []);
    for (const cand of listPoolCandidates(campaign.templateId, pool)) {
      if (cand.source === "catalog" && selected.has(cand.key)) active.push(cand);
      if (cand.source === "custom") {
        const c = pool.custom?.find((x) => phraseKey(x.text) === cand.key);
        if (c && c.on !== false) active.push(cand);
      }
    }
  }
  if (active.length > 0) return active;
  const fallback = (campaign.message ?? "").trim();
  return fallback ? [{ key: phraseKey(fallback), text: fallback, source: "fallback" }] : [];
}

/** Uniform random draw (injectable RNG for tests). */
export function pickPhrase(phrases: PoolPhrase[], rand: () => number = Math.random): PoolPhrase | null {
  if (phrases.length === 0) return null;
  return phrases[Math.min(phrases.length - 1, Math.floor(rand() * phrases.length))] ?? null;
}

/** Per-phrase Meta template mapping stored in audienceConfig.metaTemplates. */
export interface PhraseMetaTemplate { name?: string; language?: string; params?: string[] }

export function readPhraseMetaTemplates(audienceConfig: unknown): Record<string, PhraseMetaTemplate> {
  if (!audienceConfig || typeof audienceConfig !== "object") return {};
  const raw = (audienceConfig as { metaTemplates?: unknown }).metaTemplates;
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, PhraseMetaTemplate> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== "object") continue;
    const o = v as PhraseMetaTemplate;
    if (typeof o.name === "string" && o.name) {
      out[k] = {
        name:     o.name,
        language: typeof o.language === "string" ? o.language : undefined,
        params:   Array.isArray(o.params) ? o.params.map(String) : undefined,
      };
    }
  }
  return out;
}
