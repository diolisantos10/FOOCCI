/**
 * O teto de contatos do CRM — a REGRA, num lugar só.
 *
 * Existe porque o mesmo número passou a ter dois caminhos de escrita: a tela do
 * lojista (`PATCH /api/settings/crm-safety`, autenticada pela sessão dele) e a
 * rota do administrador (`PATCH /api/admin/crm/contact-budget`, autenticada pelo
 * segredo de admin). Dois caminhos com duas validações escritas à mão é a mesma
 * família de defeito que custou esta rodada inteira: a tela dizendo uma coisa e o
 * código fazendo outra. Aqui não se copia a régua — aponta-se para ela.
 *
 * Módulo PURO de propósito: **não importa o Prisma**. Assim a tela (componente de
 * cliente) pode usar os mesmos limites sem arrastar o banco para o navegador.
 */

/** Mínimo aceito. 0 é válido e quer dizer "sem teto" — é uma escolha, não um erro. */
export const CONTACT_BUDGET_MIN = 0;

/**
 * Máximo aceito. Mesmo valor que o campo da tela sempre teve (`max={1000000}`).
 * Não é limite técnico: é o ponto em que um número deixa de ser teto e vira
 * digitação errada — e teto que não acusa nada é o defeito que consertamos.
 */
export const CONTACT_BUDGET_MAX = 1_000_000;

export type ContactBudgetParse =
  | { ok: true;  value: number }
  | { ok: false; error: string };

/**
 * Valida e normaliza um teto de contatos vindo de fora (corpo de requisição,
 * campo de formulário).
 *
 * Recusa em vez de consertar em silêncio: `-5` não vira 0, `"abc"` não vira o
 * padrão, `3000.7` não vira 3000. Um valor que o chamador não quis dizer tem que
 * voltar como erro — corrigir por conta própria é decidir pelo dono quanto ele
 * pode gastar.
 */
export function parseContactBudgetTotal(raw: unknown): ContactBudgetParse {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return { ok: false, error: "contactBudgetTotal precisa ser um número" };
  }
  if (!Number.isInteger(raw)) {
    return { ok: false, error: "contactBudgetTotal precisa ser um número inteiro (pessoas não se dividem)" };
  }
  if (raw < CONTACT_BUDGET_MIN) {
    return { ok: false, error: `contactBudgetTotal não pode ser negativo (mínimo ${CONTACT_BUDGET_MIN}; 0 = sem limite)` };
  }
  if (raw > CONTACT_BUDGET_MAX) {
    return { ok: false, error: `contactBudgetTotal acima do máximo aceito (${CONTACT_BUDGET_MAX})` };
  }
  return { ok: true, value: raw };
}
