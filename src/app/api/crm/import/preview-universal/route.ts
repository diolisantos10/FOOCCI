// Preview-universal: dry-run analysis using a confirmed ColumnMapping.
// NEVER writes to the database. Returns quality counts only.
import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { prisma } from "@/lib/prisma";
import {
  ColumnMapping,
  validateMapping,
  CANONICAL_FIELDS,
} from "@/services/crm/UniversalFieldMapper";

// ── Phone normalization (mirror of ImportService.ts) ─────────────────────────

function normalizePhone(raw: string): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;
  const digits = trimmed.replace(/\D/g, "");
  if (!digits || digits.length < 8) return null;
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`;
  if (digits.length <= 15) return `+${digits}`;
  return null;
}

// ── Request body types ────────────────────────────────────────────────────────

interface PreviewRequest {
  rows:          Record<string, string>[];
  columnMappings: ColumnMapping[];
  importType?:   "customers" | "products" | "generic";
}

interface PreviewResult {
  totalRows:           number;
  mappedRows:          number;
  contactable:         number;   // rows with valid phone
  nonContactable:      number;   // rows without phone but with name/email
  skipped:             number;   // rows with no identifying fields at all
  conflicts:           number;   // existing customers in DB
  invalidPhones:       number;
  duplicatesInFile:    number;
  validationErrors:    string[];
  validationWarnings:  string[];
  qualityScore:        number;   // 0–100
  fieldCoverage:       Array<{ canonicalKey: string; label: string; nonEmptyCount: number; percent: number }>;
  sampleMapped:        Array<Record<string, string>>;  // up to 5 rows re-keyed by canonicalKey
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: PreviewRequest;
  try {
    body = await req.json() as PreviewRequest;
  } catch {
    return NextResponse.json({ error: "Corpo JSON inválido" }, { status: 400 });
  }

  const { rows, columnMappings, importType = "customers" } = body;

  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: "rows é obrigatório" }, { status: 400 });
  }
  if (!Array.isArray(columnMappings) || columnMappings.length === 0) {
    return NextResponse.json({ error: "columnMappings é obrigatório" }, { status: 400 });
  }

  // Validate mapping first
  const validation = validateMapping(columnMappings, importType);

  // Build source→canonical lookup (ignore unmapped columns)
  const srcToCanonical = new Map<string, string>();
  for (const { sourceHeader, canonicalKey } of columnMappings) {
    if (canonicalKey) srcToCanonical.set(sourceHeader, canonicalKey);
  }

  const phoneMapping    = columnMappings.find((m) => m.canonicalKey === "phone");
  const nameMapping     = columnMappings.find((m) => m.canonicalKey === "name");
  const emailMapping    = columnMappings.find((m) => m.canonicalKey === "email");

  // ── Per-row analysis ───────────────────────────────────────────────────────

  let contactable      = 0;
  let nonContactable   = 0;
  let skipped          = 0;
  let invalidPhones    = 0;
  let duplicatesInFile = 0;

  const seenPhones = new Set<string>();
  const validPhones: string[] = [];

  // Field coverage: count non-empty values per canonicalKey
  const coverageCount = new Map<string, number>();
  for (const { canonicalKey } of columnMappings) {
    if (canonicalKey) coverageCount.set(canonicalKey, 0);
  }

  const sampleMapped: Array<Record<string, string>> = [];

  for (const row of rows) {
    // Re-key row by canonicalKey
    const remapped: Record<string, string> = {};
    for (const [src, canonical] of srcToCanonical) {
      const val = row[src] ?? "";
      remapped[canonical] = val;
      if (val.trim()) {
        coverageCount.set(canonical, (coverageCount.get(canonical) ?? 0) + 1);
      }
    }

    if (sampleMapped.length < 5) sampleMapped.push(remapped);

    const rawPhone = phoneMapping ? (row[phoneMapping.sourceHeader] ?? "") : "";
    const rawName  = nameMapping  ? (row[nameMapping.sourceHeader]  ?? "") : "";
    const rawEmail = emailMapping ? (row[emailMapping.sourceHeader] ?? "") : "";

    if (rawPhone.trim()) {
      const normalized = normalizePhone(rawPhone);
      if (!normalized) {
        invalidPhones++;
        nonContactable++;
      } else if (seenPhones.has(normalized)) {
        duplicatesInFile++;
        contactable++;  // still valid, just a dupe
      } else {
        seenPhones.add(normalized);
        validPhones.push(normalized);
        contactable++;
      }
    } else if (rawName.trim() || rawEmail.trim()) {
      nonContactable++;
    } else {
      skipped++;
    }
  }

  // ── DB conflict check (existing phones) ────────────────────────────────────
  let conflicts = 0;
  if (validPhones.length > 0) {
    const existing = await prisma.customer.count({
      where: { restaurantId: ctx.restaurantId, phone: { in: validPhones } },
    });
    conflicts = existing;
  }

  // ── Field coverage summary ─────────────────────────────────────────────────
  const fieldCoverage = [...coverageCount.entries()].map(([key, count]) => {
    const field = CANONICAL_FIELDS.find((f) => f.key === key);
    return {
      canonicalKey:  key,
      label:         field?.label ?? key,
      nonEmptyCount: count,
      percent:       rows.length > 0 ? Math.round((count / rows.length) * 100) : 0,
    };
  });

  // ── Quality score ──────────────────────────────────────────────────────────
  // Simple heuristic: penalize low contactable rate + validation errors
  const contactableRate   = rows.length > 0 ? contactable / rows.length : 0;
  const errorPenalty      = Math.min(validation.errors.length * 15, 40);
  const warningPenalty    = Math.min(validation.warnings.length * 5, 20);
  const qualityScore      = Math.max(
    0,
    Math.round(contactableRate * 100 - errorPenalty - warningPenalty)
  );

  const result: PreviewResult = {
    totalRows:          rows.length,
    mappedRows:         rows.length - skipped,
    contactable,
    nonContactable,
    skipped,
    conflicts,
    invalidPhones,
    duplicatesInFile,
    validationErrors:   validation.errors,
    validationWarnings: validation.warnings,
    qualityScore,
    fieldCoverage,
    sampleMapped,
  };

  return NextResponse.json(result);
}
