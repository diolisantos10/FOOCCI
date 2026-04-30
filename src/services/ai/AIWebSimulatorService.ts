/**
 * AIWebSimulatorService — V2 Event-Driven Customer Simulator
 *
 * Simulates a REAL CUSTOMER interacting with the digital menu UI, not a chat.
 * Drives WaiterBrainV2 through the same UI events that PedidoClient emits.
 *
 * Core model:  UI EVENTS + CUSTOMER GOAL + AI REACTION
 *
 * Customer interacts via UI actions (add_item, click_finalize, etc.).
 * Each action maps to a V2Event that WaiterBrainV2 / AIOrderService handles.
 * Customer evaluates AI response (cards/message) and decides to accept or ignore.
 * Finalization is customer-driven when goal conditions are met — never AI-driven.
 *
 * Test modes:
 *   QUICK    →  5 scenarios
 *   STANDARD → 10 scenarios
 *   STRESS   → 20 scenarios
 *   CUSTOM   →  N scenarios (caller-specified)
 */

import { prisma } from "@/lib/prisma";
import { AIOrderService }           from "./AIOrderService";
import { isDessertCategory }        from "./ConversationGuardrails";
import type { V2Event, V2CatalogItem } from "./WaiterBrainV2";

// ─── test mode ────────────────────────────────────────────────────────────────

export type WebSimMode = "QUICK" | "STANDARD" | "STRESS" | "CUSTOM";

const MODE_COUNT: Record<WebSimMode, number> = {
  QUICK:    5,
  STANDARD: 10,
  STRESS:   20,
  CUSTOM:   0, // overridden by customCount
};

// ─── customer profile (spec §1) ───────────────────────────────────────────────

export interface CustomerProfile {
  archetype:             string;
  goal:                  string;
  budgetMax:             number;
  groupSize:             number;
  decisionStyle:         "fast" | "exploratory" | "indecisive";
  upsellOpenness:        "low" | "medium" | "high";
  deliveryIntent:        "delivery" | "pickup";
  finalizationCondition: string;
}

// ─── UI actions (spec §2) ─────────────────────────────────────────────────────

export type UIAction =
  | "open_menu"
  | "browse_category"
  | "view_product"
  | "add_item"
  | "add_another_item"
  | "wait"
  | "ignore_suggestion"
  | "accept_suggestion"
  | "click_finalize"
  | "fill_checkout"
  | "send_message";

// ─── turn & result types (spec §9) ───────────────────────────────────────────

export interface SimTurn {
  index:             number;
  action:            UIAction;
  event?:            V2Event;
  itemAdded?:        { id: string; name: string; price: number };
  message?:          string;
  aiMessage?:        string;
  aiCards?:          string[];
  customerDecision?: "accept" | "ignore" | "none";
}

export interface WebScenarioResult {
  profile: CustomerProfile;
  turns:   SimTurn[];
  result: {
    goalAchieved:       boolean;
    finalized:          boolean;
    itemsCount:         number;
    totalValue:         number;
    abandoned:          boolean;
    abandonmentReason?: string;
  };
}

// ─── report & metrics (spec §10) ─────────────────────────────────────────────

export interface WebSimMetrics {
  goalCompletionRate:      number;  // 0–1
  naturalFinalizationRate: number;  // 0–1 (customer triggered, not turn-limit)
  avgItemsPerOrder:        number;
  upsellAcceptanceRate:    number;  // 0–1
  idleRecoveryRate:        number;  // 0–1
  abandonmentRate:         number;  // 0–1
  checkoutCompletionRate:  number;  // 0–1
  avgCardsPerEvent:        number;
  avgTurnsToFinalize:      number;
  eventDistribution:       Partial<Record<V2Event, number>>;
}

export interface WebSimReport {
  mode:           WebSimMode;
  ranAt:          string;
  restaurantName: string;
  scenarioCount:  number;
  scenarios:      WebScenarioResult[];
  metrics:        WebSimMetrics;
}

// ─── internal simulation state ────────────────────────────────────────────────

