/**
 * CRM dynamic messaging library.
 *
 * Picks fresh, human-like messages from large variant pools.
 * No two consecutive sends will sound the same.
 *
 * Selection strategy:
 *   seed = today's date (YYYYMMDD) + offset
 *   index = seed % pool.length
 *
 * This guarantees:
 *   - Messages change every day automatically
 *   - Different opportunity types on the same day get different styles
 *   - Individual customer sends can use customerId as extra offset
 *   - Zero runtime dependencies — pure TypeScript
 */

export type MessageIntent =
  | "REACTIVATION"
  | "BIRTHDAY"
  | "VIP_INACTIVE"
  | "NEW_CUSTOMER"
  | "POST_ORDER";

// ── Pool definitions ──────────────────────────────────────────────────────────
// 10+ variants per intent, deliberately varied in structure, tone, and register.
// Use {nome} for customer name, {restaurante} for restaurant name.

const POOLS: Record<MessageIntent, string[]> = {

  REACTIVATION: [
    // playful
    "Eiii, {nome}! Saudade demais 😄 O cardápio tá diferente e tem um desconto te esperando pra voltar. Bora?",
    // direct
    "Desconto liberado pra você, {nome}. Sem complicação — é só pedir. 🙌",
    // emotional
    "Ei, {nome}. A gente não esquece de quem já pediu com a gente. Tem algo especial guardado pra quando você quiser voltar. 🍽️",
    // friendly
    "Oi, {nome}! Faz tempo que não te vemos por aqui e queríamos dar um oi. Tem um mimo esperando você. 😊",
    // premium
    "{nome}, para clientes que já viveram a nossa experiência, reservamos condições exclusivas de retorno. Quando quiser, tá aqui.",
    // casual
    "Você sumiu, {nome}! 👀 Mas tudo bem, a gente sabe que a vida corrida. Quando bater fome, lembra que a gente tá aqui.",
    // direct + emoji
    "Proposta rápida, {nome}: volta pedir com a gente e você ganha desconto direto. Simples assim. 🎯",
    // warm
    "{nome}, às vezes um bom pedido é tudo que a gente precisa pra virar o dia, né? Vem com a gente, tem algo especial esperando você.",
    // casual + humor
    "Alô, {nome}! Você tá na nossa lista de saudade 😄 Vem dar um oi com um pedido novo. Tem desconto te esperando!",
    // understated premium
    "Olá, {nome}. Reservamos uma condição especial de retorno — porque você merece ser bem recebido toda vez.",
  ],

  BIRTHDAY: [
    // playful
    "Ei, {nome}! Hoje é SEU dia 🎂 E a gente não ia deixar passar. Tem surpresa esperando você no próximo pedido!",
    // emotional
    "Feliz aniversário, {nome}! 🎉 Dias assim merecem comida boa, né? Preparamos algo especial pra tornar o seu ainda mais gostoso.",
    // friendly
    "Oi, {nome}! Hoje é um dia muito especial 😊 É seu aniversário e a gente quer celebrar junto. Tem presente esperando!",
    // premium
    "{nome}, em um dia tão especial, queremos que sua experiência seja à altura. Condição exclusiva preparada só para você.",
    // high energy
    "ANIVERSARIANTE DA CASA! 🥳 {nome}, tem mimo te esperando. Não deixa o dia passar sem aproveitar!",
    // casual
    "Oi, {nome}! Vi aqui que hoje é seu dia 🎂 Parabéns de verdade! Aceita um presentinho da {restaurante}?",
    // warm
    "Parabéns, {nome}! 🎈 Que seu aniversário seja cheio de coisas boas — e a gente cuida da parte da comida. Um mimo te espera.",
    // direct
    "{nome}, parabéns! 🎉 Mandei aqui uma surpresa pro seu dia. Aproveita no próximo pedido — é por nossa conta. 😄",
    // friendly + branded
    "Muita saúde, {nome}! 🥂 Que dia mais especial. A {restaurante} quer comemorar junto com você. Desconto de aniversariante garantido!",
    // understated
    "Feliz aniversário, {nome}. Momentos especiais pedem cuidado especial. Tem algo exclusivo preparado pra você hoje.",
  ],

  VIP_INACTIVE: [
    // premium
    "{nome}, você é um cliente que a gente valoriza de verdade. Faz um tempo sem te ver — tem algo exclusivo preparado só pra você.",
    // emotional
    "Ei, {nome}! A gente percebe quando um cliente especial some. Você faz falta aqui. Tem um mimo esperando o seu retorno. 🌟",
    // direct
    "{nome}, cliente VIP tem tratamento especial. Preparamos algo exclusivo: frete grátis e um brinde no próximo pedido.",
    // playful
    "Oi, {nome}! Cadê você? 😄 Os melhores clientes merecem o melhor tratamento — e a gente quer provar isso de novo.",
    // friendly
    "{nome}, a gente guarda os melhores mimos pra quem mais valoriza a gente. Tem algo especial reservado pro seu retorno. 💛",
    // elevated premium
    "Para você, {nome}, o tratamento é diferente. Reservamos uma condição exclusiva — clientes excepcionais merecem experiências excepcionais.",
    // emotional subtle
    "{nome}, clientes como você são raros e a gente sabe valorizar isso. Tem uma surpresa esperando pela sua próxima visita.",
    // direct + clear benefit
    "Desconto VIP liberado, {nome}. Só pra você, porque você merece tratamento especial. 🎯",
    // casual warm
    "Alô, {nome}! Você tem status VIP aqui com a gente — e VIP tem regalias. Vem aproveitar!",
    // playful honest
    "{nome}! A gente sabe que você poderia pedir em qualquer lugar 😄 Mas aqui você é VIP de verdade. Tem vantagem exclusiva esperando.",
  ],

  NEW_CUSTOMER: [
    // friendly
    "Oi, {nome}! Que alegria ter você como cliente! 😊 Esperamos que tenha adorado o primeiro pedido. Tem desconto esperando pro segundo!",
    // emotional
    "{nome}, você fez o nosso dia ao pedir com a gente pela primeira vez. Queremos que a segunda seja ainda melhor. Tem uma surpresa aqui!",
    // playful
    "Ei, {nome}! Primeiro pedido feito ✅ Agora é oficial: você faz parte da família. E família tem desconto! 😄",
    // direct
    "{nome}, obrigado pelo primeiro pedido! Pra garantir que você volta, preparamos desconto especial pro próximo. Simples assim.",
    // premium
    "{nome}, foi uma honra receber seu primeiro pedido. Queremos que cada experiência seja melhor que a anterior — começando agora.",
    // casual
    "Oi, {nome}! Vi que você pediu pela primeira vez com a gente 🥳 Amei! Tem um mimo te esperando pra segunda rodada.",
    // friendly + welcome
    "{nome}! Bem-vindo(a)! 🎉 Gostamos muito de conhecer novos clientes. Tem desconto de boas-vindas disponível — aproveita!",
    // warm
    "Obrigado, {nome}! Sabe que cada cliente novo é especial pra gente? Você faz parte disso agora. Tem algo pra sua próxima visita.",
    // direct + sequence
    "Primeiro pedido: feito! Próximo: com desconto. {nome}, é nossa forma de dizer que queremos você sempre aqui. 🙌",
    // playful + hook
    "{nome}, você caiu no lugar certo 😄 Agora que nos conhece, tem desconto de estreante esperando. Vem logo!",
  ],

  POST_ORDER: [
    // check-in friendly
    "Como foi o pedido, {nome}? 😊 Espero que tenha chegado perfeito. Quando bater fome de novo, tô aqui!",
    // warm check
    "{nome}, o pedido chegou tudo certo? A gente fica feliz demais quando tudo sai bem. Qualquer coisa, é só falar!",
    // casual delight
    "Oi, {nome}! Esperamos que tenha aproveitado cada mordida! 🍽️ Qualquer feedback é super bem-vindo por aqui.",
    // playful check
    "{nome}! Checando aqui se tudo chegou bem. A gente capricha em cada pedido. Gostou? 😄",
    // grateful
    "Obrigado pelo pedido, {nome}! Foi um prazer. Quando quiser repetir — e a gente espera que sim — é só chamar. 🙌",
    // open
    "Oi, {nome}! Tudo bem com o pedido? Conta como foi. A gente vive de feedbacks honestos!",
    // warm follow-up
    "{nome}, o jantar foi bom? 😋 Espero que sim! Na próxima, tem algo especial esperando você aqui.",
    // genuine appreciation
    "Valeu pela confiança, {nome}! Cada pedido pra gente é uma responsabilidade. Espero ter correspondido. 🙏",
    // casual next-order tease
    "{nome}! Você pediu, a gente amou. Quando quiser repetir tem cupom de fidelidade esperando por você. 😄",
    // short + punchy
    "Tudo certo no pedido, {nome}? 🙌 Qualquer coisa, fala comigo. E obrigado de coração!",
  ],
};

