/**
 * Robust QR extraction from Evolution API responses.
 *
 * Evolution API versions differ in how they return QR codes.
 * This helper tries all known field paths and normalises the result.
 *
 * Never logs or returns the full base64 string.
 */

export interface ExtractedQR {
  base64:      string | null;  // data:image/png;base64,... ready to use in <img src>
  code:        string | null;  // text QR code (2@...)
  pairingCode: string | null;  // 8-digit pairing code alternative
  foundIn:     string | null;  // field path where base64 was found (for diagnostics)
  availableKeys: string[];     // top-level keys present in the raw response
}

function isBase64Image(v: unknown): v is string {
  if (typeof v !== "string" || v.length < 20) return false;
  return v.startsWith("data:image") || /^[A-Za-z0-9+/]{20}/.test(v);
}

function normaliseBase64(v: string): string {
  if (v.startsWith("data:")) return v;
  return `data:image/png;base64,${v}`;
}

function isTextCode(v: unknown): v is string {
  if (typeof v !== "string") return false;
  // WhatsApp QR text codes start with a digit and are long
  return v.length > 10 && /^\d@/.test(v);
}

function isPairingCode(v: unknown): v is string {
  if (typeof v !== "string") return false;
  // Pairing codes are 8 alphanumeric chars, sometimes hyphenated: ABCD-EFGH
  return /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i.test(v.trim());
}

// Safely read a nested path like "qrcode.base64"
function dig(obj: unknown, ...keys: string[]): unknown {
  let cur: unknown = obj;
  for (const k of keys) {
    if (typeof cur !== "object" || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[k];
  }
  return cur;
}

export function extractEvolutionQr(raw: unknown): ExtractedQR {
  const availableKeys = typeof raw === "object" && raw !== null
    ? Object.keys(raw as Record<string, unknown>)
    : [];

  let base64:      string | null = null;
  let code:        string | null = null;
  let pairingCode: string | null = null;
  let foundIn:     string | null = null;

  // ── image base64 candidates (in priority order) ──────────
  const base64Candidates: Array<[string, unknown]> = [
    ["base64",                dig(raw, "base64")],
    ["qrcode.base64",         dig(raw, "qrcode", "base64")],
    ["qrcode",                dig(raw, "qrcode")],          // sometimes the field IS the base64
    ["qr.base64",             dig(raw, "qr", "base64")],
    ["qr",                    dig(raw, "qr")],
    ["data.base64",           dig(raw, "data", "base64")],
    ["data.qrcode.base64",    dig(raw, "data", "qrcode", "base64")],
    ["data.qr.base64",        dig(raw, "data", "qr", "base64")],
    ["data.qrcode",           dig(raw, "data", "qrcode")],
    ["qrcodeBase64",          dig(raw, "qrcodeBase64")],
    ["base64Image",           dig(raw, "base64Image")],
    // Evolution v2 create response — QR nested under "instance"
    ["instance.base64",          dig(raw, "instance", "base64")],
    ["instance.qrcode.base64",   dig(raw, "instance", "qrcode", "base64")],
    ["instance.qrcode",          dig(raw, "instance", "qrcode")],
    ["instance.qr.base64",       dig(raw, "instance", "qr", "base64")],
    ["instance.qr",              dig(raw, "instance", "qr")],
    // Variants used by some Evolution builds
    ["response.base64",          dig(raw, "response", "base64")],
    ["response.qrcode.base64",   dig(raw, "response", "qrcode", "base64")],
    ["response.qrcode",          dig(raw, "response", "qrcode")],
    ["response.qr.base64",       dig(raw, "response", "qr", "base64")],
  ];

  for (const [path, val] of base64Candidates) {
    if (isBase64Image(val)) {
      base64  = normaliseBase64(val);
      foundIn = path;
      break;
    }
  }

  // ── text QR code candidates ───────────────────────────────
  const codeCandidates: Array<[string, unknown]> = [
    ["code",                 dig(raw, "code")],
    ["qrcode.code",          dig(raw, "qrcode", "code")],
    ["qr.code",              dig(raw, "qr", "code")],
    ["data.code",            dig(raw, "data", "code")],
    ["instance.code",        dig(raw, "instance", "code")],
    ["instance.qrcode.code", dig(raw, "instance", "qrcode", "code")],
  ];

  for (const [, val] of codeCandidates) {
    if (isTextCode(val)) { code = val as string; break; }
  }

  // ── pairing code candidates ───────────────────────────────
  const pairingCandidates: Array<[string, unknown]> = [
    ["pairingCode",                dig(raw, "pairingCode")],
    ["pairing_code",               dig(raw, "pairing_code")],
    ["qrcode.pairingCode",         dig(raw, "qrcode", "pairingCode")],
    ["data.pairingCode",           dig(raw, "data", "pairingCode")],
    ["instance.pairingCode",       dig(raw, "instance", "pairingCode")],
    ["instance.qrcode.pairingCode",dig(raw, "instance", "qrcode", "pairingCode")],
  ];

  for (const [, val] of pairingCandidates) {
    if (isPairingCode(val)) { pairingCode = val as string; break; }
  }

  return { base64, code, pairingCode, foundIn, availableKeys };
}

/** True when Evolution responds with only `{ count: N }` — QR is being generated. */
export function isCountOnlyResponse(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const keys = Object.keys(raw as Record<string, unknown>);
  return keys.length === 1 && keys[0] === "count";
}

/** Return sanitized metadata for diagnostic output — never exposes the QR image. */
export function qrDiagnosticMeta(raw: unknown) {
  const result = extractEvolutionQr(raw);
  const topKeys = result.availableKeys;

  // Build a key-by-key summary
  const keyMeta: Record<string, { type: string; length?: number }> = {};
  if (typeof raw === "object" && raw !== null) {
    for (const k of topKeys) {
      const v = (raw as Record<string, unknown>)[k];
      keyMeta[k] = {
        type:   Array.isArray(v) ? "array" : typeof v,
        length: typeof v === "string" ? v.length : undefined,
      };
    }
  }

  return {
    requestSucceeded:      true,
    qrExtracted:           !!result.base64,
    pairingCodeExtracted:  !!result.pairingCode,
    textCodeExtracted:     !!result.code,
    foundIn:               result.foundIn,
    availableKeys:         topKeys,
    keyMeta,
    reason: !result.base64 && !result.pairingCode
      ? `Nenhum campo de QR reconhecido. Chaves disponíveis: [${topKeys.join(", ")}]`
      : null,
  };
}