interface SimState {
  cart:          Array<{ id: string; name: string; price: number; qty: number }>;
  history:       Array<{ role: "user" | "assistant"; content: string }>;
  turnIndex:     number;
  browseCount:   number;
  idleCount:     number;
  messagesSent:  number;
  lastCards:     string[];
  pendingDecision: boolean;  // true when customer received cards but hasn't decided
  upsellsOffered:  number;
  upsellsAccepted: number;
  upsellsIgnored:  number;
  idleTriggers:    number;
  idleRecoveries:  number;
  eventCounts:     Partial<Record<V2Event, number>>;
  totalCards:      number;
  cardEvents:      number;
  finalized:       boolean;
  naturalFinalize: boolean;
  abandoned:       boolean;
  abandonReason?:  string;
  checkoutDone:    boolean;
}

const MAX_TURNS = 18;

// ─── category helpers ─────────────────────────────────────────────────────────

function isDrinkCategory(name: string): boolean {
  return /bebida|suco|drink|refri|água|cerveja|vinho|refrigerante|soda|shake/i.test(name);
}

function isMainItem(item: V2CatalogItem): boolean {
  return !isDrinkCategory(item.categoryName) && !isDessertCategory(item.categoryName);
}

// ─── customer archetype pool ──────────────────────────────────────────────────

const ARCHETYPES: CustomerProfile[] = [
  {
    archetype:             "Solo Rápido",
    goal:                  "Refeição rápida para uma pessoa",
    budgetMax:             60,
    groupSize:             1,
    decisionStyle:         "fast",
    upsellOpenness:        "low",
    deliveryIntent:        "pickup",
    finalizationCondition: "1 item principal dentro do orçamento",
  },
  {
    archetype:             "Casal Explorando",
    goal:                  "Refeição completa para duas pessoas",
    budgetMax:             120,
    groupSize:             2,
    decisionStyle:         "exploratory",
    upsellOpenness:        "medium",
    deliveryIntent:        "delivery",
    finalizationCondition: "2+ itens, preferencialmente com bebida",
  },
  {
    archetype:             "Família Completa",
    goal:                  "Jantar completo para família de 4",
    budgetMax:             250,
    groupSize:             4,
    decisionStyle:         "exploratory",
    upsellOpenness:        "medium",
    deliveryIntent:        "delivery",
    finalizationCondition: "4+ itens dentro do orçamento",
  },
  {
    archetype:             "Premium Solo",
    goal:                  "Experiência premium — melhor do cardápio",
    budgetMax:             180,
    groupSize:             1,
    decisionStyle:         "exploratory",
    upsellOpenness:        "high",
    deliveryIntent:        "delivery",
    finalizationCondition: "1 item premium + drink ou sobremesa",
  },
  {
    archetype:             "Indeciso Clássico",
    goal:                  "Qualquer coisa boa para uma refeição",
    budgetMax:             80,
    groupSize:             1,
    decisionStyle:         "indecisive",
    upsellOpenness:        "medium",
    deliveryIntent:        "delivery",
    finalizationCondition: "1 item principal após explorar o menu",
  },
  {
    archetype:             "Econômico Direto",
    goal:                  "Opção mais barata disponível",
    budgetMax:             42,
    groupSize:             1,
    decisionStyle:         "fast",
    upsellOpenness:        "low",
    deliveryIntent:        "pickup",
    finalizationCondition: "1 item, preço ≤ R$ 42",
  },
  {
    archetype:             "Ticket Alto Dupla",
    goal:                  "Pedido generoso para dois — sem limitar",
    budgetMax:             200,
    groupSize:             2,
    decisionStyle:         "fast",
    upsellOpenness:        "high",
    deliveryIntent:        "delivery",
    finalizationCondition: "2+ itens, aceita upsell se couber no orçamento",
  },
  {
    archetype:             "Curioso Aventureiro",
    goal:                  "Descobrir algo novo no cardápio",
    budgetMax:             90,
    groupSize:             1,
    decisionStyle:         "exploratory",
    upsellOpenness:        "high",
    deliveryIntent:        "delivery",
    finalizationCondition: "1–2 itens diferentes, explorando categorias",
  },
];

