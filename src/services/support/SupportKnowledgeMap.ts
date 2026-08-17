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
  /**
   * Gatilhos curados — o ÚNICO caminho para este modo casar.
   *
   * REGRA (04/08/2026, P0 de confiança): gatilho é EXPRESSÃO DE FALHA, não
   * palavra de assunto. "papel", "comanda", "deploy" e "desconectou" sozinhos
   * são assunto — e foi por isso que "como mudo o papel de parede do cardápio?"
   * virou incidente de impressora e "o google desconectou" virou WhatsApp caído.
   * Escreva o que o lojista diz quando a coisa QUEBRA: "não imprime",
   * "impressora não", "pararam de chegar", "não sobe o deploy".
   */
  triggers: string[];
  /**
   * Termos que SITUAM o relato neste subsistema. Se preenchido, pelo menos um
   * precisa aparecer além do gatilho — é o que impede um gatilho genérico
   * ("pararam de chegar") de pescar o canal errado. Vazio/ausente = o gatilho
   * já é específico o bastante sozinho ("too many clients", "carteiro").
   *
   * Escreva SEM ACENTO: o casamento normaliza os dois lados (ver `fold`), então
   * "impressao" cobre "impressão" e listar as duas formas é só ruído.
   */
  scope?: string[];
  /**
   * Termos que EXCLUEM este modo mesmo com gatilho e escopo. Existe para as
   * fronteiras que se confundem em produção — Instagram × WhatsApp é a nossa.
   */
  excludes?: string[];
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
  // O subsistema `whatsapp_evolution` foi REMOVIDO em 15/08/2026. A Evolution
  // saiu do Foocci em 04/08 e o que restava aqui era um verbete fantasma — com o
  // nome já estragado por uma troca mecânica ("WhatsApp não-oficial (WhatsApp
  // (Meta))") e apontando para a rota da Meta. Nenhum modo de falha o citava, e
  // este mapa é injetado no prompt COMO VERDADE: descrever um provedor que não
  // existe mais é ensinar o lojista a procurar uma tela que não há.
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
      "não imprime", "nao imprime", "não imprimiu", "não está imprimindo",
      "nao esta imprimindo", "parou de imprimir", "impressora não", "impressora nao",
      "impressora offline", "impressora desligada", "não sai comanda",
      "não sai a comanda", "não saem as comandas", "comanda não sai",
      "comandas não saem", "não sai o pedido na cozinha", "sem papel",
      "acabou o papel", "carteiro desconectado", "carteiro não conecta",
      "não imprime nada", "não imprime mais",
    ],
    // "carteiro" é nome de produto nosso — sozinho já é do assunto impressão.
    scope: ["impressora", "impressao", "imprim", "comanda", "carteiro", "cozinha"],
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
      "não chega", "nao chega", "pararam de chegar", "parou de chegar",
      "não recebo", "nao recebo", "não estou recebendo", "nao estou recebendo",
      "mensagens não chegam", "pedidos não chegam", "não caem os pedidos",
      "sumiram as mensagens", "não chegam mais",
    ],
    // Os gatilhos acima são genéricos de propósito (é assim que o lojista fala),
    // então o ESCOPO é obrigatório: sem WhatsApp no relato, não é este modo.
    // Sem isso, "as DMs do Instagram pararam de chegar" caía aqui — subsistema
    // errado, diagnóstico errado, lojista mandado para a tela errada.
    scope: ["whatsapp", "zap", "wpp", "meta", "numero", "inbound"],
    excludes: ["instagram", "insta", "direct", " dm", "dms"],
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
    key: "whatsapp_disconnected",
    subsystem: "whatsapp_meta",
    symptom: "O WhatsApp caiu / apareceu como desconectado.",
    // Resolução de conflito 04/08: a padrão melhorou a pescaria (triggers ricos +
    // scope + excludes, porque "desconectou" sozinho pescava "o google
    // desconectou"); esta branch tinha trocado a Evolution pela Meta. Fica o
    // melhor dos dois — o matcher preciso, apontando para o canal que existe.
    triggers: [
      "desconectou", "desconectado", "desconectada", "caiu o whatsapp",
      "whatsapp caiu", "zap caiu", "pedindo qr", "pedindo o qr", "pedindo qrcode",
      "ler o qr de novo", "reconectar", "aparelho desconectou", "sessão caiu",
      "perdeu a conexão",
    ],
    scope: ["whatsapp", "zap", "wpp", "qr", "aparelho", "celular", "numero", "meta"],
    excludes: ["google", "instagram", "insta", "mercado pago", "impressora"],
    likelyCause: "Conexão do número na Meta fora do ar (connectionStatus != CONNECTED).",
    confirmingSignals: ["/api/integracoes/whatsapp/meta/status != CONNECTED"],
    runbook: [
      "Conferir /api/integracoes/whatsapp/meta/status.",
      "Se != CONNECTED: conferir se o token do aplicativo expirou (o erro aparece em lastError).",
      "Reconectar exige login do DONO pela Meta — não há ação automática. Escalar.",
    ],
    // Sem ação automática de propósito: a ação "reconectar instância" saiu com a
    // Evolution e não foi substituída, porque reconectar a Meta depende de OAuth
    // do dono. Ação que finge é pior que ação ausente.
    remediationAction: null,
    severity: "HIGH",
  },
  {
    key: "db_connection_exhaustion",
    subsystem: "database",
    symptom: "O sistema todo ficou fora do ar / erro ao abrir qualquer tela.",
    triggers: [
      "fora do ar", "não abre nada", "nao abre nada", "não abre nenhuma",
      "tudo travado", "travou tudo", "sistema caiu", "sistema todo",
      "nenhuma tela", "erro em tudo", "too many clients", "site caiu",
      "não carrega nada", "nada funciona", "não consigo abrir nada",
    ],
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
    triggers: [
      "p3009", "deploy falhou", "deploy falhando", "deploy travado", "build falhou",
      "não sobe a versão", "versão nova não", "versao nova nao", "atualização não subiu",
      "migração travada", "migracao travada", "não subiu o deploy",
    ],
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
    triggers: [
      "ia parou", "ia não responde", "ia nao responde", "respostas genéricas",
      "respostas genericas", "não responde direito", "nao responde direito",
      "agente bobo", "atendente burro", "ia sem sentido", "respostas ruins",
      "ia burra", "robô bobo", "robo bobo", "caiu em fallback",
    ],
    scope: [" ia ", "agente", "atendente", "robo", "fallback", "assistente", "intelig"],
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
    symptom: "As campanhas não estão saindo / travadas, sem erro nenhum aparecendo.",
    triggers: [
      "campanha não sai", "campanha nao sai", "campanha não saiu", "campanha travada",
      "campanha não está enviando", "envio parado", "campanha presa",
      "não disparou a campanha", "nao disparou a campanha", "campanha não disparou",
      "campanha não enviou", "público 0", "publico zero", "audiência 0", "audiencia zero",
      "não foi para ninguém", "campanha não chegou em ninguém",
    ],
    scope: ["campanha", "crm", "promocao", "disparo", "envio"],
    // CAUSA CORRIGIDA EM 04/08/2026. O runbook antigo mandava "reenfileirar o job
    // zumbi" — e o job zumbi quase nunca é o problema. A causa real e recorrente,
    // documentada em docs/pendencias.md (seção "CRM — a campanha 'Almoço' não
    // dispara, e falta um clique"), é CONTACTABILIDADE: a base importada entra
    // com crmContactable=false (fila de enriquecimento), a audiência fica 0 e
    // nada sai, sem erro nenhum. Os clientes TÊM telefone. Resolve-se com um
    // clique do dono em "Ativar base". Mandar o lojista mexer em fila é mandá-lo
    // para o lugar errado — e ele não tem como consertar fila nenhuma.
    likelyCause:
      "Audiência 0 por contactabilidade: a base entrou com crmContactable=false (fila de enriquecimento) e a campanha não tem para quem enviar. Muito mais raro, e só depois de descartada a audiência: job de campanha zumbi / execuções presas em SENDING.",
    confirmingSignals: [
      "Clientes → 'Saúde da base de contatos' mostra base não ativada",
      "GET /api/admin/diagnostics/audience-breakdown?restaurantId=<id> → notContactable alto e eligible = 0",
      "campanha sem destinatários registrados, e nenhum erro no histórico",
      "(hipótese secundária) execuções antigas ainda em PENDING/SENDING",
    ],
    runbook: [
      "Abra Clientes e olhe o cartão 'Saúde da base de contatos'.",
      "Se aparecer o botão 'Ativar base', clique nele — é o passo que resolve na maioria das vezes: enquanto ninguém clica, a audiência fica 0 e a campanha nunca dispara, sem dar erro.",
      "Volte na campanha e confira o público: se saiu de 0, é só esperar a próxima janela de envio.",
      "Se o público continuar 0, confirme que os clientes têm telefone e que o filtro da campanha não está estreito demais.",
      "Só se o público estiver OK e mesmo assim nada sair: aí sim pode ser job travado — abra chamado, porque reenfileirar é com a equipe.",
    ],
    remediationAction: "requeue_stuck_campaign",
    severity: "MEDIUM",
  },
  {
    // MODO DE FALHA QUE FALTAVA (04/08/2026). O subsistema 'payments' estava
    // declarado com impacto ("se cai, o cliente não consegue pagar") e ZERO modos
    // de falha — ou seja, o agente sabia que existia e não sabia reconhecer nada.
    // Subsistema sem modo de falha é uma promessa que o mapa não cumpre.
    key: "payment_not_confirmed",
    subsystem: "payments",
    symptom: "O cliente pagou o Pix mas o pedido continua em 'Aguardando Pix' / 'Aguardando pagamento'.",
    triggers: [
      "pagou e não", "pagou mas não", "pagou mas o pedido", "pix não confirmou",
      "pix nao confirmou", "pagamento não confirmou", "pagamento nao confirmou",
      "não confirma o pagamento", "aguardando pagamento", "aguardando pix",
      "pagamento não entrou", "pagamento não caiu", "não baixou o pagamento",
      "pix não caiu", "pagamento pendente", "preso em aguardando",
    ],
    scope: ["pix", "pagamento", "pagou", "pago", "cartao", "mercado pago", "pedido"],
    likelyCause:
      "O aviso de pagamento (webhook do Mercado Pago) não chegou ou foi rejeitado, então o pedido não avançou sozinho de AWAITING_PAYMENT. Também acontece quando o Pix expirou e o cliente pagou depois, ou pagou em outra chave.",
    confirmingSignals: [
      "pedido em 'Aguardando Pix' com comprovante do cliente na mão",
      "MP_WEBHOOK_SECRET presente e ambiente do Mercado Pago em Produção?",
      "vários pedidos parados no mesmo horário = webhook; um só = caso isolado",
    ],
    runbook: [
      "Em Vendas → Pedidos, abra o pedido: ele está com o selo 'Aguardando Pix'?",
      "Peça o comprovante ao cliente e confira no seu app do Mercado Pago (ou banco) se o valor caiu MESMO. Nunca confirme só pela palavra do cliente.",
      "Se caiu: use 'Confirmar pagamento' no próprio cartão do pedido (pede um motivo, e fica registrado quem confirmou). O mesmo botão existe na Central de Conversas, como 'Confirmar pagamento manualmente'.",
      "Se não caiu: o Pix provavelmente expirou — peça para o cliente refazer o pagamento pelo link do pedido ou escolher outra forma.",
      "Se estiver acontecendo com VÁRIOS pedidos ao mesmo tempo, não é o cliente: é o aviso do Mercado Pago que não está chegando. Abra chamado — reprocessar é com a equipe.",
    ],
    remediationAction: null, // confirmar pagamento é decisão do lojista com dinheiro real na mesa — nunca da IA.
    severity: "HIGH",
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

const TRIGGER_WEIGHT = 2;

/** Minúsculas + sem acento, dos dois lados, para o casamento não depender de
 *  como o lojista digitou ("instância" × "instancia"). */
function fold(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * Acha o(s) modo(s) de falha que casam com o relato.
 *
 * ─── COMO ERA, E POR QUE MUDOU (04/08/2026, P0 de confiança) ───────────────
 * A regra antiga era `triggerHits*2 + palavrasDoSintoma >= 2`. Ou seja: DUAS
 * palavras quaisquer do texto do sintoma, sem nenhum gatilho curado, já
 * classificavam um incidente. Medido no código de produção:
 *   • "como mudo o PAPEL de parede do cardápio?"   → impressora quebrada (HIGH)
 *   • "ERRO ao ABRIR a TELA de cardápio"           → banco fora do ar (CRITICAL)
 *   • "o google DESCONECTOU de novo"               → WhatsApp Evolution caiu
 *   • "as DMs do instagram PARARAM DE CHEGAR"      → WhatsApp Meta (canal errado)
 *   • "posso mandar COMANDA por whatsapp?"         → impressora quebrada
 * Cada um desses vira runbook injetado como VERDADE, sonda do sistema disparada
 * e lojista mandado para a tela errada — a partir de uma pergunta inocente.
 *
 * ─── COMO É AGORA ──────────────────────────────────────────────────────────
 * Casar exige, nesta ordem:
 *   1. GATILHO CURADO presente (expressão de falha). Sem gatilho, não casa —
 *      sobreposição de palavras NUNCA classifica sozinha;
 *   2. ESCOPO satisfeito, quando o modo declara escopo (gatilho genérico como
 *      "pararam de chegar" precisa do canal no relato);
 *   3. Nenhum termo de EXCLUSÃO presente (fronteira Instagram × WhatsApp).
 * Só então a sobreposição de palavras do sintoma entra — e apenas para ORDENAR
 * entre modos que já casaram. Ela desempata; ela não decide.
 *
 * Conservador de propósito: na dúvida devolve vazio e o agente pede detalhe. Um
 * "me conta o que aparece na tela?" a mais é barato; um diagnóstico errado
 * apresentado com confiança, não.
 */
export function matchFailureModes(report: string): FailureMode[] {
  const t = fold(report);
  const hits: Array<{ m: FailureMode; score: number }> = [];

  for (const m of FAILURE_MODES) {
    // 1. Gatilho curado é obrigatório.
    const triggerHits = m.triggers.filter((g) => t.includes(fold(g))).length;
    if (triggerHits === 0) continue;

    // 2. Escopo, quando declarado.
    const scope = m.scope ?? [];
    if (scope.length > 0 && !scope.some((s) => t.includes(fold(s)))) continue;

    // 3. Exclusões.
    if ((m.excludes ?? []).some((x) => t.includes(fold(x)))) continue;

    // Só agora a sobreposição de palavras — para ordenar, não para classificar.
    const words = fold(m.symptom).match(/[a-z]{4,}/g) ?? [];
    const wordScore = [...new Set(words)].filter((w) => t.includes(w)).length;
    hits.push({ m, score: triggerHits * TRIGGER_WEIGHT + wordScore });
  }

  return hits.sort((a, b) => b.score - a.score).map((h) => h.m);
}
