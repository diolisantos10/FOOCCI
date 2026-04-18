import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FieldMapping {
  phone: string;      // required column name in uploaded file
  name?: string;
  email?: string;
  birthday?: string;
}

export interface NormalizedRow {
  name: string | null;
  phone: string;         // E.164
  email: string | null;
  birthday: Date | null;
  sourceRow: number;
}

export interface ImportPreview {
  totalRows: number;
  newCount: number;
  updateCount: number;
  invalidCount: number;
  dupesInFile: number;
  sample: Array<{
    name: string | null;
    phone: string;
    email: string | null;
    status: "new" | "update" | "invalid";
    reason?: string;
  }>;
}

export interface ImportResult {
  created: number;
  updated: number;
  invalid: number;
  total: number;
}

// ── Phone normalization ───────────────────────────────────────────────────────

function normalizePhone(raw: string): string | null {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();

  // Already E.164
  if (/^\+[1-9]\d{7,14}$/.test(trimmed)) return trimmed;

  const digits = trimmed.replace(/\D/g, "");
  if (!digits || digits.length < 8) return null;

  // Brazil: 10 digits (DDD+8) or 11 digits (DDD+9+8)
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;

  // Brazil with country code prefix
  if (
    (digits.length === 12 || digits.length === 13) &&
    digits.startsWith("55")
  )
    return `+${digits}`;

  // Generic international (8–15 digits after +)
  if (digits.length <= 15) return `+${digits}`;

  return null;
}

// ── Name cleaning ─────────────────────────────────────────────────────────────

function cleanName(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  const cleaned = raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}\s.\-']/gu, "")
    .trim();
  return cleaned.length >= 2 ? cleaned : null;
}

// ── Birthday parsing ──────────────────────────────────────────────────────────

function parseBirthday(raw: string | undefined | null): Date | null {
  if (!raw?.trim()) return null;
  const v = raw.trim();

  // DD/MM/YYYY
  const br = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br && br[1] && br[2] && br[3]) {
    const d = new Date(
      `${br[3]}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`
    );
    if (!isNaN(d.getTime())) return d;
  }

  // YYYY-MM-DD or other ISO-like
  const iso = new Date(v);
  if (!isNaN(iso.getTime())) return iso;

  return null;
}

// ── Row processing ────────────────────────────────────────────────────────────

function mapRow(
  raw: Record<string, string>,
  mapping: FieldMapping,
  rowIndex: number
): { ok: true; row: NormalizedRow } | { ok: false; reason: string } {
  const rawPhone = raw[mapping.phone] ?? "";
  const phone = normalizePhone(rawPhone);
  if (!phone) {
    return {
      ok: false,
      reason: `Telefone inválido: "${rawPhone}"`,
    };
  }

  const name = mapping.name ? cleanName(raw[mapping.name]) : null;
  const email = mapping.email
    ? (raw[mapping.email]?.trim() || null)
    : null;
  const birthday = mapping.birthday ? parseBirthday(raw[mapping.birthday]) : null;

  // Validate email format if provided
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    // non-fatal — just drop email
    return {
      ok: true,
      row: { name, phone, email: null, birthday, sourceRow: rowIndex },
    };
  }

  return {
    ok: true,
    row: { name, phone, email, birthday, sourceRow: rowIndex },
  };
}

// ── Core processing ───────────────────────────────────────────────────────────

interface ProcessedData {
  valid: NormalizedRow[];
  invalid: Array<{ row: number; reason: string }>;
  dupesInFile: number;
}

function processRows(
  rawRows: Record<string, string>[],
  mapping: FieldMapping
): ProcessedData {
  const invalid: Array<{ row: number; reason: string }> = [];
  const seenPhones = new Map<string, number>(); // phone → first row index
  const valid: NormalizedRow[] = [];
  let dupesInFile = 0;

  rawRows.forEach((raw, i) => {
    const result = mapRow(raw, mapping, i + 1);
    if (!result.ok) {
      invalid.push({ row: i + 1, reason: result.reason });
      return;
    }

    const { row } = result;
    if (seenPhones.has(row.phone)) {
      // Duplicate in file — merge: keep later non-empty values
      dupesInFile++;
      const existingIndex = seenPhones.get(row.phone)!;
      const existing = valid[existingIndex]!;
      // Prefer non-null values from either row
      if (!existing.name && row.name) existing.name = row.name;
      if (!existing.email && row.email) existing.email = row.email;
      if (!existing.birthday && row.birthday) existing.birthday = row.birthday;
    } else {
      seenPhones.set(row.phone, valid.length);
      valid.push(row);
    }
  });

  return { valid, invalid, dupesInFile };
}

