/**
 * metaProvisionDiagnostics — traduz o que a Meta responde ao provisionar um número.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * A Meta responde ao código `136024` com o texto *"Our servers are temporarily
 * unavailable. Please wait 1 hour and try again"* — e, no mesmo corpo, manda
 * `is_transient: false`. **A mensagem mente e o campo diz a verdade.** Uma sessão
 * inteira já foi gasta repetindo a mesma chamada de hora em hora por causa disso,
 * e o aprendizado ficou preso na vitrine do agente, onde o próximo operador não
 * olha na hora do erro.
 *
 * Guardrail 6 aplicado ao contrário do usual: aqui o alerta VEM de fora, cheio de
 * evidência falsa. O trabalho é anexar a evidência verdadeira, na resposta, no
 * momento em que ela é útil — não num documento que ninguém abre com o erro na tela.
 *
 * NÃO decide nada e NÃO chama a Meta. Só lê a resposta que já veio e escreve em
 * português o que ela significa e qual é o próximo passo.
 */

export interface ProvisionDiagnosis {
  /** Código numérico da Meta, quando veio. */
  code:        number | null;
  subcode:     number | null;
  /** O que a Meta disse sobre ser transitório. `null` quando não disse. */
  isTransient: boolean | null;
  /** Vale a pena repetir a MESMA chamada? `false` = repetir é perda de tempo. */
  retryable:   boolean | null;
  /** Explicação em português, com o próximo passo concreto. */
  explicacao:  string | null;
}

interface GraphErrorShape {
  error?: {
    code?:          number;
    error_subcode?: number;
    message?:       string;
    is_transient?:  boolean;
    error_user_msg?: string;
  };
}

/**
 * Lê o corpo bruto devolvido pela Graph e devolve o que dá para afirmar.
 * Quando não há erro reconhecível, devolve tudo `null` — ausência de informação
 * não é informação (guardrail 1), e um diagnóstico inventado é pior que nenhum.
 */
export function diagnoseProvisionError(raw: unknown): ProvisionDiagnosis {
  const vazio: ProvisionDiagnosis = {
    code: null, subcode: null, isTransient: null, retryable: null, explicacao: null,
  };
  if (!raw || typeof raw !== "object") return vazio;

  const err = (raw as GraphErrorShape).error;
  if (!err) return vazio;

  const code        = typeof err.code === "number" ? err.code : null;
  const subcode     = typeof err.error_subcode === "number" ? err.error_subcode : null;
  const isTransient = typeof err.is_transient === "boolean" ? err.is_transient : null;

  // O caso que já custou uma sessão inteira desta casa.
  if (code === 136024) {
    return {
      code, subcode, isTransient,
      retryable: false,
      explicacao:
        "A Meta escreveu \"aguarde 1 hora e tente de novo\", mas no mesmo corpo respondeu"
        + " `is_transient: false` — ou seja, PERMANENTE. Repetir a mesma chamada não resolve"
        + " e já consumiu uma sessão inteira desta casa."
        + " Causa mais provável (NÃO confirmada): o chip ainda tem uma conta de WhatsApp ativa."
        + " O destravamento é apagar a conta no aparelho (WhatsApp → Configurações → Conta →"
        + " Apagar minha conta), esperar cerca de 1h e só então repetir o `add`."
        + " Método `VOICE` no lugar de `SMS` nunca foi testado aqui e é a próxima tentativa barata.",
    };
  }

  // Número já em uso em outra conta/WABA.
  if (code === 133005 || subcode === 2388004) {
    return {
      code, subcode, isTransient,
      retryable: false,
      explicacao:
        "Este número já está registrado em outra conta do WhatsApp Business."
        + " Repetir não resolve: ou o número é liberado onde está, ou escolha outro chip.",
    };
  }

  // PIN de verificação em duas etapas errado / bloqueado.
  if (code === 133008 || code === 133009) {
    return {
      code, subcode, isTransient,
      retryable: false,
      explicacao:
        "PIN de verificação em duas etapas incorreto ou bloqueado por excesso de tentativas."
        + " Insistir agora aumenta o bloqueio. Confirme o PIN correto do número antes de tentar de novo.",
    };
  }

  // Credencial morta — não é problema de provisionamento.
  if (code === 190) {
    return {
      code, subcode, isTransient,
      retryable: false,
      explicacao:
        "A credencial usada nesta chamada está morta ou expirada (erro 190)."
        + " Nada de provisionamento vai funcionar até a conexão ser refeita.",
    };
  }

  // Sem regra específica: repassamos o que a Meta afirmou, sem inventar leitura.
  return {
    code, subcode, isTransient,
    retryable: isTransient === true ? true : isTransient === false ? false : null,
    explicacao: isTransient === false
      ? "A Meta marcou este erro como NÃO transitório (`is_transient: false`). Repetir a mesma"
        + " chamada tende a devolver o mesmo resultado, independentemente do que a mensagem sugira."
      : null,
  };
}