// ─── message pools per decision style ────────────────────────────────────────

const MESSAGES: Record<CustomerProfile["decisionStyle"], string[]> = {
  fast:       ["Quero fazer um pedido rápido", "Me ajuda a pedir logo"],
  exploratory:["O que vocês recomendam hoje?", "Qual é o prato mais pedido?", "Me apresenta o cardápio"],
  indecisive: ["Não sei o que pedir, me ajuda?", "Tô em dúvida aqui", "Tem opção boa para uma pessoa só?"],
};

// ─── scenario generation ──────────────────────────────────────────────────────

function generateProfiles(count: number): CustomerProfile[] {
  const profiles: CustomerProfile[] = [];

  // Fixed archetypes first
  for (let i = 0; i < Math.min(count, ARCHETYPES.length); i++) {
    profiles.push(ARCHETYPES[i]!);
  }

  // Random variations for extra slots
  const styles:    CustomerProfile["decisionStyle"][] = ["fast", "exploratory", "indecisive"];
  const opennessPool: CustomerProfile["upsellOpenness"][] = ["low", "medium", "high"];
  const budgets  = [45, 60, 80, 90, 120, 150, 200];
  const groups   = [1, 1, 1, 2, 3, 4];
  const deliveries: CustomerProfile["deliveryIntent"][] = ["delivery", "pickup"];

  while (profiles.length < count) {
    const idx     = profiles.length;
    const style   = styles[idx % styles.length]!;
    const open    = opennessPool[idx % opennessPool.length]!;
    const budget  = budgets[idx % budgets.length]!;
    const group   = groups[idx % groups.length]!;
    const delivery = deliveries[idx % deliveries.length]!;
    profiles.push({
      archetype:             `Variação ${idx + 1}`,
      goal:                  `Refeição para ${group} pessoa${group > 1 ? "s" : ""}`,
      budgetMax:             budget,
      groupSize:             group,
      decisionStyle:         style,
      upsellOpenness:        open,
      deliveryIntent:        delivery,
      finalizationCondition: `${group} item(ns), orçamento ≤ R$ ${budget}`,
    });
  }

  return profiles;
}

// ─── cart helpers ─────────────────────────────────────────────────────────────

function cartValue(state: SimState): number {
  return state.cart.reduce((s, c) => s + c.price * c.qty, 0);
}

function cartQty(state: SimState): number {
  return state.cart.reduce((s, c) => s + c.qty, 0);
}

function cartHasMain(state: SimState, catalog: V2CatalogItem[]): boolean {
  return state.cart.some((c) => {
    const item = catalog.find((ci) => ci.id === c.id);
    return item ? isMainItem(item) : false;
  });
}

// ─── item selection ───────────────────────────────────────────────────────────

function pickItemToAdd(
  profile:  CustomerProfile,
  catalog:  V2CatalogItem[],
  state:    SimState,
): V2CatalogItem | null {
  const budget    = profile.budgetMax - cartValue(state);
  const cartIds   = new Set(state.cart.map((c) => c.id));

  // Filter to affordable items not yet at max qty
  let candidates = catalog.filter((item) => {
    if (item.price > budget) return false;
    if (!cartIds.has(item.id)) return true;
    const qty = state.cart.find((c) => c.id === item.id)?.qty ?? 0;
    return qty < profile.groupSize; // allow multiple for groups
  });

  if (candidates.length === 0) return null;

  // Prefer main items if cart has none yet
  if (!cartHasMain(state, catalog)) {
    const mains = candidates.filter(isMainItem);
    if (mains.length > 0) candidates = mains;
  }

  // Selection strategy per style
  if (profile.budgetMax >= 120 && profile.decisionStyle !== "fast") {
    // premium preference: highest price
    return candidates.sort((a, b) => b.price - a.price)[0]!;
  }
  if (profile.budgetMax <= 50) {
    // budget preference: lowest price
    return candidates.sort((a, b) => a.price - b.price)[0]!;
  }
  // Default: first by sortOrder (best-sellers)
  return candidates[0]!;
}

// ─── finalization check ───────────────────────────────────────────────────────

