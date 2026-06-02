/**
 * StrategyRoomService — Rule-based AI specialist perspective generator.
 *
 * No external LLM calls. Pure deterministic generation based on keyword
 * matching from the project brief + brand persona. Safe to call in any context.
 */

// ─── Public types ─────────────────────────────────────────────────────────────

export interface BriefInput {
  restaurantName: string;
  objective:   string;
  audience:    string | null;
  timeline:    string | null;
  budget:      string | null;
  services:    string[];
  /** Parsed from RestaurantBrandConfig.brandPersona JSON */
  brandArchetype?: string | null;
  personalityPreset?: string | null;
  tone?: string | null;
  mainDishes?: string | null;
  uniqueValueProposition?: string | null;
}

export interface SpecialistOutput {
  specialist:           string;
  role:                 string;
  mainInsight:          string;
  recommendedDirection: string;
  risks:                string[];
  suggestedDeliverables: string[];
  priority:             "high" | "medium" | "low";
}

export interface StrategySynthesis {
  bestStrategicDirection: string;
  recommendedServices:    string[];
  proposalImplications:   string[];
  risksToMention:         string[];
  nextActionForPM:        string;
}

export interface StrategyRoomOutput {
  strategist:     SpecialistOutput;
  socialMedia:    SpecialistOutput;
  creative:       SpecialistOutput;
  paidTraffic:    SpecialistOutput;
  businessScope:  SpecialistOutput;
  criticalReview: SpecialistOutput;
  synthesis:      StrategySynthesis;
}

// ─── Available agency services catalog ────────────────────────────────────────

export const AGENCY_SERVICES = [
  { id: "gestao-social",      name: "Gestão de Redes Sociais" },
  { id: "identidade-visual",  name: "Identidade Visual" },
  { id: "trafego-pago",       name: "Tráfego Pago" },
  { id: "fotografia-video",   name: "Fotografia e Vídeo" },
  { id: "consultoria",        name: "Consultoria Estratégica" },
  { id: "crm-fidelizacao",    name: "Gestão de CRM e Fidelização" },
  { id: "cardapio-digital",   name: "Cardápio Digital e UX" },
  { id: "lancamento",         name: "Campanha de Lançamento" },
  { id: "branding",           name: "Branding e Posicionamento" },
  { id: "seo-local",          name: "SEO Local e Google Meu Negócio" },
  { id: "email-sms",          name: "E-mail e SMS Marketing" },
  { id: "influencers",        name: "Marketing de Influência" },
] as const;

// ─── Internal signal parsing ──────────────────────────────────────────────────

const OBJ = {
  launch:      /lançament|launch|estreia|abertura|novo restaur|nova unidade|inaugurac/i,
  growth:      /crescimento|growth|escalar|escala|expansão|expand|mais pedidos|aumentar faturamento/i,
  conversion:  /convers|venda|revenue|faturamento|ticket médio|mais vendas/i,
  awareness:   /awareness|reconhecimento|visibilidade|ser conhecido|marca forte|nome no mercado/i,
  retention:   /retenção|fideliz|fidelidade|loyalty|manter clientes|clientes voltando/i,
  engagement:  /engajamento|engaj|comunidade|relacionamento|interação|seguidores/i,
  rebranding:  /rebranding|rebrand|renovação|reposicionamento|nova identidade|novo visual/i,
};

const AUD = {
  young:    /jovem|jovens|teen|geração z|millenni|18.{0,4}2[0-9]|18.{0,4}30|universitário/i,
  family:   /família|famílias|family|criança|crianças|kids|pais\s+e\s+filhos|casal/i,
  premium:  /premium|executivo|executiva|alta renda|alto padrão|luxo|luxury|classe a/i,
  local:    /local|bairro|vizinhança|comunidade|região|próximo|perto/i,
  delivery: /delivery|entrega|aplicativo|ifood|rappi|app|online/i,
};

