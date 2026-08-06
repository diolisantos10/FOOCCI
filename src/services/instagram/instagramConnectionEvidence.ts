/**
 * instagramConnectionEvidence — dá caminho de leitura à evidência que já era gravada.
 *
 * Desde 05/08 o callback do Instagram grava, em `metadata`, POR QUE a conexão nasceu
 * quebrada: `longLivedExchangeError` (o motivo que a Meta deu para recusar a troca do
 * token de 1h pelo de 60 dias) e `webhookSubscribeError` (por que a conta não foi
 * inscrita no webhook de mensagens). Ver `instagramLoginOAuth.ts:394-396`.
 *
 * O problema que este módulo resolve: **nada lia esses campos**. Nem o `graph-check`,
 * nem a projeção `toView`, nem a tela. Campo gravado sem caminho de leitura é evidência
 * morta — e foi exatamente por isso que o motivo real da queda de 23/07 se perdeu três
 * vezes seguidas (a retenção de log do Railway é por deploy; o banco sobrevive, o log
 * não). Guardrail 6: o alerta carrega a própria evidência.
 *
 * 🔒 POR QUE A LIMPEZA DE SEGREDO EXISTE AQUI, e não é paranoia:
 * `instagramLoginOAuth.ts:222-224` monta a URL do subscribe com `access_token=` na
 * QUERY STRING. Se o `fetch` estourar, `e.message` pode carregar a URL inteira — e esse
 * texto é gravado em `metadata.webhookSubscribeError`. Ao abrir um caminho de leitura
 * para a API e para a tela, eu passaria a publicar um token do cliente. Então a limpeza
 * roda na LEITURA, não na escrita: assim ela protege também as linhas que já estão
 * gravadas no banco desde 05/08, que eu não posso reescrever.
 */

/** Chaves de query string que nunca podem sair daqui com valor. */
const CHAVES_SENSIVEIS = ["access_token", "client_secret", "code", "input_token", "appsecret_proof"];

/**
 * Remove segredo de um texto de diagnóstico antes de ele virar resposta de API ou tela.
 *
 * Cobre os três formatos que aparecem na prática:
 *   1. `access_token=EAAB...`  (query string — o caso real do subscribe)
 *   2. `"access_token": "EAAB..."` (JSON ecoado numa mensagem de erro)
 *   3. sequências longas de cara de token soltas no texto
 *
 * Conservador de propósito: prefere mascarar demais a vazar de menos. Um diagnóstico
 * com uma palavra a mais mascarada continua útil; um token publicado não tem volta.
 */
export function redactSecrets(text: string): string {
  let out = text;
  for (const chave of CHAVES_SENSIVEIS) {
    // 1) chave=valor em query string / form-urlencoded
    out = out.replace(new RegExp(`${chave}=[^&\\s"']+`, "gi"), `${chave}=<oculto>`);
    // 2) "chave": "valor" em JSON
    out = out.replace(new RegExp(`("${chave}"\\s*:\\s*)"[^"]*"`, "gi"), `$1"<oculto>"`);
  }
  // 3) Tokens da Meta soltos: começam com EAA e são longos. Só este prefixo, para não
  //    mastigar mensagens normais (nomes de campo, ids numéricos, URLs de callback).
  out = out.replace(/\bEAA[A-Za-z0-9_-]{20,}/g, "<oculto>");
  return out;
}

/** Aplica a limpeza e corta o tamanho. `null` continua `null` — ausência não vira "". */
export function sanitizeEvidence(value: unknown, max = 400): string | null {
  if (typeof value !== "string") return null;
  const limpo = redactSecrets(value).trim();
  return limpo.length > 0 ? limpo.slice(0, max) : null;
}

