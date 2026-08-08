/**
 * channelHealth — um canal de entrada está VIVO?
 *
 * Nasceu de um incidente: o Instagram ficou **15 dias** sem receber um único
 * evento da Meta (`lastWebhookAt` congelado em 23/07/2026) e ninguém viu, porque
 * a Central de Atendimento mostra exatamente a mesma tela para "canal morto" e
 * para "hoje ninguém mandou mensagem": um vazio educado.
 *
 * As três regras que fazem disto uma proteção em vez de um enfeite:
 *
 *  1. **Canal que o lojista nunca ligou não está caído — está ausente.** Sem
 *     configuração, sem `enabled`, em `DISABLED` ou pausado de propósito: este
 *     módulo **não devolve nada**. Um aviso que acende para quem não usa o canal
 *     é ignorado no primeiro dia e aí não serve para o dia em que importa.
 *
 *  2. **Silêncio NUNCA fica vermelho.** Vermelho (`down`) exige um fato positivo
 *     — um erro registrado pelo provedor. Ficar sem receber, por mais tempo que
 *     seja, no máximo vira `attention` (âmbar), porque um restaurante de baixo
 *     movimento pode passar dias sem um Direct legitimamente. Trocar um selo que
 *     mente "está tudo bem" por um alarme que mente "está quebrado" seria a
 *     proteção mais destrutiva que o problema (guardrail 5).
 *
 *  3. **Ausência de informação não é informação** (guardrail 1). Quando não dá
 *     para julgar — nunca recebeu nada E não sabemos desde quando está conectado
 *     — o módulo devolve vazio: **cala, e não afirma que está saudável.** Quem
 *     consome deve tratar "sem item" como "não sei", nunca como "ok".
 *
 *  4. **O próximo passo não pode ser uma tarefa que não conserta nada.** A faixa
 *     dizia "Reconectar" para qualquer erro. Quando o defeito é do nosso lado —
 *     um pedido malformado à Meta, uma permissão que falta no aplicativo — o
 *     lojista refaz o login, vê tudo falhar igual e aprende que a faixa não
 *     resolve. Aconteceu três vezes com o mesmo Instagram (25/07, 04/08, 05/08).
 *     Agora o botão só promete reconexão quando `reconnectCanFix` diz que ela
 *     resolve; `null` (não sabemos) **não** vira promessa.
 *
 * Nada aqui envia mensagem, lê token, decifra segredo ou fala com a Meta. É
 * leitura de estado já gravado.
 *
 * ── Por que o WhatsApp NÃO está aqui ─────────────────────────────────────────
 * `MetaWhatsAppConfig` não tem carimbo de último evento recebido — não existe
 * dado para julgar silêncio. E `connectionStatus: "ERROR"` na Meta **não**
 * significa WhatsApp fora do ar: a Evolution é o padrão E o fallback, então o
 * número pode estar atendendo normalmente com a config da Meta em erro. Um aviso
 * de "WhatsApp caiu" nessa situação é alarme falso no canal que carrega todo o
 * movimento. Enquanto não houver um `lastInboundAt` por provedor, este módulo
 * fica calado sobre o WhatsApp — de propósito, pela regra 3.
 */

/** A partir de quanto tempo em silêncio o canal vira "atenção" (nunca "quebrado"). */
export const CHANNEL_SILENCE_ATTENTION_MS = 48 * 60 * 60 * 1000;

export type ChannelHealthLevel =
  /** Fato positivo de falha: o provedor registrou erro. Vermelho. */
  | "down"
  /** Silêncio longo. Pode ser movimento baixo — âmbar, nunca vermelho. */
  | "attention"
  /** Recado útil sobre a configuração, sem falha nenhuma. Neutro. */
  | "info";

export interface ChannelHealthItem {
  channel: "INSTAGRAM";
  /** Nome que o lojista reconhece. */
  label: string;
  level: ChannelHealthLevel;
  /** O que está acontecendo, em uma frase. */
  headline: string;
  /**
   * O PRÓXIMO PASSO. Alerta que não diz o que fazer vira paisagem em duas semanas.
   * CURTO de propósito: vira um botão ao lado do texto, e a 375px uma ação longa
   * quebra em três linhas e a faixa passa a comer um terço da tela do celular —
   * aí o lojista aprende a rolar por cima dela, que é o mesmo que não existir.
   * A ressalva ("pode ser movimento baixo") mora no `headline`, não aqui.
   */
  action: string;
  actionHref: string;
  /** ISO do último evento recebido, quando existe. */
  lastInboundAt: string | null;
  /** Horas inteiras de silêncio, quando dá para calcular. */
  silentHours: number | null;
}

