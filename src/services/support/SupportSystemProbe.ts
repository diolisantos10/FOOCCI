/**
 * SupportSystemProbe — coleta de sinais READ-ONLY para o Agente de Suporte
 * ancorar o diagnóstico. NUNCA muta nada. NUNCA expõe o VALOR de um segredo —
 * apenas se ele está presente (booleano).
 *
 * ── O DEFEITO QUE ESTE ARQUIVO CARREGOU ATÉ 15/08/2026 ───────────────────────
 * A sonda não recebia o restaurante. Ela olhava o processo (banco respondendo,
 * variáveis de ambiente presentes) e devolvia `healthy: true` — e o agente
 * repetia isso ao lojista como *"está tudo saudável"*. Se o WhatsApp de UM
 * restaurante estivesse caído, a sonda não tinha como saber e a resposta era a
 * mesma: tudo bem. O dono desligava o telefone e ficava esperando enquanto
 * perdia pedido.
 *
 * Mentira em produção é pior que recurso faltando: um agente que diz "não sei"
 * manda o dono investigar; um que diz "tudo saudável" manda ele parar.
 *
 * ── AS TRÊS REGRAS QUE FAZEM DISTO UMA SONDA E NÃO UM ENFEITE ────────────────
 *
 *  1. **O restaurante é obrigatório.** `probeSystem` exige `restaurantId` — não é
 *     parâmetro opcional que alguém esquece de passar. Guardrail 4: prompt é
 *     aviso, código é trava. Quem chamar sem o tenant não compila.
 *
 *  2. **Falha fechada.** Não existe `healthy: boolean`. O veredito é tri-estado:
 *     `HEALTHY` | `DEGRADED` | `UNKNOWN`. Qualquer leitura que não deu certo —
 *     banco fora, restaurante inexistente, exceção no meio — vira **UNKNOWN**, e
 *     UNKNOWN se diz em voz alta: *"não consigo verificar agora"*. Guardrail 1:
 *     ausência de informação não é informação. `true` por omissão não existe
 *     neste arquivo.
 *
 *  3. **Canal que o lojista nunca ligou não está caído — está ausente.** Um
 *     restaurante sem Instagram não é um restaurante com Instagram quebrado
 *     (mesma regra do `channelHealth`). `absent` não derruba o veredito, e
 *     também não é contado como prova de saúde.
 *
 * ── O QUE NÃO ENTRA AQUI, DE PROPÓSITO ───────────────────────────────────────
 * Nenhuma chamada externa (Graph API, Mercado Pago, Railway). A sonda lê estado
 * **já gravado** — o que o sistema soube da última vez que tentou. Perguntar à
 * Meta a cada dúvida do lojista custa latência e cota, e o dado gravado é
 * atualizado a cada envio real (`MetaWhatsAppCloudProvider` carimba
 * `connectionStatus`/`lastError` em todo envio) e pela varredura diária de
 * credenciais (`metaTokenHealth`).
 */

import { prisma } from "@/lib/prisma";

export interface SignalCheck {
  key: string;
  label: string;
  ok: boolean;
  detail: string;
  /** CRITICAL = infra que, ausente, é incidente real. OPTIONAL = integração que
   *  pode legitimamente não estar configurada (não derruba a saúde geral). */
  tier: "CRITICAL" | "OPTIONAL";
}

/**
 * Estado de um sinal DESTE restaurante.
 *
 * `attention` existe para não repetir o erro oposto: silêncio e token vencendo
 * são âmbar, não vermelho. Trocar um selo que mente "está tudo bem" por um
 * alarme que mente "está quebrado" seria a proteção mais destrutiva que o
 * problema (guardrail 5).
 */
export type TenantSignalState =
  /** Fato positivo de saúde: existe, está ligado, e não há erro registrado. */
  | "ok"
  /** Fato positivo de falha: erro registrado, desconectado, credencial vencida. */
  | "down"
  /** Preocupa, mas não é queda: vencendo, nunca conectou, pausado pelo dono. */
  | "attention"
  /** O lojista não usa este canal. Não é queda — e não conta como saúde. */
  | "absent"
  /** Não deu para ler. NUNCA vira "ok". */
  | "unknown";

