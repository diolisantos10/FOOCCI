// Typed data normalizers for CRM import pipeline.
// Pure functions — no DB access, no side effects.

export type NormalizationStatus = "OK" | "INVALID" | "EMPTY";

export interface NormalizedValue<T> {
  value:   T | null;
  status:  NormalizationStatus;
  reason?: string;
  raw?:    string;
}

// ── CPF / CNPJ validation ─────────────────────────────────────────────────────

function validateCPF(digits: string): boolean {
  if (/^(\d)\1+$/.test(digits)) return false;
  const d = digits.split("").map(Number);
  const sum1 = d.slice(0, 9).reduce((acc, v, i) => acc + v * (10 - i), 0);
  const rem1  = sum1 % 11;
  const chk1  = rem1 < 2 ? 0 : 11 - rem1;
  if (chk1 !== d[9]) return false;
  const sum2 = d.slice(0, 10).reduce((acc, v, i) => acc + v * (11 - i), 0);
  const rem2  = sum2 % 11;
  const chk2  = rem2 < 2 ? 0 : 11 - rem2;
  return chk2 === d[10];
}

function validateCNPJ(digits: string): boolean {
  if (/^(\d)\1+$/.test(digits)) return false;
  const d  = digits.split("").map(Number);
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum1 = d.slice(0, 12).reduce((acc, v, i) => acc + v * w1[i]!, 0);
  const rem1  = sum1 % 11;
  const chk1  = rem1 < 2 ? 0 : 11 - rem1;
  if (chk1 !== d[12]) return false;
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const sum2 = d.slice(0, 13).reduce((acc, v, i) => acc + v * w2[i]!, 0);
  const rem2  = sum2 % 11;
  const chk2  = rem2 < 2 ? 0 : 11 - rem2;
  return chk2 === d[13];
}

// ── Normalizers ───────────────────────────────────────────────────────────────

/**
 * Normalizes a Brazilian phone number to E.164 (+55DDNNNNNNNN).
 * Accepts 10–11 digit local numbers (with DDD) and numbers already prefixed with 55.
 */
export function normalizePhone(raw: string): NormalizedValue<string> {
  if (!raw?.trim()) return { value: null, status: "EMPTY", raw };

  // Strip everything except digits; check if original had +55
  const hadCountryCode = /^\+?55/.test(raw.trim().replace(/[\s()\-]/g, ""));
  const digits = raw.replace(/\D/g, "");

  if (!digits) return { value: null, status: "INVALID", reason: "Sem dígitos", raw };

  let local = digits;

  if (hadCountryCode && digits.startsWith("55")) {
    local = digits.slice(2);
  }

  if (local.length === 10 || local.length === 11) {
    return { value: `+55${local}`, status: "OK", raw };
  }

  if (local.length === 8 || local.length === 9) {
    return { value: null, status: "INVALID", reason: "Número sem DDD — não é possível normalizar", raw };
  }

  return { value: null, status: "INVALID", reason: `Comprimento inválido: ${local.length} dígitos`, raw };
}

/**
 * Validates and formats CPF (11 digits) or CNPJ (14 digits) with mod-11 checksum.
 * Returns formatted string (e.g. "123.456.789-09").
 */
export function normalizeDocument(raw: string): NormalizedValue<string> {
  if (!raw?.trim()) return { value: null, status: "EMPTY", raw };

  const digits = raw.replace(/\D/g, "");

  if (digits.length === 11) {
    if (!validateCPF(digits)) {
      return { value: null, status: "INVALID", reason: "CPF inválido (dígito verificador)", raw };
    }
    const formatted = `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
    return { value: formatted, status: "OK", raw };
  }

  if (digits.length === 14) {
    if (!validateCNPJ(digits)) {
      return { value: null, status: "INVALID", reason: "CNPJ inválido (dígito verificador)", raw };
    }
    const formatted = `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
    return { value: formatted, status: "OK", raw };
  }

  return {
    value:  null,
    status: "INVALID",
    reason: `CPF/CNPJ deve ter 11 ou 14 dígitos (encontrado: ${digits.length})`,
    raw,
  };
}

/**
 * Validates an e-mail address (simplified RFC 5322: local@domain.tld).
 * Lowercases and trims the result.
 */