function shouldFinalize(profile: CustomerProfile, state: SimState): boolean {
  const qty   = cartQty(state);
  const value = cartValue(state);

  if (qty === 0) return false;

  // Over budget → stop adding, finalize now
  if (value > profile.budgetMax) return true;

  // Must have at least 1 item per person
  if (qty < profile.groupSize) return false;

  // Fast decision: finalize as soon as minimum satisfied
  if (profile.decisionStyle === "fast") return true;

  // Exploratory/indecisive: finalize after seeing some AI suggestions
  if (state.upsellsOffered >= 1) return true;

  // Browsed enough
  if (state.browseCount >= 2 && qty >= profile.groupSize) return true;

  return false;
}

// ─── upsell acceptance decision ──────────────────────────────────────────────

function evaluateCards(
  profile:  CustomerProfile,
  state:    SimState,
  catalog:  V2CatalogItem[],
  cardIds:  string[],
): boolean {
  if (cardIds.length === 0) return false;

  const firstId = cardIds[0]!;
  const item    = catalog.find((c) => c.id === firstId);
  if (!item) return false;

  // Budget gate: card must fit remaining budget
  if (cartValue(state) + item.price > profile.budgetMax) return false;

  // Upsell openness probability
  const roll = Math.random();
  if (profile.upsellOpenness === "low")    return roll < 0.15;
  if (profile.upsellOpenness === "medium") return roll < 0.50;
  return roll < 0.80; // high
}

// ─── add item to cart ─────────────────────────────────────────────────────────

function addToCart(
  state: SimState,
  item:  V2CatalogItem,
): void {
  const existing = state.cart.find((c) => c.id === item.id);
  if (existing) {
    existing.qty++;
  } else {
    state.cart.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
  }
}

// ─── record event count ───────────────────────────────────────────────────────

function countEvent(state: SimState, event: V2Event): void {
  state.eventCounts[event] = (state.eventCounts[event] ?? 0) + 1;
}

// ─── simulate one checkout (no AI) ───────────────────────────────────────────

function simulateCheckout(profile: CustomerProfile, state: SimState, turns: SimTurn[]): void {
  turns.push({
    index:  state.turnIndex++,
    action: "fill_checkout",
    // No event — checkout is pure UI, no AI involved
  });
  state.checkoutDone = true;
}

// ─── build ai input from state ────────────────────────────────────────────────

function buildAIInput(
  restaurantId: string,
  state:        SimState,
  catalog:      V2CatalogItem[],
  event:        V2Event,
  message:      string,
  lastAddedId?: string,
) {
  return {
    restaurantId,
    message,
    history:     state.history,
    cart:        state.cart,
    stage:       "BROWSE" as const,
    event,
    catalogItems: catalog,
    lastAddedId,
  };
}

// ─── run a single scenario ────────────────────────────────────────────────────