export interface TenantSignal {
  key: string;
  label: string;
  state: TenantSignalState;
  detail: string;
}

/**
 * O veredito. Três estados porque dois mentem: com só `true/false`, tudo que
 * não deu para verificar cai num dos dois — e o que caía em `true` era a mentira
 * que este arquivo existe para matar.
 */
export type ProbeVerdict =
  /** Nada caído entre o que EU CONSIGO VER — e o que eu vejo está listado. */
  | "HEALTHY"
  /** Fato positivo de falha em pelo menos um sinal. */
  | "DEGRADED"
  /** Não consigo verificar. Nunca se traduz por "está tudo bem". */
  | "UNKNOWN";

export interface SystemSnapshot {
  takenAt: string;
  /** Quem foi sondado. Sem isto, o snapshot não sabe de quem está falando. */
  restaurantId: string;
  db: { ok: boolean; detail: string };
  /** Presença (booleano) de config crítica do processo — nunca o valor. */
  config: SignalCheck[];
  /** Sinais DESTE restaurante. Vazio = não consegui ler nenhum. */
  tenant: TenantSignal[];
  /** Resumo em uma linha para o topo do prompt. */
  summary: string;
  verdict: ProbeVerdict;
}

/** Presença de env var, sem revelar o conteúdo. */
function present(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0 && v !== "not-configured";
}

/** Tolerância de silêncio antes de virar âmbar. Mesma régua do `channelHealth`. */
const SILENCE_ATTENTION_MS = 48 * 60 * 60 * 1000;
/** A partir de quantos dias para o vencimento a credencial vira âmbar. */
const TOKEN_WARN_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function humanizeAgo(ms: number): string {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return "há menos de uma hora";
  if (hours < 48) return `há ${hours} ${hours === 1 ? "hora" : "horas"}`;
  return `há ${Math.floor(hours / 24)} dias`;
}

/**
 * O WhatsApp oficial DESTE restaurante — o canal que carrega o movimento e o
 * primeiro sobre o qual o dono liga reclamando.
 */
function readWhatsApp(
  cfg: {
    connectionStatus: string;
    lastError: string | null;
    tokenExpiresAt: Date | null;
    displayPhoneNumber: string | null;
    lastHealthCheckAt: Date | null;
  } | null,
  now: Date,
): TenantSignal {
  const base = { key: "whatsapp", label: "WhatsApp oficial (Meta)" };

  // Regra 3 — nunca conectou não é caído.
  if (!cfg) {
    return { ...base, state: "absent", detail: "nenhum número conectado neste restaurante" };
  }

  const numero = cfg.displayPhoneNumber ? ` (${cfg.displayPhoneNumber})` : "";

  // Fato positivo de falha — o único caminho para o vermelho.
  if (cfg.lastError) {
    return { ...base, state: "down", detail: `erro registrado no canal${numero}: ${cfg.lastError.slice(0, 140)}` };
  }
  if (cfg.connectionStatus === "ERROR") {
    return { ...base, state: "down", detail: `conexão em ERRO${numero}` };
  }
  if (cfg.connectionStatus === "DISCONNECTED") {
    return { ...base, state: "down", detail: `número desconectado${numero} — o restaurante não recebe nem envia mensagem` };
  }
  // Credencial vencida = canal morto mesmo com o cadastro dizendo CONNECTED.
  if (cfg.tokenExpiresAt && cfg.tokenExpiresAt.getTime() <= now.getTime()) {
    return { ...base, state: "down", detail: `credencial do canal venceu em ${cfg.tokenExpiresAt.toISOString().slice(0, 10)}` };
  }
  if (cfg.connectionStatus === "PENDING") {
    return { ...base, state: "attention", detail: `cadastro iniciado e ainda não concluído${numero}` };
  }
  if (cfg.connectionStatus !== "CONNECTED") {
    // Status que este código não conhece. Guardrail 1: não invento que está bom.
    return { ...base, state: "unknown", detail: `estado de conexão não reconhecido: ${cfg.connectionStatus}` };
  }

  if (cfg.tokenExpiresAt) {
    const days = Math.floor((cfg.tokenExpiresAt.getTime() - now.getTime()) / DAY_MS);
    if (days <= TOKEN_WARN_DAYS) {
      return { ...base, state: "attention", detail: `conectado${numero}, mas a credencial vence em ${days} ${days === 1 ? "dia" : "dias"}` };
    }
  }

  const checked = cfg.lastHealthCheckAt
    ? `; última verificação ${humanizeAgo(now.getTime() - cfg.lastHealthCheckAt.getTime())}`
    : "; sem verificação registrada";
  return { ...base, state: "ok", detail: `conectado${numero}, sem erro registrado${checked}` };
}

