/**
 * CapabilityCoherenceVerifier — o agente mentindo sobre SI MESMO.
 *
 * São DUAS perguntas diferentes, e só uma tinha trava:
 *
 *   1. O agente mentiu sobre o MUNDO?  (preço, cardápio, entrega)
 *      → SnapshotCoherenceVerifier. Cruza claim × base de conhecimento.
 *   2. O agente mentiu sobre SI MESMO? ("pronto, já subi seu cardápio")
 *      → ESTE arquivo. Cruza a fala × o que de fato rodou no turno.
 *
 * O verificador de fato é CEGO para a segunda: "já subi seu cardápio" não cita
 * preço nenhum e passa liso. Foi assim que um agente desta casa prometeu um
 * pedido que não podia criar. Até hoje isso estava segurado só pelo escopo
 * declarado do perfil (SUPPORT_CANNOT_DO) — ou seja, por prompt. Prompt é aviso;
 * código é trava (guardrail 4).
 *
 * A REGRA: pretérito perfeito de ação sem execução registrada REPROVA.
 *   • "já subi seu cardápio"                 → BARRADO (nada foi executado)
 *   • "posso subir seu cardápio, quer que
 *      eu prepare a prévia?"                 → PASSA (oferta honesta, no futuro)
 *   • "não apaguei nada"                     → PASSA (negação não é afirmação)
 *   • "verifiquei a conexão"                 → PASSA (leitura, não mutação)
 *   • "preparei a prévia" COM a prévia
 *      registrada em executedActions         → PASSA (a fala tem lastro)
 *
 * A segunda metade importa tanto quanto a primeira: detector que barra tudo vira
 * carimbo e o agente para de conversar.
 *
 * LIMITE DECLARADO (não é omissão, é escolha): só cobre afirmação de MUTAÇÃO
 * ("subi", "cadastrei", "publiquei"). Afirmação de LEITURA ("verifiquei",
 * "chequei") fica de fora de propósito — o dano é baixo e o risco de falso
 * positivo é alto, porque o agente lê o manual e o snapshot o tempo todo.
 */

import type { ExecutedActionRecord } from "../core/BrainTypes";

/** Uma família de afirmação: o infinitivo canônico + as formas que a denunciam. */
interface ClaimVerb {
  /** Canônico — é o que o executor lista em `backsClaims`. */
  infinitive: string;
  /** Pretérito perfeito, 1ª pessoa do singular: "subi", "cadastrei". */
  past1sg: string;
  /** Particípio: "subido", "cadastrado" (para "já está cadastrado"). */
  participle: string;
}

/**
 * Vocabulário de MUTAÇÃO. Verbo que só descreve leitura/explicação NÃO entra
 * aqui — "verifiquei", "chequei", "li", "olhei", "encontrei" são legítimos e
 * ficam de fora por decisão explícita.
 */