const BUD = {
  micro:  /menos de 5|até r\$\s*[1-4]|r\$\s*[1-4][.,]\d{3}|\bmicro\b|orçamento baixo/i,
  small:  /r\$\s*[5-9][.,]?\d{0,3}|r\$\s*1[0-9][.,]\d{3}|5\s*(mil|k)|1[0-9]\s*(mil|k)/i,
  medium: /r\$\s*[2-4][0-9][.,]\d{3}|2[0-9]\s*(mil|k)|3[0-9]\s*(mil|k)|4[0-9]\s*(mil|k)/i,
  large:  /r\$\s*[5-9][0-9][.,]\d{3}|50\s*(mil|k)|1\d{2}\s*(mil|k)|alto orçamento/i,
};

const TIME = {
  urgent: /urgente|asap|imediato|1\s*mês|um\s*mês|rapidamente|rápido/i,
  short:  /2\s*meses|3\s*meses|trimestre|curto prazo/i,
  medium: /[4-6]\s*meses|semestre|médio prazo/i,
  long:   /[7-9]\s*meses|\d+\s*anos?|1\s*ano|longo prazo/i,
};

function detect<K extends string>(map: Record<K, RegExp>, text: string): K[] {
  return (Object.keys(map) as K[]).filter((k) => map[k].test(text));
}

function first<K extends string>(map: Record<K, RegExp>, text: string): K | null {
  return detect(map, text)[0] ?? null;
}

type ObjKey  = keyof typeof OBJ;
type AudKey  = keyof typeof AUD;
type BudKey  = keyof typeof BUD;
type TimeKey = keyof typeof TIME;

// ─── Specialist generators ────────────────────────────────────────────────────

function buildStrategist(b: BriefInput, obj: ObjKey | null, aud: AudKey | null): SpecialistOutput {
  const name = b.restaurantName;
  const archetype = b.brandArchetype ?? "creator";

  const insights: Record<string, string> = {
    launch:      `O lançamento de ${name} é uma janela única de atenção. A estratégia deve maximizar curiosidade antes da abertura e converter interesse em primeiras visitas.`,
    growth:      `${name} tem base instalada para escalar. O foco deve ser aumentar frequência dos clientes ativos antes de buscar novos — CAC menor, ROI maior.`,
    conversion:  `A prioridade de ${name} é converter visitantes em compradores e aumentar o ticket médio. A estratégia de produto e apresentação é chave.`,
    awareness:   `${name} precisa de presença de marca consistente. O objetivo é fazer o restaurante ser a primeira lembrança quando a categoria for considerada.`,
    retention:   `Reter clientes existentes custa 5× menos que adquirir novos. ${name} deve ativar programas de fidelização e comunicação personalizada.`,
    engagement:  `A comunidade digital de ${name} é um ativo de longo prazo. Engajamento orgânico gera confiança e reduz custo de mídia paga.`,
    rebranding:  `O reposicionamento de ${name} exige clareza de identidade antes da execução. Sem estratégia de marca definida, a comunicação nova vai parecer vazia.`,
    default:     `${name} deve partir de um diagnóstico de posicionamento atual antes de definir direção. Os objetivos precisam ser traduzidos em metas mensuráveis.`,
  };

  const directions: Record<string, string> = {
    launch:      "Criar uma campanha de pré-lançamento com contagem regressiva, degustação exclusiva para early adopters e PR digital para gerar buzz antes da abertura.",
    growth:      "Ativar programa de indicação + automação de CRM para reengajar clientes inativos (30–90 dias). Paralelamente, escalar canais de aquisição com dados dos clientes atuais.",
    conversion:  "Otimizar cardápio digital para destaque de produtos premium e combos. Testar sequências de upsell no checkout. Medir e reduzir abandono de carrinho.",
    awareness:   "Estratégia de conteúdo editorial 90 dias + SEO local + presença em reviews (Google, iFood). Posicionamento de especialista na categoria.",
    retention:   "Lançar programa de pontos ou cashback. Segmentar base por recência e enviar campanhas personalizadas por WhatsApp. Meta: aumentar frequência mensal 20%.",
    engagement:  "Série de conteúdos 'bastidores' + colaborações com criadores locais. Lives e challenges sazonais para ampliar alcance orgânico.",
    rebranding:  "Antes de qualquer execução: workshop de posicionamento de marca, definição de arquétipo e validação com clientes atuais. Só então lançar nova identidade.",
    default:     "Iniciar com auditoria de presença digital (redes, reviews, SEO). Definir 3 KPIs prioritários e construir roadmap de 90 dias baseado em dados.",
  };

  const key = obj ?? "default";

  const archetypeRisks: Record<string, string> = {
    hero:       "Comunicação muito 'épica' pode parecer distante para clientes locais que buscam praticidade",
    sage:       "Tom educativo sem entretenimento pode perder engajamento nas redes sociais",
    creator:    "Foco excessivo em estética pode comprometer clareza das ofertas",
    innocent:   "Posicionamento muito suave pode não converter em momentos de decisão de compra",
    explorer:   "Comunicação aventureira precisa de âncora de relevância local",
    outlaw:     "Tom rebelde exige execução muito precisa para não afastar público tradicional",
    magician:   "Proposta transformadora precisa de provas concretas (fotos, reviews, resultados)",
    caregiver:  "Pode parecer genérico sem elementos de diferenciação claros",
    ruler:      "Tom premium pode alienar clientes de ticket médio se não bem calibrado",
    jester:     "Humor precisa ser consistente; uma piada mal colocada arranha a marca",
    everyman:   "Posicionamento 'para todos' pode resultar em mensagem sem foco",
    lover:      "Apelo emocional forte precisa de conteúdo visual de alta qualidade para funcionar",
  };

  return {
    specialist:           "Especialista em Estratégia",
    role:                 "Strategy",
    mainInsight:          insights[key] ?? insights["default"]!,
    recommendedDirection: directions[key] ?? directions["default"]!,
    risks: [
      archetypeRisks[archetype] ?? "Falta de diferenciação clara em relação à concorrência",
      "Execução sem metas mensuráveis pode dificultar ajustes ao longo do projeto",
      obj === "launch" ? "Prazo apertado pode comprometer qualidade da percepção inicial" : "Foco em múltiplos objetivos simultaneamente reduz impacto de cada ação",
    ],
    suggestedDeliverables: [
      "Diagnóstico de posicionamento competitivo (1 semana)",
      "Definição de OKRs do projeto com metas de 30/60/90 dias",
      "Mapa de jornada do cliente (discovery → primeira compra → retenção)",
      "Calendário estratégico com marcos e responsáveis",
    ],
    priority: obj === "launch" || obj === "rebranding" ? "high" : "medium",
  };
}

