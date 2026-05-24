/**
 * import-manual-v01.mjs
 *
 * Safe, idempotent import pipeline for Foocci Manual Operacional v0.1 content.
 *
 * Usage:
 *   node --env-file=.env.local scripts/import-manual-v01.mjs [options] [content-file]
 *
 * Arguments:
 *   content-file   Path to content file (default: scripts/manual-v01-content.mjs)
 *                  Must export a named `MANUAL_V01_CONTENT` array.
 *
 * Options:
 *   --dry-run          Print what would happen without writing anything.
 *   --publish          Mark updated chapters as published (isPublished=true).
 *   --create-missing   Create chapters that exist in payload but not in DB.
 *                      Default: skip unknown slugs and warn.
 *   --source="..."     Source tag for revision snapshots (default: "MANUAL").
 *                      Valid: CHATGPT | CLAUDE_AUDIT | CODE_AUDIT | MANUAL | DEPLOY | BUGFIX | PRODUCT_DECISION
 *   --help             Show this help text.
 *
 * Safety rules (always enforced, even without --dry-run):
 *   - Never deletes chapters.
 *   - Never touches chapters not included in the payload.
 *   - Creates a revision snapshot before overwriting existing non-empty content.
 *   - Never connects AI agents or embeddings.
 *   - Never exposes anything to restaurant users.
 *   - Never downgrades version (e.g. 0.2 → 0.1 is skipped with a warning).
 */

import { PrismaClient } from "@prisma/client";
import path from "path";
import { pathToFileURL } from "url";

// ── CLI argument parsing ───────────────────────────────────────────────────

const args = process.argv.slice(2);

if (args.includes("--help")) {
  console.log(`
import-manual-v01.mjs — safe, idempotent Manual Operacional content importer

Usage:
  node --env-file=.env.local scripts/import-manual-v01.mjs [options] [content-file]

Options:
  --dry-run          Print what would happen without writing anything.
  --publish          Mark updated chapters as published (isPublished=true).
  --create-missing   Create chapters that exist in payload but not in DB.
  --source="..."     Revision source tag (default: MANUAL).
                     Valid: CHATGPT | CLAUDE_AUDIT | CODE_AUDIT | MANUAL | DEPLOY | BUGFIX | PRODUCT_DECISION
  --help             Show this message.

content-file defaults to: scripts/manual-v01-content.mjs
  `);
  process.exit(0);
}

const DRY_RUN        = args.includes("--dry-run");
const PUBLISH        = args.includes("--publish");
const CREATE_MISSING = args.includes("--create-missing");