/** O Instagram Direct deste restaurante. Mesmas regras do `channelHealth`. */
function readInstagram(
  cfg: { enabled: boolean; paused: boolean; mode: string; lastError: string | null; lastWebhookAt: Date | null } | null,
  now: Date,
): TenantSignal {
  const base = { key: "instagram", label: "Instagram Direct" };

  if (!cfg || !cfg.enabled || cfg.mode === "DISABLED") {
    return { ...base, state: "absent", detail: "canal não ligado neste restaurante" };
  }
  if (cfg.paused) {
    return { ...base, state: "absent", detail: "pausado pelo próprio lojista" };
  }
  if (cfg.lastError) {
    return { ...base, state: "down", detail: `conexão com problema: ${cfg.lastError.slice(0, 140)}` };
  }
  if (!cfg.lastWebhookAt) {
    // Ligado e nunca recebeu nada. Pode ser recém-conectado — âmbar, não vermelho.
    return { ...base, state: "attention", detail: "ligado e ainda sem nenhuma mensagem recebida" };
  }
  const silent = now.getTime() - cfg.lastWebhookAt.getTime();
  if (silent > SILENCE_ATTENTION_MS) {
    // Silêncio NUNCA fica vermelho: restaurante de baixo movimento passa dias
    // sem um Direct legitimamente.
    return { ...base, state: "attention", detail: `sem receber mensagem ${humanizeAgo(silent)} (pode ser movimento baixo)` };
  }
  return { ...base, state: "ok", detail: `recebendo mensagens (última ${humanizeAgo(silent)})` };
}

/** O Carteiro — a impressão de comanda na cozinha. */
function readPrinting(
  agent: { token: string | null; lastSeenAt: Date | null } | null,
  now: Date,
): TenantSignal {
  const base = { key: "printing", label: "Impressão de comandas (Carteiro)" };

  // A linha nasce sozinha com o código de pareamento; sem token, ninguém pareou.
  if (!agent || !agent.token) {
    return { ...base, state: "absent", detail: "nenhum Carteiro pareado neste restaurante" };
  }
  if (!agent.lastSeenAt) {
    return { ...base, state: "attention", detail: "pareado, mas nunca deu sinal de vida" };
  }
  const ago = now.getTime() - agent.lastSeenAt.getTime();
  // 30s é a janela de "online" do próprio painel; um Carteiro que sumiu há mais
  // de 5 minutos não está imprimindo comanda nenhuma — isso é fato, não silêncio.
  if (ago > 5 * 60 * 1000) {
    return { ...base, state: "down", detail: `Carteiro offline ${humanizeAgo(ago)} — as comandas não estão saindo` };
  }
  return { ...base, state: "ok", detail: "Carteiro online" };
}

/** A loja está aceitando pedido? Pausa é escolha do dono — âmbar, nunca vermelho. */
function readOrdering(r: { isOrderingPaused: boolean; orderingPausedReason: string | null }): TenantSignal {
  const base = { key: "ordering", label: "Recebimento de pedidos" };
  if (r.isOrderingPaused) {
    return {
      ...base,
      state: "attention",
      detail: `a loja está com os pedidos PAUSADOS${r.orderingPausedReason ? ` (${r.orderingPausedReason})` : ""} — foi alguém do restaurante que pausou`,
    };
  }
  return { ...base, state: "ok", detail: "loja aceitando pedidos" };
}

/**
 * Lê os sinais deste restaurante. Nunca lança: qualquer falha vira `unknown`,
 * jamais `ok`.
 */
