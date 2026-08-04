/**
 * Helpers de formatação do cardápio white-label.
 * Movidos verbatim de src/app/qr/[slug]/QRMenuClient.tsx.
 */

export function formatPrice(n: number) {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function fmtPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  const local = d.startsWith("55") && d.length > 11 ? d.slice(2) : d;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return raw;
}
