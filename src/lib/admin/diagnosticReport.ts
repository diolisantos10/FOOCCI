/**
 * Pure helpers for admin diagnostic report generation and export.
 * No DOM, no React — safe to import anywhere (server or client).
 */

export function maskPhone(phone: string): string {
  if (!phone) return "****";
  const digits = phone.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return "*".repeat(digits.length - 4) + digits.slice(-4);
}

export function maskSecret(secret: string): string {
  if (!secret || secret.length <= 4) return "****";
  return secret.slice(0, 2) + "*".repeat(secret.length - 4) + secret.slice(-2);
}

export function fmtDateForFilename(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}-${pad(d.getMinutes())}`;
}

export function buildFilename(
  prefix: string,
  slug: string,
  ranAt: string,
  ext: "json" | "txt",
): string {
  return `${prefix}-${slug}-${fmtDateForFilename(ranAt)}.${ext}`;
}

const SEP  = "=".repeat(43);
const DASH = "-".repeat(43);

export interface DiagnosticReportSection {
  title:  string;
  rows:   Array<{ label: string; value: string | number | boolean | null | undefined }>;
}

export interface DiagnosticReportOptions {
  tool:            string;
  restaurant?:     string;
  slug?:           string;
  phone?:          string;   // will be masked automatically
  mode?:           string;
  commitSha?:      string;
  verdict?:        string;
  diagnosis?:      string;
  recommendation?: string;
  inputs?:         Record<string, string | number | boolean | null | undefined>;
  sections?:       DiagnosticReportSection[];
  safetyNotes?:    string[];
}

export function buildDiagnosticReportText(opts: DiagnosticReportOptions): string {
  const generatedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

  const lines: string[] = [
    SEP,
    "FOOCCI — DIAGNOSTIC REPORT",
    SEP,
    `Ferramenta:  ${opts.tool}`,
    `Gerado em:   ${generatedAt}`,
    ...(opts.restaurant ? [`Restaurante: ${opts.restaurant}`]       : []),
    ...(opts.slug       ? [`Slug:        ${opts.slug}`]             : []),
    ...(opts.phone      ? [`Telefone:    ${maskPhone(opts.phone)}`] : []),
    ...(opts.mode       ? [`Modo:        ${opts.mode}`]             : []),
    ...(opts.commitSha  ? [`Commit SHA:  ${opts.commitSha}`]        : []),
    "",
  ];

  if (opts.verdict || opts.diagnosis || opts.recommendation) {
    lines.push(DASH, "SUMÁRIO", DASH);
    if (opts.verdict)        lines.push(`Veredicto:     ${opts.verdict}`);
    if (opts.diagnosis)      lines.push(`Diagnóstico:   ${opts.diagnosis}`);
    if (opts.recommendation) lines.push(`Recomendação:  ${opts.recommendation}`);
    lines.push("");
  }

  if (opts.inputs && Object.keys(opts.inputs).length > 0) {
    lines.push(DASH, "ENTRADAS", DASH);
    for (const [k, v] of Object.entries(opts.inputs)) {
      lines.push(`${k}: ${String(v ?? "—")}`);
    }
    lines.push("");
  }

  if (opts.sections && opts.sections.length > 0) {
    for (const section of opts.sections) {
      lines.push(DASH, section.title.toUpperCase(), DASH);
      for (const r of section.rows) {
        lines.push(`${r.label}: ${String(r.value ?? "—")}`);
      }
      lines.push("");
    }
  }

  if (opts.safetyNotes && opts.safetyNotes.length > 0) {
    lines.push(DASH, "NOTAS DE SEGURANÇA", DASH);
    for (const n of opts.safetyNotes) lines.push(`- ${n}`);
    lines.push("");
  }

  return lines.join("\n");
}
