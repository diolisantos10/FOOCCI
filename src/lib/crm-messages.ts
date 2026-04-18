/**
 * CRM dynamic messaging library.
 *
 * Each message carries an explicit style tag so the Adaptive Brain
 * can track which styles convert and bias future selection accordingly.
 *
 * Selection pipeline:
 *   1. AdaptiveCRMService computes StyleWeights from CRMActionLog history
 *   2. pickWithStyle() does a weighted draw from those weights
 *   3. The tagged message is returned so the style can be persisted in the log
 */

export type MessageIntent =
  | "REACTIVATION"
  | "BIRTHDAY"
  | "VIP_INACTIVE"
  | "NEW_CUSTOMER"
  | "POST_ORDER";

export type MessageStyle = "FRIENDLY" | "PLAYFUL" | "DIRECT" | "EMOTIONAL" | "PREMIUM";

export interface TaggedMessage {
  text:  string;
  style: MessageStyle;
}

// ── Pool definitions ──────────────────────────────────────────────────────────
// Each variant is explicitly tagged.  2 variants per style × 5 styles = 10/pool.
// Use {nome} for customer name, {restaurante} for restaurant name.

const POOLS: Record<MessageIntent, TaggedMessage[]> = {

  REACTIVATION: [
    { style: "PLAYFUL",   text: "Eiii, {nome}! Saudade demais 😄 O cardápio tá diferente e tem um desconto te esperando pra voltar. Bora?" },
    { style: "DIRECT",    text: "Desconto liberado pra você, {nome}. Sem complicação — é só pedir. 🙌" },
    { style: "EMOTIONAL", text: "Ei, {nome}. A gente não esquece de quem já pediu com a gente. Tem algo especial guardado pra quando você quiser voltar. 🍽️" },
    { style: "FRIENDLY",  text: "Oi, {nome}! Faz tempo que não te vemos por aqui e queríamos dar um oi. Tem um mimo esperando você. 😊" },
    { style: "PREMIUM",   text: "{nome}, para clientes que já viveram a nossa experiência, reservamos condições exclusivas de retorno. Quando quiser, tá aqui." },
    { style: "PLAYFUL",   text: "Você sumiu, {nome}! 👀 Mas tudo bem, a gente sabe que a vida é corrida. Quando bater fome, lembra que a gente tá aqui." },
    { style: "DIRECT",    text: "Proposta rápida, {nome}: volta pedir com a gente e você ganha desconto direto. Simples assim. 🎯" },
    { style: "EMOTIONAL", text: "Às vezes um convite faz toda a diferença, né {nome}? Considera esse o seu — a gente preparou algo especial pra quando você quiser voltar." },
    { style: "FRIENDLY",  text: "{nome}! Bateu aquela vontade de pedir uma coisa boa? 😋 A gente tem saudade de você — e tem desconto especial te esperando." },
    { style: "PREMIUM",   text: "Olá, {nome}. Reservamos uma condição especial de retorno — porque você merece ser bem recebido toda vez." },
  ],

  BIRTHDAY: [
    { style: "PLAYFUL",   text: "Ei, {nome}! Hoje é SEU dia 🎂 E a gente não ia deixar passar. Tem surpresa esperando você no próximo pedido!" },
    { style: "EMOTIONAL", text: "Feliz aniversário, {nome}! 🎉 Dias assim merecem comida boa, né? Preparamos algo especial pra tornar o seu ainda mais gostoso." },
    { style: "FRIENDLY",  text: "Oi, {nome}! Hoje é um dia muito especial 😊 É seu aniversário e a gente quer celebrar junto. Tem presente esperando!" },
    { style: "PREMIUM",   text: "{nome}, em um dia tão especial, queremos que sua experiência seja à altura. Condição exclusiva preparada só para você." },
    { style: "PLAYFUL",   text: "ANIVERSARIANTE DA CASA! 🥳 {nome}, tem mimo te esperando. Não deixa o dia passar sem aproveitar!" },
    { style: "DIRECT",    text: "{nome}, parabéns! 🎉 Mandei aqui uma surpresa pro seu dia. Aproveita no próximo pedido — é por nossa conta. 😄" },
    { style: "EMOTIONAL", text: "Parabéns, {nome}! 💛 Dias assim são pra celebrar com quem a gente gosta. A gente quer fazer parte do seu dia." },
    { style: "FRIENDLY",  text: "Muita saúde, {nome}! 🥂 A {restaurante} quer comemorar junto com você. Desconto de aniversariante garantido!" },
    { style: "DIRECT",    text: "{nome}, hoje é seu dia — e a gente preparou um presente direto no próximo pedido. Aproveita! 🎁" },
    { style: "PREMIUM",   text: "Feliz aniversário, {nome}. Em um dia tão especial, cada detalhe conta — e a gente cuidou de preparar algo à altura da ocasião." },
  ],

  VIP_INACTIVE: [
    { style: "PREMIUM",   text: "{nome}, você é um cliente que a gente valoriza de verdade. Faz um tempo sem te ver — tem algo exclusivo preparado só pra você." },
    { style: "EMOTIONAL", text: "Ei, {nome}! A gente percebe quando um cliente especial some. Você faz falta aqui. Tem um mimo esperando o seu retorno. 🌟" },
    { style: "DIRECT",    text: "{nome}, cliente VIP tem tratamento especial. Preparamos algo exclusivo: frete grátis e um brinde no próximo pedido." },
    { style: "PLAYFUL",   text: "Cadê você, {nome}? 😄 Os melhores clientes merecem o melhor tratamento — e a gente quer provar isso de novo." },
    { style: "FRIENDLY",  text: "{nome}, a gente guarda os melhores mimos pra quem mais valoriza a gente. Tem algo especial reservado pro seu retorno. 💛" },
    { style: "PREMIUM",   text: "Para você, {nome}, o tratamento é diferente. Reservamos uma condição exclusiva — clientes excepcionais merecem experiências excepcionais." },
    { style: "EMOTIONAL", text: "{nome}, clientes como você são raros e a gente reconhece isso. Tem uma surpresa esperando pela sua próxima visita." },
    { style: "DIRECT",    text: "Oferta exclusiva liberada, {nome}. Só pra você, porque você tem status VIP aqui com a gente. Aproveita! ✨" },
    { style: "PLAYFUL",   text: "Alô, {nome}! Você tem status VIP aqui — e VIP tem regalias reais. Vem aproveitar! 😄" },
    { style: "FRIENDLY",  text: "{nome}! A gente sabe que você poderia pedir em qualquer lugar. Mas aqui você é VIP de verdade. 💛" },
  ],

  NEW_CUSTOMER: [
    { style: "FRIENDLY",  text: "Oi, {nome}! Que alegria ter você como cliente! 😊 Esperamos que tenha amado o primeiro pedido. Tem desconto esperando pro segundo!" },
    { style: "EMOTIONAL", text: "{nome}, você fez o nosso dia ao pedir com a gente pela primeira vez. Queremos que a segunda seja ainda melhor." },
    { style: "PLAYFUL",   text: "Ei, {nome}! Primeiro pedido feito ✅ Agora é oficial: você faz parte da família. E família tem desconto! 😄" },
    { style: "DIRECT",    text: "{nome}, obrigado pelo primeiro pedido! Pra garantir que você volta, preparamos desconto especial pro próximo. Simples assim." },
    { style: "PREMIUM",   text: "{nome}, foi uma honra receber seu primeiro pedido. Queremos que cada experiência seja melhor que a anterior — começando agora." },
    { style: "FRIENDLY",  text: "{nome}! Bem-vindo(a)! 🎉 Todo novo cliente é especial por aqui. Desconto de boas-vindas disponível — aproveita!" },
    { style: "EMOTIONAL", text: "Obrigado, {nome}! Sabe que cada cliente novo é especial pra gente? Agora você faz parte disso. Preparamos algo pra sua próxima visita. 💛" },
    { style: "DIRECT",    text: "Primeiro pedido: feito. Próximo: com desconto. {nome}, é nossa forma de dizer que queremos você sempre aqui. 🙌" },
    { style: "PLAYFUL",   text: "{nome}, você caiu no lugar certo 😄 Agora que nos conhece, tem desconto de estreante esperando. Vem logo!" },
    { style: "PREMIUM",   text: "{nome}, foi uma honra receber seu primeiro pedido. Cada experiência conosco é preparada com cuidado — até a próxima." },
  ],

  POST_ORDER: [
    { style: "FRIENDLY",  text: "Como foi o pedido, {nome}? 😊 Espero que tenha chegado perfeito. Quando bater fome de novo, tô aqui!" },
    { style: "PLAYFUL",   text: "{nome}! Checando aqui se tudo chegou bem. A gente capricha em cada pedido. Gostou? 😄" },
    { style: "EMOTIONAL", text: "Obrigado pela confiança, {nome}! Cada pedido pra gente é uma responsabilidade. Espero ter correspondido. 🙏" },
    { style: "DIRECT",    text: "Valeu pelo pedido, {nome}! Foi um prazer. Quando quiser repetir — é só chamar. 🙌" },
    { style: "FRIENDLY",  text: "Oi, {nome}! Tudo bem com o pedido? Conta como foi. A gente vive de feedbacks honestos!" },
    { style: "PLAYFUL",   text: "{nome}! Você pediu, a gente amou servir. Quando quiser repetir tem cupom de fidelidade esperando. 😄" },
    { style: "EMOTIONAL", text: "{nome}, espero que tenha adorado! 🥰 Quando quiser repetir — e a gente espera que sim — é só pedir. Até a próxima!" },
    { style: "DIRECT",    text: "Tudo certo no pedido, {nome}? 🙌 Qualquer coisa, fala comigo. E obrigado de coração!" },
    { style: "PREMIUM",   text: "Oi, {nome}. Esperamos que tenha sido uma experiência à altura. Qualquer feedback é sempre bem-vindo." },
    { style: "PREMIUM",   text: "{nome}, foi um prazer servir. Na próxima vez, tenho certeza que vai ser ainda melhor." },
  ],
};

