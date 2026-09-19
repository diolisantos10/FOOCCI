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

/* ────────────────────────────────────────────────────────────────────────────
 * A LEITURA do teto — o mesmo estado para todas as telas.
 *
 * Nasceu do incidente do Sushi Cazza: 3.727 pessoas barradas pelo teto por
 * dias, enquanto a tela de Campanhas exibia com orgulho o limite DIÁRIO de
 * mensagens ("900/dia, modo seguro") — a trava folgada — e calava a trava que
 * estava mordendo. O dono: *"nem sabia que existia aquela configuração"*.
 *
 * Por isso o estado (ligado / com saldo / pouco saldo / esgotado) e as palavras
 * que o descrevem moram aqui, e não em cada tela. Duas telas com duas contas
 * parecidas é como se faz uma divergir da outra sem ninguém perceber.
 * ──────────────────────────────────────────────────────────────────────────── */

/** Abaixo desta fatia do teto o saldo já é "pouco" e a tela avisa (aviso brando). */
export const CONTACT_BUDGET_LOW_RATIO = 0.1;

export type ContactBudgetStatus = "OFF" | "OK" | "LOW" | "EXHAUSTED";

export type ContactBudgetView = {
  /** O teto está ligado? (`contactBudgetTotal > 0` — o mesmo critério da tela de Marketing.) */
  on: boolean;
  status: ContactBudgetStatus;
  used: number;
  total: number;
  /** Pessoas que ainda podem ser abordadas. `null` quando não há teto. */
  remaining: number | null;
  /** 0–100, para a barrinha. */
  pct: number;
  /** Saldo curto (≤10% do teto) — aviso brando. */
  low: boolean;
  /** Acabou: o CRM parou de abordar gente nova. */
  exhausted: boolean;
};

/**
 * A conta do saldo de contatos, uma vez só.
 *
 * Aceita `used > total` sem estranhar: existem contas de quando o teto ainda não
 * travava nada, e esconder esse excedente seria mentir de novo.
 */
export function describeContactBudget(input: { used?: number | null; total?: number | null }): ContactBudgetView {
  const used  = Math.max(0, Math.floor(Number(input.used  ?? 0) || 0));
  const total = Math.max(0, Math.floor(Number(input.total ?? 0) || 0));
  const on    = total > 0;

  if (!on) {
    return { on: false, status: "OFF", used, total: 0, remaining: null, pct: 0, low: false, exhausted: false };
  }

  const remaining  = Math.max(0, total - used);
  const pct        = Math.min(100, Math.round((used / total) * 100));
  const exhausted  = remaining <= 0;
  const low        = !exhausted && remaining <= Math.max(1, Math.round(total * CONTACT_BUDGET_LOW_RATIO));

  return {
    on: true,
    status: exhausted ? "EXHAUSTED" : low ? "LOW" : "OK",
    used, total, remaining, pct, low, exhausted,
  };
}

/**
 * As palavras do teto de contatos — escritas uma vez, usadas em toda tela que
 * fala dele. Segunda explicação é como se cria a explicação divergente.
 */
export const CONTACT_BUDGET_COPY = {
  /** Nome do controle, igual em todas as telas. */
  label: "Limite de Contatos",
  /** A unidade, dita sem rodeio — foi a confusão com "mensagens" que custou dias. */
  unit: "pessoas, não mensagens",
  /** Onde se ajusta. */
  path: "Configurações → Marketing → Limite de Contatos",
  /** O que acontece quando acaba — a frase da tela de Marketing. */
  exhaustedTitle: "O CRM está parado para gente nova.",
  exhaustedBody:
    "Quem já está nessa conta continua recebendo; para falar com clientes novos, aumente o limite.",
  lowHint: "pouco restante, aumente o limite se precisar.",
} as const;