function buildSocialMedia(b: BriefInput, obj: ObjKey | null, aud: AudKey | null): SpecialistOutput {
  const name = b.restaurantName;

  const platformMap: Record<string, string> = {
    young:    "TikTok (formato curto e tendências) + Instagram Reels. O conteúdo precisa ser nativo da plataforma, não apenas vídeos adaptados.",
    family:   "Instagram Stories + Facebook (grupos de bairro). Conteúdo voltado para conveniência, promoções familiares e pratos compartilháveis.",
    premium:  "Instagram Feed curado + LinkedIn (storytelling de bastidores). Qualidade visual acima da frequência.",
    local:    "Instagram + WhatsApp Business (listas de transmissão). Proximidade é o diferencial — conteúdo de bairro e eventos locais.",
    delivery: "Instagram + iFood Stories + WhatsApp. Foco em fotos de produto irresistíveis e gatilhos de urgência.",
    default:  "Instagram como canal principal (conteúdo + Stories) + WhatsApp para relacionamento direto. TikTok como canal de expansão se houver produção de vídeo.",
  };

  const freqMap: Record<string, string> = {
    young:   "5–7 posts/semana no TikTok; 3–4 no Instagram",
    family:  "3–4 posts/semana + 5 Stories diários",
    premium: "2–3 posts/semana com produção editorial; qualidade > quantidade",
    local:   "4–5 posts/semana + Stories diários de bastidores",
    delivery: "4–5 posts/semana com foco em produtos e promoções",
    default: "3–4 posts/semana + Stories diários",
  };

  const platform = platformMap[aud ?? "default"] ?? platformMap["default"]!;
  const freq     = freqMap[aud ?? "default"]     ?? freqMap["default"]!;

  return {
    specialist:           "Especialista em Redes Sociais",
    role:                 "Social Media",
    mainInsight:          `Conteúdo de ${name} precisa de uma linha editorial clara antes de aumentar frequência. Mais posts sem estratégia de conteúdo só aumenta ruído.`,
    recommendedDirection: `${platform} — frequência recomendada: ${freq}. Mix ideal: 40% produto/menu, 30% bastidores/equipe, 20% conteúdo educativo/storytelling, 10% promoções diretas.`,
    risks: [
      "Inconsistência na frequência de posts destrói o algoritmo — é melhor 3x/semana constante do que 10x numa semana e nada na próxima",
      "Falta de identidade visual consistente fragmenta a percepção da marca",
      aud === "young" ? "TikTok exige produção nativa — conteúdo reaproveitado de outras plataformas performa mal" : "Apenas posts de produto sem storytelling geram pouco engajamento orgânico",
    ],
    suggestedDeliverables: [
      "Manual de identidade social (paleta, tipografia, tom de voz, filtros)",
      "Calendário editorial de 30 dias com temas e formatos definidos",
      "Pack de 10 templates de posts e Stories para a equipe do restaurante",
      "Relatório mensal de performance com benchmarks do setor",
    ],
    priority: b.services.some((s) => /social|redes/i.test(s)) ? "high" : "medium",
  };
}