export function normalizeEmail(raw: string): NormalizedValue<string> {
  if (!raw?.trim()) return { value: null, status: "EMPTY", raw };

  const trimmed = raw.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return { value: null, status: "INVALID", reason: "Formato de e-mail inválido", raw };
  }
  return { value: trimmed, status: "OK", raw };
}

/**
 * Trims, collapses whitespace, and title-cases a customer name.
 * Rejects names shorter than 2 characters or longer than 200.
 */
export function normalizeName(raw: string): NormalizedValue<string> {
  if (!raw?.trim()) return { value: null, status: "EMPTY", raw };

  const trimmed = raw.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2) return { value: null, status: "INVALID", reason: "Nome muito curto (mínimo 2 caracteres)", raw };
  if (trimmed.length > 200) return { value: null, status: "INVALID", reason: "Nome muito longo (máximo 200 caracteres)", raw };

  const titleCased = trimmed
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");

  return { value: titleCased, status: "OK", raw };
}

/**
 * Parses Brazilian dates in DD/MM/YYYY format as well as ISO (YYYY-MM-DD)
 * and Excel serial dates (integer days since 1899-12-30).
 */
export function normalizeDateBR(raw: string): NormalizedValue<Date> {
  if (!raw?.trim()) return { value: null, status: "EMPTY", raw };

  const trimmed = raw.trim();

  // DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
  const brMatch = /^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/.exec(trimmed);
  if (brMatch) {
    const [, d, m, y] = brMatch;
    const year  = y!.length === 2 ? 2000 + parseInt(y!, 10) : parseInt(y!, 10);
    const month = parseInt(m!, 10) - 1;
    const day   = parseInt(d!, 10);
    const date  = new Date(year, month, day);
    if (isNaN(date.getTime()) || date.getMonth() !== month) {
      return { value: null, status: "INVALID", reason: "Data inválida", raw };
    }
    return { value: date, status: "OK", raw };
  }

  // ISO: YYYY-MM-DD (optionally with time)
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const date = new Date(trimmed);
    if (!isNaN(date.getTime())) return { value: date, status: "OK", raw };
  }

  // Excel serial date (days since 1899-12-30)
  const num = parseFloat(trimmed);
  if (!isNaN(num) && /^\d+(\.\d+)?$/.test(trimmed) && num > 1 && num < 100_000) {
    const excelEpoch = new Date(1899, 11, 30);
    const date = new Date(excelEpoch.getTime() + num * 86_400_000);
    if (!isNaN(date.getTime())) return { value: date, status: "OK", raw };
  }

  return { value: null, status: "INVALID", reason: "Formato de data não reconhecido (use DD/MM/AAAA)", raw };
}

/**
 * Parses Brazilian currency strings.
 * Handles: "R$ 1.234,56", "1.234,56", "1234,56", "1234.56".
 * Rejects negative values.
 */
export function normalizeCurrencyBR(raw: string): NormalizedValue<number> {
  if (!raw?.trim()) return { value: null, status: "EMPTY", raw };

  let s = raw.trim().replace(/R\$\s*/gi, "").trim();

  if (/\d\.\d{3}[,\s]/.test(s) || /\d\.\d{3}$/.test(s)) {
    // Thousands dots + optional comma decimal: 1.234,56 or 1.234
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d[\d.]*,\d+$/.test(s)) {
    // Only comma as decimal separator: 1234,56
    s = s.replace(",", ".");
  }
  // Otherwise assume dot decimal: 1234.56 — unchanged

  const value = parseFloat(s.replace(/[^\d.\-]/g, ""));
  if (isNaN(value)) return { value: null, status: "INVALID", reason: "Valor monetário inválido", raw };
  if (value < 0)    return { value: null, status: "INVALID", reason: "Valor não pode ser negativo", raw };

  return { value, status: "OK", raw };
}

/**
 * Parses an integer order count.
 * Strips all non-digit characters then parses as integer.
 */
export function normalizeOrderCount(raw: string): NormalizedValue<number> {
  if (!raw?.trim()) return { value: null, status: "EMPTY", raw };

  const digits = raw.trim().replace(/\D/g, "");
  if (!digits) return { value: null, status: "INVALID", reason: "Sem dígitos válidos", raw };

  const value = parseInt(digits, 10);
  if (isNaN(value) || value < 0) return { value: null, status: "INVALID", reason: "Contagem inválida", raw };

  return { value, status: "OK", raw };
}