async function runScenario(
  restaurantId: string,
  profile:      CustomerProfile,
  catalog:      V2CatalogItem[],
): Promise<WebScenarioResult> {
  const state: SimState = {
    cart: [], history: [],
    turnIndex: 0, browseCount: 0, idleCount: 0, messagesSent: 0,
    lastCards: [], pendingDecision: false,
    upsellsOffered: 0, upsellsAccepted: 0, upsellsIgnored: 0,
    idleTriggers: 0, idleRecoveries: 0,
    eventCounts: {}, totalCards: 0, cardEvents: 0,
    finalized: false, naturalFinalize: false, abandoned: false, checkoutDone: false,
  };
  const turns: SimTurn[] = [];

  // ── Step 1: open menu (ON_MENU_MODE) ──────────────────────────────────────
  {
    const event: V2Event = "ON_MENU_MODE";
    countEvent(state, event);
    const res = await AIOrderService.runWebTurn(
      buildAIInput(restaurantId, state, catalog, event, "")
    );
    const turn: SimTurn = {
      index:  state.turnIndex++,
      action: "open_menu",
      event,
      aiMessage: res.reply,
      aiCards:   res.cards,
    };
    if (res.cards.length > 0) { state.totalCards += res.cards.length; state.cardEvents++; }
    if (res.reply) state.history.push({ role: "assistant", content: res.reply });
    turns.push(turn);
  }

  // ── Main simulation loop ───────────────────────────────────────────────────
  while (!state.finalized && !state.abandoned && state.turnIndex < MAX_TURNS) {

    // ── Handle pending card decision ────────────────────────────────────────
    if (state.pendingDecision && state.lastCards.length > 0) {
      state.pendingDecision = false;
      const accepts = evaluateCards(profile, state, catalog, state.lastCards);
      state.upsellsOffered++;

      if (accepts) {
        const itemId  = state.lastCards[0]!;
        const item    = catalog.find((c) => c.id === itemId);
        if (item) {
          state.upsellsAccepted++;
          addToCart(state, item);
          if (state.idleTriggers > state.idleRecoveries) state.idleRecoveries++;

          const event: V2Event = cartQty(state) >= 2 ? "ON_CART_UPDATED" : "ON_ITEM_ADDED";
          countEvent(state, event);
          const res = await AIOrderService.runWebTurn(
            buildAIInput(restaurantId, state, catalog, event, `Adicionar ${item.name}`, item.id)
          );
          const turn: SimTurn = {
            index:     state.turnIndex++,
            action:    "accept_suggestion",
            event,
            itemAdded: { id: item.id, name: item.name, price: item.price },
            aiMessage: res.reply,
            aiCards:   res.cards,
            customerDecision: "accept",
          };
          if (res.cards.length > 0) {
            state.totalCards += res.cards.length; state.cardEvents++;
            state.lastCards = res.cards; state.pendingDecision = true;
          } else {
            state.lastCards = [];
          }
          if (res.reply) state.history.push({ role: "assistant", content: res.reply });
          turns.push(turn);
        }
      } else {
        state.upsellsIgnored++;
        state.lastCards = [];
        turns.push({
          index:            state.turnIndex++,
          action:           "ignore_suggestion",
          customerDecision: "ignore",
        });
      }
      continue;
    }

    // ── Check finalization ──────────────────────────────────────────────────
    if (shouldFinalize(profile, state)) {
      const event: V2Event = "ON_CHECKOUT_STARTED";
      countEvent(state, event);
      const res = await AIOrderService.runWebTurn(
        buildAIInput(restaurantId, state, catalog, event, "")
      );
      turns.push({
        index:    state.turnIndex++,
        action:   "click_finalize",
        event,
        aiMessage: res.reply,
      });
      if (res.reply) state.history.push({ role: "assistant", content: res.reply });

      simulateCheckout(profile, state, turns);
      state.finalized     = true;
      state.naturalFinalize = true;
      break;
    }

    // ── Determine next action based on decision style ───────────────────────
    const qty     = cartQty(state);
    const isEmpty = qty === 0;

    // ── Indecisive: browse and possibly wait before adding ─────────────────
    if (profile.decisionStyle === "indecisive") {
      if (state.browseCount < 2 && isEmpty) {
        state.browseCount++;
        turns.push({ index: state.turnIndex++, action: "browse_category" });
        continue;
      }
      if (state.idleCount === 0 && qty === 0) {
        state.idleCount++;
        state.idleTriggers++;
        const event: V2Event = "ON_IDLE";
        countEvent(state, event);
        const res = await AIOrderService.runWebTurn(
          buildAIInput(restaurantId, state, catalog, event, "")
        );
        const turn: SimTurn = {
          index:    state.turnIndex++,
          action:   "wait",
          event,
          aiMessage: res.reply,
          aiCards:  res.cards,
        };
        if (res.cards.length > 0) {
          state.totalCards += res.cards.length; state.cardEvents++;
          state.lastCards   = res.cards; state.pendingDecision = true;
        }
        if (res.reply) state.history.push({ role: "assistant", content: res.reply });
        turns.push(turn);
        continue;
      }
    }

    // ── Exploratory: send a message before adding (once) ─────────────────
    if (profile.decisionStyle === "exploratory" && state.messagesSent === 0 && isEmpty) {
      state.messagesSent++;
      state.browseCount++;
      const pool    = MESSAGES[profile.decisionStyle];
      const message = pool[Math.floor(Math.random() * pool.length)]!;
      const event: V2Event = "ON_USER_MESSAGE";
      countEvent(state, event);
      state.history.push({ role: "user", content: message });
      const res = await AIOrderService.runWebTurn(
        buildAIInput(restaurantId, state, catalog, event, message)
      );
      const turn: SimTurn = {
        index:    state.turnIndex++,
        action:   "send_message",
        event,
        message,
        aiMessage: res.reply,
        aiCards:  res.cards,
      };
      if (res.cards.length > 0) {
        state.totalCards += res.cards.length; state.cardEvents++;
        state.lastCards   = res.cards; state.pendingDecision = true;
      }
      if (res.reply) state.history.push({ role: "assistant", content: res.reply });
      turns.push(turn);
      continue;
    }

    // ── Add item ─────────────────────────────────────────────────────────────
    const item = pickItemToAdd(profile, catalog, state);
    if (!item) {
      // Can't afford anything — abandon
      state.abandoned      = true;
      state.abandonReason  = "Nenhum item disponível dentro do orçamento restante";
      break;
    }

    addToCart(state, item);
    const event: V2Event = cartQty(state) >= 2 ? "ON_CART_UPDATED" : "ON_ITEM_ADDED";
    countEvent(state, event);
    const res = await AIOrderService.runWebTurn(
      buildAIInput(restaurantId, state, catalog, event, `Adicionar ${item.name}`, item.id)
    );
    const turn: SimTurn = {
      index:     state.turnIndex++,
      action:    qty === 0 ? "add_item" : "add_another_item",
      event,
      itemAdded: { id: item.id, name: item.name, price: item.price },
      aiMessage: res.reply,
      aiCards:   res.cards,
    };
    if (res.cards.length > 0) {
      state.totalCards += res.cards.length; state.cardEvents++;
      state.lastCards   = res.cards; state.pendingDecision = true;
    } else {
      state.lastCards = [];
    }
    if (res.reply) state.history.push({ role: "assistant", content: res.reply });
    turns.push(turn);
  }

  // ── Turn limit hit without finalization ────────────────────────────────────
  if (!state.finalized && !state.abandoned) {
    state.abandoned     = true;
    state.abandonReason = "Limite de turnos atingido sem finalização";
  }

  // ── Build result ──────────────────────────────────────────────────────────
  const finalQty    = cartQty(state);
  const finalValue  = cartValue(state);
  const hasMain     = cartHasMain(state, catalog);
  const goalAchieved =
    state.finalized &&
    finalQty >= profile.groupSize &&
    hasMain &&
    finalValue <= profile.budgetMax;

  return {
    profile,
    turns,
    result: {
      goalAchieved,
      finalized:        state.finalized,
      itemsCount:       finalQty,
      totalValue:       finalValue,
      abandoned:        state.abandoned,
      abandonmentReason: state.abandonReason,
    },
  };
}