// ── Public service ────────────────────────────────────────────────────────────

export class ImportService {
  /**
   * Dry-run: returns preview counts without writing to DB.
   * Full-run: upserts all valid rows, returns result counts.
   */
  static async process(
    restaurantId: string,
    rawRows: Record<string, string>[],
    mapping: FieldMapping,
    dryRun: boolean
  ): Promise<ImportPreview | ImportResult> {
    const { valid, invalid, dupesInFile } = processRows(rawRows, mapping);

    // Bulk lookup existing customers by phone
    const phones = valid.map((r) => r.phone);
    const existingRows = await prisma.customer.findMany({
      where: { restaurantId, phone: { in: phones } },
      select: { id: true, phone: true, name: true, email: true, birthDate: true },
    });
    const existingMap = new Map(existingRows.map((c) => [c.phone, c]));

    const toCreate = valid.filter((r) => !existingMap.has(r.phone));
    const toUpdate = valid
      .filter((r) => existingMap.has(r.phone))
      .map((r) => {
        const existing = existingMap.get(r.phone)!;
        // Merge logic: only overwrite with non-empty values
        const patch: Record<string, unknown> = {};
        if (r.name && !existing.name) patch.name = r.name;
        if (r.email && !existing.email) patch.email = r.email;
        if (r.birthday && !existing.birthDate) patch.birthDate = r.birthday;
        return { id: existing.id, patch };
      });

    if (dryRun) {
      const sampleRows = valid.slice(0, 8).map((r) => ({
        name: r.name,
        phone: r.phone,
        email: r.email,
        status: existingMap.has(r.phone)
          ? ("update" as const)
          : ("new" as const),
      }));
      const invalidSample = invalid.slice(0, 3).map((e) => ({
        name: null,
        phone: `Linha ${e.row}`,
        email: null,
        status: "invalid" as const,
        reason: e.reason,
      }));

      return {
        totalRows: rawRows.length,
        newCount: toCreate.length,
        updateCount: toUpdate.length,
        invalidCount: invalid.length,
        dupesInFile,
        sample: [...sampleRows, ...invalidSample].slice(0, 8),
      };
    }

    // ── Execute ──────────────────────────────────────────────────────────────

    // Create new customers
    let created = 0;
    if (toCreate.length > 0) {
      // createMany in batches of 200
      const BATCH = 200;
      for (let i = 0; i < toCreate.length; i += BATCH) {
        const batch = toCreate.slice(i, i + BATCH);
        const res = await prisma.customer.createMany({
          data: batch.map((r) => ({
            restaurantId,
            name: r.name ?? "Sem nome",
            phone: r.phone,
            email: r.email ?? null,
            birthDate: r.birthday ?? null,
          })),
          skipDuplicates: true,
        });
        created += res.count;
      }
    }

    // Update existing customers (only fields with non-empty patch)
    let updated = 0;
    const updatesWithPatch = toUpdate.filter(
      (u) => Object.keys(u.patch).length > 0
    );
    if (updatesWithPatch.length > 0) {
      const BATCH = 50;
      for (let i = 0; i < updatesWithPatch.length; i += BATCH) {
        const batch = updatesWithPatch.slice(i, i + BATCH);
        await prisma.$transaction(
          batch.map(({ id, patch }) =>
            prisma.customer.update({ where: { id }, data: patch })
          )
        );
        updated += batch.length;
      }
    }
    // Count updates where no fields changed (phone matched but nothing to merge)
    const noChangeUpdates = toUpdate.length - updatesWithPatch.length;
    updated += noChangeUpdates;

    return {
      created,
      updated,
      invalid: invalid.length,
      total: rawRows.length,
    };
  }
}