export interface InstagramHealthInput {
  /** Existe linha de configuração para este restaurante. */
  configured: boolean;
  enabled: boolean;
  paused: boolean;
  /** DISABLED | RECEIVE_ONLY | REPLY_ONLY | FULL */
  mode: string;
  /** Erro registrado pelo provedor/reconexão. Fato positivo de falha. */
  lastError: string | null;
  /**
   * Refazer o login pela tela resolve ESTE erro?
   *
   * `null` = não sabemos (guardrail 1) — e aí a faixa não promete conserto nenhum.
   * `false` = já sabemos que NÃO resolve; mandar reconectar seria pedir ao lojista uma
   * ação que não conserta nada. Foi o que aconteceu com o Instagram: reconectaram em
   * 25/07, 04/08 e 05/08 e as três conexões nasceram com o mesmo defeito, porque o
   * defeito nunca esteve na conexão dele.
   */
  reconnectCanFix?: boolean | null;
  /** Último evento entregue pela Meta. */
  lastWebhookAt: Date | null;
  /** Quando a conta foi conectada (metadata.connectedAt). */
  connectedAt: Date | null;
  now: Date;
}

const IG_HREF = "/integracoes/instagram";

/** "há 3 dias" / "há 5 horas" — o número é o que assusta, então ele aparece. */
export function humanizeSilence(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "há menos de uma hora";
  if (hours < 48) return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  const days = Math.floor(hours / 24);
  return `há ${days} dias`;
}

/**
 * Avalia o Instagram Direct (a mesma configuração serve o Messenger).
 *
 * Devolve de 0 a 2 itens: no máximo um de saúde e no máximo um informativo
 * sobre o modo de resposta. Lista vazia significa **"nada a dizer"**, e nunca
 * deve ser lida como "o canal está bem".
 */
export function evaluateInstagramHealth(input: InstagramHealthInput): ChannelHealthItem[] {
  const { configured, enabled, paused, mode, lastError, lastWebhookAt, connectedAt, now } = input;
  const reconnectCanFix = input.reconnectCanFix ?? null;

  // Regra 1 — canal ausente não é canal caído.
  if (!configured) return [];
  if (!enabled || mode === "DISABLED") return [];
  // Pausado é escolha explícita do lojista; o painel de Integrações já mostra
  // "Pausado". Avisar aqui seria repreender alguém pelo que ela acabou de pedir.
  if (paused) return [];

  const items: ChannelHealthItem[] = [];

  const base = {
    channel: "INSTAGRAM" as const,
    label: "Instagram",
    actionHref: IG_HREF,
    lastInboundAt: lastWebhookAt ? lastWebhookAt.toISOString() : null,
  };

  if (lastError) {
    // Fato positivo de falha — o único caminho para o vermelho.
    //
    // O botão só promete "Reconectar" quando reconectar resolve. Quando já sabemos que
    // não resolve, ele leva o lojista à tela de detalhe e a faixa diz, com todas as
    // letras, que o conserto não é do lado dele — em vez de empurrá-lo para a quarta
    // tentativa de um login que vai falhar igual.
    const naoAdiantaReconectar = reconnectCanFix === false;
    items.push({
      ...base,
      level: "down",
      headline: naoAdiantaReconectar
        ? `A conexão do Instagram está com problema e as mensagens não estão chegando. Refazer o login NÃO resolve este caso — o conserto é do lado da Foocci. ${lastError}`
        : `A conexão do Instagram está com problema e as mensagens não estão chegando. ${lastError}`,
      action: naoAdiantaReconectar ? "Ver detalhes" : "Reconectar",
      silentHours: lastWebhookAt ? Math.floor((now.getTime() - lastWebhookAt.getTime()) / (60 * 60 * 1000)) : null,
    });
  } else if (lastWebhookAt === null) {
    // Nunca recebeu nada. Só dá para julgar se soubermos desde quando.
    if (connectedAt === null) {
      // Regra 3 — não sei desde quando. Calo, e NÃO afirmo que está saudável.
    } else {
      const silent = now.getTime() - connectedAt.getTime();
      if (silent > CHANNEL_SILENCE_ATTENTION_MS) {
        items.push({
          ...base,
          level: "attention",
          headline: `Instagram conectado ${humanizeSilence(silent)} e ainda não recebeu nenhuma mensagem. Confira a conexão.`,
          action: "Abrir Integrações",
          silentHours: Math.floor(silent / (60 * 60 * 1000)),
        });
      }
      // Conectado há pouco e ainda sem mensagem é o normal — nada a dizer.
    }
  } else {
    const silent = now.getTime() - lastWebhookAt.getTime();
    if (silent > CHANNEL_SILENCE_ATTENTION_MS) {
      // Regra 2 — âmbar, com a ressalva de movimento baixo dita em voz alta,
      // para o lojista tranquilo não achar que quebrou.
      items.push({
        ...base,
        level: "attention",
        headline: `Instagram sem receber mensagem ${humanizeSilence(silent)}. Pode ser movimento baixo — mas se você espera Directs, confira a conexão.`,
        action: "Abrir Integrações",
        silentHours: Math.floor(silent / (60 * 60 * 1000)),
      });
    }
  }

  // Recado de configuração — sem isto, o lojista com o canal perfeitamente
  // saudável abre a conversa, escreve a resposta e leva um 502 na cara
  // ("Modo somente recebimento"). Informar não é alterar: o padrão continua
  // RECEIVE_ONLY, quem muda é ele, em Integrações.
  //
  // Só aparece quando NÃO há problema de saúde (`items.length === 0`). Empilhar
  // duas faixas come metade da tela a 375px, e com a conexão caída "você não
  // consegue responder" é rodapé: primeiro o canal volta a receber. Uma faixa
  // por vez é o que mantém a faixa sendo lida.
  if (items.length === 0 && mode === "RECEIVE_ONLY") {
    items.push({
      ...base,
      level: "info",
      headline: "O Instagram está em somente recebimento: você lê os Directs aqui, mas ainda não consegue responder por aqui.",
      action: "Ativar resposta em Integrações",
      silentHours: null,
    });
  }

  return items;
}

