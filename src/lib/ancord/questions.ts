import type { Question } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Banco de questões ANCORD — conjunto inicial (semente), curado para precisão.
//
// Foco nos capítulos críticos (I, II, III, VIII, XV) e nos tópicos de maior
// incidência. As alternativas são embaralhadas em tempo de execução, então a
// posição do gabarito aqui não importa para o treino.
//
// Este banco cresce com o tempo (e o tutor de IA gera questões extras sob
// demanda). Conteúdo baseado no programa oficial da ANCORD e na legislação
// vigente (CVM, BACEN, Lei 9.613/98).
// ─────────────────────────────────────────────────────────────────────────────

export const QUESTIONS: Question[] = [
  // ── Módulo I — Atividade do Assessor de Investimento (CRÍTICO) ──────────────
  {
    id: "m1-1",
    moduleId: 1,
    difficulty: 1,
    stem: "O que é VEDADO ao assessor de investimento?",
    options: [
      "Prospectar e captar clientes para o intermediário",
      "Administrar/gerir a carteira de valores mobiliários de clientes",
      "Distribuir produtos do intermediário ao qual está vinculado",
      "Receber remuneração do intermediário contratante",
    ],
    correct: 1,
    explanation:
      "O AI distribui produtos e prospecta clientes. Administrar/gerir carteira é atividade privativa do administrador de carteiras — vedada ao AI, assim como custódia, procuração para operar e recomendação de investimento.",
    tags: ["vedações"],
  },
  {
    id: "m1-2",
    moduleId: 1,
    difficulty: 1,
    stem: "Perante o cliente, quem responde pelos atos do assessor de investimento?",
    options: [
      "Exclusivamente o próprio AI",
      "A ANCORD",
      "O intermediário contratante (corretora, distribuidora ou banco)",
      "A CVM",
    ],
    correct: 2,
    explanation:
      "O intermediário que contrata o AI é responsável por seus atos perante os clientes e a CVM. Por isso ele supervisiona a atuação do assessor.",
    tags: ["responsabilidade"],
  },
  {
    id: "m1-3",
    moduleId: 1,
    difficulty: 1,
    stem: "Para atuar, o assessor de investimento precisa de:",
    options: [
      "Apenas diploma em economia ou administração",
      "Registro na CVM e certificação concedida por entidade credenciada (ANCORD)",
      "Autorização do Banco Central",
      "Registro direto na B3",
    ],
    correct: 1,
    explanation:
      "A atuação exige certificação (ANCORD) e registro na CVM. Diploma específico não é requisito.",
    tags: ["registro", "certificação"],
  },
  {
    id: "m1-4",
    moduleId: 1,
    difficulty: 2,
    stem: "O assessor de investimento pode receber procuração de clientes para movimentar a conta e operar em nome deles?",
    options: [
      "Sim, desde que por escrito",
      "Sim, se autorizado pela corretora",
      "Não — é expressamente vedado",
      "Sim, apenas para investidores qualificados",
    ],
    correct: 2,
    explanation:
      "Receber procuração/mandato para operar pela conta do cliente é vedado ao AI. A ordem deve partir do próprio cliente.",
    tags: ["vedações", "procuração"],
  },
  {
    id: "m1-5",
    moduleId: 1,
    difficulty: 2,
    stem: "A atividade do assessor de investimento consiste essencialmente em:",
    options: [
      "Gerir fundos de investimento",
      "Prospectar clientes e distribuir produtos por conta do intermediário ao qual está vinculado",
      "Emitir relatórios de análise (research) com recomendações",
      "Custodiar os ativos financeiros dos clientes",
    ],
    correct: 1,
    explanation:
      "O AI é um distribuidor: prospecta, capta e atende clientes e distribui produtos do intermediário. Análise/recomendação e custódia não são suas atribuições.",
    tags: ["atividade"],
  },
  {
    id: "m1-6",
    moduleId: 1,
    difficulty: 2,
    stem: "Qual norma da CVM regula atualmente a atividade do assessor de investimento?",
    options: [
      "A Instrução CVM 497, ainda em vigor sem alterações",
      "A Resolução CVM 178, que substituiu a Instrução CVM 497",
      "A Lei 6.385/76, exclusivamente",
      "A Resolução CMN 4.553",
    ],
    correct: 1,
    explanation:
      "A Resolução CVM 178 passou a reger a atividade (e trouxe a nomenclatura 'assessor de investimento'), substituindo a antiga Instrução CVM 497.",
    tags: ["regulação"],
  },

  // ── Módulo II — Ética Profissional (CRÍTICO) ────────────────────────────────
  {
    id: "m2-1",
    moduleId: 2,
    difficulty: 1,
    stem: "Diante de um conflito de interesses, o assessor deve:",
    options: [
      "Priorizar o produto que paga maior comissão",
      "Dar preferência ao próprio interesse e informar depois",
      "Priorizar o interesse do cliente e revelar o conflito",
      "Ignorar, pois conflito de interesses é normal no mercado",
    ],
    correct: 2,
    explanation:
      "O interesse do cliente vem sempre antes do interesse do assessor. Conflitos devem ser evitados e, quando existirem, revelados de forma transparente.",
    tags: ["conflito de interesses"],
  },
  {
    id: "m2-2",
    moduleId: 2,
    difficulty: 1,
    stem: "O princípio do 'suitability' significa:",
    options: [
      "Vender sempre o produto de maior rentabilidade",
      "Recomendar/distribuir apenas produtos adequados ao perfil, objetivos e situação do cliente",
      "Conhecer todos os produtos disponíveis no mercado",
      "Garantir uma rentabilidade mínima ao cliente",
    ],
    correct: 1,
    explanation:
      "Suitability é a adequação do produto ao cliente — perfil de risco, objetivos e situação financeira. Não é vender o mais rentável nem garantir retorno.",
    tags: ["suitability"],
  },
  {
    id: "m2-3",
    moduleId: 2,
    difficulty: 1,
    stem: "Sobre o sigilo das informações do cliente, é correto afirmar que:",
    options: [
      "Pode ser compartilhado livremente com outros clientes",
      "Deve ser mantido, salvo exigência legal ou regulatória",
      "Pode ser usado em benefício próprio do assessor",
      "Não existe dever de sigilo para o assessor",
    ],
    correct: 1,
    explanation:
      "O dever de sigilo é um pilar ético. As informações só podem ser reveladas mediante exigência legal/regulatória ou autorização do cliente.",
    tags: ["sigilo"],
  },
  {
    id: "m2-4",
    moduleId: 2,
    difficulty: 2,
    stem: "É conduta ADEQUADA do assessor de investimento:",
    options: [
      "Prometer rentabilidade mínima para fechar o negócio",
      "Estimular o cliente a operar mais para gerar corretagem (churning)",
      "Informar de forma clara os riscos e os custos dos produtos",
      "Omitir riscos para não assustar o cliente",
    ],
    correct: 2,
    explanation:
      "Transparência sobre riscos e custos é dever do assessor. Prometer rentabilidade e o 'churning' (giro excessivo) são condutas vedadas.",
    tags: ["conduta"],
  },
  {
    id: "m2-5",
    moduleId: 2,
    difficulty: 1,
    stem: "O 'Conheça seu Cliente' (KYC) tem como objetivo principal:",
    options: [
      "Aumentar o volume de vendas",
      "Conhecer a identidade, a atividade e o perfil do cliente, prevenindo fraudes e lavagem de dinheiro",
      "Substituir a análise de suitability",
      "Cumprir metas comerciais da corretora",
    ],
    correct: 1,
    explanation:
      "O KYC identifica e conhece o cliente, sendo base tanto para o suitability quanto para a prevenção à lavagem de dinheiro.",
    tags: ["KYC"],
  },

  // ── Módulo III — Lavagem de Dinheiro (CRÍTICO) ──────────────────────────────
  {
    id: "m3-1",
    moduleId: 3,
    difficulty: 1,
    stem: "As três fases clássicas da lavagem de dinheiro são:",
    options: [
      "Captação, aplicação e resgate",
      "Colocação, ocultação e integração",
      "Emissão, distribuição e liquidação",
      "Identificação, comunicação e bloqueio",
    ],
    correct: 1,
    explanation:
      "Colocação (inserir o recurso no sistema), ocultação/estratificação (apagar a trilha com várias transações) e integração (retorno com aparência lícita).",
    tags: ["fases"],
  },
  {
    id: "m3-2",
    moduleId: 3,
    difficulty: 1,
    stem: "O órgão central de prevenção e combate à lavagem de dinheiro no Brasil é:",
    options: ["A CVM", "O COAF", "A Receita Federal", "A Polícia Federal"],
    correct: 1,
    explanation:
      "O COAF (Conselho de Controle de Atividades Financeiras) é a unidade de inteligência financeira que recebe e analisa as comunicações de operações suspeitas.",
    tags: ["COAF"],
  },
  {
    id: "m3-3",
    moduleId: 3,
    difficulty: 2,
    stem: "Ao identificar uma operação suspeita de lavagem de dinheiro, a instituição deve:",
    options: [
      "Avisar o cliente e pedir explicações",
      "Comunicar ao COAF, sem dar ciência ao cliente",
      "Encerrar a conta imediatamente, sem registro",
      "Aguardar uma ordem judicial para agir",
    ],
    correct: 1,
    explanation:
      "A comunicação ao COAF deve ser feita SEM cientificar o cliente. Avisar o cliente ('tipping off') é vedado.",
    tags: ["comunicação"],
  },
  {
    id: "m3-4",
    moduleId: 3,
    difficulty: 2,
    stem: "A fase de 'colocação' (placement) na lavagem de dinheiro caracteriza-se por:",
    options: [
      "Reintroduzir o recurso já com aparência lícita na economia",
      "Inserir inicialmente o dinheiro de origem ilícita no sistema financeiro",
      "Multiplicar transações para dificultar o rastreamento",
      "Ocorrer exclusivamente no exterior",
    ],
    correct: 1,
    explanation:
      "A colocação é a primeira fase: introduzir o dinheiro 'sujo' no sistema (depósitos, compra de bens, etc.). A multiplicação de transações é a ocultação.",
    tags: ["fases"],
  },
  {
    id: "m3-5",
    moduleId: 3,
    difficulty: 2,
    stem: "Após a Lei 12.683/2012, em relação aos crimes antecedentes à lavagem de dinheiro:",
    options: [
      "Apenas o tráfico de drogas pode ser antecedente",
      "Existe um rol taxativo de crimes antecedentes",
      "Qualquer infração penal pode ser antecedente",
      "Deixou de existir o crime de lavagem",
    ],
    correct: 2,
    explanation:
      "A Lei 12.683/12 eliminou o rol taxativo: hoje qualquer infração penal pode ser antecedente da lavagem.",
    tags: ["crime antecedente"],
  },
  {
    id: "m3-6",
    moduleId: 3,
    difficulty: 2,
    stem: "O prazo mínimo de guarda dos registros de cadastro e operações, para fins de prevenção à lavagem, é de:",
    options: [
      "1 ano",
      "5 anos (podendo ser estendido por determinação da autoridade competente)",
      "6 meses",
      "10 anos, em qualquer caso",
    ],
    correct: 1,
    explanation:
      "A regra geral é guardar os registros por, no mínimo, 5 anos, prazo que pode ser estendido pela autoridade competente.",
    tags: ["guarda de registros"],
  },

  // ── Módulo IV — Economia ────────────────────────────────────────────────────
  {
    id: "m4-1",
    moduleId: 4,
    difficulty: 1,
    stem: "A taxa básica de juros da economia (Selic meta) é definida pelo:",
    options: ["Ministério da Fazenda", "COPOM", "CMN", "Congresso Nacional"],
    correct: 1,
    explanation:
      "O COPOM (Comitê de Política Monetária do Banco Central) define a meta da taxa Selic.",
    tags: ["selic", "copom"],
  },
  {
    id: "m4-2",
    moduleId: 4,
    difficulty: 1,
    stem: "O índice oficial de inflação, usado na meta perseguida pelo Banco Central, é o:",
    options: ["IGP-M", "INCC", "IPCA", "IPA"],
    correct: 2,
    explanation:
      "O IPCA (IBGE) é o índice oficial de inflação e a referência da meta de inflação.",
    tags: ["inflação", "ipca"],
  },
  {
    id: "m4-3",
    moduleId: 4,
    difficulty: 2,
    stem: "Para conter a inflação, a política monetária tende a:",
    options: [
      "Reduzir a taxa de juros",
      "Elevar a taxa de juros",
      "Aumentar os gastos públicos",
      "Desvalorizar o câmbio propositalmente",
    ],
    correct: 1,
    explanation:
      "Elevar os juros encarece o crédito e desestimula o consumo, ajudando a conter a inflação (política monetária contracionista).",
    tags: ["política monetária"],
  },
  {
    id: "m4-4",
    moduleId: 4,
    difficulty: 1,
    stem: "O PIB (Produto Interno Bruto) representa:",
    options: [
      "Toda a riqueza acumulada do país ao longo da história",
      "O valor de todos os bens e serviços finais produzidos em um período",
      "Apenas a produção industrial",
      "A arrecadação total de tributos",
    ],
    correct: 1,
    explanation:
      "O PIB é um fluxo: soma o valor dos bens e serviços finais produzidos em determinado período (geralmente um ano ou trimestre).",
    tags: ["pib"],
  },

  // ── Módulo V — Estrutura do SFN ─────────────────────────────────────────────
  {
    id: "m5-1",
    moduleId: 5,
    difficulty: 1,
    stem: "O órgão máximo e normativo do Sistema Financeiro Nacional é:",
    options: ["O Banco Central", "A CVM", "O Conselho Monetário Nacional (CMN)", "A B3"],
    correct: 2,
    explanation:
      "O CMN é o órgão máximo do SFN, com função normativa (define as regras). Ele não executa — quem executa/supervisiona é o BACEN, a CVM, etc.",
    tags: ["cmn"],
  },
  {
    id: "m5-2",
    moduleId: 5,
    difficulty: 1,
    stem: "A regulação e fiscalização do mercado de valores mobiliários (ações, fundos, debêntures) cabe à:",
    options: ["SUSEP", "CVM", "PREVIC", "BACEN"],
    correct: 1,
    explanation:
      "A CVM regula e fiscaliza o mercado de valores mobiliários.",
    tags: ["cvm"],
  },
  {
    id: "m5-3",
    moduleId: 5,
    difficulty: 2,
    stem: "A supervisão de seguros, capitalização e previdência aberta cabe à:",
    options: ["PREVIC", "SUSEP", "CVM", "BACEN"],
    correct: 1,
    explanation:
      "A SUSEP supervisiona seguros, capitalização e previdência complementar ABERTA. A previdência FECHADA (fundos de pensão) é com a PREVIC.",
    tags: ["susep"],
  },
  {
    id: "m5-4",
    moduleId: 5,
    difficulty: 2,
    stem: "Entre as atribuições do Banco Central do Brasil está:",
    options: [
      "Definir a política fiscal do governo",
      "Executar a política monetária e supervisionar as instituições financeiras",
      "Regular o mercado de capitais",
      "Fiscalizar os fundos de pensão",
    ],
    correct: 1,
    explanation:
      "O BACEN executa a política monetária, supervisiona as instituições financeiras e zela pelo sistema de pagamentos.",
    tags: ["bacen"],
  },

  // ── Módulo VI — Instituições e Intermediadores ──────────────────────────────
  {
    id: "m6-1",
    moduleId: 6,
    difficulty: 1,
    stem: "Os bancos comerciais caracterizam-se por:",
    options: [
      "Operar apenas no longo prazo",
      "Captar depósitos à vista e criar moeda escritural",
      "Não poder captar depósitos do público",
      "Atuar exclusivamente no mercado de capitais",
    ],
    correct: 1,
    explanation:
      "A marca do banco comercial é captar depósitos à vista, o que lhe permite criar moeda escritural por meio do multiplicador bancário.",
    tags: ["bancos"],
  },
  {
    id: "m6-2",
    moduleId: 6,
    difficulty: 2,
    stem: "A custódia e a liquidação dos títulos públicos federais ocorrem no sistema:",
    options: ["B3 (ex-CETIP)", "SELIC", "SPB exclusivamente", "TecBan"],
    correct: 1,
    explanation:
      "O SELIC é o sistema de custódia e liquidação dos títulos públicos federais. Títulos privados ficam na B3 (que incorporou a CETIP).",
    tags: ["selic", "custódia"],
  },
  {
    id: "m6-3",
    moduleId: 6,
    difficulty: 2,
    stem: "Para ser classificada como banco múltiplo, a instituição precisa ter:",
    options: [
      "Apenas a carteira comercial",
      "No mínimo duas carteiras, sendo uma delas comercial ou de investimento",
      "Exatamente cinco carteiras",
      "Obrigatoriamente uma carteira de seguros",
    ],
    correct: 1,
    explanation:
      "O banco múltiplo deve ter pelo menos duas carteiras, das quais uma precisa ser comercial ou de investimento.",
    tags: ["banco múltiplo"],
  },
  {
    id: "m6-4",
    moduleId: 6,
    difficulty: 1,
    stem: "A função principal das corretoras (CTVM) e distribuidoras (DTVM) é:",
    options: [
      "Emitir moeda",
      "Intermediar a compra e a venda de valores mobiliários",
      "Definir a taxa Selic",
      "Fiscalizar o mercado de capitais",
    ],
    correct: 1,
    explanation:
      "CTVM e DTVM intermediam negócios com valores mobiliários. Hoje têm atuação praticamente equivalente.",
    tags: ["corretoras"],
  },
  {
    id: "m6-5",
    moduleId: 6,
    difficulty: 1,
    stem: "A bolsa de valores brasileira, que também realiza a clearing (liquidação e custódia), é a:",
    options: ["BACEN", "B3", "ANBIMA", "CVM"],
    correct: 1,
    explanation:
      "A B3 é a bolsa do Brasil e também opera as câmaras de liquidação e custódia (clearing).",
    tags: ["b3"],
  },

  // ── Módulo VII — Administração de Risco ─────────────────────────────────────
  {
    id: "m7-1",
    moduleId: 7,
    difficulty: 2,
    stem: "O risco que NÃO pode ser eliminado pela diversificação da carteira é o:",
    options: [
      "Risco não sistemático",
      "Risco específico (da empresa)",
      "Risco sistemático (de mercado)",
      "Risco diversificável",
    ],
    correct: 2,
    explanation:
      "O risco sistemático afeta todo o mercado (juros, câmbio, política) e não some com diversificação. O não sistemático (específico) é diversificável.",
    tags: ["risco sistemático"],
  },
  {
    id: "m7-2",
    moduleId: 7,
    difficulty: 1,
    stem: "O risco de a contraparte não honrar o pagamento devido é o risco de:",
    options: ["Mercado", "Liquidez", "Crédito", "Operacional"],
    correct: 2,
    explanation:
      "Risco de crédito é o risco de calote/inadimplência da contraparte.",
    tags: ["risco de crédito"],
  },
  {
    id: "m7-3",
    moduleId: 7,
    difficulty: 1,
    stem: "O FGC garante, por CPF e por instituição, até:",
    options: [
      "R$ 70 mil",
      "R$ 250 mil (com teto de R$ 1 milhão a cada 4 anos)",
      "R$ 1 milhão por aplicação",
      "Um valor ilimitado",
    ],
    correct: 1,
    explanation:
      "O FGC cobre até R$ 250 mil por CPF e por instituição, limitado a R$ 1 milhão por CPF a cada período de 4 anos.",
    tags: ["fgc"],
  },
  {
    id: "m7-4",
    moduleId: 7,
    difficulty: 2,
    stem: "NÃO conta com a cobertura do FGC:",
    options: ["CDB", "Poupança", "Fundo de investimento", "LCI"],
    correct: 2,
    explanation:
      "O FGC cobre CDB, poupança, LCI, LCA, LC e depósitos. Não cobre fundos de investimento, debêntures nem títulos públicos.",
    tags: ["fgc"],
  },
  {
    id: "m7-5",
    moduleId: 7,
    difficulty: 1,
    stem: "O risco de não conseguir vender um ativo rapidamente sem perder valor é o risco de:",
    options: ["Crédito", "Liquidez", "Mercado", "Operacional"],
    correct: 1,
    explanation:
      "Risco de liquidez é a dificuldade de transformar o ativo em dinheiro pelo preço justo e no tempo desejado.",
    tags: ["risco de liquidez"],
  },

  // ── Módulo VIII — Mercado de Capitais (CRÍTICO) ─────────────────────────────
  {
    id: "m8-1",
    moduleId: 8,
    difficulty: 1,
    stem: "As ações ordinárias (ON) conferem ao seu titular:",
    options: [
      "Preferência no recebimento de dividendos",
      "Direito a voto nas assembleias",
      "Isenção de IR em qualquer situação",
      "Garantia de recompra pela empresa",
    ],
    correct: 1,
    explanation:
      "ON dão direito a voto. As preferenciais (PN) têm preferência em dividendos/reembolso, em geral sem direito a voto.",
    tags: ["ações"],
  },
  {
    id: "m8-2",
    moduleId: 8,
    difficulty: 2,
    stem: "O 'tag along' garante ao acionista minoritário:",
    options: [
      "Dividendos fixos",
      "O direito de vender suas ações na troca de controle, por no mínimo 80% do valor pago ao controlador",
      "Voto em dobro",
      "Isenção tributária sobre o ganho",
    ],
    correct: 1,
    explanation:
      "Tag along é o direito de venda conjunta na alienação de controle (mínimo legal de 80% do preço pago ao controlador; no Novo Mercado, 100%).",
    tags: ["tag along", "governança"],
  },
  {
    id: "m8-3",
    moduleId: 8,
    difficulty: 2,
    stem: "No underwriting com GARANTIA FIRME:",
    options: [
      "O risco de não colocação fica com o emissor",
      "A instituição intermediária garante a subscrição total, assumindo o risco da colocação",
      "Não há participação de intermediário",
      "Apenas investidores qualificados podem participar",
    ],
    correct: 1,
    explanation:
      "Na garantia firme, o intermediário garante a colocação total — se sobrar, ele fica com os papéis. O risco é do banco.",
    tags: ["underwriting"],
  },
  {
    id: "m8-4",
    moduleId: 8,
    difficulty: 2,
    stem: "No mercado PRIMÁRIO:",
    options: [
      "Os investidores negociam entre si e a empresa não recebe recursos",
      "A empresa capta recursos novos (ex.: em um IPO)",
      "Negociam-se apenas debêntures",
      "Não há emissão de valores mobiliários",
    ],
    correct: 1,
    explanation:
      "No primário a empresa emite e capta recursos. No secundário os investidores negociam entre si e a empresa não recebe nada.",
    tags: ["primário", "secundário"],
  },
  {
    id: "m8-5",
    moduleId: 8,
    difficulty: 2,
    stem: "A alíquota de IR sobre o ganho líquido em operações de DAY TRADE com ações é de:",
    options: ["15%", "20%", "22,5%", "Isento"],
    correct: 1,
    explanation:
      "Day trade é tributado em 20%. Operações normais (swing trade) em 15%.",
    tags: ["tributação", "day trade"],
  },
  {
    id: "m8-6",
    moduleId: 8,
    difficulty: 2,
    stem: "A isenção de IR na venda de ações no mercado à vista aplica-se quando:",
    options: [
      "As vendas no mês não superam R$ 20 mil (exceto day trade)",
      "O investidor é estrangeiro",
      "O lucro é reinvestido em outras ações",
      "Sempre, sem qualquer limite",
    ],
    correct: 0,
    explanation:
      "Há isenção de IR quando o total de vendas de ações no mercado à vista, no mês, fica até R$ 20 mil. Não vale para day trade.",
    tags: ["tributação", "isenção"],
  },
  {
    id: "m8-7",
    moduleId: 8,
    difficulty: 1,
    stem: "Uma debênture representa:",
    options: [
      "Participação no capital (sociedade) da empresa",
      "Uma dívida (empréstimo) emitida por uma sociedade anônima",
      "Um contrato de derivativo",
      "Uma cota de fundo de investimento",
    ],
    correct: 1,
    explanation:
      "Debênture é título de dívida de uma S.A. — renda fixa privada. Quem compra é credor, não sócio.",
    tags: ["debêntures"],
  },
  {
    id: "m8-8",
    moduleId: 8,
    difficulty: 2,
    stem: "No underwriting de MELHORES ESFORÇOS (best efforts):",
    options: [
      "O banco garante a colocação total dos papéis",
      "O intermediário se compromete a empregar seu melhor esforço, sem garantir a colocação",
      "A operação é vedada pela CVM",
      "A oferta vale apenas no mercado secundário",
    ],
    correct: 1,
    explanation:
      "Em melhores esforços não há garantia de colocação: o risco do que não for vendido fica com o emissor.",
    tags: ["underwriting"],
  },
  {
    id: "m8-9",
    moduleId: 8,
    difficulty: 2,
    stem: "Qual provento pago ao acionista é ISENTO de Imposto de Renda para a pessoa física?",
    options: [
      "Os juros sobre capital próprio (JCP)",
      "Os dividendos",
      "O aluguel de ações",
      "O ganho de capital no day trade",
    ],
    correct: 1,
    explanation:
      "Dividendos são isentos de IR para o acionista PF. Já o JCP sofre retenção de 15% na fonte.",
    tags: ["dividendos", "tributação"],
  },
  {
    id: "m8-10",
    moduleId: 8,
    difficulty: 2,
    stem: "No segmento Novo Mercado da B3, as empresas devem ter:",
    options: [
      "Apenas ações preferenciais",
      "100% de ações ordinárias e tag along de 100%",
      "Tag along limitado a 80%",
      "Nenhuma exigência de governança",
    ],
    correct: 1,
    explanation:
      "O Novo Mercado é o nível mais alto de governança: só ações ON e tag along de 100%.",
    tags: ["novo mercado", "governança"],
  },

  // ── Módulo IX — Fundos de Investimento ──────────────────────────────────────
  {
    id: "m9-1",
    moduleId: 9,
    difficulty: 1,
    stem: "Em um fundo de investimento, o responsável legal perante os cotistas e a CVM é o:",
    options: ["Gestor", "Administrador", "Custodiante", "Distribuidor"],
    correct: 1,
    explanation:
      "O administrador é o responsável legal pelo fundo. O gestor decide os investimentos; o custodiante guarda os ativos.",
    tags: ["administrador"],
  },
  {
    id: "m9-2",
    moduleId: 9,
    difficulty: 1,
    stem: "A decisão sobre quais ativos comprar e vender na carteira do fundo é responsabilidade do:",
    options: ["Administrador", "Custodiante", "Gestor", "Auditor independente"],
    correct: 2,
    explanation:
      "O gestor toma as decisões de investimento (compra e venda de ativos) dentro da política do fundo.",
    tags: ["gestor"],
  },
  {
    id: "m9-3",
    moduleId: 9,
    difficulty: 2,
    stem: "O 'come-cotas' é:",
    options: [
      "A taxa de administração do fundo",
      "A antecipação de IR, no último dia útil de maio e de novembro, em certos fundos",
      "A taxa de performance",
      "Uma multa cobrada no resgate antecipado",
    ],
    correct: 1,
    explanation:
      "O come-cotas antecipa o IR em maio e novembro (15% em fundos de longo prazo, 20% nos de curto prazo), com ajuste no resgate. Fundos de ações não têm come-cotas.",
    tags: ["come-cotas", "tributação"],
  },
  {
    id: "m9-4",
    moduleId: 9,
    difficulty: 1,
    stem: "Um fundo de investimento ABERTO caracteriza-se por:",
    options: [
      "Ter cotas negociadas no mercado secundário (bolsa)",
      "Permitir aplicações e resgates conforme o regulamento",
      "Não permitir resgate em nenhuma hipótese",
      "Ter número fixo e limitado de cotas",
    ],
    correct: 1,
    explanation:
      "No fundo aberto o cotista aplica e resgata diretamente com o fundo. No fechado, sai vendendo a cota no mercado secundário.",
    tags: ["aberto", "fechado"],
  },
  {
    id: "m9-5",
    moduleId: 9,
    difficulty: 2,
    stem: "A taxa de performance é cobrada:",
    options: [
      "Sobre todo o patrimônio, em qualquer situação",
      "Sobre a parcela da rentabilidade que exceder um benchmark, respeitando a 'linha d'água'",
      "No momento da aplicação",
      "Apenas em fundos de renda fixa simples",
    ],
    correct: 1,
    explanation:
      "A taxa de performance incide só sobre o que superar o benchmark, e a 'linha d'água' impede cobrar duas vezes sobre a mesma valorização.",
    tags: ["taxa de performance"],
  },
  {
    id: "m9-6",
    moduleId: 9,
    difficulty: 2,
    stem: "Os fundos de ações são tributados:",
    options: [
      "Com come-cotas semestral",
      "Em 15% sobre o ganho, no resgate, sem come-cotas",
      "Isentos de Imposto de Renda",
      "Em 22,5%, conforme a tabela regressiva",
    ],
    correct: 1,
    explanation:
      "Fundos de ações têm alíquota única de 15% no resgate e não sofrem come-cotas.",
    tags: ["tributação"],
  },

  // ── Módulo X — Outros Fundos ────────────────────────────────────────────────
  {
    id: "m10-1",
    moduleId: 10,
    difficulty: 2,
    stem: "Os rendimentos distribuídos por um FII (fundo imobiliário) à pessoa física podem ser ISENTOS de IR quando:",
    options: [
      "O fundo é fechado",
      "O fundo tem muitos cotistas, cotas negociadas em bolsa e o cotista detém menos de 10% das cotas",
      "Em qualquer situação, sem condições",
      "O cotista é pessoa jurídica",
    ],
    correct: 1,
    explanation:
      "A isenção dos rendimentos do FII para PF exige: cotas negociadas em bolsa, fundo com no mínimo 50 cotistas e cotista com menos de 10% das cotas. O ganho na venda da cota é tributado em 20%.",
    tags: ["fii"],
  },
  {
    id: "m10-2",
    moduleId: 10,
    difficulty: 2,
    stem: "Em um FIDC, a cota que tem PRIORIDADE no recebimento (amortização e resgate) é a:",
    options: ["Subordinada", "Sênior", "Mezanino, sempre", "Ordinária"],
    correct: 1,
    explanation:
      "A cota sênior tem preferência; a subordinada absorve primeiro as perdas, protegendo a sênior.",
    tags: ["fidc"],
  },
  {
    id: "m10-3",
    moduleId: 10,
    difficulty: 1,
    stem: "Um ETF é:",
    options: [
      "Um título de renda fixa do Tesouro",
      "Um fundo de índice negociado em bolsa",
      "Um contrato de derivativo",
      "Uma debênture incentivada",
    ],
    correct: 1,
    explanation:
      "ETF (Exchange Traded Fund) é um fundo de índice negociado em bolsa, que busca replicar um índice de referência (ex.: BOVA11).",
    tags: ["etf"],
  },

  // ── Módulo XI — Securitização ───────────────────────────────────────────────
  {
    id: "m11-1",
    moduleId: 11,
    difficulty: 1,
    stem: "CRI e CRA são emitidos por:",
    options: [
      "Bancos comerciais",
      "Companhias securitizadoras",
      "A B3",
      "O Tesouro Nacional",
    ],
    correct: 1,
    explanation:
      "CRI (imobiliário) e CRA (agronegócio) são emitidos por companhias securitizadoras, que transformam recebíveis em títulos.",
    tags: ["cri", "cra"],
  },
  {
    id: "m11-2",
    moduleId: 11,
    difficulty: 1,
    stem: "Para a pessoa física, os rendimentos de CRI e CRA são:",
    options: [
      "Tributados em 15%",
      "Isentos de Imposto de Renda",
      "Tributados em 22,5%",
      "Sujeitos ao come-cotas",
    ],
    correct: 1,
    explanation:
      "CRI, CRA, LCI, LCA e debêntures incentivadas são isentos de IR para a pessoa física.",
    tags: ["isenção"],
  },
  {
    id: "m11-3",
    moduleId: 11,
    difficulty: 2,
    stem: "CRI e CRA contam com a garantia do FGC?",
    options: [
      "Sim, até R$ 250 mil",
      "Não",
      "Sim, de forma ilimitada",
      "Apenas o CRI conta",
    ],
    correct: 1,
    explanation:
      "CRI e CRA NÃO têm cobertura do FGC. O investidor depende da qualidade do lastro e das garantias da operação.",
    tags: ["fgc", "risco"],
  },

  // ── Módulo XII — Clubes de Investimento ─────────────────────────────────────
  {
    id: "m12-1",
    moduleId: 12,
    difficulty: 1,
    stem: "Um clube de investimento deve ter:",
    options: [
      "No mínimo 3 e no máximo 50 cotistas",
      "No mínimo 10 cotistas",
      "No máximo 100 cotistas",
      "Número ilimitado de cotistas",
    ],
    correct: 0,
    explanation:
      "Clube de investimento: mínimo de 3 e máximo de 50 cotistas (pessoas físicas).",
    tags: ["clubes"],
  },
  {
    id: "m12-2",
    moduleId: 12,
    difficulty: 2,
    stem: "Em um clube de investimento, um único cotista pode deter no máximo:",
    options: ["10% das cotas", "40% das cotas", "51% das cotas", "100% das cotas"],
    correct: 1,
    explanation:
      "Nenhum cotista pode ter mais de 40% das cotas do clube.",
    tags: ["clubes"],
  },
  {
    id: "m12-3",
    moduleId: 12,
    difficulty: 2,
    stem: "O percentual mínimo do patrimônio de um clube que deve estar aplicado em ações e ativos ligados a ações é de:",
    options: ["50%", "67%", "80%", "100%"],
    correct: 1,
    explanation:
      "O clube deve manter no mínimo 67% do patrimônio em ações, bônus/recibos de subscrição e derivativos de ações.",
    tags: ["clubes"],
  },

  // ── Módulo XIII — Matemática Financeira ─────────────────────────────────────
  {
    id: "m13-1",
    moduleId: 13,
    difficulty: 1,
    stem: "A diferença essencial entre juros simples e compostos é que, nos compostos:",
    options: [
      "Os juros incidem apenas sobre o capital inicial",
      "Os juros incidem sobre o montante acumulado (juros sobre juros)",
      "Não há incidência de juros",
      "A taxa aplicada é sempre menor",
    ],
    correct: 1,
    explanation:
      "Nos juros compostos há 'juros sobre juros' (crescimento exponencial). Nos simples, os juros incidem só sobre o principal (crescimento linear).",
    tags: ["juros"],
  },
  {
    id: "m13-2",
    moduleId: 13,
    difficulty: 2,
    stem: "Em regime de juros simples, a taxa de 12% ao ano equivale, proporcionalmente, a:",
    options: ["1% ao mês", "0,949% ao mês", "12% ao mês", "6% ao mês"],
    correct: 0,
    explanation:
      "Taxa proporcional (juros simples): 12% ÷ 12 = 1% ao mês. A taxa equivalente (compostos) seria ~0,949% a.m.",
    tags: ["taxa proporcional"],
  },
  {
    id: "m13-3",
    moduleId: 13,
    difficulty: 2,
    stem: "A taxa real, segundo a relação de Fisher, é obtida:",
    options: [
      "Subtraindo simplesmente a inflação da taxa nominal",
      "Por (1 + nominal) ÷ (1 + inflação) − 1",
      "Somando a inflação à taxa nominal",
      "Multiplicando a taxa nominal pela inflação",
    ],
    correct: 1,
    explanation:
      "Fisher: (1 + real) = (1 + nominal) / (1 + inflação). Não é simples subtração (isso é só uma aproximação).",
    tags: ["taxa real", "fisher"],
  },
  {
    id: "m13-4",
    moduleId: 13,
    difficulty: 2,
    stem: "Se a taxa nominal de um investimento foi 8% e a inflação no período foi 10%, a taxa real é:",
    options: ["Positiva em 2%", "Negativa", "Igual a 18%", "Igual a zero"],
    correct: 1,
    explanation:
      "Quando a inflação supera a taxa nominal, a taxa real é negativa — o poder de compra diminui.",
    tags: ["taxa real"],
  },
  {
    id: "m13-5",
    moduleId: 13,
    difficulty: 2,
    stem: "R$ 1.000,00 aplicados a juros compostos de 10% ao ano, por 2 anos, resultam em um montante de:",
    options: ["R$ 1.200,00", "R$ 1.210,00", "R$ 1.100,00", "R$ 1.220,00"],
    correct: 1,
    explanation:
      "M = 1.000 × (1,10)² = 1.000 × 1,21 = R$ 1.210,00. Nos juros simples seriam R$ 1.200,00.",
    tags: ["juros compostos"],
  },

  // ── Módulo XIV — Mercado Financeiro / Renda Fixa ────────────────────────────
  {
    id: "m14-1",
    moduleId: 14,
    difficulty: 1,
    stem: "São ISENTOS de Imposto de Renda para a pessoa física:",
    options: ["CDB e LC", "LCI e LCA", "Fundos de renda fixa", "Tesouro Prefixado"],
    correct: 1,
    explanation:
      "LCI e LCA são isentas de IR para PF. CDB, LC, fundos e títulos do Tesouro são tributados.",
    tags: ["isenção", "lci", "lca"],
  },
  {
    id: "m14-2",
    moduleId: 14,
    difficulty: 2,
    stem: "Na tabela regressiva de IR da renda fixa, a MENOR alíquota (15%) aplica-se a aplicações com prazo:",
    options: [
      "Até 180 dias",
      "Acima de 720 dias",
      "De 181 a 360 dias",
      "De 361 a 720 dias",
    ],
    correct: 1,
    explanation:
      "Tabela regressiva: 22,5% (até 180 d), 20% (181–360), 17,5% (361–720) e 15% (acima de 720 dias). Quanto mais tempo, menos imposto.",
    tags: ["tributação", "tabela regressiva"],
  },
  {
    id: "m14-3",
    moduleId: 14,
    difficulty: 1,
    stem: "O título público mais indicado para proteção contra a inflação é o:",
    options: ["Tesouro Selic", "Tesouro Prefixado", "Tesouro IPCA+", "LCI"],
    correct: 2,
    explanation:
      "O Tesouro IPCA+ paga a variação do IPCA mais uma taxa real, protegendo o poder de compra.",
    tags: ["tesouro direto"],
  },
  {
    id: "m14-4",
    moduleId: 14,
    difficulty: 2,
    stem: "O IOF sobre aplicações de renda fixa:",
    options: [
      "Incide sempre, independentemente do prazo",
      "Incide de forma regressiva e zera a partir do 30º dia",
      "É de 22,5% fixo",
      "Nunca incide",
    ],
    correct: 1,
    explanation:
      "O IOF regressivo incide só nos primeiros 30 dias (de 96% no 1º dia a 0% no 30º). Resgates a partir do 30º dia não pagam IOF.",
    tags: ["iof"],
  },
  {
    id: "m14-5",
    moduleId: 14,
    difficulty: 1,
    stem: "O Tesouro Selic é um título:",
    options: [
      "Prefixado",
      "Pós-fixado, com baixa volatilidade",
      "Isento de Imposto de Renda",
      "Atrelado ao dólar",
    ],
    correct: 1,
    explanation:
      "O Tesouro Selic é pós-fixado (acompanha a Selic) e tem baixa volatilidade — bom para reserva de liquidez.",
    tags: ["tesouro direto"],
  },
  {
    id: "m14-6",
    moduleId: 14,
    difficulty: 2,
    stem: "Uma aplicação de renda fixa resgatada em 200 dias terá alíquota de IR de:",
    options: ["22,5%", "20%", "17,5%", "15%"],
    correct: 1,
    explanation:
      "200 dias está na faixa de 181 a 360 dias → alíquota de 20%.",
    tags: ["tributação"],
  },

  // ── Módulo XV — Derivativos (CRÍTICO) ───────────────────────────────────────
  {
    id: "m15-1",
    moduleId: 15,
    difficulty: 2,
    stem: "A principal diferença entre o mercado FUTURO e o mercado A TERMO é:",
    options: [
      "O futuro não é negociado em bolsa",
      "O futuro tem ajuste diário; o a termo liquida apenas no vencimento",
      "O a termo é padronizado e o futuro não",
      "Não há diferença entre eles",
    ],
    correct: 1,
    explanation:
      "No mercado futuro há ajuste diário de ganhos e perdas (e margem). No a termo, a liquidação ocorre só no vencimento.",
    tags: ["futuro", "termo"],
  },
  {
    id: "m15-2",
    moduleId: 15,
    difficulty: 2,
    stem: "No mercado de opções, o TITULAR de uma opção de compra (call):",
    options: [
      "Tem a obrigação de comprar o ativo",
      "Tem o direito (não a obrigação) de comprar o ativo pelo preço de exercício",
      "Recebe o prêmio da operação",
      "É obrigado a depositar margem de garantia",
    ],
    correct: 1,
    explanation:
      "O titular paga o prêmio e adquire o DIREITO de comprar (call). Quem tem obrigação é o lançador, que recebe o prêmio.",
    tags: ["opções", "call"],
  },
  {
    id: "m15-3",
    moduleId: 15,
    difficulty: 2,
    stem: "O LANÇADOR de uma opção:",
    options: [
      "Paga o prêmio e adquire um direito",
      "Recebe o prêmio e assume a obrigação",
      "Não tem qualquer obrigação",
      "Sempre obtém lucro na operação",
    ],
    correct: 1,
    explanation:
      "O lançador (vendedor) recebe o prêmio e assume a obrigação de honrar a opção, se exercida. Por isso deposita margem de garantia.",
    tags: ["opções", "lançador"],
  },
  {
    id: "m15-4",
    moduleId: 15,
    difficulty: 1,
    stem: "Usar derivativos para PROTEGER uma posição contra oscilações de preço chama-se:",
    options: ["Especulação", "Arbitragem", "Hedge", "Alavancagem"],
    correct: 2,
    explanation:
      "Hedge é proteção. Especulação busca lucro com a oscilação; arbitragem explora distorções de preço.",
    tags: ["hedge"],
  },
  {
    id: "m15-5",
    moduleId: 15,
    difficulty: 1,
    stem: "O mecanismo de ajuste diário é característico do mercado:",
    options: ["A termo", "Futuro", "De opções", "À vista"],
    correct: 1,
    explanation:
      "O ajuste diário é típico do mercado futuro: ganhos e perdas são apurados e creditados/debitados a cada dia.",
    tags: ["futuro", "ajuste diário"],
  },
  {
    id: "m15-6",
    moduleId: 15,
    difficulty: 2,
    stem: "Um swap é uma operação de:",
    options: [
      "Compra de ações no mercado à vista",
      "Troca de fluxos financeiros / indexadores entre as partes",
      "Custódia de títulos públicos",
      "Empréstimo bancário com garantia",
    ],
    correct: 1,
    explanation:
      "Swap é a troca de fluxos de caixa/indexadores (ex.: trocar uma taxa prefixada por CDI) entre duas partes.",
    tags: ["swap"],
  },
  {
    id: "m15-7",
    moduleId: 15,
    difficulty: 2,
    stem: "A estratégia que busca lucro praticamente sem risco, aproveitando distorções de preço entre mercados, é a:",
    options: ["Hedge", "Especulação", "Arbitragem", "Diversificação"],
    correct: 2,
    explanation:
      "Arbitragem aproveita diferenças de preço de um mesmo ativo em mercados distintos, buscando lucro sem risco.",
    tags: ["arbitragem"],
  },
];

export function questionsByModule(moduleId: number): Question[] {
  return QUESTIONS.filter((q) => q.moduleId === moduleId);
}
