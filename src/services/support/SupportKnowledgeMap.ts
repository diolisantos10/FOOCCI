/**
 * SupportKnowledgeMap — o "mapa do sistema" que o Agente de Suporte conhece.
 *
 * Dado ESTÁTICO e puro (sem DB, sem I/O): a arquitetura do FOOCCI em alto nível,
 * os modos de falha conhecidos e o runbook de cada um. É a fonte de verdade de
 * DOMÍNIO do agente — o que ele "estudou" sobre o sistema — que o reasoner injeta
 * no prompt junto com os sinais read-only do momento (SupportSystemProbe).
 *
 * Manter isto curado e honesto é o que separa um diagnóstico útil de um palpite.
 * Cada modo de falha aponta os SINAIS que o confirmam e a AÇÃO de remediação
 * candidata (que só executa se estiver na allowlist da escada — ver
 * SupportRemediationLadder).
 */

export interface SubsystemInfo {
  key: string;
  name: string;
  /** O que quebra a experiência quando este subsistema cai. */
  impact: string;
  /** Sinais read-only que revelam a saúde deste subsistema. */
  signals: string[];
}

export interface FailureMode {
  key: string;
  subsystem: string;
  /** Como o usuário costuma DESCREVER o sintoma (linguagem do lojista). */
  symptom: string;
  /** Palavras/expressões-gatilho curadas — o casamento primário e mais confiável.
   *  Uma delas no relato já indica este modo (ver matchFailureModes). */
  triggers: string[];
  /** A causa provável, em termos técnicos. */
  likelyCause: string;
  /** Sinais que CONFIRMAM esta causa (o agente exige sinal antes de concluir). */
  confirmingSignals: string[];
  /** Runbook: o passo-a-passo da correção. */
  runbook: string[];
  /** Chave da ação de remediação candidata (na allowlist), ou null = só humano. */
  remediationAction: string | null;
  /** Severidade default deste modo de falha. */
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export const SUBSYSTEMS: readonly SubsystemInfo[] = [
  {
    key: "database",
    name: "Banco de dados (Postgres)",
    impact: "Se cai, nada funciona: painel, pedidos, cardápio — tudo depende do banco.",
    signals: ["/api/health → db", "erros P1001/P1017 (conexão)", "'too many clients already'"],
  },
  {
    key: "whatsapp_meta",
    name: "WhatsApp Cloud API (Meta)",
    impact: "Se cai, o restaurante para de receber e responder mensagens no canal oficial.",
    signals: ["/api/integracoes/whatsapp/meta/status", "/api/admin/meta/diag", "webhooks de entrada"],
  },
  {
    key: "whatsapp_evolution",
    name: "WhatsApp não-oficial (WhatsApp (Meta))",
    impact: "Se cai, a instância desconecta e as campanhas/atendimento por WhatsApp (Meta) param.",
    signals: ["/api/integracoes/whatsapp/meta/status → open|close|connecting"],
  },
  {
    key: "payments",
    name: "Pagamentos (Mercado Pago / Pix)",
    impact: "Se cai, o cliente não consegue pagar e o pedido não fecha.",
    signals: ["webhook do Mercado Pago", "MP_WEBHOOK_SECRET presente", "status do pedido travado em 'aguardando pagamento'"],
  },
  {
    key: "deploy_migrations",
    name: "Deploy e migrações (Railway/Prisma)",
    impact: "Se trava, uma versão nova não sobe ou o schema fica inconsistente.",
    signals: ["deploy FAILED", "P3009 (migração travada)", "preDeploy migrate-deploy.sh"],
  },
  {
    key: "ai_brain",
    name: "IA / Brain (OpenAI)",
    impact: "Se cai, os agentes caem para o modo seguro (fallback) e param de raciocinar.",
    signals: ["OPENAI_API_KEY presente/válida", "401 Incorrect API key", "reasoningMode = FALLBACK"],
  },
  {
    key: "campaign_queue",
    name: "Fila de campanhas de CRM",
    impact: "Se trava, campanhas param de sair ou ficam presas em envio.",
    signals: ["job de campanha zumbi", "execuções presas em PENDING/SENDING"],
  },
  {
    key: "printing",
    name: "Impressão de comandas (Carteiro)",
    impact: "Se cai, as comandas não saem na cozinha/caixa e o pedido não é preparado.",
    signals: [
      "Configurações → Impressoras mostra 'Carteiro conectado'?",
      "print agent lastSeenAt < 30s (online)",
      "estação (Cozinha/Caixa) com impressora escolhida",
    ],
  },
];

export const FAILURE_MODES: readonly FailureMode[] = [
  {
    key: "printer_not_printing",
    subsystem: "printing",
    symptom: "As comandas não estão saindo na impressora da cozinha/caixa.",
    triggers: [
      "impressora", "impressão", "imprimir", "imprime", "não imprime", "não sai comanda",
      "comanda", "comandas", "carteiro", "não sai o pedido na cozinha", "papel",
    ],
    likelyCause: "Carteiro (programa no PC) desconectado, estação sem impressora escolhida, ou a impressora física offline (papel/energia/cabo).",
    confirmingSignals: ["Configurações → Impressoras: 'Carteiro conectado'?", "estação com impressora selecionada?"],
    runbook: [
      "Em Configurações → Impressoras, veja se o topo mostra 'Carteiro conectado'.",
      "Se NÃO conectado: abra o programa Carteiro no computador da cozinha (Windows) e confirme que está rodando; se preciso, pareie de novo com o código da tela.",
      "Se conectado: no cartão '1. Impressora de cada estação', confirme que a estação (Cozinha/Caixa) tem uma impressora escolhida e clique em 🖨️ Testar.",
      "Cheque o básico da impressora física: ligada, com papel, cabo/USB conectado.",
      "Se o teste sai mas o pedido não: revise o cartão '2. Para onde vai cada categoria' (mapeamento categoria → estação).",
      "Reimprima o pedido pelo botão 🖨️ Reimprimir.",
    ],
    remediationAction: null, // impressão local depende de hardware/PC do restaurante — orienta e escala.
    severity: "HIGH",
  },
  {
    key: "meta_inbound_stopped",
    subsystem: "whatsapp_meta",
    symptom: "Os pedidos/mensagens pararam de chegar no WhatsApp, mas dá pra enviar.",
    triggers: [
      "não chega", "pararam de chegar", "não recebo", "não estou recebendo",
      "mensagens não chegam", "pedidos não chegam", "não caem os pedidos", "sumiram as mensagens",
    ],
    likelyCause: "Webhook de entrada do Meta dessinscrito ou fila de entrada presa.",
    confirmingSignals: ["/api/admin/meta/diag mostra subscribed_apps vazio ou phone sem inbound"],
    runbook: [
      "Conferir /api/admin/meta/diag: número conectado? subscribed_apps presente?",
      "Se dessinscrito: re-subscrever o app ao webhook (ação de integração).",
      "Reprocessar a fila de entrada dos últimos minutos.",
      "Confirmar recebimento com uma mensagem de teste.",
    ],
    remediationAction: "reprocess_meta_inbound",
    severity: "HIGH",
  },
  {
    key: "evolution_disconnected",
    subsystem: "whatsapp_evolution",
    symptom: "O WhatsApp (não-oficial) caiu / apareceu como desconectado.",
    triggers: ["desconectou", "desconectado", "caiu o whatsapp", "qr code", "qrcode", "reconectar", "instância", "evolution", "pedindo qr", "aparelho desconectou"],
    likelyCause: "Instância WhatsApp (Meta) em estado 'close' — sessão caiu.",
    confirmingSignals: ["/api/integracoes/whatsapp/meta/status = close"],
    runbook: [
      "Conferir /api/integracoes/whatsapp/meta/status.",
      "Se 'close': disparar reconexão da instância (ação de integração).",
      "Se pedir QR novamente: escalar — precisa do humano reparear o aparelho.",
    ],
    remediationAction: "reconnect_whatsapp_meta",
    severity: "HIGH",
  },
  {
    key: "db_connection_exhaustion",
    subsystem: "database",
    symptom: "O sistema todo ficou fora do ar / erro ao abrir qualquer tela.",
    triggers: ["fora do ar", "não abre", "tudo travado", "sistema caiu", "nenhuma tela", "erro em tudo", "too many clients", "site caiu", "não carrega nada"],
    likelyCause: "Exaustão de conexões do Postgres ('too many clients already').",
    confirmingSignals: ["/api/health db = unreachable", "logs com 'too many clients'"],
    runbook: [
      "Conferir /api/health (db).",
      "Se exaustão de conexão: escalar para reciclar as conexões do Postgres.",
      "Verificar se houve tempestade de deploys concorrentes.",
    ],
    remediationAction: null, // reciclar Postgres é ação de infra — humano por ora.
    severity: "CRITICAL",
  },
  {
    key: "migration_stuck_p3009",
    subsystem: "deploy_migrations",
    symptom: "A versão nova não sobe / deploy falhando repetidamente.",
    triggers: ["deploy", "não sobe", "versão nova", "atualização não", "p3009", "deploy falhando", "build falhou"],
    likelyCause: "Migração travada (P3009) bloqueando o preDeploy.",
    confirmingSignals: ["deploy FAILED com P3009", "migrate-deploy.sh em retry"],
    runbook: [
      "Conferir o log do deploy: é P3009?",
      "O migrate-deploy.sh já tenta auto-recuperar (rollback + reaplicar).",
      "Se persistir após os retries: escalar com o nome da migração travada.",
    ],
    remediationAction: null, // já há auto-heal no preDeploy; resto é humano.
    severity: "HIGH",
  },
  {
    key: "ai_key_invalid",
    subsystem: "ai_brain",
    symptom: "As IAs pararam de responder direito / respostas genéricas.",
    triggers: ["ia parou", "respostas genéricas", "não responde direito", "fallback", "agente bobo", "atendente burro", "ia sem sentido", "respostas ruins"],
    likelyCause: "OPENAI_API_KEY ausente ou inválida — Brain em fallback.",
    confirmingSignals: ["/api/health openaiKey = false", "401 Incorrect API key nos logs"],
    runbook: [
      "Conferir /api/health (openaiKey presente?).",
      "Se inválida/ausente: escalar para rotacionar a chave (segredo — nunca expor).",
      "Após corrigir: confirmar que reasoningMode voltou a LLM via probe.",
    ],
    remediationAction: null, // troca de segredo é sempre humano.
    severity: "HIGH",
  },
  {
    key: "campaign_queue_stuck",
    subsystem: "campaign_queue",
    symptom: "As campanhas não estão saindo / travadas.",
    triggers: ["campanha não sai", "campanha travada", "não está enviando", "envio parado", "campanha presa", "não disparou a campanha"],
    likelyCause: "Job de campanha zumbi ou execuções presas em SENDING.",
    confirmingSignals: ["execuções antigas ainda em PENDING/SENDING"],
    runbook: [
      "Conferir se há execuções presas há muito tempo.",
      "Reenfileirar/limpar o job zumbi (ação segura e reversível).",
      "Confirmar que a próxima janela de envio processa normalmente.",
    ],
    remediationAction: "requeue_stuck_campaign",
    severity: "MEDIUM",
  },
];

/** Bloco de texto compacto do mapa, para injetar no prompt do reasoner. */
export function buildKnowledgeMapContext(): string {
  const subs = SUBSYSTEMS.map((s) => `• ${s.name} — ${s.impact} (sinais: ${s.signals.join("; ")})`).join("\n");
  const modes = FAILURE_MODES.map((m) =>
    [
      `— [${m.subsystem}] ${m.symptom}`,
      `  causa provável: ${m.likelyCause}`,
      `  confirma com: ${m.confirmingSignals.join("; ")}`,
      `  ação candidata: ${m.remediationAction ?? "NENHUMA (escalar para humano)"} · severidade ${m.severity}`,
    ].join("\n"),
  ).join("\n");

  return [
    "━━━ MAPA DO SISTEMA FOOCCI (o que você conhece) ━━━",
    "SUBSISTEMAS:",
    subs,
    "",
    "MODOS DE FALHA CONHECIDOS (sintoma → causa → sinal → ação):",
    modes,
    "━━━",
  ].join("\n");
}

/** Pontuação mínima para considerar um modo de falha. Um gatilho curado vale 2
 *  (basta um pra casar); a sobreposição de palavras do sintoma é secundária. */
const MIN_MATCH_SCORE = 2;
const TRIGGER_WEIGHT = 2;

/** Acha o(s) modo(s) de falha que casam com o relato.
 *
 *  Sinal PRIMÁRIO: palavras-gatilho curadas (específicas por falha) — uma já casa.
 *  Sinal secundário: sobreposição de palavras do próprio sintoma (desempate).
 *  Conservador de propósito: sem gatilho e sem sobreposição suficiente, NÃO casa —
 *  o agente prefere pedir detalhe a inventar causa (e nunca troca a pergunta do
 *  usuário por um sinal de sistema sem relação). */
export function matchFailureModes(report: string): FailureMode[] {
  const t = report.toLowerCase();
  const hits: Array<{ m: FailureMode; score: number }> = [];
  for (const m of FAILURE_MODES) {
    const triggerHits = m.triggers.filter((g) => t.includes(g.toLowerCase())).length;
    const words = m.symptom.toLowerCase().match(/[a-zà-ú]{4,}/g) ?? [];
    const wordScore = [...new Set(words)].filter((w) => t.includes(w)).length;
    const score = triggerHits * TRIGGER_WEIGHT + wordScore;
    if (score >= MIN_MATCH_SCORE) hits.push({ m, score });
  }
  return hits.sort((a, b) => b.score - a.score).map((h) => h.m);
}