function buildCreative(b: BriefInput, obj: ObjKey | null, aud: AudKey | null): SpecialistOutput {
  const name = b.restaurantName;
  const preset = b.personalityPreset ?? "traditional";

  const creativeMap: Record<string, { visual: string; direction: string }> = {
    traditional: {
      visual:    "Paleta quente (terrosos, amarelos, vermelhos), fotografias com iluminação natural, tipografia clássica com serifa.",
      direction: "Valorizar o artesanal, a tradição e a história do restaurante. Fotos de produto em estilo editorial gastronômico.",
    },
    fast: {
      visual:    "Paleta vibrante e contrastada, layout limpo, ícones flat, tipografia bold sem serifa.",
      direction: "Comunicação direta: produto + preço + chamada. Velocidade visual — o cliente deve entender a oferta em 2 segundos.",
    },
    premium: {
      visual:    "Paleta neutra (preto, branco, dourado/cobre), fotografia de alta produção, muito espaço negativo.",
      direction: "Menos é mais. Cada elemento comunica exclusividade. Nunca usar fontes gratuitas ou templates genéricos.",
    },
    young: {
      visual:    "Cores saturadas, gradientes, memes adaptados à marca, vídeos curtos com cortes rápidos.",
      direction: "Conteúdo participativo (trends, desafios, duets). A marca precisa ter personalidade e não ter medo de errar.",
    },
    aggressive: {
      visual:    "Alto contraste, texto grande, urgência visual em promoções.",
      direction: "Ofertas em destaque, contagem regressiva, linguagem de urgência. O foco é conversão imediata.",
    },
  };

  const cfg = creativeMap[preset] ?? creativeMap["traditional"]!;

  return {
    specialist:           "Especialista em Criação e Design",
    role:                 "Creative",
    mainInsight:          `A identidade visual atual de ${name} precisa ser auditada antes de qualquer produção. Conteúdo novo com identidade inconsistente vai diluir a marca.`,
    recommendedDirection: `Direção criativa ${preset}: ${cfg.visual} ${cfg.direction}`,
    risks: [
      "Fotografias amadoras de produto perdem conversões — mobile bem iluminado pode ser suficiente com técnica correta",
      "Identidade visual em múltiplas mãos (equipe + agência) cria inconsistência — brandbook é obrigatório",
      obj === "rebranding" ? "Nova identidade lançada sem transição planejada pode confundir clientes atuais" : "Templates genéricos de Canva posicionam a marca como amadora",
    ],
    suggestedDeliverables: [
      "Brandbook digital (logo, cores, tipografia, aplicações)",
      "Sessão fotográfica profissional do cardápio (12–20 pratos-chave)",
      "Kit de templates editáveis para Stories, Feed e WhatsApp",
      obj === "launch" ? "Kit de materiais de lançamento (banner digital, convite, backdrop)" : "Redesign ou auditoria do cardápio digital",
    ],
    priority: b.services.some((s) => /visual|design|criação|brand|foto/i.test(s)) ? "high" : "medium",
  };
}