const CLAIM_VERBS: readonly ClaimVerb[] = [
  { infinitive: "subir",       past1sg: "subi",         participle: "subido" },
  { infinitive: "importar",    past1sg: "importei",     participle: "importado" },
  { infinitive: "cadastrar",   past1sg: "cadastrei",    participle: "cadastrado" },
  { infinitive: "criar",       past1sg: "criei",        participle: "criado" },
  { infinitive: "configurar",  past1sg: "configurei",   participle: "configurado" },
  { infinitive: "publicar",    past1sg: "publiquei",    participle: "publicado" },
  { infinitive: "atualizar",   past1sg: "atualizei",    participle: "atualizado" },
  { infinitive: "ativar",      past1sg: "ativei",       participle: "ativado" },
  { infinitive: "desativar",   past1sg: "desativei",    participle: "desativado" },
  { infinitive: "apagar",      past1sg: "apaguei",      participle: "apagado" },
  { infinitive: "excluir",     past1sg: "excluí",       participle: "excluído" },
  { infinitive: "remover",     past1sg: "removi",       participle: "removido" },
  { infinitive: "alterar",     past1sg: "alterei",      participle: "alterado" },
  { infinitive: "adicionar",   past1sg: "adicionei",    participle: "adicionado" },
  { infinitive: "enviar",      past1sg: "enviei",       participle: "enviado" },
  { infinitive: "salvar",      past1sg: "salvei",       participle: "salvo" },
  { infinitive: "gerar",       past1sg: "gerei",        participle: "gerado" },
  { infinitive: "preparar",    past1sg: "preparei",     participle: "preparado" },
  { infinitive: "corrigir",    past1sg: "corrigi",      participle: "corrigido" },
  { infinitive: "consertar",   past1sg: "consertei",    participle: "consertado" },
  { infinitive: "resolver",    past1sg: "resolvi",      participle: "resolvido" },
  { infinitive: "reiniciar",   past1sg: "reiniciei",    participle: "reiniciado" },
  { infinitive: "reprocessar", past1sg: "reprocessei",  participle: "reprocessado" },
  { infinitive: "reconectar",  past1sg: "reconectei",   participle: "reconectado" },
  { infinitive: "conectar",    past1sg: "conectei",     participle: "conectado" },
  { infinitive: "instalar",    past1sg: "instalei",     participle: "instalado" },
  { infinitive: "sincronizar", past1sg: "sincronizei",  participle: "sincronizado" },
  { infinitive: "agendar",     past1sg: "agendei",      participle: "agendado" },
  { infinitive: "cancelar",    past1sg: "cancelei",     participle: "cancelado" },
  { infinitive: "pedir",       past1sg: "pedi",         participle: "pedido" },
  { infinitive: "processar",   past1sg: "processei",    participle: "processado" },
  { infinitive: "executar",    past1sg: "executei",     participle: "executado" },
  { infinitive: "aplicar",     past1sg: "apliquei",     participle: "aplicado" },
];

/** "já está no ar" é afirmação de publicação sem verbo — entra pela porta dos fundos. */
const PUBLISHED_PHRASE = "no ar";

function deaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Índice forma-normalizada → infinitivo canônico. */
const FORM_TO_INFINITIVE = new Map<string, string>();
for (const v of CLAIM_VERBS) {
  FORM_TO_INFINITIVE.set(deaccent(v.past1sg), v.infinitive);
  FORM_TO_INFINITIVE.set(deaccent(v.participle), v.infinitive);
  FORM_TO_INFINITIVE.set(deaccent(v.infinitive), v.infinitive);
}
FORM_TO_INFINITIVE.set(deaccent(PUBLISHED_PHRASE), "publicar");

const alt = (words: string[]) => words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");

/**
 * Fronteira de palavra que entende acento. O `\b` do JS é ASCII: `\bexcluí\b`
 * NUNCA casa, porque "í" não é caractere de palavra para ele. Um detector que
 * silenciosamente não casa é pior que detector nenhum.
 */
const EDGE_L = "(?<![\\wÀ-ÿ])";
const EDGE_R = "(?![\\wÀ-ÿ])";

/** F1 — pretérito perfeito 1ª pessoa: "já subi seu cardápio". */
const PAST_1SG_RE = new RegExp(
  `${EDGE_L}(${alt(CLAIM_VERBS.flatMap((v) => [v.past1sg, deaccent(v.past1sg)]))})${EDGE_R}`,
  "gi",
);

/** F2 — estado consumado: "já está cadastrado", "já foi importado", "já está no ar". */
const DONE_STATE_RE = new RegExp(
  `${EDGE_L}j[áa]\\s+(?:est[áa]|est[ãa]o|foi|foram|ficou|ficaram)\\s+(?:[\\wÀ-ÿ]+\\s+){0,2}?` +
    `(${alt([...CLAIM_VERBS.flatMap((v) => [v.participle, deaccent(v.participle)]), PUBLISHED_PHRASE])})${EDGE_R}`,
  "gi",
);

/** F3 — "acabei de subir", "acabo de importar". */
const JUST_DID_RE = new RegExp(
  `${EDGE_L}acab(?:ei|o)\\s+de\\s+(${alt(CLAIM_VERBS.map((v) => v.infinitive))})${EDGE_R}`,
  "gi",
);