/** A evidência da última conexão, pronta para API e tela. Nunca contém segredo. */
export interface InstagramConnectionEvidence {
  /** Quando a conexão atual foi feita (ISO). */
  connectedAt: string | null;
  /** Quando o token guardado expira (ISO). */
  tokenExpiresAt: string | null;
  /**
   * Vida do token NO ATO da conexão, em horas. ~1h é a assinatura digital do fallback
   * da troca short→long; ~1440h (60 dias) é o esperado. Esta conta dispensa log.
   */
  tokenLifetimeHours: number | null;
  /** O motivo que a Meta deu para recusar a troca do token de 60 dias. */
  longLivedExchangeError: string | null;
  /** Quando a conta foi inscrita no webhook de mensagens (ISO). */
  webhookSubscribedAt: string | null;
  /** O motivo que a Meta deu para recusar a inscrição da conta. */
  webhookSubscribeError: string | null;
  /**
   * Uma frase por problema, em português, pronta para a tela — para o operador não
   * precisar interpretar mensagem de API em inglês.
   */
  problemas: string[];
}

const UMA_HORA_MS = 60 * 60 * 1000;
/** Abaixo disto, o token nasceu curto. 7 dias — mesmo piso de `DURABLE_TOKEN_MIN_SECONDS`. */
const HORAS_DURAVEL_MIN = 7 * 24;

/**
 * Lê a evidência de `metadata`. Nunca lança: um metadata torto não pode derrubar a tela
 * de diagnóstico, que é justamente a tela que a pessoa abre quando algo está errado
 * (guardrail 5 — a proteção não pode ser mais destrutiva que o problema).
 */
export function readConnectionEvidence(metadata: unknown): InstagramConnectionEvidence {
  const m = (metadata && typeof metadata === "object") ? (metadata as Record<string, unknown>) : {};

  const connectedAt    = typeof m.connectedAt === "string" ? m.connectedAt : null;
  const tokenExpiresAt = typeof m.tokenExpiresAt === "string" ? m.tokenExpiresAt : null;
  const longLivedExchangeError = sanitizeEvidence(m.longLivedExchangeError);
  const webhookSubscribedAt    = typeof m.webhookSubscribedAt === "string" ? m.webhookSubscribedAt : null;
  const webhookSubscribeError  = sanitizeEvidence(m.webhookSubscribeError);

  const nasceu = connectedAt ? Date.parse(connectedAt) : NaN;
  const morre  = tokenExpiresAt ? Date.parse(tokenExpiresAt) : NaN;
  const tokenLifetimeHours = (Number.isFinite(nasceu) && Number.isFinite(morre))
    ? Math.round(((morre - nasceu) / UMA_HORA_MS) * 10) / 10
    : null;

  const problemas: string[] = [];
  if (tokenLifetimeHours !== null && tokenLifetimeHours < HORAS_DURAVEL_MIN) {
    problemas.push(
      `A conexão nasceu com um token de ${tokenLifetimeHours}h de vida, em vez dos 60 dias esperados.`
      + (longLivedExchangeError
        ? ` A Meta recusou a troca com esta resposta: "${longLivedExchangeError}".`
        : " A Meta não devolveu motivo — a troca precisa ser instrumentada para descobrir por quê."),
    );
  } else if (longLivedExchangeError) {
    // Houve recusa registrada mas o token acabou durável — vale mostrar mesmo assim.
    problemas.push(`A troca do token de 60 dias falhou ao menos uma vez: "${longLivedExchangeError}".`);
  }

  if (webhookSubscribeError) {
    problemas.push(
      `A conta não foi inscrita no webhook de mensagens. A Meta respondeu: "${webhookSubscribeError}".`
      + " Sem essa inscrição nenhuma DM chega, mesmo com o token válido.",
    );
  } else if (Number.isFinite(nasceu) && !webhookSubscribedAt) {
    // Guardrail 1, duas vezes. (a) Não afirmo que falhou — afirmo que não há REGISTRO
    // de que tenha dado certo, que é o fato. (b) Só digo isso quando sei que houve uma
    // conexão: exijo um `connectedAt` que realmente vira data. Um metadata corrompido
    // não pode virar acusação — foi isto que o teste da data ilegível pegou.
    problemas.push(
      "Não há registro de que a conta tenha sido inscrita no webhook de mensagens nesta conexão."
      + " Confirme com o graph-check (o campo subscribedApps precisa conter \"messages\").",
    );
  }

  return {
    connectedAt,
    tokenExpiresAt,
    tokenLifetimeHours,
    longLivedExchangeError,
    webhookSubscribedAt,
    webhookSubscribeError,
    problemas,
  };
}