// ─── aggregate metrics ────────────────────────────────────────────────────────

function buildMetrics(scenarios: WebScenarioResult[]): WebSimMetrics {
  const n   = scenarios.length;
  if (n === 0) return {
    goalCompletionRate: 0, naturalFinalizationRate: 0, avgItemsPerOrder: 0,
    upsellAcceptanceRate: 0, idleRecoveryRate: 0, abandonmentRate: 0,
    checkoutCompletionRate: 0, avgCardsPerEvent: 0, avgTurnsToFinalize: 0,
    eventDistribution: {},
  };

  let goals = 0, finalizations = 0, itemsSum = 0, abandoned = 0;
  let upsellOffered = 0, upsellAccepted = 0;
  let idleTriggers = 0, idleRecoveries = 0;
  let checkouts = 0, turnsSum = 0;
  let totalCards = 0, cardEvents = 0;
  const eventDist: Partial<Record<V2Event, number>> = {};

  for (const s of scenarios) {
    if (s.result.goalAchieved)  goals++;
    if (s.result.finalized)     finalizations++;
    if (s.result.abandoned)     abandoned++;
    if (s.result.finalized)     itemsSum += s.result.itemsCount;

    // Aggregate from turns
    let turnUpsellOff = 0, turnUpsellAcc = 0, turnIdleTrig = 0, turnIdleRec = 0;
    let hasCheckout = false;
    for (const t of s.turns) {
      if (t.event) eventDist[t.event] = (eventDist[t.event] ?? 0) + 1;
      if (t.aiCards && t.aiCards.length > 0) { totalCards += t.aiCards.length; cardEvents++; }
      if (t.action === "accept_suggestion" || t.action === "ignore_suggestion") turnUpsellOff++;
      if (t.action === "accept_suggestion") turnUpsellAcc++;
      if (t.action === "wait") { turnIdleTrig++; }
      if (t.action === "accept_suggestion" && t.event === "ON_ITEM_ADDED") turnIdleRec++;
      if (t.action === "fill_checkout") hasCheckout = true;
    }
    upsellOffered  += turnUpsellOff;
    upsellAccepted += turnUpsellAcc;
    idleTriggers   += turnIdleTrig;
    idleRecoveries += turnIdleRec;
    if (hasCheckout) checkouts++;
    if (s.result.finalized) turnsSum += s.turns.length;
  }

  const finalizedCount = scenarios.filter((s) => s.result.finalized).length;

  return {
    goalCompletionRate:      goals / n,
    naturalFinalizationRate: finalizations / n,
    avgItemsPerOrder:        finalizedCount > 0 ? itemsSum / finalizedCount : 0,
    upsellAcceptanceRate:    upsellOffered > 0 ? upsellAccepted / upsellOffered : 0,
    idleRecoveryRate:        idleTriggers  > 0 ? idleRecoveries / idleTriggers : 0,
    abandonmentRate:         abandoned / n,
    checkoutCompletionRate:  finalizations > 0 ? checkouts / finalizations : 0,
    avgCardsPerEvent:        cardEvents > 0 ? totalCards / cardEvents : 0,
    avgTurnsToFinalize:      finalizedCount > 0 ? turnsSum / finalizedCount : 0,
    eventDistribution:       eventDist,
  };
}

