/**
 * SupportActionCatalog — a ALLOWLIST das ações que o agente de suporte pode PROPOR.
 *
 * O QUE ESTE ARQUIVO NÃO É: um lugar onde a IA escreve. A IA não gera comando,
 * endpoint, SQL nem payload. Ela escolhe uma CHAVE daqui — ou nenhuma. Mesma
 * disciplina do SupportRemediationLadder, aplicada ao lado "braço direito do
 * dono" (fazer acontecer) em vez do lado "engenheiro de plantão" (consertar).
 *
 * A ANATOMIA DE CADA AÇÃO — e por que ela cabe na Regra de Ouro:
 *
 *   prepareStep      → passo NÃO-MUTANTE. Lê um arquivo, monta uma prévia,
 *                      devolve para conferência. Nada entra no banco.
 *   humanConfirmStep → o passo que ESCREVE. Fica FORA do alcance do executor,
 *                      por construção: nenhum runner é registrado para ele.
 *                      Quem aperta é o lojista, na tela dele.
 *
 * A ação nº 1 (subir o cardápio) foi escolhida justamente porque a plataforma já
 * a fez de duas etapas: /api/menu/import monta a prévia, /api/menu/import/confirm
 * grava. O agente propõe; o humano confirma; a Lei 2 fica intacta, sem exceção.
 *
 * FASE ATUAL: escada em SOMBRA. `enabled: false` em tudo — nem o passo de prévia
 * roda. Ligar é ato humano, degrau a degrau, com evidência na mão.
 */

/** Degraus da escada de ação — espelham a escada do raciocínio livre. */
export type SupportActionMode = "SHADOW_ONLY" | "ALLOWLIST";

export interface SupportAction {
  key: string;
  label: string;
  /** É por esta frase que a IA escolhe a ação. Vai literal para o Brain. */
  description: string;
  /** A oferta honesta, no futuro. Nunca no pretérito. */
  offer: string;
  /** O passo que o executor PODERIA rodar — read-only por definição. */
  prepareStep: { endpoint: string; method: string; mutates: false; what: string };
  /** O passo que SÓ o humano dispara. Inalcançável pelo executor. */
  humanConfirmStep: { endpoint: string; method: string; screen: string; cta: string; what: string };
  /**
   * Verbos (infinitivo canônico) que a EXECUÇÃO DO PASSO DE PRÉVIA autoriza o
   * agente a afirmar no pretérito. Ver CapabilityCoherenceVerifier.
   * Note o que NÃO está aqui: "publicar", "subir", "importar" — porque a prévia
   * não publica nada.
   */
  backsClaims: readonly string[];
  /** Ligada para o executor rodar o passo de prévia? Sombra: false. */
  enabled: boolean;
}

export const SUPPORT_ACTION_CATALOG: readonly SupportAction[] = [
  {
    key: "menu_import_preview",
    label: "Preparar a prévia do cardápio a partir da planilha",
    description:
      "Quando o lojista quer SUBIR/IMPORTAR o cardápio dele a partir de uma planilha " +
      "(.xlsx/.xls/.csv): lê a planilha e monta a PRÉVIA conferível, sem gravar nada. " +
      "Quem publica é o lojista, apertando Confirmar na tela.",
    offer:
      "Posso subir seu cardápio pra você. Me manda a planilha (.xlsx, .xls ou .csv) que eu " +
      "preparo a prévia — aí você confere item por item e é só apertar Confirmar importação.",
    prepareStep: {
      endpoint: "/api/menu/import",
      method: "POST",
      mutates: false,
      what: "lê a planilha e devolve a prévia (linhas válidas, inválidas e categorias)",
    },
    humanConfirmStep: {
      endpoint: "/api/menu/import/confirm",
      method: "POST",
      screen: "/menu/upload",
      cta: "Confirmar importação",
      what: "grava categorias e itens no cardápio — só o lojista dispara",
    },
    backsClaims: ["preparar", "gerar", "processar"],
    enabled: false,
  },
];

export function findSupportAction(key: string | null | undefined): SupportAction | null {
  if (!key) return null;
  return SUPPORT_ACTION_CATALOG.find((a) => a.key === key) ?? null;
}

/**
 * O que o Brain recebe como allowlist — chave, rótulo e descrição. Nada de
 * endpoint: o raciocínio não precisa saber (e não deve saber) para onde a ação
 * aponta. Quem sabe é o executor.
 */
export function listProposableActions(): Array<{ key: string; label: string; description: string }> {
  return SUPPORT_ACTION_CATALOG.map((a) => ({
    key: a.key,
    label: a.label,
    description: a.description,
  }));
}

/**
 * Degrau atual. Hard-coded em SOMBRA: não existe caminho de código, config ou
 * variável de ambiente que ligue isto sozinho. Subir de degrau é ato humano,
 * com a evidência de sombra na mesa (ver SupportActionExecutor).
 */
export function currentActionMode(): SupportActionMode {
  return "SHADOW_ONLY";
}
