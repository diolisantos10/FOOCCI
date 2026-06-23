import type { Question } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Banco de questões ANCORD — LOTE 2 (expansão).
//
// Curado para precisão e calibrado pelos pesos reais da prova: reforço pesado no
// Módulo I (Atividade do AI — ~15% da prova, o maior bloco) e nos capítulos
// críticos. Conteúdo baseado no programa da ANCORD e na legislação vigente.
// As alternativas são embaralhadas em tempo de execução.
// ─────────────────────────────────────────────────────────────────────────────

export const QUESTIONS_EXTRA: Question[] = [
  // ── Módulo I — Atividade do Assessor de Investimento (CRÍTICO, ~12 questões) ─
  {
    id: "m1-7",
    moduleId: 1,
    difficulty: 2,
    stem: "A atividade de assessor de investimento pode ser exercida:",
    options: [
      "Apenas por pessoa física certificada",
      "Por pessoa física certificada ou por pessoa jurídica (escritório) constituída para esse fim",
      "Apenas por sociedade anônima de capital aberto",
      "Somente por funcionários de bancos",
    ],
    correct: 1,
    explanation:
      "O AI pode atuar como pessoa física certificada ou constituir uma pessoa jurídica (escritório de assessoria) registrada, cujos sócios responsáveis também sejam certificados.",
    tags: ["pf", "pj"],
  },
  {
    id: "m1-8",
    moduleId: 1,
    difficulty: 3,
    stem: "Sobre o vínculo do assessor de investimento com intermediários, a regulação vigente (Res. CVM 178):",
    options: [
      "Mantém a exclusividade obrigatória a um único intermediário",
      "Permite vínculo com mais de um intermediário, observadas as condições da norma",
      "Proíbe qualquer vínculo com intermediários",
      "Exige vínculo apenas com bancos",
    ],
    correct: 1,
    explanation:
      "A Resolução CVM 178 flexibilizou a exclusividade: o assessor pode se vincular a mais de um intermediário, desde que cumpridas as regras de transparência e organização. (Apostilas antigas ainda citam a exclusividade da CVM 497.)",
    tags: ["exclusividade", "regulação"],
  },
  {
    id: "m1-9",
    moduleId: 1,
    difficulty: 2,
    stem: "Constitui atividade VEDADA ao assessor de investimento:",
    options: [
      "Transmitir ao intermediário as ordens recebidas dos clientes",
      "Atuar como consultor de valores mobiliários, recomendando investimentos como atividade própria",
      "Prospectar e captar clientes",
      "Divulgar informações sobre os produtos do intermediário",
    ],
    correct: 1,
    explanation:
      "Consultoria e recomendação de valores mobiliários são atividades privativas do consultor (com registro próprio), vedadas ao assessor de investimento.",
    tags: ["vedações", "consultoria"],
  },
  {
    id: "m1-10",
    moduleId: 1,
    difficulty: 1,
    stem: "A certificação que habilita o exercício da atividade de assessor de investimento é concedida pela:",
    options: ["CVM", "ANBIMA", "ANCORD", "B3"],
    correct: 2,
    explanation:
      "A ANCORD é a entidade credenciada que aplica o exame de certificação; o registro do profissional é feito junto à CVM.",
    tags: ["certificação"],
  },
  {
    id: "m1-11",
    moduleId: 1,
    difficulty: 2,
    stem: "Em relação a dinheiro e valores mobiliários dos clientes, o assessor de investimento:",
    options: [
      "Pode receber e custodiar temporariamente",
      "Não pode receber, entregar ou manter sob sua guarda recursos ou valores de clientes",
      "Pode receber apenas cheques nominais",
      "Pode custodiar se houver autorização por escrito",
    ],
    correct: 1,
    explanation:
      "É vedado ao AI ter qualquer custódia ou movimentação de recursos/valores dos clientes — isso passa pela instituição intermediária.",
    tags: ["vedações", "custódia"],
  },
  {
    id: "m1-12",
    moduleId: 1,
    difficulty: 3,
    stem: "A responsabilidade regulatória pela análise de perfil (suitability) e adequação dos produtos é, em última instância, de quem?",
    options: [
      "Do assessor de investimento isoladamente",
      "Do intermediário (instituição) ao qual o assessor está vinculado",
      "Da ANCORD",
      "Do próprio cliente",
    ],
    correct: 1,
    explanation:
      "O dever de suitability é da instituição intermediária. O AI participa da distribuição, mas a responsabilidade perante o regulador é do intermediário.",
    tags: ["suitability", "responsabilidade"],
  },
  {
    id: "m1-13",
    moduleId: 1,
    difficulty: 2,
    stem: "O assessor de investimento pode cobrar remuneração diretamente do cliente pela indicação de produtos?",
    options: [
      "Sim, livremente",
      "Não — ele é remunerado pelo intermediário ao qual presta serviço",
      "Sim, desde que comunique à ANCORD",
      "Sim, na forma de corretagem própria",
    ],
    correct: 1,
    explanation:
      "A remuneração do AI vem do intermediário contratante (normalmente repasse de receitas), não de cobrança direta ao cliente.",
    tags: ["remuneração"],
  },
  {
    id: "m1-14",
    moduleId: 1,
    difficulty: 1,
    stem: "Para exercer a atividade, o registro do assessor de investimento perante a CVM é:",
    options: [
      "Dispensável, se tiver a certificação",
      "Obrigatório",
      "Substituído pela certificação ANCORD",
      "Feito pela B3",
    ],
    correct: 1,
    explanation:
      "Além da certificação, o registro na CVM é obrigatório para o exercício da atividade.",
    tags: ["registro"],
  },

  // ── Módulo II — Ética ───────────────────────────────────────────────────────
  {
    id: "m2-6",
    moduleId: 2,
    difficulty: 2,
    stem: "Operar em benefício próprio antecipando-se a uma ordem de cliente ('front running') é:",
    options: [
      "Uma prática recomendada de eficiência",
      "Uma conduta vedada e antiética",
      "Permitido para clientes qualificados",
      "Indiferente do ponto de vista ético",
    ],
    correct: 1,
    explanation:
      "Front running é uso indevido de informação privilegiada sobre ordens de clientes — conduta vedada e antiética.",
    tags: ["front running"],
  },
  {
    id: "m2-7",
    moduleId: 2,
    difficulty: 1,
    stem: "O dever de informação do assessor implica:",
    options: [
      "Destacar apenas os pontos positivos do produto",
      "Prestar informações completas, claras e verdadeiras, inclusive sobre riscos e custos",
      "Informar somente se o cliente perguntar",
      "Omitir custos para não desmotivar",
    ],
    correct: 1,
    explanation:
      "Transparência total — riscos, custos e características — é parte do dever de informação e da boa-fé.",
    tags: ["dever de informação"],
  },
  {
    id: "m2-8",
    moduleId: 2,
    difficulty: 2,
    stem: "Receber benefícios/presentes que possam comprometer a imparcialidade do profissional:",
    options: [
      "É sempre permitido",
      "Deve ser evitado, por configurar conflito de interesses",
      "É indiferente para a ética",
      "Só é problema se for em dinheiro",
    ],
    correct: 1,
    explanation:
      "Benefícios capazes de comprometer a isenção do profissional configuram conflito de interesses e devem ser evitados.",
    tags: ["conflito de interesses"],
  },

  // ── Módulo III — Lavagem de Dinheiro ────────────────────────────────────────
  {
    id: "m3-7",
    moduleId: 3,
    difficulty: 2,
    stem: "A fase de 'integração' na lavagem de dinheiro corresponde a:",
    options: [
      "Inserir inicialmente o dinheiro ilícito no sistema",
      "Incorporar os recursos à economia já com aparência de origem lícita",
      "Multiplicar transações para apagar a trilha",
      "Comunicar a operação ao COAF",
    ],
    correct: 1,
    explanation:
      "Integração é a última fase: o recurso retorna ao agente com aparência legítima (ex.: investido em negócios, imóveis).",
    tags: ["fases"],
  },
  {
    id: "m3-8",
    moduleId: 3,
    difficulty: 2,
    stem: "No contexto da prevenção à lavagem, o 'Conheça seu Cliente' exige:",
    options: [
      "Apenas o nome do cliente",
      "Identificar, qualificar e conhecer a atividade do cliente e a compatibilidade das operações com seu perfil",
      "Somente o número do CPF",
      "Nada além da assinatura do contrato",
    ],
    correct: 1,
    explanation:
      "O KYC vai além do cadastro: avalia se as operações são compatíveis com a capacidade econômica e o perfil do cliente.",
    tags: ["kyc"],
  },
  {
    id: "m3-9",
    moduleId: 3,
    difficulty: 3,
    stem: "A obrigação de comunicar operações às autoridades:",
    options: [
      "Depende sempre de suspeita subjetiva",
      "Pode decorrer de suspeita OU de atingir valores/limites objetivos previstos na norma",
      "É facultativa para a instituição",
      "Só ocorre mediante ordem judicial",
    ],
    correct: 1,
    explanation:
      "Há comunicações por suspeita e comunicações automáticas por critérios objetivos (valores/limites) definidos na regulação.",
    tags: ["comunicação"],
  },

  // ── Módulo IV — Economia ────────────────────────────────────────────────────
  {
    id: "m4-5",
    moduleId: 4,
    difficulty: 1,
    stem: "A política FISCAL diz respeito a:",
    options: [
      "Definição da taxa Selic pelo Copom",
      "Decisões de gastos públicos e de tributação pelo governo",
      "Compra e venda de dólares pelo Banco Central",
      "Emissão de ações pelas empresas",
    ],
    correct: 1,
    explanation:
      "Política fiscal = governo gerindo receitas (tributos) e despesas. Juros são política monetária; câmbio é política cambial.",
    tags: ["política fiscal"],
  },
  {
    id: "m4-6",
    moduleId: 4,
    difficulty: 2,
    stem: "Uma desvalorização do real frente ao dólar tende a:",
    options: [
      "Baratear as importações",
      "Encarecer importações e estimular exportações",
      "Não afetar a inflação",
      "Reduzir o preço das commodities em reais",
    ],
    correct: 1,
    explanation:
      "Real mais fraco torna o produto importado mais caro (pressiona inflação) e o exportado mais competitivo lá fora.",
    tags: ["câmbio"],
  },

  // ── Módulo V — Estrutura do SFN ─────────────────────────────────────────────
  {
    id: "m5-5",
    moduleId: 5,
    difficulty: 2,
    stem: "A previdência complementar FECHADA (fundos de pensão) é fiscalizada pela:",
    options: ["SUSEP", "PREVIC", "CVM", "BACEN"],
    correct: 1,
    explanation:
      "PREVIC = previdência fechada (fundos de pensão). SUSEP cuida da previdência aberta e seguros.",
    tags: ["previc"],
  },
  {
    id: "m5-6",
    moduleId: 5,
    difficulty: 2,
    stem: "O subsistema NORMATIVO do SFN é responsável por:",
    options: [
      "Executar as operações financeiras do dia a dia",
      "Definir as regras e fiscalizar (CMN, BACEN, CVM)",
      "Apenas custodiar títulos",
      "Negociar ações em bolsa",
    ],
    correct: 1,
    explanation:
      "O subsistema normativo regula e fiscaliza; o operativo (bancos, corretoras, bolsa) executa as operações.",
    tags: ["normativo"],
  },

  // ── Módulo VI — Instituições ────────────────────────────────────────────────
  {
    id: "m6-6",
    moduleId: 6,
    difficulty: 2,
    stem: "Os bancos de investimento caracterizam-se por:",
    options: [
      "Captar depósitos à vista do público",
      "Atuar em operações de médio e longo prazo e no mercado de capitais, sem captar depósitos à vista",
      "Emitir papel-moeda",
      "Ser fiscalizados pela SUSEP",
    ],
    correct: 1,
    explanation:
      "Bancos de investimento não captam depósito à vista; focam crédito de longo prazo, repasses e mercado de capitais.",
    tags: ["banco de investimento"],
  },
  {
    id: "m6-7",
    moduleId: 6,
    difficulty: 2,
    stem: "A função de uma câmara de compensação e liquidação (clearing) é:",
    options: [
      "Definir a taxa básica de juros",
      "Garantir a liquidação das operações e reduzir o risco de contraparte",
      "Emitir ações das empresas",
      "Fiscalizar as corretoras",
    ],
    correct: 1,
    explanation:
      "A clearing assegura que as operações sejam liquidadas, atuando como contraparte central e mitigando o risco de inadimplência.",
    tags: ["clearing"],
  },

  // ── Módulo VII — Risco ──────────────────────────────────────────────────────
  {
    id: "m7-6",
    moduleId: 7,
    difficulty: 2,
    stem: "O risco operacional está relacionado a:",
    options: [
      "Oscilação de preços de mercado",
      "Falhas em processos, pessoas, sistemas ou eventos externos (inclusive fraudes)",
      "Inadimplência da contraparte",
      "Dificuldade de vender o ativo rapidamente",
    ],
    correct: 1,
    explanation:
      "Risco operacional vem de falhas internas/externas (processos, pessoas, sistemas, fraudes), não da variação de preços.",
    tags: ["risco operacional"],
  },
  {
    id: "m7-7",
    moduleId: 7,
    difficulty: 1,
    stem: "A diversificação de uma carteira reduz principalmente o risco:",
    options: ["Sistemático", "Não sistemático (específico)", "De mercado", "Soberano"],
    correct: 1,
    explanation:
      "Diversificar dilui o risco específico de cada ativo. O risco sistemático (de mercado) permanece.",
    tags: ["diversificação"],
  },

  // ── Módulo VIII — Mercado de Capitais (CRÍTICO) ─────────────────────────────
  {
    id: "m8-11",
    moduleId: 8,
    difficulty: 2,
    stem: "Em caso de liquidação da companhia, quanto ao reembolso de capital:",
    options: [
      "A ação ordinária tem preferência sobre a preferencial",
      "A ação preferencial tem preferência no reembolso de capital",
      "Ambas recebem exatamente ao mesmo tempo, sempre",
      "Nenhuma das ações dá direito a reembolso",
    ],
    correct: 1,
    explanation:
      "A preferencial (PN) costuma ter prioridade no reembolso de capital e nos dividendos; a ordinária dá voto.",
    tags: ["ações"],
  },
  {
    id: "m8-12",
    moduleId: 8,
    difficulty: 1,
    stem: "O 'free float' de uma empresa é:",
    options: [
      "O total de ações emitidas",
      "A parcela de ações em circulação no mercado (fora das mãos dos controladores)",
      "O dividendo distribuído no ano",
      "A taxa de corretagem cobrada",
    ],
    correct: 1,
    explanation:
      "Free float é o percentual das ações disponível para negociação livre no mercado; é exigido um mínimo nos segmentos de governança.",
    tags: ["free float"],
  },
  {
    id: "m8-13",
    moduleId: 8,
    difficulty: 2,
    stem: "O bônus de subscrição confere ao titular:",
    options: [
      "O direito de vender ações de volta ao emissor",
      "O direito de subscrever novas ações da companhia em condições preestabelecidas",
      "Uma renda fixa garantida",
      "Direito a voto nas assembleias",
    ],
    correct: 1,
    explanation:
      "Bônus de subscrição dá ao titular o direito de comprar (subscrever) novas ações em condições e prazos definidos.",
    tags: ["bônus de subscrição"],
  },
  {
    id: "m8-14",
    moduleId: 8,
    difficulty: 1,
    stem: "A primeira oferta pública de ações de uma empresa na bolsa é chamada de:",
    options: ["Follow-on", "IPO (Initial Public Offering)", "OPA", "Block trade"],
    correct: 1,
    explanation:
      "IPO é a abertura de capital (oferta inicial). Follow-on é uma oferta subsequente; OPA é oferta para aquisição/fechamento.",
    tags: ["ipo"],
  },
  {
    id: "m8-15",
    moduleId: 8,
    difficulty: 3,
    stem: "Do ponto de vista da empresa que paga, os Juros sobre Capital Próprio (JCP):",
    options: [
      "Não trazem nenhum benefício",
      "São dedutíveis do lucro tributável (vantagem fiscal para a empresa)",
      "São proibidos por lei",
      "São isentos de IR para o acionista pessoa física",
    ],
    correct: 1,
    explanation:
      "Para a empresa, o JCP é despesa dedutível (reduz o IR a pagar). Para o acionista PF, há retenção de 15% na fonte.",
    tags: ["jcp"],
  },
  {
    id: "m8-16",
    moduleId: 8,
    difficulty: 2,
    stem: "Vender ações que não se possui, tomando-as emprestado para entregar, é uma operação de:",
    options: [
      "Compra alavancada",
      "Venda a descoberto (short)",
      "Subscrição",
      "Bonificação",
    ],
    correct: 1,
    explanation:
      "Na venda a descoberto o investidor vende ativos alugados, apostando na queda; depois recompra para devolver.",
    tags: ["short"],
  },

  // ── Módulo IX — Fundos de Investimento ──────────────────────────────────────
  {
    id: "m9-7",
    moduleId: 9,
    difficulty: 2,
    stem: "A marcação a mercado das cotas de um fundo serve para:",
    options: [
      "Esconder perdas temporárias",
      "Refletir o valor atual dos ativos, evitando transferência de riqueza entre cotistas que entram e saem",
      "Calcular a taxa de administração",
      "Definir a data do come-cotas",
    ],
    correct: 1,
    explanation:
      "Marcar a mercado mantém o valor da cota justo a cada dia, de forma que ninguém entre/saia com vantagem indevida.",
    tags: ["marcação a mercado"],
  },
  {
    id: "m9-8",
    moduleId: 9,
    difficulty: 3,
    stem: "A 'barreira de informação' (chinese wall) em uma instituição financeira tem como objetivo:",
    options: [
      "Aumentar a taxa de performance",
      "Separar a gestão de recursos de terceiros das demais áreas, evitando conflito de interesses e uso indevido de informação",
      "Impedir resgates dos cotistas",
      "Definir o benchmark do fundo",
    ],
    correct: 1,
    explanation:
      "O chinese wall isola áreas para evitar conflito de interesses e vazamento de informação privilegiada.",
    tags: ["chinese wall"],
  },
  {
    id: "m9-9",
    moduleId: 9,
    difficulty: 3,
    stem: "Um fundo classificado como 'Renda Fixa' deve manter, no mínimo, da carteira em ativos do respectivo fator de risco:",
    options: ["51%", "80%", "67%", "100%"],
    correct: 1,
    explanation:
      "Os fundos de Renda Fixa devem manter no mínimo 80% da carteira em ativos relacionados ao fator de risco de juros/índice de preços.",
    tags: ["classificação", "renda fixa"],
  },
  {
    id: "m9-10",
    moduleId: 9,
    difficulty: 2,
    stem: "A taxa de administração de um fundo:",
    options: [
      "Só é cobrada no momento do resgate",
      "É cobrada sobre o patrimônio e já está descontada no valor da cota divulgado",
      "Incide apenas sobre o lucro do fundo",
      "É opcional para o administrador",
    ],
    correct: 1,
    explanation:
      "A taxa de administração é provisionada diariamente e já está refletida (descontada) no valor da cota. A rentabilidade divulgada é líquida dessa taxa.",
    tags: ["taxa de administração"],
  },

  // ── Módulo X — Outros Fundos ────────────────────────────────────────────────
  {
    id: "m10-4",
    moduleId: 10,
    difficulty: 2,
    stem: "O FIP (Fundo de Investimento em Participações) caracteriza-se por:",
    options: [
      "Investir apenas em títulos públicos",
      "Investir em participações em empresas (private equity), com influência na gestão",
      "Replicar um índice de bolsa",
      "Não ter nenhum risco",
    ],
    correct: 1,
    explanation:
      "O FIP investe em empresas (ações, debêntures conversíveis) participando da governança — é o veículo de private equity, em geral para investidor qualificado.",
    tags: ["fip"],
  },

  // ── Módulo XI — Securitização ───────────────────────────────────────────────
  {
    id: "m11-4",
    moduleId: 11,
    difficulty: 2,
    stem: "A securitização de recebíveis permite que uma empresa:",
    options: [
      "Emita ações ordinárias",
      "Antecipe recursos transformando recebíveis futuros em títulos negociáveis",
      "Capte depósitos à vista",
      "Reduza diretamente a alíquota dos seus tributos",
    ],
    correct: 1,
    explanation:
      "Securitizar é converter fluxos futuros (recebíveis) em títulos vendidos a investidores, antecipando caixa.",
    tags: ["securitização"],
  },

  // ── Módulo XII — Clubes de Investimento ─────────────────────────────────────
  {
    id: "m12-4",
    moduleId: 12,
    difficulty: 2,
    stem: "A administração de um clube de investimento deve ser feita por:",
    options: [
      "Qualquer cotista, livremente",
      "Uma corretora ou distribuidora (instituição autorizada), com registro na B3",
      "O Banco Central",
      "Um cotista estrangeiro",
    ],
    correct: 1,
    explanation:
      "O clube é administrado por instituição autorizada (corretora/DTVM) e registrado na B3; a gestão pode caber a profissional ou a cotistas, conforme o estatuto.",
    tags: ["administração"],
  },

  // ── Módulo XIII — Matemática Financeira ─────────────────────────────────────
  {
    id: "m13-6",
    moduleId: 13,
    difficulty: 2,
    stem: "Duas taxas são EQUIVALENTES quando:",
    options: [
      "São numericamente iguais",
      "Produzem o mesmo montante, no mesmo prazo, em regime de juros compostos",
      "Uma é exatamente o dobro da outra",
      "Estão expressas em moedas diferentes",
    ],
    correct: 1,
    explanation:
      "Taxas equivalentes geram o mesmo resultado para o mesmo período em juros compostos (conceito-chave do regime composto).",
    tags: ["taxa equivalente"],
  },
  {
    id: "m13-7",
    moduleId: 13,
    difficulty: 3,
    stem: "Em juros compostos, a taxa de 1% ao mês, ao longo de 12 meses, equivale a uma taxa anual de:",
    options: [
      "Exatamente 12%",
      "Aproximadamente 12,68% (maior que 12%)",
      "Menos de 12%",
      "1% ao ano",
    ],
    correct: 1,
    explanation:
      "(1,01)¹² − 1 ≈ 12,68%. No regime composto, a taxa anual equivalente supera a simples soma (12%).",
    tags: ["juros compostos"],
  },
  {
    id: "m13-8",
    moduleId: 13,
    difficulty: 1,
    stem: "O Valor Presente (VP) de um valor futuro é:",
    options: [
      "Sempre maior que o valor futuro",
      "O valor futuro descontado por uma taxa de juros",
      "Sempre igual ao valor futuro",
      "Independente da taxa de juros",
    ],
    correct: 1,
    explanation:
      "VP = VF descontado pela taxa no tempo. Quanto maior a taxa ou o prazo, menor o valor presente.",
    tags: ["valor presente"],
  },

  // ── Módulo XIV — Mercado Financeiro / Renda Fixa ────────────────────────────
  {
    id: "m14-7",
    moduleId: 14,
    difficulty: 1,
    stem: "O CDB é um título emitido por:",
    options: [
      "Empresas não financeiras",
      "Bancos, para captar recursos do público",
      "O Tesouro Nacional",
      "Companhias securitizadoras",
    ],
    correct: 1,
    explanation:
      "CDB (Certificado de Depósito Bancário) é emitido por bancos para captação; conta com a garantia do FGC.",
    tags: ["cdb"],
  },
  {
    id: "m14-8",
    moduleId: 14,
    difficulty: 1,
    stem: "Para a pessoa física, o rendimento da caderneta de poupança é:",
    options: [
      "Tributado em 15%",
      "Isento de Imposto de Renda",
      "Sujeito ao come-cotas",
      "Tributado em 22,5%",
    ],
    correct: 1,
    explanation:
      "A poupança é isenta de IR para PF e conta com cobertura do FGC.",
    tags: ["poupança"],
  },
  {
    id: "m14-9",
    moduleId: 14,
    difficulty: 2,
    stem: "A diferença entre LCI e LCA está principalmente:",
    options: [
      "Na tributação (uma é isenta e a outra não)",
      "No lastro: a LCI é imobiliário e a LCA é do agronegócio",
      "No fato de uma ser pública e outra privada",
      "No prazo, que é idêntico em ambas",
    ],
    correct: 1,
    explanation:
      "Ambas são isentas de IR para PF e têm FGC. A diferença é o lastro: imobiliário (LCI) x agronegócio (LCA).",
    tags: ["lci", "lca"],
  },
  {
    id: "m14-10",
    moduleId: 14,
    difficulty: 2,
    stem: "O Tesouro Prefixado é mais indicado quando o investidor:",
    options: [
      "Acredita em forte alta futura dos juros",
      "Quer travar uma taxa e acredita em queda ou estabilidade dos juros (e pode levar até o vencimento)",
      "Quer proteção direta contra a inflação",
      "Precisa de liquidez diária sem risco de oscilação de preço",
    ],
    correct: 1,
    explanation:
      "No prefixado a taxa é travada na compra. Se os juros sobem, o preço cai (marcação a mercado) — por isso combina com expectativa de queda/estabilidade.",
    tags: ["tesouro prefixado"],
  },
  {
    id: "m14-11",
    moduleId: 14,
    difficulty: 3,
    stem: "Na marcação a mercado de um título prefixado, se a taxa de juros do mercado SOBE, o preço do título:",
    options: ["Sobe", "Cai", "Permanece igual", "Vira zero"],
    correct: 1,
    explanation:
      "Preço e taxa andam em sentidos opostos: juros sobem → preço do título cai (e vice-versa). É o risco de mercado da renda fixa prefixada.",
    tags: ["marcação a mercado"],
  },
  {
    id: "m14-12",
    moduleId: 14,
    difficulty: 2,
    stem: "Sobre um CDB de banco pequeno que oferece taxa bem acima da média:",
    options: [
      "Não há risco algum, pois o FGC é ilimitado",
      "Há maior risco de crédito do emissor, mitigado pelo FGC até R$ 250 mil por CPF/instituição",
      "O rendimento é isento de IR",
      "É garantido diretamente pelo Tesouro Nacional",
    ],
    correct: 1,
    explanation:
      "Taxa alta costuma remunerar maior risco de crédito. O FGC protege até R$ 250 mil (teto de R$ 1 mi/4 anos) — atenção a concentrar acima disso.",
    tags: ["risco de crédito", "fgc"],
  },

  // ── Módulo XV — Derivativos (CRÍTICO) ───────────────────────────────────────
  {
    id: "m15-8",
    moduleId: 15,
    difficulty: 1,
    stem: "No mercado A TERMO de ações, a liquidação financeira ocorre:",
    options: [
      "Diariamente, por ajuste",
      "No vencimento do contrato",
      "Apenas se a ação subir",
      "Nunca há liquidação",
    ],
    correct: 1,
    explanation:
      "No termo não há ajuste diário: a liquidação acontece no vencimento, pelo preço acordado.",
    tags: ["termo"],
  },
  {
    id: "m15-9",
    moduleId: 15,
    difficulty: 2,
    stem: "Quem tem uma dívida em dólar e compra contratos futuros de dólar para se proteger de uma alta da moeda está fazendo:",
    options: ["Especulação", "Hedge", "Arbitragem", "Subscrição"],
    correct: 1,
    explanation:
      "Trata-se de hedge: usar o derivativo para neutralizar o risco de variação cambial sobre a dívida.",
    tags: ["hedge"],
  },
  {
    id: "m15-10",
    moduleId: 15,
    difficulty: 1,
    stem: "O valor pago pelo titular de uma opção ao lançador é chamado de:",
    options: ["Margem", "Prêmio", "Ajuste", "Strike"],
    correct: 1,
    explanation:
      "O prêmio é o preço da opção, pago pelo titular (comprador) ao lançador (vendedor).",
    tags: ["prêmio"],
  },
  {
    id: "m15-11",
    moduleId: 15,
    difficulty: 1,
    stem: "O preço de exercício de uma opção também é conhecido como:",
    options: ["Prêmio", "Strike", "Ajuste diário", "Spread"],
    correct: 1,
    explanation:
      "Strike é o preço de exercício — o valor pelo qual o titular pode comprar (call) ou vender (put) o ativo.",
    tags: ["strike"],
  },
  {
    id: "m15-12",
    moduleId: 15,
    difficulty: 3,
    stem: "Uma opção de compra (call) está 'dentro do dinheiro' (in the money) quando:",
    options: [
      "O preço do ativo está abaixo do strike",
      "O preço do ativo está acima do preço de exercício (strike)",
      "O prêmio é igual a zero",
      "A opção já venceu sem valor",
    ],
    correct: 1,
    explanation:
      "Numa call, in the money = preço do ativo acima do strike (vale a pena exercer). Numa put é o contrário.",
    tags: ["opções", "in the money"],
  },
];
