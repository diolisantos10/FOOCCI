/**
 * importManualV01.ts
 *
 * Server-side import logic for Manual Operacional v0.1.
 * Safe, idempotent — mirrors scripts/import-manual-v01.mjs behaviour exactly.
 *
 * Safety rules (always enforced):
 *   - Never deletes chapters.
 *   - Never touches chapters not in the payload.
 *   - Creates a revision snapshot before overwriting non-empty content.
 *   - Never connects AI agents or embeddings.
 *   - Never exposes anything to restaurant users.
 *   - Never downgrades version (e.g. 0.2 → 0.1 is skipped with a warning).
 *   - agentVisibility is never set by this importer.
 */

import { prisma } from "@/lib/prisma";
import { ManualSourceType } from "@prisma/client";
import { MANUAL_V01_CONTENT } from "./manualV01Content";

// ── Types ────────────────────────────────────────────────────────────────────

export type ImportMode = "dry-run" | "publish";

export type ImportAction = "UPDATED" | "NO_CHANGE" | "MISSING" | "SKIPPED";

export interface ImportChapterResult {
  slug:             string;
  title:            string;
  action:           ImportAction;
  changes?:         string[];
  revisionCreated?: boolean;
  warning?:         string;
}

export interface ImportSummary {
  dryRun:           boolean;
  source:           ManualSourceType;
  payloadCount:     number;
  validationErrors: string[];
  results:          ImportChapterResult[];
  countUpdated:     number;
  countNoChange:    number;
  countMissing:     number;
  countSkipped:     number;
  countRevisions:   number;
  countPublished:   number;
}

// ── Validation constants ─────────────────────────────────────────────────────

const VALID_AREAS = [
  "GENERAL", "WAITER_AGENT", "CRM", "WHATSAPP", "UI_UX", "BRANDING",
  "INTEGRATIONS", "CHECKOUT", "PAYMENTS", "ANALYTICS", "SECURITY", "BACKLOG",
];

const VALID_STATUSES = ["IMPLEMENTED", "PARTIAL", "DECIDED", "BACKLOG"];

// ── Version helpers ──────────────────────────────────────────────────────────

function parseVersion(v: string | null | undefined): number[] {
  if (!v || typeof v !== "string") return [0, 0, 0];
  return v.split(".").map((n) => parseInt(n, 10) || 0);
}

function versionGte(a: string | null | undefined, b: string): boolean {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return true; // equal
}

// ── Main import function ─────────────────────────────────────────────────────

