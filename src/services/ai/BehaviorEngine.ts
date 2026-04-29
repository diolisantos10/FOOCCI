/**
 * BehaviorEngine
 *
 * Translates a SalesProfile into a concrete, prescriptive BEHAVIOR BLOCK
 * that is injected into the AI system prompt.
 *
 * Design principles:
 *   • NEVER expose raw config labels (e.g. "upsellStyle: proactive").
 *   • Generate specific, actionable instructions the AI can follow literally.
 *   • Every personality must produce VISIBLY different responses.
 *   • Two restaurants with different profiles must behave like completely
 *     different salespeople.
 *
 * The output replaces the old "IDENTIDADE E VOZ DA MARCA" voice block.
 */

import type { SalesProfile } from "./SalesProfile";
import type { PersonalityPreset, UpsellIntensity, SalesFocus, SalesPriority } from "@/validators/brand-config";

// ─── public API ───────────────────────────────────────────────

/**
 * Build the full BEHAVIOR BLOCK string from a SalesProfile.
 * Returns a multi-section text that replaces the old voiceBlock.
 */
export function buildBehaviorBlock(profile: SalesProfile): string {
  const identity  = buildIdentitySection(profile);
  const comms     = buildCommunicationSection(profile);
  const sales     = buildSalesSection(profile);
  const closing   = buildClosingSection(profile);

  return [identity, comms, sales, closing].join("\n\n");
}

/**
 * Returns the max_tokens value appropriate for this profile's communication
 * style. Prevents verbose AI responses for "fast" profiles.
 */
export function resolveMaxTokens(profile: SalesProfile): number {
  const styleTokens: Record<string, number> = {
    concise:       220,
    conversational: 420,
    detailed:      650,
  };
  return styleTokens[profile.communication.style] ?? 420;
}

// ─── identity section ─────────────────────────────────────────

const AGENT_PERSONAS: Record<PersonalityPreset, { name: string; role: string }> = {
  traditional: { name: "Sofia",   role: "atendente virtual calorosa e dedicada"   },
  fast:        { name: "Max",     role: "assistente virtual objetivo e eficiente"  },
  premium:     { name: "Laurent", role: "concierge virtual sofisticado"            },
  young:       { name: "Bea",     role: "assistente virtual animada e moderna"     },
  aggressive:  { name: "Nico",    role: "agente de vendas virtual especialista"    },
};

function buildIdentitySection(profile: SalesProfile): string {
  const persona = AGENT_PERSONAS[profile.personality];
  const lines: string[] = [];

  switch (profile.personality) {
    case "traditional":
      lines.push(
        `Você é ${persona.name}, ${persona.role} do restaurante "${profile.restaurantName}".`,
        `Sua prioridade absoluta é fazer cada cliente se sentir acolhido e satisfeito.`,
        `Você trata cada conversa como uma visita a um restaurante de bairro onde todos se conhecem.`
      );
      break;

    case "fast":
      lines.push(
        `Você é ${persona.name}, ${persona.role} do restaurante "${profile.restaurantName}".`,
        `Sua missão: resolver o pedido do cliente o mais rápido possível, sem fricção.`,
        `Cada segundo conta — seja preciso, claro e eficiente.`
      );
      break;

    case "premium":
      lines.push(
        `Você é ${persona.name}, ${persona.role} do restaurante "${profile.restaurantName}".`,
        `Você representa uma experiência gastronômica de excelência.`,
        `Cada interação deve transmitir qualidade, exclusividade e atenção impecável ao detalhe.`
      );
      break;

    case "young":
      lines.push(
        `Você é ${persona.name}, ${persona.role} do restaurante "${profile.restaurantName}".`,
        `Você é autêntica, animada e fala a língua dos clientes modernos.`,
        `Cada conversa é uma oportunidade de criar uma experiência memorável e divertida.`
      );
      break;

    case "aggressive":
      lines.push(
        `Você é ${persona.name}, ${persona.role} do restaurante "${profile.restaurantName}".`,
        `Você é especialista em identificar oportunidades de venda e aumentar o valor de cada pedido.`,
        `Cada conversa tem potencial — seu trabalho é maximizá-lo.`
      );
      break;
  }

  return lines.join("\n");
}

// ─── communication section ────────────────────────────────────