async function probeTenant(restaurantId: string, now: Date): Promise<TenantSignal[]> {
  const blind = (detail: string): TenantSignal[] => [
    { key: "tenant", label: "Estado deste restaurante", state: "unknown", detail },
  ];

  if (!restaurantId.trim()) return blind("nenhum restaurante informado na pergunta");

  try {
    const restaurant = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true,
        isOrderingPaused: true,
        orderingPausedReason: true,
        metaWhatsAppConfig: {
          select: {
            connectionStatus: true,
            lastError: true,
            tokenExpiresAt: true,
            displayPhoneNumber: true,
            lastHealthCheckAt: true,
          },
        },
        printAgent: { select: { token: true, lastSeenAt: true } },
      },
    });

    // Restaurante que não existe não é restaurante saudável.
    if (!restaurant) return blind(`restaurante ${restaurantId} não encontrado no banco`);

    // O Instagram não pendura em `Restaurant` no schema — consulta própria.
    let instagram: Parameters<typeof readInstagram>[0] | undefined;
    try {
      instagram = await prisma.instagramChannelConfig.findUnique({
        where: { restaurantId },
        select: { enabled: true, paused: true, mode: true, lastError: true, lastWebhookAt: true },
      });
    } catch (err) {
      console.error("[SupportSystemProbe] leitura do Instagram falhou:", err);
      instagram = undefined; // undefined ≠ null: um não deu para ler, o outro não existe.
    }

    return [
      readWhatsApp(restaurant.metaWhatsAppConfig, now),
      instagram === undefined
        ? { key: "instagram", label: "Instagram Direct", state: "unknown" as const, detail: "não consegui ler a configuração do canal" }
        : readInstagram(instagram, now),
      readPrinting(restaurant.printAgent, now),
      readOrdering(restaurant),
    ];
  } catch (err) {
    console.error("[SupportSystemProbe] leitura do restaurante falhou:", err);
    return blind(`não consegui ler o estado do restaurante (${err instanceof Error ? err.message.slice(0, 80) : "erro desconhecido"})`);
  }
}

export interface ProbeInput {
  /** Obrigatório. A sonda que não sabe de quem está falando não pode falar. */
  restaurantId: string;
  /** Injetável para teste. */
  now?: Date;
}

/** Roda o probe para UM restaurante. */
export async function probeSystem(input: ProbeInput): Promise<SystemSnapshot> {
  const now = input.now ?? new Date();
  const restaurantId = input.restaurantId ?? "";

  let dbOk = false;
  let dbDetail = "sem checagem";
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
    dbDetail = "respondendo";
  } catch (err) {
    dbOk = false;
    dbDetail = err instanceof Error ? err.message.slice(0, 80) : "inacessível";
  }

  const mk = (key: string, label: string, env: string, tier: "CRITICAL" | "OPTIONAL"): SignalCheck => ({
    key, label, ok: present(env), detail: present(env) ? "configurada" : "ausente", tier,
  });
  const config: SignalCheck[] = [
    mk("openaiKey", "IA (OpenAI)", "OPENAI_API_KEY", "CRITICAL"),
    mk("databaseUrl", "Banco (DATABASE_URL)", "DATABASE_URL", "CRITICAL"),
    mk("encryptionKey", "Criptografia", "ENCRYPTION_KEY", "CRITICAL"),
    mk("nextauthSecret", "Sessão (NextAuth)", "NEXTAUTH_SECRET", "CRITICAL"),
    // Integração opcional: pode não estar configurada por escolha do restaurante —
    // ausência NÃO é incidente e não pode sequestrar o diagnóstico.
    mk("mpWebhookSecret", "Webhook de pagamento", "MP_WEBHOOK_SECRET", "OPTIONAL"),
  ];

  const criticalMissing = config.filter((c) => c.tier === "CRITICAL" && !c.ok).map((c) => c.label);
  const optionalMissing = config.filter((c) => c.tier === "OPTIONAL" && !c.ok).map((c) => c.label);

  // Banco fora = nem adianta tentar ler o restaurante, e já é fato de falha.
  const tenant = dbOk ? await probeTenant(restaurantId, now) : [];

  const down      = tenant.filter((t) => t.state === "down");
  const unknown   = tenant.filter((t) => t.state === "unknown");
  const attention = tenant.filter((t) => t.state === "attention");
  const seen      = tenant.filter((t) => t.state === "ok");

  // ── O veredito, em ordem de prioridade ──────────────────────────────────────
  // Fato de falha vence tudo; depois cegueira; saúde é o ÚLTIMO recurso e só
  // quando não sobrou nenhuma dúvida. É o inverso da versão antiga, em que a
  // saúde era o padrão e a dúvida não tinha como ser expressa.
  let verdict: ProbeVerdict;
  let summary: string;

  if (!dbOk || criticalMissing.length > 0 || down.length > 0) {
    verdict = "DEGRADED";
    summary = [
      !dbOk ? `Banco: ${dbDetail}.` : null,
      criticalMissing.length ? `Infra crítica ausente: ${criticalMissing.join(", ")}.` : null,
      ...down.map((d) => `${d.label}: ${d.detail}.`),
      // Cegueira parcial no meio de um incidente também se diz.
      unknown.length ? `E não consegui verificar: ${unknown.map((u) => u.label).join(", ")}.` : null,
    ].filter(Boolean).join(" ");
  } else if (tenant.length === 0 || unknown.length > 0) {
    verdict = "UNKNOWN";
    const motivos = tenant.length === 0
      ? "não consegui ler nada sobre este restaurante"
      : unknown.map((u) => `${u.label} (${u.detail})`).join("; ");
    summary =
      `NÃO CONSIGO VERIFICAR AGORA o estado deste restaurante: ${motivos}. ` +
      `Isto NÃO quer dizer que está tudo bem — quer dizer que estou sem o sinal.` +
      (seen.length ? ` O que consegui ver: ${seen.map((s) => s.label).join(", ")}.` : "");
  } else {
    verdict = "HEALTHY";
    summary =
      `Sinais que consigo ver DESTE restaurante: ${seen.map((s) => `${s.label} — ${s.detail}`).join("; ")}. ` +
      `Sem incidente aparente${attention.length ? `, mas atenção: ${attention.map((a) => a.detail).join("; ")}` : ""}` +
      `${optionalMissing.length ? ` (integração opcional não configurada: ${optionalMissing.join(", ")} — informativo, não é falha)` : ""}.`;
  }

  return { takenAt: now.toISOString(), restaurantId, db: { ok: dbOk, detail: dbDetail }, config, tenant, summary, verdict };
}