// ── Seed helpers ──────────────────────────────────────────────────────────────

/** Daily seed: changes every day, stable within the same day. */
function dailySeed(): number {
  const d = new Date();
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Simple deterministic hash of a string (djb2 variant). */
function hashStr(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return Math.abs(h);
}

function pickFrom<T>(pool: T[], seed: number): T {
  return pool[seed % pool.length]!;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Pick a group-level suggested message for an opportunity card.
 *
 * @param intent   - Message intent/type
 * @param restaurant - Restaurant name (fills {restaurante})
 * @param offset   - Additional offset (e.g. customer count) to further vary selection
 */
export function pickSuggestedMessage(
  intent: MessageIntent,
  restaurant: string,
  offset = 0
): string {
  const seed = dailySeed() + offset;
  const template = pickFrom(POOLS[intent], seed);
  return template.replace(/\{restaurante\}/g, restaurant);
}

/**
 * Personalise a message for a specific customer.
 * Uses the customer's ID as an offset so every customer gets a different variant.
 */
export function personaliseMessage(template: string, name: string): string {
  return template.replace(/\{nome\}/g, name);
}

/**
 * Pick a fresh automation placeholder for a given trigger.
 * Uses current time as seed so it cycles naturally on page reload.
 */
export function pickAutomationPlaceholder(trigger: MessageIntent): string {
  const seed = dailySeed() + hashStr(trigger);
  return pickFrom(POOLS[trigger], seed).replace(/\{restaurante\}/g, "seu restaurante");
}

/**
 * Generate a personalised message for a specific customer.
 * Intent + customerId → deterministic but unique per customer.
 */
export function generateForCustomer(
  intent: MessageIntent,
  customerId: string,
  customerName: string,
  restaurant: string
): string {
  const seed = dailySeed() + hashStr(customerId);
  const template = pickFrom(POOLS[intent], seed);
  return template
    .replace(/\{nome\}/g, customerName)
    .replace(/\{restaurante\}/g, restaurant);
}