function buildPaidTraffic(b: BriefInput, obj: ObjKey | null, bud: BudKey | null): SpecialistOutput {
  const name = b.restaurantName;

  const budgetRecs: Record<string, { channels: string; split: string; expectation: string }> = {
    micro:  {
      channels:    "Meta Ads (Instagram/Facebook) como único canal. Google Ads não é viável com orçamento micro.",
      split:       "100% Meta Ads — campanhas de alcance local (raio 3–5km) e conversão no cardápio digital",
      expectation: "Resultado esperado: aumento de 15–30% no alcance orgânico, 50–100 novos seguidores/mês",
    },
    small:  {
      channels:    "Meta Ads (70%) + Google Ads — Search local (30%). Foco em campanhas de conversão.",
      split:       "Meta: anúncios de produto e promoções; Google: termos de busca local ('restaurante + bairro/cidade')",
      expectation: "Resultado esperado: 200–500 cliques/mês no cardápio digital, CPC entre R$ 0,80–R$ 2,00",
    },
    medium: {
      channels:    "Meta Ads (50%) + Google Ads (30%) + TikTok Ads (20%) se público jovem.",
      split:       "Meta: awareness + remarketing; Google: captura de intenção; TikTok: descoberta de marca",
      expectation: "Resultado esperado: 1.000–3.000 cliques/mês, ROAS de 3–5x em campanhas de delivery",
    },
    large:  {
      channels:    "Meta Ads + Google Ads + TikTok + influenciadores pagos + iFood Ads.",
      split:       "Estratégia full-funnel: awareness → consideração → conversão → retenção",
      expectation: "Resultado esperado: escala de audiência qualificada, ROAS mínimo 4x, share of voice crescente",
    },
  };

  const rec = budgetRecs[bud ?? "small"] ?? budgetRecs["small"]!;

  return {
    specialist:           "Especialista em Tráfego Pago",
    role:                 "Paid Traffic",
    mainInsight:          `Tráfego pago sem criativo forte e página de destino otimizada queima orçamento. ${name} precisa ter o cardápio digital funcionando antes de investir em anúncios.`,
    recommendedDirection: `${rec.channels} Distribuição: ${rec.split}. ${rec.expectation}.`,
    risks: [
      "Anunciar sem pixel de conversão instalado impede otimização e aprendizado da campanha",
      "Criativo estático performa muito abaixo de vídeo — sem produção visual, o budget rende menos",
      bud === "micro" ? "Orçamento micro exige paciência — resultados expressivos aparecem após 30–45 dias de otimização" : "Escalar budget sem criativos novos 'queima' o público e aumenta custo por clique",
    ],
    suggestedDeliverables: [
      "Instalação e configuração do Meta Pixel + Conversions API",
      "Estrutura de campanhas: awareness (TOFU) → engajamento (MOFU) → conversão (BOFU)",
      "Pack de 5–8 criativos testáveis (variações de copy + visual)",
      "Relatório quinzenal com CPL, ROAS, CTR e recomendações de otimização",
    ],
    priority: b.services.some((s) => /tráfego|paid|anúncio|ads/i.test(s)) ? "high" : obj === "launch" ? "high" : "medium",
  };
}