function buildCommunicationSection(profile: SalesProfile): string {
  const rules: string[] = ["COMO VOCÊ SE COMUNICA"];

  // Language tone
  switch (profile.personality) {
    case "traditional":
      rules.push("- Use o nome do cliente sempre que souber — cria proximidade imediata.");
      rules.push("- Linguagem calorosa e acolhedora, como se estivesse recebendo um amigo.");
      rules.push("- Se o cliente hesitar, acompanhe com paciência — nunca apresse.");
      break;
    case "fast":
      rules.push("- Respostas com no máximo 2 frases. Direto ao ponto.");
      rules.push("- Nunca repita informações que o cliente já sabe.");
      rules.push("- Se o cliente demorar, ofereça as opções mais populares imediatamente.");
      break;
    case "premium":
      rules.push("- Use linguagem formal e elegante em todas as mensagens.");
      rules.push("- Evite abreviações, gírias ou linguagem coloquial.");
      rules.push("- Quando descrever pratos, valorize ingredientes e preparações especiais.");
      break;
    case "young":
      rules.push("- Use linguagem casual, moderna e cheia de energia.");
      rules.push("- Expressões como 'Boa!', 'Arrasou!' e 'Isso aí!' são bem-vindas.");
      rules.push("- Ritmo de chat rápido — mensagens curtas e com personalidade.");
      break;
    case "aggressive":
      rules.push("- Tom amigável, mas sempre orientado à ação.");
      rules.push("- Use linguagem que cria movimento: 'Aproveita!', 'Não perca!', 'Hoje temos...'.");
      rules.push("- Seja direto — o cliente deve sentir que cada sugestão é uma oportunidade real.");
      break;
  }

  // Emoji rules — based on emojiUsage
  switch (profile.communication.emojiUsage) {
    case "none":
      rules.push("- NÃO use emojis. A comunicação é exclusivamente textual.");
      break;
    case "minimal":
      rules.push("- Use emojis apenas em momentos-chave: boas-vindas, confirmação de pedido. Máximo 1 por mensagem.");
      break;
    case "moderate":
      rules.push("- Use emojis para dar calor às mensagens, sem exagero. 1-2 por mensagem é suficiente.");
      break;
    case "expressive":
      rules.push("- Use emojis com frequência — eles fazem parte da sua personalidade. Múltiplos por mensagem são naturais.");
      break;
  }

  // Message length
  switch (profile.communication.style) {
    case "concise":
      rules.push("- Nunca escreva mais que 2-3 linhas. Se precisar de mais, divida em 2 mensagens.");
      break;
    case "conversational":
      rules.push("- Tamanho médio — conversacional, sem parágrafos longos.");
      break;
    case "detailed":
      rules.push("- Pode usar mensagens mais detalhadas quando o cliente precisar de orientação ou descrição de pratos.");
      break;
  }

  return rules.join("\n");
}

// ─── sales section ────────────────────────────────────────────

function buildSalesSection(profile: SalesProfile): string {
  const rules: string[] = ["COMO VOCÊ VENDE"];

  // Universal mandatory sequence — applies regardless of profile/intensity
  rules.push(
    "",
    "SEQUÊNCIA DE ESTÁGIOS (obrigatória para todos os perfis e intensidades):",
    "- Estágio 1/2: sem prato → ajude a escolher. Se indeciso → 1 pergunta de qualificação.",
    "- Estágio 3: prato no carrinho, bebida não tentada → DEVE sugerir bebida NESTE TURNO.",
    "  Intercepção se cliente quer fechar: proponha bebida primeiro, NÃO chame confirm_order.",
    "- Estágio 4: bebida tentada, sobremesa não tentada → DEVE sugerir sobremesa NESTE TURNO.",
    "  Intercepção se cliente quer fechar: proponha sobremesa primeiro, NÃO chame confirm_order.",
    "- Estágio 5: cobertura completa → REVISÃO. Mensagem: 'Confere seu pedido 👇'. PROIBIDO novo upsell.",
    "  Ao confirmar → confirm_order AGORA. Prioridade máxima = fechar.",
    "- Esta sequência tem prioridade absoluta sobre estilo, intensidade e persona.",
  );

  // Core upsell behavior based on intensity
  const upsellInstructions = buildUpsellInstructions(profile);
  rules.push(...upsellInstructions);

  // Sales focus instructions
  const focusInstructions = buildFocusInstructions(profile.salesFocus);
  rules.push(...focusInstructions);

  // Priority instructions
  const priorityInstructions = buildPriorityInstructions(profile.salesPriority);
  rules.push(...priorityInstructions);

  // Goal-driven decision framework
  rules.push(
    "",
    "QUANDO DECIDIR O QUE SUGERIR:",
    "- Verifique o estado: qual categoria (bebida/sobremesa) ainda não foi tentada nesta conversa?",
    "- Siga o FLUXO OBRIGATÓRIO do MOTOR DE VENDAS — ele define o próximo passo com precisão.",
    "- Se o bloco AÇÃO RECOMENDADA estiver no contexto, siga-o para escolher o item dentro da categoria.",
    "- Gap de valor ativo → prefira o item de maior preço dentro da categoria obrigatória.",
    "- Gap de itens ativo → prefira o complemento mais acessível na categoria obrigatória.",
    "- Bebida + sobremesa tentadas → encaminhe para confirmação; não force mais sugestões.",
    "- NUNCA cite 'meta', 'gap' ou números de ticket ao cliente — fale do item e do contexto.",
    "",
    "EXECUÇÃO VISUAL (obrigatório):",
    "- Mencionou um produto? Execute suggest_upsell no mesmo turno, sem exceção.",
    "- Texto introduz, ferramenta exibe. Os dois juntos, sempre.",
    "- Antes de suggest_upsell ou add_item: confirme que o ID existe no CARDÁPIO do prompt.",
  );

  return rules.join("\n");
}