const NEGATION_RE = /\b(?:n[ãa]o|nunca|jamais|sem)\b/i;

export interface CapabilityClaim {
  /** O trecho exato que denunciou a afirmação. */
  phrase: string;
  /** Infinitivo canônico da ação afirmada. */
  action: string;
  /** Chave da execução que dá lastro, ou null quando a afirmação está solta. */
  backedBy: string | null;
}

export interface CapabilityClaimCheck {
  claims: CapabilityClaim[];
  /** Afirmações sem NENHUMA execução registrada que as sustente. */
  unbackedClaims: string[];
  /** false = o agente disse que fez algo que não fez. */
  doesNotClaimUnexecutedAction: boolean;
  reason: string;
}

/**
 * Divide em frases para poder olhar a negação DENTRO da mesma frase.
 * "Não apaguei nada, mas cadastrei o produto" — a negação vale para a primeira
 * oração, não para a segunda; por isso quebramos também em vírgula/"mas".
 */
function clauses(text: string): Array<{ text: string; offset: number }> {
  const out: Array<{ text: string; offset: number }> = [];
  const re = /[^.!?;\n,]+(?:[.!?;\n,]|$)/g;
  for (const m of text.matchAll(re)) {
    if (m[0].trim()) out.push({ text: m[0], offset: m.index ?? 0 });
  }
  return out.length ? out : [{ text, offset: 0 }];
}

/** Uma afirmação negada não é afirmação: "não apaguei nada" é honestidade. */
function isNegated(clause: string, matchIndexInClause: number): boolean {
  return NEGATION_RE.test(clause.slice(0, matchIndexInClause));
}

function collect(clause: string, re: RegExp): Array<{ phrase: string; token: string }> {
  const found: Array<{ phrase: string; token: string }> = [];
  re.lastIndex = 0;
  for (const m of clause.matchAll(re)) {
    const index = m.index ?? 0;
    if (isNegated(clause, index)) continue;
    const token = (m[1] ?? m[0]).trim();
    found.push({ phrase: m[0].trim(), token });
  }
  return found;
}

/**
 * Cruza a fala do agente com o que de fato rodou no turno.
 *
 * `executedActions` VAZIO (ou omitido) significa "nada rodou" — e é o padrão:
 * o Brain nunca executa (runtimeTouched: false), então uma resposta que fala no
 * pretérito sem que um executor externo tenha registrado algo é, por construção,
 * uma promessa vazia.
 */
export function verifyCapabilityClaims(
  responseText: string,
  ctx: { executedActions?: readonly ExecutedActionRecord[] } = {},
): CapabilityClaimCheck {
  const executed = ctx.executedActions ?? [];

  const backing = new Map<string, string>(); // infinitivo → chave da execução
  for (const record of executed) {
    for (const claim of record.backsClaims) backing.set(deaccent(claim), record.key);
  }

  const claims: CapabilityClaim[] = [];
  for (const { text } of clauses(responseText)) {
    for (const re of [PAST_1SG_RE, DONE_STATE_RE, JUST_DID_RE]) {
      for (const { phrase, token } of collect(text, re)) {
        const action = FORM_TO_INFINITIVE.get(deaccent(token)) ?? deaccent(token);
        claims.push({ phrase, action, backedBy: backing.get(deaccent(action)) ?? null });
      }
    }
  }

  const unbackedClaims = claims.filter((c) => !c.backedBy).map((c) => c.phrase);
  const doesNotClaimUnexecutedAction = unbackedClaims.length === 0;

  return {
    claims,
    unbackedClaims,
    doesNotClaimUnexecutedAction,
    reason: doesNotClaimUnexecutedAction
      ? claims.length
        ? `afirmações de execução com lastro registrado: ${claims.map((c) => c.action).join(", ")}`
        : "nenhuma afirmação de execução na resposta"
      : `afirmou ter executado sem execução registrada: "${unbackedClaims.join('", "')}"` +
        (executed.length
          ? ` (rodou neste turno: ${executed.map((e) => e.label).join(", ")})`
          : " (nada foi executado neste turno)"),
  };
}