function buildBusinessScope(b: BriefInput, obj: ObjKey | null, bud: BudKey | null, time: TimeKey | null): SpecialistOutput {
  const name = b.restaurantName;
  const hasMany = b.services.length > 4;

  const timeEstimates: Record<string, string> = {
    urgent: "Com prazo de 1 mês, apenas 1–2 serviços são executáveis com qualidade. Priorização cirúrgica é obrigatória.",
    short:  "Em 2–3 meses é possível entregar um pacote médio (3–4 serviços) se onboarding for imediato.",
    medium: "6 meses permitem entrega completa de 5–7 serviços com iterações e ajustes.",
    long:   "Com 7+ meses, é possível construir e testar um ciclo completo: marca → aquisição → retenção.",
    default: "Prazo não definido — recomendado formalizar datas de entrega antes de assinar contrato.",
  };

  const budgetFit: Record<string, string> = {
    micro:  "Orçamento micro: foco em 1–2 entregáveis de alto impacto. Evitar pacotes amplos que diluem qualidade.",
    small:  "Orçamento pequeno/médio: pacote essencial (social + foto + estratégia) é viável sem comprometer qualidade.",
    medium: "Orçamento médio: escopo completo de 4–6 serviços é sustentável.",
    large:  "Orçamento alto: retainer mensal com squad dedicado é o modelo ideal.",
    default: "Orçamento a definir — crucial para dimensionar equipe e cronograma.",
  };

  return {
    specialist:           "Especialista em Negócios e Escopo",
    role:                 "Business/Scope",
    mainInsight:          hasMany
      ? `${b.services.length} serviços solicitados para ${name} — o escopo está amplo. Sem priorização, o projeto corre risco de entrega fragmentada e baixa qualidade.`
      : `O escopo de ${name} está bem dimensionado. O foco deve ser na qualidade de execução dos ${b.services.length || 2} serviços prioritários.`,
    recommendedDirection: `${timeEstimates[time ?? "default"]} ${budgetFit[bud ?? "default"]}`,
    risks: [
      hasMany ? "Escopo amplo sem fases definidas gera retrabalho e atrasos — definir Fase 1 e Fase 2 no contrato" : "Escopo enxuto pode criar expectativas de resultados antes do prazo realista",
      "Ausência de SLA claro (tempo de resposta, rodadas de revisão) gera conflito na entrega",
      time === "urgent" ? "Prazo urgente compromete qualidade — alinhar expectativas realistas antes de assinar" : "Sem gate de aprovação por fase, o cliente pode mudar de direção no meio do projeto",
    ],
    suggestedDeliverables: [
      "Proposta comercial faseada (Fase 1: fundação; Fase 2: crescimento; Fase 3: escala)",
      "Contrato com SLA, rodadas de revisão, critérios de aceite e cláusula de alteração de escopo",
      "Dashboard de acompanhamento compartilhado (Notion ou similar)",
      "Reunião quinzenal de alinhamento e relatório mensal de resultados",
    ],
    priority: "high",
  };
}

function buildCriticalReview(
  b: BriefInput,
  obj: ObjKey | null,
  aud: AudKey | null,
  bud: BudKey | null,
  time: TimeKey | null,
  specialists: Omit<StrategyRoomOutput, "criticalReview" | "synthesis">,
): SpecialistOutput {
  const name = b.restaurantName;
  const tensions: string[] = [];

  if (obj === "launch" && time === "urgent") tensions.push("Lançamento + prazo urgente = alto risco de execução apressada que prejudica a primeira impressão da marca");
  if (bud === "micro" && b.services.length > 3) tensions.push("Orçamento micro com muitos serviços: inevitavelmente algum entregável será superficial. Reduzir escopo ou aumentar budget.");
  if (obj === "awareness" && !b.services.some((s) => /social|tráfego|conteúdo/i.test(s))) tensions.push("Objetivo de awareness sem redes sociais ou tráfego pago nos serviços: como o objetivo será atingido?");
  if (obj === "conversion" && !b.services.some((s) => /cardápio|tráfego|crm|digital/i.test(s))) tensions.push("Objetivo de conversão sem cardápio digital otimizado ou tráfego pago: revisitar serviços selecionados.");
  if (tensions.length === 0) tensions.push("Não há tensões críticas aparentes entre objetivo, orçamento e prazo. Projeto bem dimensionado.");

  return {
    specialist:           "Revisora Crítica",
    role:                 "Critical Reviewer",
    mainInsight:          tensions[0] ?? "O projeto está bem estruturado, mas requer validação dos KPIs antes da assinatura.",
    recommendedDirection: `Antes de avançar para proposta: (1) confirmar os 2–3 entregáveis de maior impacto para ${name}; (2) validar que o orçamento disponível é compatível com o escopo; (3) garantir que as metas são mensuráveis e acordadas com o cliente.`,
    risks: [
      ...tensions.slice(1),
      "Falta de baseline (dados históricos) impede medir o sucesso do projeto — coletar dados pré-projeto",
      "Dependência de aprovação do cliente pode atrasar entregas — definir SLA de feedback no contrato",
    ].slice(0, 4),
    suggestedDeliverables: [
      "Checklist de validação pré-proposta (objetivo, KPIs, budget, prazo, equipe cliente)",
      "Sessão de kick-off com o cliente para alinhar expectativas antes de iniciar",
      `Documento de 'definição de sucesso' para ${name} com metas numéricas acordadas`,
    ],
    priority: tensions.length > 1 ? "high" : "medium",
  };
}