// ── Seed helpers ──────────────────────────────────────────────────────────────

function dailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

export function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h);
}

function pickFrom<T>(pool: T[], seed: number): T {
  return pool[seed % pool.length]!;
}

// ── Weighted random selection ─────────────────────────────────────────────────

export type StyleWeights = Partial<Record<MessageStyle, number>>;

/**
 * Pick a message using weighted style selection.
 * Used by the Adaptive Brain to favour high-converting styles.
 *
 * @param intent   - Message intent
 * @param weights  - { FRIENDLY: 0.4, PLAYFUL: 0.3, ... } must sum to ~1
 * @param seed     - Optional deterministic seed (defaults to dailySeed)
 */
export function pickWithStyle(
  intent: MessageIntent,
  weights: StyleWeights,
  seed?: number
): TaggedMessage {
  const pool = POOLS[intent];
  const styles = Object.keys(weights) as MessageStyle[];

  // If no weights provided, fall back to uniform daily rotation
  if (styles.length === 0) {
    return pickFrom(pool, seed ?? dailySeed());
  }

  // Weighted random draw using cumulative distribution
  const s = seed ?? dailySeed();
  // Use seed to get a pseudo-random float 0–1 that's deterministic
  const pseudo = (hashStr(String(s)) % 10000) / 10000;

  let cumulative = 0;
  for (const style of styles) {
    cumulative += weights[style] ?? 0;
    if (pseudo < cumulative) {
      // Pick a message of this style
      const stylePool = pool.filter((m) => m.style === style);
      if (stylePool.length > 0) return pickFrom(stylePool, s);
    }
  }

  // Fallback: uniform pick
  return pickFrom(pool, s);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Group-level suggestion (shown in opportunity cards).
 * No style tracking — uses daily seed + offset for variety.
 */
export function pickSuggestedMessage(
  intent: MessageIntent,
  restaurant: string,
  offset = 0
): string {
  const seed = dailySeed() + offset;
  const msg = pickFrom(POOLS[intent], seed);
  return msg.text.replace(/\{restaurante\}/g, restaurant);
}

/** Fill {nome} placeholder in a template. */
export function personaliseMessage(template: string, name: string): string {
  return template.replace(/\{nome\}/g, name);
}

/**
 * Automation textarea placeholder — rotates daily so it never looks stale.
 */
export function pickAutomationPlaceholder(trigger: MessageIntent): string {
  const seed = dailySeed() + hashStr(trigger);
  const msg = pickFrom(POOLS[trigger], seed);
  return msg.text.replace(/\{restaurante\}/g, "seu restaurante");
}

/**
 * Per-customer personalised message.
 * Customer ID is hashed so every recipient in the same batch gets a different variant.
 */
export function generateForCustomer(
  intent: MessageIntent,
  customerId: string,
  customerName: string,
  restaurant: string,
  weights?: StyleWeights
): { text: string; style: MessageStyle } {
  const seed = dailySeed() + hashStr(customerId);
  const msg = weights && Object.keys(weights).length > 0
    ? pickWithStyle(intent, weights, seed)
    : pickFrom(POOLS[intent], seed);

  return {
    text:  msg.text.replace(/\{nome\}/g, customerName).replace(/\{restaurante\}/g, restaurant),
    style: msg.style,
  };
}
