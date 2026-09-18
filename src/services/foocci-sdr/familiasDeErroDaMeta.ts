/**
 * ⛔ AS DUAS FAMÍLIAS DE ERRO DA META — a tabela mora aqui, e só aqui.
 *
 * ── O DIA QUE PAGOU POR ESTA TABELA, 18/09/2026 ─────────────────────────────
 *
 * O código `131042` (elegibilidade/cobrança da conta) derrubou os **três**
 * modelos de contato inicial: 43 mensagens frias pela manhã e os 3 leads
 * quentes da tarde. Com variável e sem variável. **Se fosse questão de modelo,
 * uma das combinações teria passado.** Era a CONTA.
 *
 * Daí a régua que este arquivo existe para aplicar:
 *
 *   · erro **do modelo / da mensagem** → o texto está errado, a conta está boa.
 *     Trocar de modelo é exatamente o conserto. **Tenta o próximo.**
 *   · erro **da conta / do destinatário / do sistema** → nenhum texto resolve.
 *     Repetir só gasta tentativa e piora a reputação do número. **PARA, e
 *     grava o motivo.**
 *
 * ── ⛔ CÓDIGO DESCONHECIDO = PARA (fail-closed) ─────────────────────────────
 *
 * Tratar o desconhecido como "tenta outro" é como se transforma um bloqueio de
 * conta em rajada de tentativas contra a Meta. Um envio a menos custa um lead;
 * uma rajada custa o número. Na dúvida, não insiste.
 */

export type FamiliaDeErroDaMeta =
  /** O texto/modelo está errado. Outro modelo pode passar. */
  | "doModelo"
  /** Conta, destinatário, limite ou credencial. Nenhum modelo passa. */
  | "daConta"
  /** Código que esta tabela não conhece. Tratado como `daConta`: fail-closed. */
  | "desconhecido";

/** Erros que falam do TEXTO. Trocar de modelo é o conserto. */
export const ERROS_DO_MODELO: Readonly<Record<string, string>> = {
  "131008": "parâmetro obrigatório faltando",
  "132000": "contagem de parâmetros não bate com o modelo",
  "132001": "modelo inexistente para este nome/idioma",
  "132005": "texto do modelo grande demais depois de renderizado",
  "132007": "formato do parâmetro rejeitado",
  "132012": "parâmetro inválido para o modelo",
  "132015": "modelo pausado pela Meta",
  "132016": "modelo desativado pela Meta",
};

/** Erros que NÃO falam do texto. Nenhum outro modelo passa — parar. */
export const ERROS_DA_CONTA: Readonly<Record<string, string>> = {
  "131042": "elegibilidade/cobrança da conta (foi este que derrubou os três em 18/09/2026)",
  "131026": "destinatário não recebe mensagens",
  "131047": "fora da janela de 24h",
  "131031": "conta bloqueada",
  "130429": "limite de taxa de mensagens",
  "131056": "limite de pares remetente/destinatário",
  "368": "restrição temporária por violação de políticas",
  "190": "credencial inválida ou expirada",
};

export interface ClassificacaoDeErroDaMeta {
  familia: FamiliaDeErroDaMeta;
  /** `true` só quando o código está numa das duas tabelas acima. */
  conhecido: boolean;
  /** O código normalizado como texto, ou `null` quando a Meta não mandou um. */
  codigo: string | null;
  /** Em uma frase, para a linha da mensagem e para quem investiga amanhã. */
  explicacao: string;
}

function normalizar(codigo: unknown): string | null {
  if (codigo === null || codigo === undefined) return null;
  const t = String(codigo).trim();
  return t.length ? t : null;
}

export function classificarErroDaMeta(codigo: unknown): ClassificacaoDeErroDaMeta {
  const c = normalizar(codigo);

  if (c && ERROS_DO_MODELO[c]) {
    return { familia: "doModelo", conhecido: true, codigo: c, explicacao: ERROS_DO_MODELO[c] };
  }
  if (c && ERROS_DA_CONTA[c]) {
    return { familia: "daConta", conhecido: true, codigo: c, explicacao: ERROS_DA_CONTA[c] };
  }

  // ⛔ Sem código, ou com código que ninguém mapeou: PARA. Ver o cabeçalho.
  return {
    familia: "desconhecido",
    conhecido: false,
    codigo: c,
    explicacao: c
      ? `código ${c} não está na tabela de famílias — tratado como erro de conta (fail-closed)`
      : "a Meta não devolveu código — tratado como erro de conta (fail-closed)",
  };
}

/**
 * A única pergunta que o caminho de envio faz a este arquivo: **vale tentar o
 * próximo modelo?** Só `doModelo` responde que sim.
 */
export function podeTentarOutroModelo(codigo: unknown): boolean {
  return classificarErroDaMeta(codigo).familia === "doModelo";
}
