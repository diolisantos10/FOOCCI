/**
 * Normalização de telefone brasileiro para envio de WhatsApp.
 *
 * O formato é E.164 SEM o `+`: "5511999990000" (55 + DDD + número). É o que a
 * Meta Cloud API espera, e era também o que o provedor anterior esperava — por
 * isso estas funções se chamavam `normalizePhoneForEvolution` /
 * `isValidEvolutionPhone` até 04/08/2026.
 *
 * **Renomeadas de propósito, e vale saber por quê:** o nome dizia "Evolution",
 * mas isto nunca foi tecnologia de provedor nenhum — é o normalizador de
 * telefone BR do projeto inteiro, e hoje está no caminho de envio da Meta
 * (`toMetaRecipient` depende dele). Na remoção da Evolution, uma varredura por
 * "evolution" apagaria isto e derrubaria a validação de telefone de TODO envio.
 * O nome certo é a proteção.
 *
 * Clientes têm telefone gravado em muitos formatos:
 *   "+55 (11) 99999-0000", "11999990000", "5511999990000", "(11) 9 9999-0000"
 */

/**
 * Normaliza um telefone cru para dígitos E.164 (sem `+`).
 * Devolve `null` quando não dá para normalizar com segurança para um número
 * brasileiro capaz de receber WhatsApp — nunca adivinha.
 */
export function normalizePhoneBR(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  // Already has full country code prefix (13 digits: 55 + 2-digit DDD + 9-digit mobile)
  // or 12 digits (55 + 2-digit DDD + 8-digit old landline/mobile)
  if ((digits.length === 13 || digits.length === 12) && digits.startsWith("55")) {
    return digits;
  }

  // Local format: 2-digit DDD + mobile (10–11 digits total)
  if (digits.length === 11 || digits.length === 10) {
    return `55${digits}`;
  }

  // Unrecognizable format — do not guess
  return null;
}

/** Verdadeiro quando `phone` é E.164 válido para o Brasil. */
export function isValidPhoneBR(phone: string | null | undefined): phone is string {
  if (!phone) return false;
  const digits = phone.replace(/\D/g, "");
  return (
    digits.length >= 12 &&
    digits.length <= 13 &&
    digits.startsWith("55")
  );
}