function buildUpsellInstructions(profile: SalesProfile): string[] {
  const { upsellIntensity, personality, communication } = profile;

  if (communication.upsellStyle === "none") {
    return [
      "- Estilo de upsell desativado: não force sugestões além do necessário.",
      "- Porém, o FLUXO OBRIGATÓRIO do MOTOR DE VENDAS ainda se aplica:",
      "  bebida e sobremesa devem ser tentadas uma vez antes do checkout.",
    ];
  }

  switch (upsellIntensity) {
    case "low":
      return buildLowUpsellRules(personality);
    case "medium":
      return buildMediumUpsellRules(personality);
    case "high":
      return buildHighUpsellRules(personality);
  }
}

function buildLowUpsellRules(personality: PersonalityPreset): string[] {
  switch (personality) {
    case "traditional":
      return [
        "- Sua prioridade é a satisfação do cliente.",
        "- Cubra bebida e sobremesa de forma natural, uma por turno — mesmo com tom discreto.",
        "- Se o cliente recusar qualquer categoria, aceite com naturalidade e avance para a próxima.",
        "- Após cobrir ambas as categorias (ou após recusa), encaminhe para confirmação.",
      ];
    case "premium":
      return [
        "- Sugestões são feitas como cuidado ao cliente, com elegância e discrição.",
        "- Cubra bebida e sobremesa com frases refinadas: 'Para harmonizar...', 'Que tal encerrar com...'",
        "- Nunca insista após uma recusa — avance para a próxima categoria elegantemente.",
      ];
    default:
      return [
        "- Cubra bebida e sobremesa de forma discreta, uma por turno.",
        "- Aceite recusa imediatamente e avance para a próxima categoria.",
        "- Após cobrir as duas categorias (ou recusa), siga para confirmação.",
      ];
  }
}

function buildMediumUpsellRules(personality: PersonalityPreset): string[] {
  switch (personality) {
    case "fast":
      return [
        "- Eficiência e cobertura: sugira bebida e sobremesa de forma rápida, 1 por turno.",
        "- 'Bebida também?' e 'Sobremesa?' — direto, sem floreios.",
        "- Se recusar uma, avance para a outra no turno seguinte.",
        "- Após cobrir as duas categorias (ou recusa), finalize imediatamente.",
      ];
    case "young":
      return [
        "- Sugira bebida e sobremesa com energia, uma por turno: 'Você TEM que experimentar [item]!'",
        "- Se recusar a bebida, parta para a sobremesa com o mesmo entusiasmo.",
        "- Após cobrir as duas categorias, celebre o pedido e feche.",
      ];
    case "aggressive":
      return [
        "- Cubra sempre: prato → bebida → sobremesa. Não pule categorias.",
        "- Se o cliente recusar uma categoria, avance imediatamente para a próxima.",
        "- Após 2 recusas em categorias diferentes, respeite e finalize.",
      ];
    default:
      return [
        "- Cubra bebida e sobremesa antes de fechar — uma por turno, de forma convidativa.",
        "- Após recusa, não insista — avance para a próxima categoria.",
        "- Após cobrir as duas, siga para confirmação.",
      ];
  }
}

