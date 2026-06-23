import type { Flashcard } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Flashcards ANCORD — fatos de alto rendimento, para revisão por repetição
// espaçada (SRS). Frente = pergunta/gatilho; verso = resposta enxuta.
// ─────────────────────────────────────────────────────────────────────────────

export const FLASHCARDS: Flashcard[] = [
  // Módulo I
  { id: "f1-1", moduleId: 1, front: "O que é VEDADO ao assessor de investimento?", back: "Gerir/administrar carteira, ter custódia de valores do cliente, receber procuração para operar, atuar como contraparte e dar recomendação/consultoria." },
  { id: "f1-2", moduleId: 1, front: "Quem responde pelos atos do AI perante o cliente?", back: "O intermediário contratante (corretora/distribuidora/banco)." },
  { id: "f1-3", moduleId: 1, front: "O que o AI precisa para atuar?", back: "Certificação ANCORD + registro na CVM. Atua vinculado a um intermediário." },
  { id: "f1-4", moduleId: 1, front: "Norma que regula a atividade do AI hoje?", back: "Resolução CVM 178 (substituiu a Instrução CVM 497)." },

  // Módulo II
  { id: "f2-1", moduleId: 2, front: "Suitability é...", back: "Recomendar/distribuir apenas produtos ADEQUADOS ao perfil, objetivos e situação financeira do cliente." },
  { id: "f2-2", moduleId: 2, front: "Diante de conflito de interesses, o AI deve...", back: "Priorizar o interesse do cliente e revelar o conflito." },
  { id: "f2-3", moduleId: 2, front: "KYC ('Conheça seu Cliente') serve para...", back: "Identificar e conhecer o cliente — base do suitability e da prevenção à lavagem." },
  { id: "f2-4", moduleId: 2, front: "Churning é...", back: "Giro excessivo da carteira só para gerar corretagem. Conduta VEDADA." },

  // Módulo III
  { id: "f3-1", moduleId: 3, front: "As 3 fases da lavagem de dinheiro", back: "Colocação → Ocultação (estratificação) → Integração." },
  { id: "f3-2", moduleId: 3, front: "Órgão central de combate à lavagem", back: "COAF (recebe as comunicações de operações suspeitas)." },
  { id: "f3-3", moduleId: 3, front: "Operação suspeita: o que fazer?", back: "Comunicar ao COAF SEM avisar o cliente. Não comunicar gera responsabilização." },
  { id: "f3-4", moduleId: 3, front: "Crimes antecedentes à lavagem (Lei 12.683/12)", back: "Qualquer infração penal pode ser antecedente (acabou o rol taxativo)." },
  { id: "f3-5", moduleId: 3, front: "Prazo mínimo de guarda de registros (PLD)", back: "5 anos (pode ser estendido pela autoridade)." },

  // Módulo IV
  { id: "f4-1", moduleId: 4, front: "Quem define a Selic meta?", back: "O COPOM (Comitê de Política Monetária do BACEN)." },
  { id: "f4-2", moduleId: 4, front: "Índice oficial de inflação?", back: "IPCA (referência da meta de inflação)." },
  { id: "f4-3", moduleId: 4, front: "Para conter a inflação, a Selic...", back: "Sobe (encarece o crédito e esfria o consumo)." },

  // Módulo V
  { id: "f5-1", moduleId: 5, front: "Órgão máximo e normativo do SFN", back: "CMN — Conselho Monetário Nacional (normatiza, não executa)." },
  { id: "f5-2", moduleId: 5, front: "Quem regula o mercado de valores mobiliários?", back: "CVM (ações, fundos, debêntures)." },
  { id: "f5-3", moduleId: 5, front: "SUSEP x PREVIC", back: "SUSEP: seguros e previdência ABERTA. PREVIC: previdência FECHADA (fundos de pensão)." },
  { id: "f5-4", moduleId: 5, front: "O que o BACEN faz?", back: "Executa a política monetária e supervisiona as instituições financeiras." },

  // Módulo VI
  { id: "f6-1", moduleId: 6, front: "Marca do banco comercial", back: "Capta depósitos à vista e cria moeda escritural." },
  { id: "f6-2", moduleId: 6, front: "SELIC (sistema) x B3/CETIP", back: "SELIC: custódia de títulos públicos federais. B3 (ex-CETIP): títulos privados." },
  { id: "f6-3", moduleId: 6, front: "Banco múltiplo precisa de...", back: "No mínimo 2 carteiras, sendo uma comercial ou de investimento." },

  // Módulo VII
  { id: "f7-1", moduleId: 7, front: "Risco sistemático x não sistemático", back: "Sistemático: afeta todo o mercado, NÃO diversificável. Não sistemático: específico, diversificável." },
  { id: "f7-2", moduleId: 7, front: "Limite de cobertura do FGC", back: "R$ 250 mil por CPF por instituição; teto de R$ 1 milhão a cada 4 anos." },
  { id: "f7-3", moduleId: 7, front: "O FGC NÃO cobre...", back: "Fundos de investimento, debêntures e títulos públicos." },
  { id: "f7-4", moduleId: 7, front: "O FGC cobre...", back: "Poupança, CDB, LCI, LCA, LC e depósitos à vista/prazo." },

  // Módulo VIII
  { id: "f8-1", moduleId: 8, front: "Ação ON x PN", back: "ON: direito a voto. PN: preferência em dividendos/reembolso (geralmente sem voto)." },
  { id: "f8-2", moduleId: 8, front: "Tag along (mínimo legal / Novo Mercado)", back: "Mínimo 80% do valor pago ao controlador; Novo Mercado: 100%." },
  { id: "f8-3", moduleId: 8, front: "Garantia firme x melhores esforços", back: "Firme: banco garante a colocação total (risco do banco). Melhores esforços: sem garantia (risco do emissor)." },
  { id: "f8-4", moduleId: 8, front: "Mercado primário x secundário", back: "Primário: empresa capta recursos (IPO). Secundário: investidores negociam entre si, empresa não recebe nada." },
  { id: "f8-5", moduleId: 8, front: "IR em ações: swing trade x day trade", back: "Swing trade: 15%. Day trade: 20%. Isenção até R$ 20 mil/mês de vendas (só fora do day trade)." },
  { id: "f8-6", moduleId: 8, front: "Dividendos x JCP (tributação PF)", back: "Dividendos: isentos de IR. JCP: 15% retido na fonte." },

  // Módulo IX
  { id: "f9-1", moduleId: 9, front: "Administrador x Gestor do fundo", back: "Administrador: responsável legal. Gestor: decide as compras/vendas." },
  { id: "f9-2", moduleId: 9, front: "Come-cotas: quando e quanto?", back: "Maio e novembro: 15% (longo prazo) ou 20% (curto prazo). Fundo de ações NÃO tem come-cotas." },
  { id: "f9-3", moduleId: 9, front: "Fundo aberto x fechado", back: "Aberto: aplica/resgata com o fundo. Fechado: cotas negociadas no secundário." },

  // Módulo X
  { id: "f10-1", moduleId: 10, front: "FII: isenção de IR dos rendimentos para PF", back: "Cotas em bolsa, ≥50 cotistas e cotista com <10% das cotas. Ganho na venda da cota: 20%." },
  { id: "f10-2", moduleId: 10, front: "FIDC: cota sênior x subordinada", back: "Sênior tem prioridade; subordinada absorve as perdas primeiro." },

  // Módulo XI
  { id: "f11-1", moduleId: 11, front: "Quem emite CRI e CRA?", back: "Companhias securitizadoras (CRI = imobiliário; CRA = agronegócio)." },
  { id: "f11-2", moduleId: 11, front: "Isenção de IR para PF (lista clássica)", back: "LCI, LCA, CRI, CRA, debênture incentivada e poupança. (Nenhum tem FGC, exceto LCI/LCA e poupança.)" },

  // Módulo XII
  { id: "f12-1", moduleId: 12, front: "Clube de investimento: nº de cotistas e limite", back: "Mín. 3, máx. 50 cotistas; um cotista no máximo 40% das cotas." },
  { id: "f12-2", moduleId: 12, front: "Clube: mínimo em ações", back: "Pelo menos 67% do patrimônio em ações e ativos ligados a ações." },

  // Módulo XIII
  { id: "f13-1", moduleId: 13, front: "Juros simples x compostos", back: "Simples: incide só sobre o principal (linear). Compostos: juros sobre juros (exponencial)." },
  { id: "f13-2", moduleId: 13, front: "Taxa proporcional x equivalente", back: "Proporcional: juros simples (12% a.a. = 1% a.m.). Equivalente: juros compostos." },
  { id: "f13-3", moduleId: 13, front: "Taxa real (Fisher)", back: "(1+real) = (1+nominal)/(1+inflação). Se inflação > nominal → real negativa." },

  // Módulo XIV
  { id: "f14-1", moduleId: 14, front: "Tabela regressiva de IR (renda fixa)", back: "22,5% (até 180d) · 20% (181–360) · 17,5% (361–720) · 15% (>720d)." },
  { id: "f14-2", moduleId: 14, front: "IOF na renda fixa", back: "Regressivo nos primeiros 30 dias; zera a partir do 30º dia." },
  { id: "f14-3", moduleId: 14, front: "Tesouro: Selic x Prefixado x IPCA+", back: "Selic: pós-fixado, baixa volatilidade. Prefixado: taxa travada. IPCA+: protege da inflação." },
  { id: "f14-4", moduleId: 14, front: "Renda fixa isenta de IR para PF", back: "LCI e LCA (além de CRI, CRA, debênture incentivada e poupança)." },

  // Módulo XV
  { id: "f15-1", moduleId: 15, front: "Futuro x a termo (diferença-chave)", back: "Futuro: ajuste diário + margem. A termo: liquida só no vencimento." },
  { id: "f15-2", moduleId: 15, front: "Titular x lançador de opção", back: "Titular: paga prêmio, tem o direito. Lançador: recebe prêmio, tem a obrigação (deposita margem)." },
  { id: "f15-3", moduleId: 15, front: "Call x Put", back: "Call: opção de COMPRA. Put: opção de VENDA." },
  { id: "f15-4", moduleId: 15, front: "Hedge x especulação x arbitragem", back: "Hedge: proteção. Especulação: lucrar com a oscilação. Arbitragem: lucro sem risco em distorções de preço." },
];

export function flashcardsByModule(moduleId: number): Flashcard[] {
  return FLASHCARDS.filter((f) => f.moduleId === moduleId);
}
