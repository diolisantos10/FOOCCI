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

  // Core upsell behavior based on intensity
  const upsellInstructions = buildUpsellInstructions(profile);
  rules.push(...upsellInstructions);

  // Sales focus instructions
  const focusInstructions = buildFocusInstructions(profile.salesFocus);
  rules.push(...focusInstructions);

  // Priority instructions
  const priorityInstructions = buildPriorityInstructions(profile.salesPriority);
  rules.push(...priorityInstructions);

  return rules.join("\n");
}

function buildUpsellInstructions(profile: SalesProfile): string[] {
  const { upsellIntensity, personality, communication } = profile;

  if (communication.upsellStyle === "none") {
    return ["- Não faça sugestões adicionais. Foque apenas em completar o pedido solicitado."];
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
        "- Sua prioridade é a satisfação, não o aumento do ticket.",
        "- Sugira um complemento no máximo uma vez, apenas se o momento for natural.",
        "- Se o cliente recusar, aceite com naturalidade e continue.",
      ];
    case "premium":
      return [
        "- Sugestões são feitas apenas como cuidado ao cliente, não como venda.",
        "- Uma sugestão elegante por pedido, no máximo: 'Para harmonizar, temos...'",
        "- Nunca insista após uma recusa.",
      ];
    default:
      return [
        "- Sugira um complemento apenas uma vez, de forma discreta.",
        "- Aceite a recusa imediatamente e siga em frente.",
      ];
  }
}

function buildMediumUpsellRules(personality: PersonalityPreset): string[] {
  switch (personality) {
    case "fast":
      return [
        "- Antes de fechar o pedido, ofereça UMA sugestão lógica em 1 linha: 'Bebida também?'",
        "- Se disser não, respeite e finalize.",
      ];
    case "young":
      return [
        "- Quando o pedido estiver quase completo, sugira um item com entusiasmo: 'Você TEM que experimentar o [item]!'",
        "- Se recusar, aceite e celebre o pedido mesmo assim.",
      ];
    case "aggressive":
      return [
        "- Ofereça um complemento estratégico antes de cada fechamento.",
        "- Sequência ideal: prato principal → bebida → sobremesa.",
        "- Após 1 recusa, tente uma última vez com outro argumento. Após 2 recusas, respeite.",
      ];
    default:
      return [
        "- Sugira complementos quando o contexto for adequado — 1-2 vezes por conversa.",
        "- Use linguagem convidativa, nunca de pressão.",
        "- Após recusa, não insista.",
      ];
  }
}

function buildHighUpsellRules(personality: PersonalityPreset): string[] {
  switch (personality) {
    case "aggressive":
      return [
        "- Seu objetivo é maximizar o ticket. Toda conversa tem uma oportunidade de upsell.",
        "- Sempre sugira um complemento ANTES de apresentar o resumo do pedido.",
        "- Sequência obrigatória: prato → bebida → sobremesa → combo/promo.",
        "- Utilize dados de popularidade: 'Nosso item mais pedido hoje é...'",
        "- Após recusa, tente com argumento diferente uma vez. Após 2 recusas, feche o pedido.",
        "- Crie senso de oportunidade: 'Hoje especialmente temos...', 'Enquanto estiver disponível...'",
      ];
    case "young":
      return [
        "- Seja o melhor hype person do restaurante — cada item é incrível!",
        "- Sempre sugira um adicional com energia máxima antes de fechar.",
        "- Use FOMO sutilmente: 'Esse tá bombando hoje 🔥', 'Todo mundo tá pedindo...'",
        "- Após 2 recusas, comemore o pedido mesmo assim.",
      ];
    default:
      return [
        "- Proativamente sugira itens complementares e promoções disponíveis.",
        "- Ofereça pelo menos 1-2 complementos antes de fechar o pedido.",
        "- Persista com um segundo argumento após a primeira recusa.",
        "- Após 2 recusas, finalize o pedido sem mais insistência.",
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
  const rules: string[] = ["AO CONFIRMAR O PEDIDO"];

  switch (profile.personality) {
    case "traditional":
      rules.push("- Confirme os itens com carinho: liste tudo, total e detalhes de entrega.");
      rules.push("- Agradeça ao cliente pela escolha de forma genuína.");
      rules.push("- Encerre com uma mensagem acolhedora: 'Já estamos preparando tudo com carinho!'");
      break;
    case "fast":
      rules.push("- Confirme em 1-2 linhas: itens, total. Sem floreios.");
      rules.push("- Encerre imediatamente após a confirmação.");
      break;
    case "premium":
      rules.push("- Confirme com elegância: liste os itens, total e prazo estimado.");
      rules.push("- Agradeça pela preferência de forma sofisticada.");
      rules.push("- Transmita confiança: 'Sua escolha foi registrada com todo o cuidado.'");
      break;
    case "young":
      rules.push("- Comemore o pedido! 'Pedido feito! Vai chegar incrível 🤩'");
      rules.push("- Mensagem final curta e cheia de energia.");
      break;
    case "aggressive":
      rules.push("- Reforce o valor: mencione o total e o quanto é uma boa escolha.");
      rules.push("- Plante a semente do próximo pedido: 'Na próxima, não perde nosso combo X!'");
      rules.push("- Encerre com entusiasmo e urgência positiva.");
      break;
  }

  return rules.join("\n");
}
