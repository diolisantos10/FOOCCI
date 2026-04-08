/**
 * Layer 1 — Personality
 *
 * Translates the restaurant's PersonalityConfig into a concrete persona
 * block for the system prompt. This is the only layer the restaurant can
 * customize freely; all other layers have hard constraints.
 */

import type { PersonalityConfig } from "./types";

function emojiRule(usage: PersonalityConfig["emojiUsage"]): string {
  switch (usage) {
    case "none":       return "NÃO use nenhum emoji em nenhuma mensagem.";
    case "minimal":    return "Máx. 1 emoji por mensagem, apenas quando reforça o significado.";
    case "expressive": return "Use emojis livremente — reforçam energia e personalidade.";
    default:           return "Use 1–2 emojis por mensagem para transmitir calor sem exagerar.";
  }
}

function presetVoice(preset: PersonalityConfig["preset"]): string {
  switch (preset) {
    case "fast":
      return "Você é rápido, direto e eficiente. Conduza o cliente ao pedido sem demora.";
    case "premium":
      return "Você é refinado, atencioso e impecável — como um garçom de restaurante de alto padrão.";
    case "young":
      return "Você é despojado, animado e próximo — como um amigo recomendando o que pedir.";
    case "aggressive":
      return "Você é confiante e persuasivo. Guia ativamente o cliente para pedidos maiores.";
    default:
      return "Você é caloroso, acessível e genuinamente prestativo — o atendente de confiança do bairro.";
  }
}

function languageStyle(p: PersonalityConfig): string {
  const parts: string[] = [];

  if (p.formality === "formal")   parts.push("Use linguagem formal (você). Evite gírias.");
  if (p.formality === "informal") parts.push("Use linguagem informal e direta. Frases curtas.");
  if (p.formality === "mixed")    parts.push("Misture cortesia formal com informalidade acolhedora.");

  if (p.tone === "professional") parts.push("Tom profissional — sem excessos de exclamações.");
  if (p.tone === "casual")       parts.push("Tom casual — como uma troca de mensagens com um amigo.");
  if (p.tone === "warm")         parts.push("Tom caloroso — o cliente deve se sentir bem-vindo.");

  switch (p.communicationStyle) {
    case "concise":  parts.push("Seja brevíssimo. Máx. 1 frase por resposta sempre que possível."); break;
    case "detailed": parts.push("Forneça contexto útil quando relevante."); break;
    default:         parts.push("Extensão conversacional — máx. 1–2 frases."); break;
  }

  return parts.join(" ");
}

export function buildPersonalityLayer(
  personality: PersonalityConfig,
  restaurantName: string,
): string {
  const greeting = personality.greetingTemplate
    ? `Abertura: "${personality.greetingTemplate}"`
    : `Abertura: "Olá! Que bom ter você aqui 😊 O que vai ser hoje?"`;

  return `━━━ IDENTIDADE ━━━
Você é o atendente de pedidos do *${restaurantName}*.
${presetVoice(personality.preset)}

ESTILO: ${languageStyle(personality)}
EMOJIS: ${emojiRule(personality.emojiUsage)}
${greeting}`;
}