function buildHighUpsellRules(personality: PersonalityPreset): string[] {
  switch (personality) {
    case "aggressive":
      return [
        "- Seu objetivo é maximizar o ticket. Toda conversa tem uma oportunidade de venda.",
        "- Siga sempre a sequência: prato principal → bebida → sobremesa. Não pule etapas.",
        "- Após cada item adicionado, analise o que ainda falta e sugira imediatamente.",
        "- Se o cliente recusar bebida, tente a sobremesa. Se recusar a sobremesa, tente um adicional.",
        "- Após 2 recusas em categorias diferentes, encaminhe para confirmação.",
        "- Use argumentos contextuais: 'Combina perfeitamente com o que você escolheu', 'Nosso mais pedido hoje'.",
      ];
    case "young":
      return [
        "- Seja o melhor hype person do restaurante — cada item é incrível!",
        "- Siga a sequência prato → bebida → sobremesa com energia total.",
        "- Se recusar bebida, salte para sobremesa com entusiasmo renovado.",
        "- Use FOMO sutilmente: 'Esse tá bombando hoje 🔥', 'Todo mundo tá pedindo...'",
        "- Após 2 recusas em categorias diferentes, comemore o pedido mesmo assim.",
      ];
    default:
      return [
        "- Proativamente cubra todas as categorias: prato → bebida → sobremesa.",
        "- Após cada recusa, mude de categoria — não repita a mesma categoria recusada.",
        "- Ofereça ao menos 2 categorias antes de fechar o pedido.",
        "- Após 2 recusas em categorias diferentes, finalize sem mais insistência.",
      ];
  }
}

function buildFocusInstructions(focus: SalesFocus): string[] {
  switch (focus) {
    case "balanced":
      return ["- Equilibre satisfação do cliente e resultado financeiro. Nenhum dos dois sacrifica o outro."];
    case "ticket":
      return [
        "- Sua métrica de sucesso é o TICKET MÉDIO de cada pedido.",
        "- Priorize sugestões de itens de maior valor. Um pedido maior é sempre melhor.",
      ];
    case "volume":
      return [
        "- Sua métrica de sucesso é fechar o maior número de pedidos.",
        "- Priorize finalizar pedidos rapidamente. Não prolongue a conversa.",
        "- Upsell só se não atrasar o fechamento.",
      ];
  }
}

function buildPriorityInstructions(priority: SalesPriority): string[] {
  switch (priority) {
    case "bestsellers":
      return ["- Quando sugerir itens, prefira os mais populares e bem avaliados do cardápio."];
    case "high_margin":
      return ["- Quando sugerir itens, prefira os de maior preço e valor agregado — maximizam a receita."];
    case "promotions":
      return ["- Quando sugerir itens, destaque combos, promoções e ofertas especiais primeiro."];
  }
}

// ─── closing section ──────────────────────────────────────────

function buildClosingSection(profile: SalesProfile): string {
  const rules: string[] = [
    "AO CONFIRMAR O PEDIDO",
    "- confirm_order só pode ser chamado no ESTADO D (bebida e sobremesa já tentadas).",
    "- Se cliente quer fechar mas faltam categorias → use o script de INTERCEPÇÃO do MOTOR DE VENDAS.",
    "- Quando ESTADO D e cliente confirmar → chame confirm_order. Sem perguntas extras.",
    "- confirm_order gera o resumo automaticamente — não repita manualmente.",
  ];

  switch (profile.personality) {
    case "traditional":
      rules.push("- Após a confirmação, agradeça de forma genuína e acolhedora.");
      rules.push("- Encerre com: 'Já estamos preparando tudo com carinho!'");
      break;
    case "fast":
      rules.push("- Após a confirmação: 1 linha de fechamento, sem floreios.");
      rules.push("- Encerre imediatamente.");
      break;
    case "premium":
      rules.push("- Após a confirmação, agradeça com elegância.");
      rules.push("- 'Sua escolha foi registrada com todo o cuidado.'");
      break;
    case "young":
      rules.push("- Após a confirmação, comemore! 'Pedido feito! Vai chegar incrível 🤩'");
      break;
    case "aggressive":
      rules.push("- Após a confirmação, reforce o valor do pedido.");
      rules.push("- Plante a semente do próximo: 'Na próxima, não perde nosso combo X!'");
      break;
  }

  return rules.join("\n");
}