// ─── public API ───────────────────────────────────────────────────────────────

export async function runWebSimulation(
  restaurantId:  string,
  mode:          WebSimMode,
  options?:      { customCount?: number; onScenarioDone?: (r: WebScenarioResult, i: number, total: number) => void },
): Promise<WebSimReport> {
  const count = mode === "CUSTOM"
    ? (options?.customCount ?? 5)
    : MODE_COUNT[mode];

  // Load restaurant name
  const restaurant = await prisma.restaurant.findUnique({
    where:  { id: restaurantId },
    select: { name: true },
  });
  const restaurantName = restaurant?.name ?? restaurantId;

  // Load catalog once
  const catalogRows = await prisma.menuItem.findMany({
    where:   {
      isActive: true, isAvailable: true, showInDelivery: true,
      category: { restaurantId },
    },
    orderBy: { sortOrder: "asc" },
    select:  { id: true, name: true, price: true, sortOrder: true, category: { select: { name: true } } },
  });
  const catalog: V2CatalogItem[] = catalogRows.map((i: typeof catalogRows[number]) => ({
    id:           i.id,
    name:         i.name,
    categoryName: (i.category as { name: string } | null)?.name ?? "",
    price:        Number(i.price),
    sortOrder:    i.sortOrder ?? undefined,
  }));

  if (catalog.length === 0) {
    throw new Error(`Restaurante ${restaurantId} não tem itens no cardápio disponíveis.`);
  }

  const profiles  = generateProfiles(count);
  const scenarios: WebScenarioResult[] = [];

  for (let i = 0; i < profiles.length; i++) {
    const profile  = profiles[i]!;
    const result   = await runScenario(restaurantId, profile, catalog);
    scenarios.push(result);
    options?.onScenarioDone?.(result, i + 1, profiles.length);
  }

  return {
    mode,
    ranAt:          new Date().toISOString(),
    restaurantName,
    scenarioCount:  scenarios.length,
    scenarios,
    metrics:        buildMetrics(scenarios),
  };
}