function buildSynthesis(
  b: BriefInput,
  obj: ObjKey | null,
  specialists: Omit<StrategyRoomOutput, "synthesis">,
): StrategySynthesis {
  const name = b.restaurantName;

  const highPriority = Object.values(specialists)
    .filter((s: SpecialistOutput) => s.priority === "high")
    .map((s: SpecialistOutput) => s.role);

  const directionByObj: Record<string, string> = {
    launch:     `Campanha de lançamento com forte componente visual e social. Identidade visual consistente desde o dia 1 é inegociável. Pré-lançamento de 2–3 semanas antes da abertura.`,
    growth:     `Estratégia de retenção + aquisição em paralelo. CRM e automação para reengajar base existente enquanto tráfego pago atrai novos clientes qualificados.`,
    conversion: `Otimização de cardápio digital + tráfego pago com foco em conversão. Cada R$ investido deve ser rastreável até o pedido.`,
    awareness:  `Presença editorial consistente por 90 dias minimum. SEO local + redes sociais + reviews são a base. Tráfego pago amplifica após orgânico estar funcionando.`,
    retention:  `Programa de fidelização + automação de CRM. O maior retorno está na base de clientes que já compraram e podem comprar de novo.`,
    engagement: `Comunidade antes de conversão. Construir audiência engajada com conteúdo de valor cria demanda orgânica e reduz dependência de mídia paga.`,
    rebranding: `Estratégia antes de execução. Workshop de posicionamento → nova identidade → rollout graduado. Comunicar a mudança aos clientes atuais antes do lançamento público.`,
    default:    `Diagnóstico → estratégia → execução. Sem dados do estado atual, qualquer direção é aposta.`,
  };

  const allRisks = Object.values(specialists)
    .flatMap((s: SpecialistOutput) => s.risks.slice(0, 1));

  const topRisks = [...new Set(allRisks)].slice(0, 3);

  return {
    bestStrategicDirection: directionByObj[obj ?? "default"] ?? directionByObj["default"]!,
    recommendedServices:    b.services.length > 0 ? b.services : ["Consultoria Estratégica", "Gestão de Redes Sociais", "Tráfego Pago"],
    proposalImplications: [
      highPriority.length > 0 ? `Especialistas ${highPriority.join(" e ")} marcaram prioridade ALTA — estes serviços devem estar no Pacote Mínimo Viável da proposta` : "Todos os especialistas concordam que o escopo está equilibrado",
      `Para ${name}: apresentar proposta faseada com Fase 1 (fundação, 30–45 dias) e Fase 2 (escala, 60–90 dias)`,
      "Incluir cláusula de revisão de metas no contrato (30 e 60 dias)",
    ],
    risksToMention: topRisks,
    nextActionForPM: `Agendar sessão de validação de brief com o cliente de ${name} antes de elaborar proposta. Confirmar: (1) budget exato disponível, (2) data desejada de início, (3) quem aprovará as peças no lado do cliente.`,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function generateStrategyRoom(brief: BriefInput): StrategyRoomOutput {
  const text = [brief.objective, brief.audience ?? ""].join(" ");

  const obj  = first(OBJ, text);
  const aud  = first(AUD, brief.audience ?? text);
  const bud  = first(BUD, brief.budget ?? text);
  const time = first(TIME, brief.timeline ?? text);

  const strategist    = buildStrategist(brief, obj, aud);
  const socialMedia   = buildSocialMedia(brief, obj, aud);
  const creative      = buildCreative(brief, obj, aud);
  const paidTraffic   = buildPaidTraffic(brief, obj, bud);
  const businessScope = buildBusinessScope(brief, obj, bud, time);

  const partialOutput = { strategist, socialMedia, creative, paidTraffic, businessScope };
  const criticalReview = buildCriticalReview(brief, obj, aud, bud, time, partialOutput);

  const allSpecialists = { ...partialOutput, criticalReview };
  const synthesis = buildSynthesis(brief, obj, allSpecialists);

  return { strategist, socialMedia, creative, paidTraffic, businessScope, criticalReview, synthesis };
}
