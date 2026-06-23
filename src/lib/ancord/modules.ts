import type { AncordModule } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Os 15 módulos do edital ANCORD (Assessor de Investimentos / ex-AAI).
//
// Aprovação: ≥ 70% no geral (56/80) E ≥ 50% nos capítulos críticos
// I, II, III, VIII e XV.  examQuestions = peso aproximado (soma = 80).
// A distribuição exata varia por edição da prova — usamos uma estimativa
// fiel ao histórico para montar o simulado.
// ─────────────────────────────────────────────────────────────────────────────

export const MODULES: AncordModule[] = [
  {
    id: 1,
    slug: "atividade-ai",
    title: "A Atividade do Assessor de Investimento (Res. CVM 178)",
    short: "Atividade do AI",
    critical: true,
    examQuestions: 5,
    topics: [
      "Quem é o assessor de investimento e o que ele pode fazer",
      "Vínculo com intermediário (corretora/distribuidora/banco)",
      "Vedações: gestão de carteira, custódia, procuração, recomendação",
      "Responsabilidade do intermediário pelos atos do AI",
      "Registro na CVM e certificação ANCORD",
    ],
    summary:
      "O Assessor de Investimento (AI, antigo AAI) DISTRIBUI produtos e PROSPECTA clientes para um intermediário ao qual está vinculado por contrato — nunca por conta própria. É VEDADO ao AI: administrar/gerir carteira de clientes, ter custódia de valores ou dinheiro de clientes, atuar como contraparte, receber procuração para operar, e dar recomendação/consultoria de investimento (isso é papel de consultor/analista). Quem responde perante o cliente e a CVM pelos atos do AI é o intermediário contratante. O AI precisa de registro na CVM e certificação ANCORD. A Resolução CVM 178 substituiu a antiga Instrução CVM 497.",
  },
  {
    id: 2,
    slug: "etica",
    title: "Ética Profissional e Aspectos Comportamentais",
    short: "Ética",
    critical: true,
    examQuestions: 4,
    topics: [
      "Código de conduta ANCORD",
      "Conflito de interesses",
      "Sigilo profissional",
      "Suitability (adequação) e 'Conheça seu Cliente'",
      "Dever de informação e boa-fé",
    ],
    summary:
      "O AI deve agir com boa-fé, diligência, lealdade e transparência. Pilares: evitar e revelar conflitos de interesse (o interesse do cliente vem antes do seu), manter sigilo das informações do cliente, e respeitar o 'Conheça seu Cliente' (KYC) + suitability (recomendar/distribuir apenas o que é ADEQUADO ao perfil, objetivos e situação financeira do cliente). Nunca prometer rentabilidade, nem induzir o cliente a erro. Violações éticas podem gerar punição pela ANCORD/CVM.",
  },
  {
    id: 3,
    slug: "lavagem-dinheiro",
    title: "Prevenção à Lavagem de Dinheiro (Lei 9.613/98)",
    short: "Lavagem de Dinheiro",
    critical: true,
    examQuestions: 4,
    topics: [
      "Lei 9.613/98 e alterações (Lei 12.683/12)",
      "Fases: colocação, ocultação (estratificação) e integração",
      "COAF — comunicação de operações suspeitas",
      "Conheça seu Cliente (KYC) e guarda de registros",
      "Vedação de avisar o cliente (não dar ciência da comunicação)",
    ],
    summary:
      "Lavagem de dinheiro é dar aparência lícita a recursos de origem ilícita. Três fases: COLOCAÇÃO (placement — inserir o dinheiro no sistema), OCULTAÇÃO/estratificação (layering — multiplicar transações para apagar a trilha) e INTEGRAÇÃO (integration — o recurso volta com aparência legal). Após a Lei 12.683/12, qualquer infração penal pode ser antecedente (acabou o rol taxativo). O órgão central é o COAF. As instituições devem: identificar e conhecer o cliente (KYC), manter registros (guarda mínima de 5 anos), e COMUNICAR ao COAF operações suspeitas/acima de limites — SEM avisar o cliente. Não comunicar gera responsabilização.",
  },
  {
    id: 4,
    slug: "economia",
    title: "Fundamentos de Economia",
    short: "Economia",
    critical: false,
    examQuestions: 4,
    topics: [
      "PIB, inflação (IPCA, IGP-M)",
      "Taxa Selic e o Copom",
      "Políticas monetária, fiscal e cambial",
      "Câmbio e balança comercial",
    ],
    summary:
      "PIB = soma dos bens e serviços finais produzidos. Inflação medida principalmente pelo IPCA (índice oficial, meta perseguida pelo BC) e IGP-M (reajustes/aluguéis). A taxa SELIC meta é definida pelo COPOM (Comitê de Política Monetária do BACEN) e é o principal instrumento da política monetária: sobe para conter inflação, cai para estimular a economia. Política fiscal = governo (gastos e tributos); política cambial = atuação no câmbio. Câmbio valorizado/desvalorizado afeta exportações, importações e inflação.",
  },
  {
    id: 5,
    slug: "sfn-estrutura",
    title: "Estrutura do Sistema Financeiro Nacional (SFN)",
    short: "Estrutura do SFN",
    critical: false,
    examQuestions: 4,
    topics: [
      "Subsistema normativo x operativo",
      "CMN — órgão máximo normativo",
      "BACEN, CVM, SUSEP, PREVIC",
      "Conselhos: CMN e CNSP",
    ],
    summary:
      "O SFN divide-se em subsistema NORMATIVO (define regras) e OPERATIVO/de intermediação (executa). No topo está o CMN (Conselho Monetário Nacional), órgão MÁXIMO e normativo. Abaixo, os supervisores: BACEN (executa a política monetária, supervisiona instituições financeiras e o sistema de pagamentos), CVM (regula e fiscaliza o mercado de valores mobiliários — ações, fundos, debêntures), SUSEP (seguros, capitalização, previdência aberta) e PREVIC (previdência fechada / fundos de pensão). O CMN não executa: ele normatiza.",
  },
  {
    id: 6,
    slug: "instituicoes",
    title: "Instituições e Intermediadores do SFN",
    short: "Instituições",
    critical: false,
    examQuestions: 5,
    topics: [
      "Bancos comerciais, de investimento e múltiplos",
      "Corretoras (CTVM) e Distribuidoras (DTVM)",
      "B3 — bolsa e clearing",
      "Sistemas SELIC e B3 (ex-CETIP) de custódia/liquidação",
    ],
    summary:
      "Bancos COMERCIAIS captam depósitos à vista e criam moeda escritural; bancos de INVESTIMENTO operam médio/longo prazo e mercado de capitais; banco MÚLTIPLO reúne carteiras (precisa de pelo menos duas, sendo uma comercial ou de investimento). CTVM (corretoras) e DTVM (distribuidoras) intermediam compra/venda de valores mobiliários — hoje têm atuação praticamente equivalente. A B3 é a bolsa brasileira (também faz a clearing/liquidação). Custódia/liquidação: SELIC para títulos públicos federais; a B3 (que incorporou a CETIP) para títulos privados.",
  },
  {
    id: 7,
    slug: "risco",
    title: "Administração de Risco",
    short: "Risco",
    critical: false,
    examQuestions: 4,
    topics: [
      "Riscos: mercado, crédito, liquidez e operacional",
      "Risco sistemático x não sistemático (diversificação)",
      "Volatilidade",
      "FGC — Fundo Garantidor de Créditos",
    ],
    summary:
      "Principais riscos: de MERCADO (oscilação de preços/taxas), de CRÉDITO (calote da contraparte), de LIQUIDEZ (não conseguir vender/realizar pelo preço justo) e OPERACIONAL (falhas, fraudes, sistemas). Risco SISTEMÁTICO (não diversificável) afeta todo o mercado e não some com diversificação; risco NÃO SISTEMÁTICO (específico/diversificável) pode ser reduzido diversificando a carteira. O FGC garante até R$ 250 mil por CPF por instituição (teto de R$ 1 milhão a cada 4 anos) e cobre poupança, CDB, LCI, LCA, LC e depósitos — NÃO cobre fundos, debêntures nem títulos públicos.",
  },
  {
    id: 8,
    slug: "mercado-capitais",
    title: "Mercado de Capitais: Produtos e Tributação",
    short: "Mercado de Capitais",
    critical: true,
    examQuestions: 12,
    topics: [
      "Ações ON x PN, direitos do acionista, tag along",
      "Debêntures e bônus de subscrição",
      "Underwriting: garantia firme, melhores esforços, stand-by",
      "Mercado primário x secundário, governança (Novo Mercado)",
      "Tributação de renda variável (15% / 20% day trade, isenção)",
    ],
    summary:
      "AÇÕES: ON dão direito a voto; PN têm preferência em dividendos/reembolso (em geral sem voto). Acionista tem direito a dividendos, JCP, bonificação, subscrição. TAG ALONG = direito de vender junto quando o controle é vendido (mín. 80% do valor pago ao controlador; Novo Mercado = 100% e só ON). DEBÊNTURE = dívida de companhia (renda fixa privada). UNDERWRITING (subscrição/IPO): garantia FIRME (banco garante a colocação total — risco do banco), MELHORES ESFORÇOS (best efforts — sem garantia, risco do emissor) e STAND-BY/residual (banco subscreve o que sobrar). Mercado PRIMÁRIO = empresa capta recursos (IPO/follow-on); SECUNDÁRIO = investidores negociam entre si (a empresa não recebe nada). Tributação RV: 15% sobre o ganho (swing trade) e 20% no day trade; isenção de IR na venda à vista de ações até R$ 20 mil/mês (não vale para day trade).",
  },
  {
    id: 9,
    slug: "fundos",
    title: "Fundos de Investimento",
    short: "Fundos",
    critical: false,
    examQuestions: 7,
    topics: [
      "Condomínio, cota e marcação a mercado",
      "Aberto x fechado; administrador, gestor, custodiante",
      "Taxas de administração e performance",
      "Classes ANBIMA (RF, Ações, Multimercado, Cambial)",
      "Come-cotas e tributação",
    ],
    summary:
      "Fundo é um CONDOMÍNIO de investidores; cada cotista tem COTAS, cujo valor vem da marcação a mercado do patrimônio. ABERTO permite entrada/saída (resgate); FECHADO tem cotas negociadas no mercado secundário. Prestadores: ADMINISTRADOR (responsável legal), GESTOR (decide os investimentos), CUSTODIANTE (guarda os ativos), auditor. Taxa de ADMINISTRAÇÃO (fixa, % a.a.) e de PERFORMANCE (sobre o que exceder um benchmark — regra do 'linha d'água'). Classes (Res. CVM 175 / ANBIMA): Renda Fixa, Ações, Multimercado, Cambial. Tributação por come-cotas (antecipação de IR no último dia útil de maio e novembro): 15% (longo prazo) ou 20% (curto prazo), com ajuste no resgate conforme tabela regressiva. Fundo de ações: 15% no resgate, sem come-cotas.",
  },
  {
    id: 10,
    slug: "outros-fundos",
    title: "Outros Fundos Regulados pela CVM",
    short: "Outros Fundos",
    critical: false,
    examQuestions: 3,
    topics: [
      "FII — Fundos Imobiliários",
      "FIDC — Direitos Creditórios (cotas sênior/subordinada)",
      "FIP — Participações",
      "ETF — fundos de índice",
    ],
    summary:
      "FII (Fundo de Investimento Imobiliário): fechado, negociado em bolsa; rendimentos distribuídos podem ser ISENTOS de IR para PF (se cumpre condições: 50+ cotistas, cotas negociadas em bolsa, cotista com <10%); ganho na venda da cota é tributado em 20%. FIDC: investe em direitos creditórios (recebíveis); tem cotas SÊNIOR (preferência) e SUBORDINADA (absorve o prejuízo primeiro); em geral para investidor qualificado. FIP (Participações): investe em empresas (private equity). ETF: fundo de índice negociado em bolsa, replica um índice (ex.: BOVA11).",
  },
  {
    id: 11,
    slug: "securitizacao",
    title: "Securitização de Recebíveis",
    short: "Securitização",
    critical: false,
    examQuestions: 2,
    topics: [
      "Companhia securitizadora",
      "CRI e CRA",
      "Isenção de IR para PF",
    ],
    summary:
      "Securitização transforma recebíveis (fluxos futuros) em títulos negociáveis, emitidos por uma COMPANHIA SECURITIZADORA. CRI (Certificado de Recebíveis Imobiliários) — lastro imobiliário; CRA (Certificado de Recebíveis do Agronegócio) — lastro no agro. Ambos são ISENTOS de IR para pessoa física, assim como LCI, LCA e debêntures incentivadas. NÃO contam com cobertura do FGC.",
  },
  {
    id: 12,
    slug: "clubes",
    title: "Clubes de Investimento",
    short: "Clubes",
    critical: false,
    examQuestions: 2,
    topics: [
      "Mínimo 3 e máximo 50 cotistas",
      "Limite de 40% por cotista",
      "Mínimo de 67% em ações/derivativos de ações",
      "Administração por corretora/DTVM, registro na B3",
    ],
    summary:
      "Clube de investimento é uma 'porta de entrada' coletiva para a bolsa: mínimo de 3 e máximo de 50 cotistas (pessoas físicas), administrado por corretora/DTVM e registrado na B3. Um único cotista NÃO pode deter mais de 40% das cotas. Deve manter no mínimo 67% do patrimônio em ações, bônus de subscrição, recibos de subscrição e derivativos de ações. Acima de 50 cotistas, normalmente deve se transformar em fundo.",
  },
  {
    id: 13,
    slug: "matematica-financeira",
    title: "Matemática Financeira",
    short: "Matemática Fin.",
    critical: false,
    examQuestions: 6,
    topics: [
      "Juros simples x compostos",
      "Taxa nominal, efetiva e real (Fisher)",
      "Taxa proporcional x equivalente",
      "Valor presente e valor futuro",
    ],
    summary:
      "Juros SIMPLES incidem só sobre o principal (crescimento linear); juros COMPOSTOS incidem sobre o montante acumulado (juros sobre juros — crescimento exponencial). Taxa NOMINAL é a 'cheia' (ex.: 12% a.a. com capitalização mensal); EFETIVA é a realmente paga no período. Taxa PROPORCIONAL usa-se em juros simples (12% a.a. → 1% a.m.); EQUIVALENTE usa-se em juros compostos. Taxa REAL desconta a inflação pela fórmula de Fisher: (1+real) = (1+nominal)/(1+inflação). Se a taxa nominal < inflação, a taxa real é NEGATIVA.",
  },
  {
    id: 14,
    slug: "mercado-financeiro",
    title: "Mercado Financeiro: Renda Fixa e Tributação",
    short: "Mercado Financeiro",
    critical: false,
    examQuestions: 10,
    topics: [
      "CDB, LCI, LCA, LC, poupança",
      "Tesouro Direto (Selic, Prefixado, IPCA+)",
      "IR regressivo da renda fixa e IOF",
      "Risco de crédito e FGC",
    ],
    summary:
      "Renda fixa privada: CDB (emitido por banco, tem FGC), LCI/LCA (lastro imobiliário/agro, ISENTOS de IR para PF e com FGC), LC (financeiras). Poupança: isenta de IR para PF, com FGC. Tesouro Direto (títulos públicos federais, sem FGC mas baixíssimo risco): Tesouro SELIC (pós-fixado, pouca volatilidade), PREFIXADO (taxa travada) e IPCA+ (híbrido, protege da inflação). IR REGRESSIVO da renda fixa: 22,5% até 180 dias; 20% de 181 a 360; 17,5% de 361 a 720; 15% acima de 720 dias. IOF regressivo incide só nos primeiros 30 dias (zera no 30º dia). Quanto maior o prazo, menor o imposto.",
  },
  {
    id: 15,
    slug: "derivativos",
    title: "Mercado de Derivativos",
    short: "Derivativos",
    critical: true,
    examQuestions: 8,
    topics: [
      "Mercados: a termo, futuro, opções e swap",
      "Hedge, especulação e arbitragem",
      "Ajuste diário (futuro) x liquidação no vencimento (termo)",
      "Opções: call/put, titular x lançador, prêmio",
      "Margem de garantia",
    ],
    summary:
      "Derivativo é um contrato cujo valor DERIVA de um ativo-objeto. Mercados: A TERMO (compra/venda futura com preço travado, liquida no vencimento, sem ajuste diário); FUTURO (padronizado, negociado em bolsa, com AJUSTE DIÁRIO de ganhos/perdas e margem de garantia); OPÇÕES (direito, não obrigação); SWAP (troca de fluxos/indexadores). Finalidades: HEDGE (proteção), ESPECULAÇÃO (lucrar com a oscilação) e ARBITRAGEM (lucro sem risco em distorções de preço). OPÇÕES: CALL = opção de compra, PUT = opção de venda. O TITULAR (comprador) paga o PRÊMIO e tem o direito; o LANÇADOR (vendedor) recebe o prêmio e tem a obrigação (e deposita margem). A diferença-chave: futuro tem ajuste diário; a termo não.",
  },
];

export const TOTAL_EXAM_QUESTIONS = 80;
export const PASS_PCT = 0.7; // 70% no geral
export const CRITICAL_MIN_PCT = 0.5; // 50% nos capítulos críticos
export const CRITICAL_MODULE_IDS = MODULES.filter((m) => m.critical).map((m) => m.id);

export function getModule(id: number): AncordModule | undefined {
  return MODULES.find((m) => m.id === id);
}

const ROMAN = [
  "",
  "I", "II", "III", "IV", "V", "VI", "VII", "VIII",
  "IX", "X", "XI", "XII", "XIII", "XIV", "XV",
];

export function roman(id: number): string {
  return ROMAN[id] ?? String(id);
}