// ── O selo do cartão de Integrações ─────────────────────────────────────────

export type IntegrationCardStatus =
  | "unconfigured"
  | "configured"
  | "active"
  | "error"
  /** Conectado, sem erro, mas mudo há tempo demais. Âmbar — nunca vermelho. */
  | "attention"
  | "pending_validation";

export interface InstagramCardStatusInput {
  configured: boolean;
  enabled: boolean;
  paused: boolean;
  mode: string;
  lastError: string | null;
  lastWebhookAt: Date | null;
  tokenConfigured: boolean;
  hasAccountIds: boolean;
  now: Date;
}

/**
 * O selo do cartão, COM prazo de validade.
 *
 * Até 07/08/2026 bastava `lastWebhookAt` ser não-nulo para o cartão ficar verde:
 * um carimbo de quinze dias valia igual a um de um minuto. Foi assim que o
 * Instagram passou treze dias "Ativo" com o canal morto.
 *
 * `attention` é deliberadamente distinto de `error`: silêncio pode ser movimento
 * baixo, e só um fato positivo de falha (`lastError`) autoriza o vermelho.
 */
export function instagramCardStatus(input: InstagramCardStatusInput): IntegrationCardStatus {
  const { configured, enabled, paused, mode, lastError, lastWebhookAt, tokenConfigured, hasAccountIds, now } = input;

  if (!configured) return "unconfigured";
  if (lastError) return "error";
  if (paused) return "configured";

  const live = enabled && mode !== "DISABLED";
  if (live && lastWebhookAt) {
    const silent = now.getTime() - lastWebhookAt.getTime();
    return silent > CHANNEL_SILENCE_ATTENTION_MS ? "attention" : "active";
  }
  if (live) return "pending_validation";
  if (tokenConfigured || hasAccountIds) return "configured";
  return "unconfigured";
}

/** Ordem de exibição: o que quebrou primeiro, o recado por último. */
const LEVEL_WEIGHT: Record<ChannelHealthLevel, number> = { down: 0, attention: 1, info: 2 };

export function sortChannelHealth(items: ChannelHealthItem[]): ChannelHealthItem[] {
  return [...items].sort((a, b) => LEVEL_WEIGHT[a.level] - LEVEL_WEIGHT[b.level]);
}