const sourceArg = args.find((a) => a.startsWith("--source="));
const SOURCE_RAW = sourceArg ? sourceArg.replace("--source=", "").replace(/^["']|["']$/g, "") : "MANUAL";

const VALID_SOURCES = ["CHATGPT", "CLAUDE_AUDIT", "CODE_AUDIT", "MANUAL", "DEPLOY", "BUGFIX", "PRODUCT_DECISION"];
if (!VALID_SOURCES.includes(SOURCE_RAW)) {
  console.error(`\n❌  --source="${SOURCE_RAW}" is not valid.`);
  console.error(`   Valid values: ${VALID_SOURCES.join(" | ")}`);
  process.exit(1);
}
const SOURCE = SOURCE_RAW;

// Content file path — positional arg or default
const positional = args.find((a) => !a.startsWith("--"));
const contentFilePath = positional
  ? path.resolve(process.cwd(), positional)
  : path.resolve(process.cwd(), "scripts/manual-v01-content.mjs");

// ── Validation constants ───────────────────────────────────────────────────

const VALID_AREAS = [
  "GENERAL", "WAITER_AGENT", "CRM", "WHATSAPP", "UI_UX", "BRANDING",
  "INTEGRATIONS", "CHECKOUT", "PAYMENTS", "ANALYTICS", "SECURITY", "BACKLOG",
];

const VALID_STATUSES = ["IMPLEMENTED", "PARTIAL", "DECIDED", "BACKLOG"];

// ── Version comparison (semver-light: "0.1" < "0.2" < "1.0") ──────────────

function parseVersion(v) {
  if (!v || typeof v !== "string") return [0, 0, 0];
  return v.split(".").map((n) => parseInt(n, 10) || 0);
}

function versionGte(a, b) {
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

// ── Main ───────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

async function main() {
  console.log(`\n📖  Foocci Manual Operacional — import pipeline`);
  console.log(`   content file : ${contentFilePath}`);
  console.log(`   dry-run      : ${DRY_RUN}`);
  console.log(`   publish      : ${PUBLISH}`);
  console.log(`   createMissing: ${CREATE_MISSING}`);
  console.log(`   source       : ${SOURCE}`);
  console.log("");

  // ── Load content file ──────────────────────────────────────────────────

  let MANUAL_V01_CONTENT;
  try {
    const mod = await import(pathToFileURL(contentFilePath).href);
    MANUAL_V01_CONTENT = mod.MANUAL_V01_CONTENT;
  } catch (err) {
    console.error(`\n❌  Cannot load content file: ${contentFilePath}`);
    console.error(`   ${err.message}`);
    console.error(`\n   Tip: copy the template first:`);
    console.error(`     cp scripts/manual-v01-content.template.mjs scripts/manual-v01-content.mjs`);
    process.exit(1);
  }

  if (!Array.isArray(MANUAL_V01_CONTENT)) {
    console.error("❌  Content file must export a named array: MANUAL_V01_CONTENT");
    process.exit(1);
  }

  // ── Validate payload ───────────────────────────────────────────────────

  const errors = [];
  const seenSlugs = new Set();

  for (let i = 0; i < MANUAL_V01_CONTENT.length; i++) {
    const ch = MANUAL_V01_CONTENT[i];
    const label = `Entry[${i}] slug="${ch?.slug ?? "(missing)"}"`;

    if (!ch || typeof ch !== "object") {
      errors.push(`${label}: not an object`);
      continue;
    }
    if (!ch.slug || typeof ch.slug !== "string") {
      errors.push(`${label}: slug is required and must be a string`);
      continue;
    }
    if (seenSlugs.has(ch.slug)) {
      errors.push(`${label}: duplicate slug "${ch.slug}"`);
    }
    seenSlugs.add(ch.slug);

    if (!ch.title || typeof ch.title !== "string" || !ch.title.trim()) {
      errors.push(`${label}: title is required`);
    }
    if (!ch.area || !VALID_AREAS.includes(ch.area)) {
      errors.push(`${label}: area "${ch.area}" is not valid. Valid: ${VALID_AREAS.join(", ")}`);
    }
    if (!ch.status || !VALID_STATUSES.includes(ch.status)) {
      errors.push(`${label}: status "${ch.status}" is not valid. Valid: ${VALID_STATUSES.join(", ")}`);
    }
    if (!ch.content || typeof ch.content !== "string" || !ch.content.trim()) {
      errors.push(`${label}: content must not be empty`);
    }
    if (ch.content && ch.content.trim() === ch.content.trim().replace(/\[PLACEHOLDER[^\]]*\]/g, "").trim()) {
      // content has no placeholder — OK
    }
  }

  if (errors.length > 0) {
    console.error("❌  Payload validation failed:\n");
    errors.forEach((e) => console.error(`   • ${e}`));
    process.exit(1);
  }

  console.log(`✅  Payload validated: ${MANUAL_V01_CONTENT.length} entries, no duplicates.\n`);

  // ── Check for placeholder-only content (warn, not block) ──────────────

  for (const ch of MANUAL_V01_CONTENT) {
    const hasOnlyPlaceholders = !/[A-Za-zÀ-ÿ]{10}/.test(
      ch.content.replace(/\[PLACEHOLDER[^\]]*\]/g, "").replace(/^#+\s.+$/gm, ""),
    );
    if (hasOnlyPlaceholders) {
      console.warn(`   ⚠️  "${ch.slug}": content appears to be all placeholders — will import as-is`);
    }
  }

  // ── Load existing DB chapters ──────────────────────────────────────────

  const dbChapters = await prisma.operationalManualChapter.findMany({
    select: { id: true, slug: true, title: true, area: true, status: true, version: true, content: true, isPublished: true },
  });
  const dbBySlug = Object.fromEntries(dbChapters.map((c) => [c.slug, c]));

  // ── Process each payload entry ─────────────────────────────────────────

  let countUpdated   = 0;
  let countCreated   = 0;
  let countSkipped   = 0;
  let countMissing   = 0;
  let countRevisions = 0;
  let countPublished = 0;

  for (const ch of MANUAL_V01_CONTENT) {
    const existing = dbBySlug[ch.slug];

    if (!existing) {
      countMissing++;
      if (!CREATE_MISSING) {
        console.warn(`   ⚠️  MISSING  — "${ch.slug}" not found in DB (use --create-missing to create it)`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`   🔍  DryRun  — CREATE "${ch.title}" (${ch.area}, ${ch.status})`);
        countCreated++;
        continue;
      }

      await prisma.operationalManualChapter.create({
        data: {
          slug:        ch.slug,
          title:       ch.title,
          area:        ch.area,
          status:      ch.status,
          version:     ch.version ?? "0.1",
          content:     ch.content,
          isPublished: PUBLISH,
          createdBy:   "import-v01",
        },
      });

      console.log(`   ✅  CREATED  — "${ch.title}" (${ch.area}, published=${PUBLISH})`);
      countCreated++;
      if (PUBLISH) countPublished++;
      continue;
    }

    // Chapter exists — check if version would downgrade
    const targetVersion = ch.version ?? "0.1";
    if (existing.version && versionGte(existing.version, targetVersion) && existing.version !== targetVersion) {
      console.warn(`   ⏭  SKIPPED  — "${ch.slug}": DB version ${existing.version} >= payload version ${targetVersion} (no downgrade)`);
      countSkipped++;
      continue;
    }

    // Check if content is actually changing
    const contentChanged = existing.content !== ch.content;
    const metaChanged    = existing.title  !== ch.title  ||
                           existing.area   !== ch.area   ||
                           existing.status !== ch.status;

    if (!contentChanged && !metaChanged && existing.version === targetVersion) {
      console.log(`   ⏭  NO-CHANGE — "${ch.slug}": content and metadata identical`);
      countSkipped++;
      continue;
    }

    if (DRY_RUN) {
      const changes = [];
      if (contentChanged) changes.push("content");
      if (existing.title  !== ch.title)  changes.push(`title→"${ch.title}"`);
      if (existing.area   !== ch.area)   changes.push(`area→${ch.area}`);
      if (existing.status !== ch.status) changes.push(`status→${ch.status}`);
      if (existing.version !== targetVersion) changes.push(`version→${targetVersion}`);
      if (PUBLISH && !existing.isPublished) changes.push("publish");
      console.log(`   🔍  DryRun  — UPDATE "${ch.slug}": ${changes.join(", ")}`);
      if (contentChanged && existing.content?.trim()) {
        console.log(`              → would create revision snapshot (source: ${SOURCE})`);
        countRevisions++;
      }
      countUpdated++;
      if (PUBLISH && !existing.isPublished) countPublished++;
      continue;
    }

    // Create revision snapshot before overwriting non-empty content
    if (contentChanged && existing.content?.trim()) {
      await prisma.operationalManualRevision.create({
        data: {
          chapterId:   existing.id,
          version:     existing.version ?? "0.0",
          content:     existing.content,
          sourceType:  SOURCE,
          description: `Snapshot before import-v01 update (${new Date().toISOString().slice(0, 10)})`,
          createdBy:   "import-v01",
        },
      });
      countRevisions++;
    }

    // Update chapter
    await prisma.operationalManualChapter.update({
      where: { id: existing.id },
      data: {
        title:       ch.title,
        area:        ch.area,
        status:      ch.status,
        version:     targetVersion,
        content:     ch.content,
        ...(PUBLISH ? { isPublished: true } : {}),
      },
    });

    const changes = [];
    if (contentChanged) changes.push("content");
    if (existing.title  !== ch.title)  changes.push(`title`);
    if (existing.area   !== ch.area)   changes.push(`area→${ch.area}`);
    if (existing.status !== ch.status) changes.push(`status→${ch.status}`);
    if (existing.version !== targetVersion) changes.push(`version→${targetVersion}`);
    if (PUBLISH && !existing.isPublished) changes.push("published");

    console.log(`   ✅  UPDATED  — "${ch.slug}": ${changes.join(", ")}`);
    countUpdated++;
    if (PUBLISH && !existing.isPublished) countPublished++;
  }

  // ── Summary ────────────────────────────────────────────────────────────

  console.log("\n" + "─".repeat(60));
  console.log("📊  Import Summary");
  console.log("─".repeat(60));
  console.log(`   Updated   : ${countUpdated}`);
  console.log(`   Created   : ${countCreated}`);
  console.log(`   Skipped   : ${countSkipped}  (no change or version downgrade)`);
  console.log(`   Missing   : ${countMissing}  (slug not in DB; use --create-missing to create)`);
  console.log(`   Revisions : ${countRevisions}  (snapshots created before overwrite)`);
  console.log(`   Published : ${countPublished}`);
  if (DRY_RUN) {
    console.log("\n   ⚠️  DRY-RUN — no changes were written to the database.");
  }
  console.log("─".repeat(60));
  console.log("📖  Manual import complete.\n");
}

main()
  .catch((err) => {
    console.error("\n❌  Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