export async function runManualV01Import(
  mode: ImportMode,
  source: ManualSourceType,
): Promise<ImportSummary> {
  const dryRun  = mode === "dry-run";
  const content = MANUAL_V01_CONTENT;

  // ── Validate payload ───────────────────────────────────────────────────────

  const validationErrors: string[] = [];
  const seenSlugs = new Set<string>();

  for (let i = 0; i < content.length; i++) {
    const ch    = content[i];
    const label = `Entry[${i}] slug="${ch?.slug ?? "(missing)"}"`;

    if (!ch || typeof ch !== "object") {
      validationErrors.push(`${label}: not an object`);
      continue;
    }
    if (!ch.slug || typeof ch.slug !== "string") {
      validationErrors.push(`${label}: slug is required and must be a string`);
      continue;
    }
    if (seenSlugs.has(ch.slug)) {
      validationErrors.push(`${label}: duplicate slug "${ch.slug}"`);
    }
    seenSlugs.add(ch.slug);

    if (!ch.title || typeof ch.title !== "string" || !ch.title.trim()) {
      validationErrors.push(`${label}: title is required`);
    }
    if (!ch.area || !VALID_AREAS.includes(ch.area)) {
      validationErrors.push(`${label}: area "${ch.area}" is not valid. Valid: ${VALID_AREAS.join(", ")}`);
    }
    if (!ch.status || !VALID_STATUSES.includes(ch.status)) {
      validationErrors.push(`${label}: status "${ch.status}" is not valid. Valid: ${VALID_STATUSES.join(", ")}`);
    }
    if (!ch.content || typeof ch.content !== "string" || !ch.content.trim()) {
      validationErrors.push(`${label}: content must not be empty`);
    }
  }

  if (validationErrors.length > 0) {
    return {
      dryRun,
      source,
      payloadCount:     content.length,
      validationErrors,
      results:          [],
      countUpdated:     0,
      countNoChange:    0,
      countMissing:     0,
      countSkipped:     0,
      countRevisions:   0,
      countPublished:   0,
    };
  }

  // ── Load existing DB chapters ──────────────────────────────────────────────

  const dbChapters = await prisma.operationalManualChapter.findMany({
    select: {
      id: true, slug: true, title: true, area: true,
      status: true, version: true, content: true, isPublished: true,
    },
  });
  const dbBySlug = Object.fromEntries(dbChapters.map((c) => [c.slug, c]));

  // ── Process each payload entry ─────────────────────────────────────────────

  const results: ImportChapterResult[] = [];
  let countUpdated   = 0;
  let countNoChange  = 0;
  let countMissing   = 0;
  let countSkipped   = 0;
  let countRevisions = 0;
  let countPublished = 0;

  for (const ch of content) {
    const existing = dbBySlug[ch.slug];

    // Missing in DB
    if (!existing) {
      countMissing++;
      results.push({
        slug:    ch.slug,
        title:   ch.title,
        action:  "MISSING",
        warning: "Slug not found in DB. Run seed-manual.mjs to create base chapters.",
      });
      continue;
    }

    // Version downgrade guard
    const targetVersion = ch.version ?? "0.1";
    if (
      existing.version &&
      versionGte(existing.version, targetVersion) &&
      existing.version !== targetVersion
    ) {
      countSkipped++;
      results.push({
        slug:    ch.slug,
        title:   ch.title,
        action:  "SKIPPED",
        changes: [`DB version ${existing.version} >= payload version ${targetVersion} — no downgrade`],
      });
      continue;
    }

    // Diff
    const contentChanged = existing.content !== ch.content;
    const metaChanged    =
      existing.title  !== ch.title  ||
      existing.area   !== ch.area   ||
      existing.status !== ch.status;

    if (
      !contentChanged &&
      !metaChanged &&
      existing.version === targetVersion &&
      existing.isPublished
    ) {
      countNoChange++;
      results.push({ slug: ch.slug, title: ch.title, action: "NO_CHANGE" });
      continue;
    }

    // Build change list
    const changes: string[] = [];
    if (contentChanged)                      changes.push("content");
    if (existing.title  !== ch.title)        changes.push(`title→"${ch.title}"`);
    if (existing.area   !== ch.area)         changes.push(`area→${ch.area}`);
    if (existing.status !== ch.status)       changes.push(`status→${ch.status}`);
    if (existing.version !== targetVersion)  changes.push(`version→${targetVersion}`);
    if (!existing.isPublished)               changes.push("publish");

    const willRevision = contentChanged && !!existing.content?.trim();

    if (!dryRun) {
      // Create revision snapshot before overwriting non-empty content
      if (willRevision) {
        await prisma.operationalManualRevision.create({
          data: {
            chapterId:    existing.id,
            version:      existing.version ?? "0.0",
            content:      existing.content,
            sourceType:   source,
            changeSummary: `Snapshot before import-v01 update (${new Date().toISOString().slice(0, 10)})`,
            createdBy:    "import-v01-api",
          },
        });
        countRevisions++;
      }

      await prisma.operationalManualChapter.update({
        where: { id: existing.id },
        data: {
          title:       ch.title,
          area:        ch.area   as never,
          status:      ch.status as never,
          version:     targetVersion,
          content:     ch.content,
          isPublished: true,
          publishedAt: new Date(),
          updatedBy:   "import-v01-api",
        },
      });
    } else {
      if (willRevision) countRevisions++;
    }

    countUpdated++;
    countPublished++;
    results.push({
      slug:            ch.slug,
      title:           ch.title,
      action:          "UPDATED",
      changes,
      revisionCreated: willRevision,
    });
  }

  return {
    dryRun,
    source,
    payloadCount:     content.length,
    validationErrors: [],
    results,
    countUpdated,
    countNoChange,
    countMissing,
    countSkipped,
    countRevisions,
    countPublished,
  };
}