/** Bloco compacto dos sinais, para injetar no prompt do reasoner. */
export function buildProbeContext(snap: SystemSnapshot): string {
  const cfg = snap.config
    .map((c) => `• ${c.label} [${c.tier === "OPTIONAL" ? "opcional" : "crítico"}]: ${c.ok ? "ok" : "AUSENTE"}`)
    .join("\n");
  const ten = snap.tenant.length
    ? snap.tenant.map((t) => `• ${t.label}: ${t.state.toUpperCase()} — ${t.detail}`).join("\n")
    : "• (não consegui ler nenhum sinal deste restaurante)";

  return [
    "━━━ SINAIS READ-ONLY DO SISTEMA AGORA (contexto de fundo) ━━━",
    `Banco de dados: ${snap.db.ok ? "respondendo" : `INACESSÍVEL (${snap.db.detail})`}`,
    cfg,
    "",
    `SINAIS DESTE RESTAURANTE (${snap.restaurantId || "não informado"}):`,
    ten,
    "",
    `VEREDITO: ${snap.verdict}`,
    `Leitura geral: ${snap.summary}`,
    snap.verdict === "UNKNOWN"
      ? 'REGRA DURA: o veredito é UNKNOWN. Diga ao lojista, com estas palavras, que você NÃO CONSEGUE VERIFICAR AGORA o estado do sistema dele. É PROIBIDO dizer "está tudo saudável", "está tudo certo" ou equivalente. Ofereça abrir um chamado.'
      : snap.verdict === "DEGRADED"
        ? "REGRA DURA: há falha confirmada acima. Não minimize e não diga que está tudo bem."
        : 'REGRA: os sinais acima são os ÚNICOS que eu vejo. Se afirmar que está tudo bem, diga que vale para o que você consegue ver — nunca para o sistema inteiro.',
    "NOTA: um item [opcional] AUSENTE é informativo — NÃO é incidente e NÃO explica",
    "um relato sobre outro assunto. Só cite um sinal se ele tiver relação com o relato.",
    "━━━",
  ].join("\n");
}
