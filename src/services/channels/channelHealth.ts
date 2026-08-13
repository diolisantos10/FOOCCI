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
 * Nada aqui envia mensagem, lê token, decifra segredo ou fala com a Meta. É
 * leitura de estado já gravado.
 *
 * ── O WhatsApp ENTROU aqui em 13/08/2026, e por quê ──────────────────────────
 * Este bloco dizia "por que o WhatsApp NÃO está aqui", com duas razões. **Uma
 * delas morreu e a outra tinha solução.**
 *
 *  • *"a Evolution é o padrão E o fallback"* — **CADUCOU**. A Evolution foi
 *    extraída em 04/08/2026. Há um provedor só, e `connectionStatus: "ERROR"`
 *    hoje significa exatamente o que parece.
 *  • *"não existe dado para julgar silêncio"* — havia. `MetaWhatsAppConfig` de
 *    fato não tem carimbo, mas a última entrada sempre esteve calculável a
 *    partir de `Message` (é o que
 *    `api/integracoes/whatsapp/meta/diagnostics/route.ts:30` já fazia).
 *
 * **O que essa cegueira custou, medido:** em 12/08 um restaurante trocou de
 * chip. O `phone_number_id` gravado continuou apontando para o número velho, e
 * toda mensagem que entrava morria num `console.warn`
 * (`webhooks/meta/whatsapp/route.ts:168`). A tela ficou **verde o tempo todo**.
 * O CEO descobriu no dia seguinte, pelas vendas: *"as vendas caíram"*.
 *
 * O selo de Integrações vem só de `connectionStatus`, e `connectionStatus` é
 * gravado no `upsert` e só revisto por um health check que testa **envio**.
 * **Verde sempre significou "consigo falar", nunca "consigo ouvir".**
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
  channel: "INSTAGRAM" | "WHATSAPP";
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
    items.push({
      ...base,
      level: "down",
      headline: `A conexão do Instagram está com problema e as mensagens não estão chegando. ${lastError}`,
      action: "Reconectar",
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

// ─── WHATSAPP ────────────────────────────────────────────────────────────────
//
// O canal que carrega o movimento inteiro. Por isso ele tem um limiar PRÓPRIO,
// mais curto que o do Instagram: 24h. Um restaurante pode passar dois dias sem
// um Direct e estar tudo bem; passar um dia inteiro sem UMA mensagem no
// WhatsApp, tendo histórico de receber, não é movimento baixo — é sintoma.
//
// E o aviso carrega a CAUSA MAIS PROVÁVEL, não só o sintoma. O raio-X de
// 13/08/2026 mostrou que o silêncio total do WhatsApp tem uma origem dominante:
// o restaurante trocou de número e ninguém reconectou no painel. O sistema
// continua ouvindo o número velho. Um alerta que diz "sem receber" e não diz
// "você trocou de chip?" faz o lojista procurar defeito onde não há.

/** Silêncio que vira atenção no WhatsApp. Menor que o do Instagram de propósito:
 *  aqui passa o pedido, e um dia mudo no canal principal não é movimento baixo. */
export const WHATSAPP_SILENCE_ATTENTION_MS = 24 * 60 * 60 * 1000;

const WA_HREF = "/integracoes/whatsapp";

export interface WhatsAppHealthInput {
  /** Existe config da Meta gravada para este restaurante. */
  configured: boolean;
  /** `connectionStatus` da config. */
  connectionStatus: string;
  /** Erro registrado. Fato positivo de falha. */
  lastError: string | null;
  /** Última mensagem RECEBIDA, calculada de `Message` — não de um carimbo no canal. */
  lastInboundAt: Date | null;
  /** Quando a config foi gravada/atualizada pela última vez. É o que permite
   *  julgar "conectado há muito tempo e nunca recebeu nada". */
  connectedAt: Date | null;
  now: Date;
}

/**
 * Avalia o WhatsApp. Devolve 0 ou 1 item.
 *
 * Lista vazia significa **"nada a dizer"** — nunca "o canal está bem". É a
 * regra 3 do cabeçalho, e ela vale aqui com força: o histórico deste canal é
 * justamente o de parecer saudável enquanto estava mudo.
 */
export function evaluateWhatsAppHealth(input: WhatsAppHealthInput): ChannelHealthItem[] {
  const { configured, connectionStatus, lastError, lastInboundAt, connectedAt, now } = input;

  // Canal ausente não é canal caído.
  if (!configured) return [];

  const base = {
    channel: "WHATSAPP" as const,
    label: "WhatsApp",
    actionHref: WA_HREF,
    lastInboundAt: lastInboundAt ? lastInboundAt.toISOString() : null,
  };
  const horas = (ms: number) => Math.floor(ms / (60 * 60 * 1000));

  // ── Fato positivo de falha: o único caminho para o vermelho ───────────────
  if (lastError || connectionStatus === "ERROR") {
    return [{
      ...base,
      level: "down",
      headline: `A conexão do WhatsApp está com problema e as mensagens podem não estar chegando.${lastError ? ` ${lastError}` : ""}`,
      action: "Reconectar",
      silentHours: lastInboundAt ? horas(now.getTime() - lastInboundAt.getTime()) : null,
    }];
  }

  // Config existe mas não está conectada: é recado de configuração, não falha.
  if (connectionStatus !== "CONNECTED") return [];

  // ── Nunca recebeu nada ────────────────────────────────────────────────────
  if (lastInboundAt === null) {
    // Sem saber desde quando, não dá para julgar. Cala — e NÃO afirma saúde.
    if (connectedAt === null) return [];
    const mudo = now.getTime() - connectedAt.getTime();
    if (mudo <= CHANNEL_SILENCE_ATTENTION_MS) return [];
    return [{
      ...base,
      level: "attention",
      headline: `WhatsApp conectado ${humanizeSilence(mudo)} e ainda não recebeu nenhuma mensagem. Normalmente isso é o número: confira se o que está conectado aqui é o mesmo que os clientes usam.`,
      action: "Conferir número",
      silentHours: horas(mudo),
    }];
  }

  // ── Recebia, e parou ──────────────────────────────────────────────────────
  const mudo = now.getTime() - lastInboundAt.getTime();
  if (mudo <= WHATSAPP_SILENCE_ATTENTION_MS) return [];

  // Este restaurante TEM histórico de receber — então o silêncio não é "nunca
  // teve movimento". A frase nomeia a causa dominante em vez de mandar o
  // lojista caçar: trocar de chip não troca o número que o sistema escuta.
  return [{
    ...base,
    level: "attention",
    headline: `WhatsApp sem receber nenhuma mensagem ${humanizeSilence(mudo)}, e antes disso recebia. Se você trocou o chip ou o número, é preciso reconectar aqui — o sistema continua ouvindo o número anterior.`,
    action: "Conferir número",
    silentHours: horas(mudo),
  }];
}
