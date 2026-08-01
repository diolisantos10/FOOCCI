/**
 * WebOrderService — AI ordering assistant for /pedido/[slug] public web UI.
 *
 * Stateless: every request is self-contained (cart + history live client-side).
 * Contrast with AIOrderService (WhatsApp) which is stateful and tool-based.
 *
 * Single entry point: runTurn(input) → { reply, suggestedItemName? }
 *
 * This file consolidates and replaces:
 *   src/lib/ai-context/{runner,builder,filter,types}.ts
 *   src/lib/agent/{builder,personality,sales,protocol,types}.ts
 *   src/lib/sales/{flow,suggest,opportunity}.ts
 *   src/lib/order/orchestrator.ts
 */

import { openai }            from "@/lib/openai";
import { prisma }            from "@/lib/prisma";
import { BrandConfigService } from "./BrandConfigService";
import type OpenAI            from "openai";

// ═══════════════════════════════════════════════════════════════════════════════
// 1. PUBLIC API TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type OrderStage =
  | "BROWSE"
  | "DELIVERY_TYPE"
  | "ADDRESS_INPUT"
  | "ADDRESS_DETAILS"
  | "ADDRESS_CONFIRM"
  | "ASK_NAME"
  | "PAYMENT"
  | "PAYMENT_METHOD"
  | "PAYMENT_LINK"
  | "REVIEW_ORDER"
  | "DONE";

export interface TurnCartItem {
  name:  string;
  price: number;
  qty:   number;
}

export interface TurnInput {
  restaurantId:    string;
  message:         string;
  history:         Array<{ role: "user" | "assistant"; content: string }>;
  cart?:           TurnCartItem[];
  stage?:          OrderStage;
  upsellOffered?:  "drink" | "dessert" | null;
  deliveryMethod?: "delivery" | "pickup" | null;
  address?:        string | null;
  paymentMethod?:  string | null;
  customerId?:     string;
  customerPhone?:  string;
  customerName?:   string | null;
  categoryIntro?:  { name: string; description: string } | null;
}

export interface TurnOutput {
  reply:              string;
  suggestedItemName?: string;
  forced?:            true;
  reason?:            string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. INTERNAL TYPES
// ═══════════════════════════════════════════════════════════════════════════════

type SalesPhase    = "NONE" | "DRINK" | "DESSERT" | "DONE";
type ToneValue     = "friendly" | "professional" | "casual" | "warm";
type FormalityVal  = "formal" | "informal" | "mixed";
type EmojiUsage    = "none" | "minimal" | "moderate" | "expressive";
type CommStyle     = "conversational" | "concise" | "detailed";
type PersonalityP  = "traditional" | "fast" | "premium" | "young" | "aggressive";
type UpsellStyle   = "none" | "gentle" | "moderate" | "proactive";
type UpsellIntens  = "low" | "medium" | "high";
type SalesFocus    = "balanced" | "ticket" | "volume";
type SalesPriority = "bestsellers" | "high_margin" | "promotions";

interface PersonalityConfig {
  tone:               ToneValue;
  formality:          FormalityVal;
  emojiUsage:         EmojiUsage;
  communicationStyle: CommStyle;
  preset:             PersonalityP;
  greetingTemplate:   string | null;
}

interface SalesConfig {
  upsellStyle:     UpsellStyle;
  upsellIntensity: UpsellIntens;
  focus:           SalesFocus;
  priority:        SalesPriority;
}

interface MenuItem {
  id:           string;
  name:         string;
  description:  string | null;
  ingredients:  string | null;
  price:        number;
  imageUrl:     string | null;
  isAvailable:  boolean;
  isBestseller: boolean;
  tags:         string[];
}

interface MenuCategory {
  id:             string;
  name:           string;
  description:    string | null;
  isAvailable:    boolean;
  showInDelivery: boolean;
  showInDineIn:   boolean;
  items:          MenuItem[];
}

interface Promotion {
  id:                string;
  name:              string;
  description:       string | null;
  type:              string;
  discountValue:     number;
  target:            string;
  targetProductIds:  string[];
  targetCategoryIds: string[];
  couponCode:        string | null;
  minOrderValue:     number | null;
  channel:           string;
  endsAt:            string | null;
}

interface CustomerCtx {
  id:                 string;
  name:               string;
  phone:              string;
  email:              string | null;
  totalOrders:        number;
  totalSpend:         number;
  lastOrderAt:        string | null;
  daysSinceLastOrder: number | null;
  isRecurring:        boolean;
  preferences: {
    dietary:      string[];
    allergies:    string[];
    favoriteDish: string | null;
    notes:        string | null;
  } | null;
  recentOrders: Array<{
    id:        string;
    total:     number;
    type:      string;
    status:    string;
    createdAt: string;
    items:     Array<{ name: string; quantity: number; price: number }>;
  }>;
  segments: string[];
}

interface CartItemCtx {
  itemId:    string;
  name:      string;
  quantity:  number;
  unitPrice: number;
  notes:     string | null;
}

interface DeliveryCtx {
  enabled:           boolean;
  pickupEnabled:     boolean;
  fee:               number | null;
  estimatedMinutes:  number | null;
  minOrderValue:     number | null;
  freeDeliveryAbove: number | null;
  areaDescription:   string | null;
}

interface PaymentCtx {
  acceptPix:  boolean;
  acceptCash: boolean;
  acceptCard: boolean;
  acceptLink: boolean;
}

interface AIConfigCtx {
  tone:                 string;
  formality:            string;
  emojiUsage:           string;
  communicationStyle:   string;
  personalityPreset:    string;
  greetingTemplate:     string | null;
  systemPromptOverride: string | null;
  upsellStyle:          string;
  upsellIntensity:      string;
  salesFocus:           string;
  salesPriority:        string;
  comboFocus:           boolean;
  avgTicketFocus:       boolean;
  useClientName:        boolean;
  canInsistAfterRefusal:boolean;
  aiModel:              string;
  maxHistoryMessages:   number;
}

interface Context {
  restaurant: {
    id:          string;
    name:        string;
    slug:        string;
    description: string | null;
    timezone:    string;
    plan:        string;
  };
  aiConfig:    AIConfigCtx;
  menu:        MenuCategory[];
  promotions:  Promotion[];
  customer:    CustomerCtx | null;
  operational: {
    delivery:       DeliveryCtx | null;
    payment:        PaymentCtx | null;
    cart:           CartItemCtx[];
    cartTotal:      number;
    orderStage:     string | null;
    deliveryMethod: string | null;
    address:        string | null;
    paymentMethod:  string | null;
    customerName:   string | null;
    salesPhase:     SalesPhase;
    salesResolved:  boolean;
  };
}

interface SuggestedItem {
  itemName:        string;
  itemPrice:       number;
  itemDescription: string | null;
  reason:          string;
  promotionHint:   string | null;
}

interface SalesFlowResult {
  salesPhase:    SalesPhase;
  salesResolved: boolean;
  blockCheckout: boolean;
  type?:         "drink" | "dessert";
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. CONFIG CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const ALLOWED_MODELS = new Set(["gpt-4o-mini", "gpt-4o"]);

const DEFAULT_PERSONALITY: PersonalityConfig = {
  tone:               "friendly",
  formality:          "informal",
  emojiUsage:         "moderate",
  communicationStyle: "conversational",
  preset:             "traditional",
  greetingTemplate:   null,
};

const DEFAULT_SALES: SalesConfig = {
  upsellStyle:     "gentle",
  upsellIntensity: "medium",
  focus:           "balanced",
  priority:        "bestsellers",
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. DIETARY FILTER
// ═══════════════════════════════════════════════════════════════════════════════

const FISH_KW      = ["peixe","atum","salmão","salmao","tilápia","tilapia","bacalhau","sardinha","anchova","moqueca","file de peixe"];
const SEAFOOD_KW   = ["camarão","camarao","lagosta","caranguejo","mariscos","frutos do mar","polvo","lula","ostra","mexilhão","mexilhao"];
const PORK_KW      = ["porco","bacon","presunto","linguiça","linguica","chouriço","chourico","pernil","salame","pepperoni","peperoni","lombo suíno","lombo suino","bisteca"];
const MEAT_KW      = ["carne","frango","bife","costela","hambúrguer","hamburguer","churrasco","steak","filé","file","fraldinha","picanha","alcatra","acém","acem","contrafilé","contrafile",...FISH_KW,...SEAFOOD_KW,...PORK_KW];
const DAIRY_KW     = ["queijo","requeijão","requeijao","leite","manteiga","creme de leite","iogurte","nata","ricota","chantilly","mussarela"];
const EGG_KW       = ["ovo","ovos","clara","gema"];
const GLUTEN_KW    = ["trigo","farinha de trigo","glúten","gluten","macarrão","macarrao","massa","pão","pao","cerveja"];
const VEGAN_EXCL   = [...MEAT_KW,...DAIRY_KW,...EGG_KW,"mel"];
const VEG_EXCL     = MEAT_KW;

const VEGAN_TRIG   = ["vegano","vegana","vegan","sou vegan"];
const VEG_TRIG     = ["vegetariano","vegetariana","sem carne","plant-based","não como carne","nao como carne","não como frango","nao como frango","não como peixe","nao como peixe","não como nada de animal"];
const NOFISH_TRIG  = ["sem peixe","não como peixe","nao como peixe","alergia a peixe","alergia ao peixe","não gosto de peixe","nao gosto de peixe"];
const NOSEA_TRIG   = ["sem frutos do mar","sem mariscos","sem camarão","sem camarao","não como frutos do mar","nao como frutos do mar","alergia a frutos do mar","alergia ao camarão","alergia a camarao"];
const NOPORK_TRIG  = ["sem porco","sem carne de porco","sem bacon","sem presunto","não como porco","nao como porco","não como bacon","nao como bacon","halal","kosher"];
const NOLACT_TRIG  = ["sem lactose","intolerante a lactose","intolerância a lactose","intolerancia a lactose","alergia ao leite","alergia a leite","sem leite"];
const NOGLU_TRIG   = ["sem glúten","sem gluten","celíaco","celiaco","intolerante ao glúten","intolerante ao gluten","alergia ao glúten","alergia ao gluten","doença celíaca"];

type DietFlag = "vegan"|"vegetarian"|"no_fish"|"no_seafood"|"no_pork"|"no_lactose"|"no_gluten";

function normalizeDietary(labels: string[], message: string): Set<DietFlag> {
  const out = new Set<DietFlag>();
  const lower = message.toLowerCase();
  const check = (src: string) => {
    if (VEGAN_TRIG.some((t)  => src.includes(t))) out.add("vegan");
    if (VEG_TRIG.some((t)    => src.includes(t))) out.add("vegetarian");
    if (NOFISH_TRIG.some((t) => src.includes(t))) out.add("no_fish");
    if (NOSEA_TRIG.some((t)  => src.includes(t))) out.add("no_seafood");
    if (NOPORK_TRIG.some((t) => src.includes(t))) out.add("no_pork");
    if (NOLACT_TRIG.some((t) => src.includes(t))) out.add("no_lactose");
    if (NOGLU_TRIG.some((t)  => src.includes(t))) out.add("no_gluten");
  };
  for (const label of labels) check(label.toLowerCase());
  check(lower);
  return out;
}

function filterMenuForAI(menu: MenuCategory[], opts: { customerDietary?: string[]; userMessage?: string } = {}): MenuCategory[] {
  const dietary    = normalizeDietary(opts.customerDietary ?? [], opts.userMessage ?? "");
  const isVegan    = dietary.has("vegan");
  const isVeg      = isVegan || dietary.has("vegetarian");
  const noFish     = isVeg || dietary.has("no_fish");
  const noSeafood  = isVeg || dietary.has("no_seafood");
  const noPork     = isVeg || dietary.has("no_pork");
  const noLactose  = dietary.has("no_lactose");
  const noGluten   = dietary.has("no_gluten");
  if (!isVeg && !noFish && !noSeafood && !noPork && !noLactose && !noGluten) return menu;

  const excl: string[] = [];
  if (isVegan)   excl.push(...VEGAN_EXCL);
  else if (isVeg) excl.push(...VEG_EXCL);
  else {
    if (noFish)    excl.push(...FISH_KW);
    if (noSeafood) excl.push(...SEAFOOD_KW);
    if (noPork)    excl.push(...PORK_KW);
  }
  if (noLactose) excl.push(...DAIRY_KW);
  if (noGluten)  excl.push(...GLUTEN_KW);
  const unique = [...new Set(excl)];

  function itemExcluded(item: MenuItem, catName: string): boolean {
    const text = `${catName} ${item.name} ${item.description ?? ""} ${item.ingredients ?? ""}`.toLowerCase();
    return unique.some((kw) => text.includes(kw));
  }

  return menu
    .map((cat) => ({ ...cat, items: cat.items.filter((i) => !itemExcluded(i, cat.name)) }))
    .filter((cat) => cat.items.length > 0);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. DB CONTEXT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

const TAG_MAP: Array<[string, string[]]> = [
  ["vegetariano", ["vegetariano","sem carne","plant-based","vegetal"]],
  ["vegano",      ["vegano","vegan","plant based"]],
  ["sem glúten",  ["sem glúten","gluten free","gluten-free","s/glúten"]],
  ["sem lactose", ["sem lactose","lactose free","s/lactose"]],
  ["picante",     ["picante","apimentado","ardido","pimenta malagueta"]],
  ["fresco",      ["fresco","natural","orgânico"]],
];

function deriveTags(name: string, description: string | null): string[] {
  const hay = `${name} ${description ?? ""}`.toLowerCase();
  return TAG_MAP.filter(([, kws]) => kws.some((kw) => hay.includes(kw))).map(([tag]) => tag);
}

async function buildContext(
  restaurantId: string,
  opts: {
    customerId?:    string;
    customerPhone?: string;
    cart?:          Array<{ itemId?: string; name: string; quantity: number; unitPrice: number; notes?: string | null }>;
    orderStage?:    string | null;
    deliveryMethod?:string | null;
    address?:       string | null;
    paymentMethod?: string | null;
    customerName?:  string | null;
  } = {},
): Promise<Context> {
  const {
    customerId, customerPhone,
    cart = [], orderStage = null, deliveryMethod = null,
    address = null, paymentMethod = null, customerName = null,
  } = opts;

  const customerInclude = {
    preferences: true,
    orders: {
      orderBy: { createdAt: "desc" as const },
      take: 5,
      include: { items: { select: { name: true, quantity: true, price: true } } },
    },
    segmentMembers: { include: { segment: { select: { name: true } } } },
  } as const;

  const customerPromise = customerId
    ? prisma.customer.findUnique({ where: { id: customerId }, include: customerInclude })
    : customerPhone
    ? prisma.customer.findUnique({ where: { phone_restaurantId: { phone: customerPhone, restaurantId } }, include: customerInclude })
    : Promise.resolve(null);

  const [restaurant, brandConfig, categories, promotions, deliveryConfig, paymentSettings, customerRaw] =
    await Promise.all([
      prisma.restaurant.findUnique({
        where:  { id: restaurantId },
        select: { id: true, name: true, slug: true, description: true, timezone: true, plan: true },
      }),
      BrandConfigService.getOrDefault(restaurantId),
      prisma.menuCategory.findMany({
        where:    { restaurantId, isActive: true, isAvailable: true },
        orderBy:  { sortOrder: "asc" },
        include: {
          items: {
            where:   { isActive: true, isAvailable: true, showInDelivery: true },
            orderBy: { sortOrder: "asc" },
          },
        },
      }),
      prisma.promotion.findMany({ where: { restaurantId, status: "ACTIVE" } }),
      prisma.deliveryConfig.findUnique({ where: { restaurantId } }),
      prisma.paymentSettings.findUnique({ where: { restaurantId } }),
      customerPromise,
    ]);

  if (!restaurant) throw new Error(`WebOrderService: restaurant "${restaurantId}" not found`);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const topItems = await prisma.orderItem.groupBy({
    by:      ["menuItemId"],
    where:   { order: { restaurantId, createdAt: { gte: thirtyDaysAgo }, status: { not: "CANCELLED" } } },
    _sum:    { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take:    5,
  });
  const bestsellerIds = new Set(topItems.map((r) => r.menuItemId).filter((id): id is string => id !== null));

  const menu: MenuCategory[] = categories.map((cat) => ({
    id:             cat.id,
    name:           cat.name,
    description:    cat.description,
    isAvailable:    cat.isAvailable,
    showInDelivery: cat.showInDelivery,
    showInDineIn:   cat.showInDineIn,
    items:          cat.items.map((item): MenuItem => ({
      id:           item.id,
      name:         item.name,
      description:  item.description,
      ingredients:  item.ingredients ?? null,
      price:        Number(item.price),
      imageUrl:     item.imageUrl,
      isAvailable:  item.isAvailable,
      isBestseller: bestsellerIds.has(item.id),
      tags:         deriveTags(item.name, item.description),
    })),
  }));

  const promos: Promotion[] = promotions.map((p) => ({
    id:                p.id,
    name:              p.name,
    description:       p.description,
    type:              p.type,
    discountValue:     Number(p.discountValue),
    target:            p.target,
    targetProductIds:  p.targetProductIds,
    targetCategoryIds: p.targetCategoryIds,
    couponCode:        p.couponCode,
    minOrderValue:     p.minOrderValue != null ? Number(p.minOrderValue) : null,
    channel:           p.channel,
    endsAt:            p.endsAt?.toISOString() ?? null,
  }));

  let customer: CustomerCtx | null = null;
  if (customerRaw) {
    const daysSince = customerRaw.lastOrderAt
      ? Math.floor((Date.now() - customerRaw.lastOrderAt.getTime()) / 86_400_000)
      : null;
    customer = {
      id:                 customerRaw.id,
      name:               customerRaw.name,
      phone:              customerRaw.phone,
      email:              customerRaw.email,
      totalOrders:        customerRaw.totalOrders,
      totalSpend:         Number(customerRaw.totalSpend),
      lastOrderAt:        customerRaw.lastOrderAt?.toISOString() ?? null,
      daysSinceLastOrder: daysSince,
      isRecurring:        customerRaw.totalOrders > 1,
      preferences:        customerRaw.preferences
        ? { dietary: customerRaw.preferences.dietary, allergies: customerRaw.preferences.allergies, favoriteDish: customerRaw.preferences.favoriteDish, notes: customerRaw.preferences.notes }
        : null,
      recentOrders: customerRaw.orders.map((o) => ({
        id:        o.id,
        total:     Number(o.total),
        type:      o.type,
        status:    o.status,
        createdAt: o.createdAt.toISOString(),
        items:     o.items.map((i) => ({ name: i.name, quantity: i.quantity, price: Number(i.price) })),
      })),
      segments: customerRaw.segmentMembers.map((m) => m.segment.name),
    };
  }

  const delivery: DeliveryCtx | null = deliveryConfig
    ? {
        enabled:           deliveryConfig.enabled,
        pickupEnabled:     deliveryConfig.pickupEnabled,
        fee:               deliveryConfig.fee != null ? Number(deliveryConfig.fee) : null,
        estimatedMinutes:  deliveryConfig.estimatedMinutes,
        minOrderValue:     deliveryConfig.minOrderValue != null ? Number(deliveryConfig.minOrderValue) : null,
        freeDeliveryAbove: deliveryConfig.freeDeliveryAbove != null ? Number(deliveryConfig.freeDeliveryAbove) : null,
        areaDescription:   deliveryConfig.areaDescription,
      }
    : null;

  const payment: PaymentCtx | null = paymentSettings
    ? { acceptPix: paymentSettings.acceptPix, acceptCash: paymentSettings.acceptCash, acceptCard: paymentSettings.acceptCard, acceptLink: paymentSettings.acceptLink }
    : null;

  const cartItems: CartItemCtx[] = cart.map((item) => ({
    itemId:    item.itemId ?? "",
    name:      item.name,
    quantity:  item.quantity,
    unitPrice: item.unitPrice,
    notes:     item.notes ?? null,
  }));
  const cartTotal = cartItems.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  const persona = brandConfig.brandPersona as Record<string, unknown> | null;

  return {
    restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug, description: restaurant.description, timezone: restaurant.timezone, plan: restaurant.plan },
    aiConfig: {
      tone:                 brandConfig.tone,
      formality:            brandConfig.formality,
      emojiUsage:           brandConfig.emojiUsage,
      communicationStyle:   brandConfig.communicationStyle,
      personalityPreset:    brandConfig.personalityPreset,
      greetingTemplate:     brandConfig.greetingTemplate,
      systemPromptOverride: brandConfig.systemPromptOverride,
      upsellStyle:          brandConfig.upsellStyle,
      upsellIntensity:      brandConfig.upsellIntensity,
      salesFocus:           brandConfig.salesFocus,
      salesPriority:        brandConfig.salesPriority,
      comboFocus:           Boolean(persona?.comboFocus),
      avgTicketFocus:       Boolean(persona?.avgTicketFocus),
      useClientName:        persona?.useClientName !== false,
      canInsistAfterRefusal:persona?.canInsistAfterRefusal !== false,
      aiModel:              brandConfig.aiModel,
      maxHistoryMessages:   brandConfig.maxHistoryMessages,
    },
    menu,
    promotions: promos,
    customer,
    operational: {
      delivery, payment, cart: cartItems, cartTotal,
      orderStage: orderStage ?? null, deliveryMethod: deliveryMethod ?? null,
      address: address ?? null, paymentMethod: paymentMethod ?? null,
      customerName: customerName ?? null,
      salesPhase: "NONE", salesResolved: false,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. ORDER FLOW VALIDATOR
// ═══════════════════════════════════════════════════════════════════════════════

type FlowBlocked = { block: true; reason: string; message: string };
type FlowClear   = { block: false };

function validateOrderFlow(ctx: Context): FlowBlocked | FlowClear {
  const { cart, deliveryMethod, address, paymentMethod, customerName } = ctx.operational;
  const customer = ctx.customer;

  const hasItems        = cart.length > 0;
  const hasName         = !!(customer?.name?.trim() || customerName?.trim());
  const hasDelivery     = !!deliveryMethod;
  const hasAddress      = !!address?.trim();
  const hasPayment      = !!paymentMethod?.trim();

  if (!hasItems)                                     return { block: true, reason: "NO_ITEMS",          message: "Vamos começar escolhendo seu pedido 👇" };
  if (!hasDelivery)                                  return { block: true, reason: "MISSING_DELIVERY",   message: "Seu pedido é para entrega ou retirada?" };
  if (deliveryMethod === "delivery" && !hasAddress)  return { block: true, reason: "MISSING_ADDRESS",    message: "Me informe seu endereço para entrega 👇" };
  if (!hasName)                                      return { block: true, reason: "MISSING_NAME",       message: "Como posso te chamar?" };
  if (!hasPayment)                                   return { block: true, reason: "MISSING_PAYMENT",    message: "Qual será a forma de pagamento?" };

  return { block: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. SALES PHASE RESOLVER
// ═══════════════════════════════════════════════════════════════════════════════

const DRINK_KW_PHASE   = ["bebida","bebidas","suco","sucos","refrigerante","refrigerantes","água","cerveja","cervejas","limonada","chá","café","vitamina","shake","smoothie","drinks","drink","coquetéis"];
const DESSERT_KW_PHASE = ["sobremesa","sobremesas","doce","doces","pudim","sorvete","brigadeiro","brownie","torta","bolo","mousse","petit gateau","açaí","waffle","crepe"];

function buildCatIndex(menu: MenuCategory[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const cat of menu) for (const item of cat.items) if (item.id) m.set(item.id, cat.name.toLowerCase());
  return m;
}

function inKeywords(text: string, kws: string[]): boolean {
  return kws.some((kw) => text.includes(kw));
}

function itemInGroup(item: CartItemCtx, kws: string[], idx: Map<string, string>): boolean {
  const cat = item.itemId ? (idx.get(item.itemId) ?? "") : "";
  return (cat && inKeywords(cat, kws)) || inKeywords(item.name.toLowerCase(), kws);
}

function resolveSalesPhase(ctx: Context, alreadyOffered: "drink" | "dessert" | null): SalesFlowResult {
  const cart = ctx.operational.cart;
  if (cart.length === 0) return { salesPhase: "NONE", salesResolved: true, blockCheckout: false };

  const idx        = buildCatIndex(ctx.menu);
  const hasDrink   = cart.some((i) => itemInGroup(i, DRINK_KW_PHASE,   idx));
  const hasDessert = cart.some((i) => itemInGroup(i, DESSERT_KW_PHASE, idx));
  const hasMain    = cart.some((i) => !itemInGroup(i, DRINK_KW_PHASE, idx) && !itemInGroup(i, DESSERT_KW_PHASE, idx));

  if (!hasMain) return { salesPhase: "DONE", salesResolved: true, blockCheckout: false };

  if (!hasDrink && alreadyOffered !== "drink")
    return { salesPhase: "DRINK", salesResolved: false, blockCheckout: true, type: "drink" };

  if ((hasDrink || alreadyOffered === "drink") && !hasDessert && alreadyOffered !== "dessert")
    return { salesPhase: "DESSERT", salesResolved: false, blockCheckout: true, type: "dessert" };

  return { salesPhase: "DONE", salesResolved: true, blockCheckout: false };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. SUGGESTION ENGINE
// ═══════════════════════════════════════════════════════════════════════════════

type ContextRule = [cartKws: string[], itemKws: string[], reason: string];

const DRINK_PAIRING: ContextRule[] = [
  [["vegano","vegetariano","plant based","sem carne","fit","light","leve","natural"],["suco","vitamina","limonada","água","natural","chá"],"vai muito bem com esse estilo leve e natural"],
  [["peixe","camarão","salmão","frutos do mar","tilápia","bacalhau"],["limonada","água","suco","vitamina","cerveja"],"vai muito bem com frutos do mar"],
  [["japonês","sushi","temaki","yakissoba","udon","gyoza","sashimi","niguiri","harumaki"],["chá","água","suco","refrigerante","saquê"],"harmoniza com comida japonesa"],
  [["pizza","calabresa","pepperoni","portuguesa","mussarela"],["cola","refrigerante","coca","cerveja","chopp"],"combina muito bem com pizza"],
  [["hamburger","burger","lanche","smash","cheddar","bacon"],["refrigerante","limonada","cola","cerveja","chopp"],"fica perfeito com lanche"],
  [["costela","churrasco","espetinho","picanha","fraldinha","bife","carne assada"],["cerveja","chopp","refrigerante","cola"],"fica incrível com uma carne boa assim"],
  [["frango","grelhado","salada"],["suco","vitamina","limonada","água","natural"],"vai muito bem com esse estilo mais leve"],
  [["massa","pasta","lasanha","macarrão","espaguete","talharim","ravioli"],["refrigerante","limonada","cerveja","chopp","suco"],"harmoniza perfeitamente com massas"],
  [["açaí","frutas","tropical","granola"],["suco","vitamina","água de coco","natural"],"combina com esse estilo tropical"],
  [["picante","apimentado","pimenta","ardido","jalapeño"],["limonada","água","refrigerante","suco"],"fica perfeito para equilibrar o picante"],
  [["mexicano","burrito","taco","quesadilla","nachos","guacamole"],["limonada","refrigerante","suco","água"],"combina com o sabor mexicano"],
  [["tapioca","pão de queijo","cuscuz","pamonha"],["suco","vitamina","café","natural","água de coco"],"vai muito bem com esse sabor brasileiro"],
];

const DESSERT_PAIRING: ContextRule[] = [
  [["pizza","hamburger","burger","lanche","bacon","cheddar","smash"],["sorvete","sorbet","mousse","leve","fruta","frutas"],"fica perfeito para fechar um pedido assim"],
  [["vegano","vegetariano","natural","fit","light","leve","grelhado"],["frutas","mousse","natural","vegano","leve","sorvete"],"combina com o estilo do seu pedido"],
  [["frango","salada","levinho","grelhado","wrap"],["sorvete","frutas","mousse","leve","sorbet"],"vai muito bem para fechar com leveza"],
  [["costela","churrasco","espetinho","picanha","fraldinha","carne assada"],["brownie","petit gateau","chocolate","brigadeiro","torta"],"fica perfeito depois de um prato assim"],
  [["massa","pasta","lasanha","macarrão","espaguete","talharim"],["pudim","tiramisu","bolo","mousse","panna cotta"],"é o fechamento clássico para massas"],
  [["açaí","frutas","tropical","granola"],["waffle","crepe","bolo","frutas"],"combina muito bem com esse estilo"],
  [["picante","apimentado","pimenta","ardido"],["sorvete","sorbet","mousse","frutas"],"vai muito bem para refrescar no final"],
];

const DRINK_CAT_KW   = ["bebida","bebidas","suco","sucos","refrigerante","refrigerantes","água","cerveja","cervejas","limonada","chá","café","vitamina","shake","smoothie","drinks","drink","coquetéis"];
const DESSERT_CAT_KW = ["sobremesa","sobremesas","doce","doces","pudim","sorvete","brigadeiro","brownie","torta","bolo","mousse","petit gateau","açaí","waffle","crepe"];

function normSug(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function matchesAnySug(text: string, kws: string[]): boolean {
  const n = normSug(text);
  return kws.some((kw) => n.includes(normSug(kw)));
}

function findCategory(menu: MenuCategory[], type: "drink" | "dessert"): MenuCategory | null {
  const kws = type === "drink" ? DRINK_CAT_KW : DESSERT_CAT_KW;
  return menu.find((c) => matchesAnySug(c.name, kws))
    ?? menu.find((c) => c.items.some((i) => matchesAnySug(i.name, kws)))
    ?? null;
}

function buildPromoMap(promos: Promotion[], cat: MenuCategory): Map<string, Promotion> {
  const map = new Map<string, Promotion>();
  for (const p of promos)
    for (const item of cat.items)
      if (!map.has(item.id) && (p.targetProductIds.includes(item.id) || p.targetCategoryIds.includes(cat.id) || p.target === "ORDER"))
        map.set(item.id, p);
  return map;
}

function formatPromoHint(p: Promotion): string {
  if (p.type === "PERCENTAGE")    return `${p.discountValue}% de desconto hoje`;
  if (p.type === "FIXED")         return `R$ ${p.discountValue.toFixed(2)} de desconto`;
  if (p.type === "FREE_DELIVERY") return "frete grátis incluído";
  return p.name;
}

function scoreItem(
  item:       MenuItem,
  promoMap:   Map<string, Promotion>,
  priority:   SalesPriority,
  cartText:   string,
  type:       "drink" | "dessert",
  pastNames:  Set<string>,
): number {
  let score = 0;
  if (item.isBestseller) score += priority === "bestsellers" ? 40 : 30;
  if (promoMap.has(item.id)) score += priority === "promotions" ? 30 : 20;

  const itemText = normSug(`${item.name} ${item.description ?? ""} ${item.tags.join(" ")}`);
  const rules = type === "drink" ? DRINK_PAIRING : DESSERT_PAIRING;
  for (const [cartKws, itemKws] of rules)
    if (matchesAnySug(cartText, cartKws) && matchesAnySug(itemText, itemKws)) score += 15;

  if (/vegano|vegetariano|plant.based|sem.carne/.test(cartText)) {
    const animalKws = ["leite","queijo","creme","requeijao","cream","dairy","mel","ovo","ovos","bacon","carne","frango","camarao"];
    if (matchesAnySug(itemText, animalKws)) score -= 25;
  }

  if (pastNames.has(normSug(item.name))) score += 10;
  return score;
}

function resolveReason(cart: CartItemCtx[], item: MenuItem, type: "drink" | "dessert"): string {
  const cartText = normSug(cart.map((i) => `${i.name} ${i.notes ?? ""}`).join(" "));
  const itemText = normSug(`${item.name} ${item.description ?? ""} ${item.tags.join(" ")}`);
  const rules    = type === "drink" ? DRINK_PAIRING : DESSERT_PAIRING;
  for (const [cartKws, itemKws, reason] of rules)
    if (cartKws.length > 0 && matchesAnySug(cartText, cartKws) && (itemKws.length === 0 || matchesAnySug(itemText, itemKws)))
      return reason;
  return type === "drink" ? "vai muito bem com o que você pediu" : "fica perfeito para fechar bem";
}

function selectSuggestion(ctx: Context, filteredMenu: MenuCategory[], type: "drink" | "dessert", priority: SalesPriority): SuggestedItem | null {
  const cart     = ctx.operational.cart;
  const category = findCategory(filteredMenu, type);
  if (!category || category.items.length === 0) return null;

  const promoMap  = buildPromoMap(ctx.promotions, category);
  const cartText  = normSug(cart.map((i) => `${i.name} ${i.notes ?? ""}`).join(" "));
  const pastNames = new Set<string>((ctx.customer?.recentOrders ?? []).flatMap((o) => o.items.map((i) => normSug(i.name))));

  const scored = category.items
    .map((item) => ({ item, score: scoreItem(item, promoMap, priority, cartText, type, pastNames) }))
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.item;
  if (!best) return null;

  const promo = promoMap.get(best.id) ?? null;
  return {
    itemName:        best.name,
    itemPrice:       best.price,
    itemDescription: best.description,
    reason:          resolveReason(cart, best, type),
    promotionHint:   promo ? formatPromoHint(promo) : null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. SYSTEM PROMPT BUILDER
// ═══════════════════════════════════════════════════════════════════════════════

// ── Personality → config ──────────────────────────────────────────────────────

function coerce<T extends string>(val: string | null | undefined, allowed: T[], fallback: T): T {
  return allowed.includes(val as T) ? (val as T) : fallback;
}

function toPersonality(cfg: AIConfigCtx): PersonalityConfig {
  return {
    tone:               coerce(cfg.tone,               ["friendly","professional","casual","warm"],                      DEFAULT_PERSONALITY.tone),
    formality:          coerce(cfg.formality,          ["formal","informal","mixed"],                                     DEFAULT_PERSONALITY.formality),
    emojiUsage:         coerce(cfg.emojiUsage,         ["none","minimal","moderate","expressive"],                        DEFAULT_PERSONALITY.emojiUsage),
    communicationStyle: coerce(cfg.communicationStyle, ["conversational","concise","detailed"],                           DEFAULT_PERSONALITY.communicationStyle),
    preset:             coerce(cfg.personalityPreset,  ["traditional","fast","premium","young","aggressive"],             DEFAULT_PERSONALITY.preset),
    greetingTemplate:   cfg.greetingTemplate,
  };
}

function toSales(cfg: AIConfigCtx): SalesConfig {
  return {
    upsellStyle:     coerce(cfg.upsellStyle,     ["none","gentle","moderate","proactive"],              DEFAULT_SALES.upsellStyle),
    upsellIntensity: coerce(cfg.upsellIntensity, ["low","medium","high"],                               DEFAULT_SALES.upsellIntensity),
    focus:           coerce(cfg.salesFocus,      ["balanced","ticket","volume"],                        DEFAULT_SALES.focus),
    priority:        coerce(cfg.salesPriority,   ["bestsellers","high_margin","promotions"],            DEFAULT_SALES.priority),
  };
}

// ── Personality layer (Layer 1) ───────────────────────────────────────────────

function emojiRule(u: EmojiUsage): string {
  if (u === "none")       return "NÃO use nenhum emoji em nenhuma mensagem.";
  if (u === "minimal")    return "Máx. 1 emoji por mensagem, apenas quando reforça o significado.";
  if (u === "expressive") return "Use emojis livremente — reforçam energia e personalidade.";
  return "Use 1–2 emojis por mensagem para transmitir calor sem exagerar.";
}

function presetVoice(p: PersonalityP): string {
  if (p === "fast")       return "Você é rápido, direto e eficiente. Conduza o cliente ao pedido sem demora.";
  if (p === "premium")    return "Você é refinado, atencioso e impecável — como um garçom de restaurante de alto padrão.";
  if (p === "young")      return "Você é despojado, animado e próximo — como um amigo recomendando o que pedir.";
  if (p === "aggressive") return "Você é confiante e persuasivo. Guia ativamente o cliente para pedidos maiores.";
  return "Você é caloroso, acessível e genuinamente prestativo — o atendente de confiança do bairro.";
}

function langStyle(p: PersonalityConfig): string {
  const parts: string[] = [];
  if (p.formality === "formal")   parts.push("Use linguagem formal (você). Evite gírias.");
  if (p.formality === "informal") parts.push("Use linguagem informal e direta. Frases curtas.");
  if (p.formality === "mixed")    parts.push("Misture cortesia formal com informalidade acolhedora.");
  if (p.tone === "professional")  parts.push("Tom profissional — sem excessos de exclamações.");
  if (p.tone === "casual")        parts.push("Tom casual — como uma troca de mensagens com um amigo.");
  if (p.tone === "warm")          parts.push("Tom caloroso — o cliente deve se sentir bem-vindo.");
  if (p.communicationStyle === "concise")  parts.push("Seja brevíssimo. Máx. 1 frase por resposta sempre que possível.");
  else if (p.communicationStyle === "detailed") parts.push("Forneça contexto útil quando relevante.");
  else parts.push("Extensão conversacional — máx. 1–2 frases.");
  return parts.join(" ");
}

function buildPersonalityLayer(p: PersonalityConfig, restaurantName: string, stage: OrderStage): string {
  const greeting = (!stage || stage === "BROWSE")
    ? (p.greetingTemplate ? `Abertura: "${p.greetingTemplate}"` : `Abertura: "Olá! Que bom ter você aqui 😊 O que vai ser hoje?"`)
    : `Abertura: DESATIVADA — etapa de checkout ativa. NÃO use saudação de abertura.`;
  return `━━━ IDENTIDADE ━━━\nVocê é o atendente de pedidos do *${restaurantName}*.\n${presetVoice(p.preset)}\n\nESTILO: ${langStyle(p)}\nEMOJIS: ${emojiRule(p.emojiUsage)}\n${greeting}`;
}

// ── Restaurant profile + menu blocks (Layer 2) ────────────────────────────────

const CUISINE_SIGS: [string[], string][] = [
  [["sushi","temaki","sashimi","niguiri","uramaki","harumaki","yakissoba","udon","gyoza","missoshiro"],"Restaurante japonês / culinária oriental"],
  [["pizza","pizzas","calzone","mussarela","pepperoni","calabresa"],"Pizzaria"],
  [["hamburger","burger","smash","artesanal","lanche","hot dog"],"Hamburgueria / lanchonete"],
  [["vegano","vegetariano","plant based","sem carne","integral","orgânico"],"Restaurante vegano / vegetariano"],
  [["peixe","salmão","camarão","frutos do mar","atum","tilápia","bacalhau"],"Restaurante de frutos do mar / peixaria"],
  [["churrasco","picanha","costela","espetinho","fraldinha","maminha"],"Churrascaria"],
  [["tapioca","cuscuz","baião","macaxeira","nordestino","regional"],"Restaurante regional / nordestino"],
  [["massa","lasanha","macarrão","espaguete","risoto","nhoque"],"Restaurante italiano / massas"],
];

function normPrompt(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function detectCuisine(menu: MenuCategory[]): string {
  const allText = menu.flatMap((c) => [c.name, ...c.items.map((i) => `${i.name} ${i.description ?? ""}`)]).join(" ");
  const n = normPrompt(allText);
  for (const [kws, label] of CUISINE_SIGS)
    if (kws.filter((kw) => n.includes(normPrompt(kw))).length >= 2) return label;
  return "Restaurante";
}

function findUpsellCat(menu: MenuCategory[], type: "drink" | "dessert"): MenuCategory | null {
  const kws = type === "drink"
    ? ["bebida","bebidas","suco","refrigerante","agua","cerveja","limonada","cha","cafe","drink","drinks"]
    : ["sobremesa","sobremesas","doce","pudim","sorvete","brownie","torta","bolo","mousse","acai","waffle"];
  return menu.find((c) => kws.some((kw) => normPrompt(c.name).includes(kw)))
    ?? menu.find((c) => c.items.some((i) => kws.some((kw) => normPrompt(i.name).includes(kw))))
    ?? null;
}

function buildRestaurantProfileBlock(menu: MenuCategory[]): string {
  const active = menu.filter((c) => c.items.length > 0);
  const cuisine = detectCuisine(active);
  const catNames = active.map((c) => c.name).join(", ");
  const drinkCat   = findUpsellCat(active, "drink");
  const dessertCat = findUpsellCat(active, "dessert");
  const drinkLine   = drinkCat   ? `Bebidas disponíveis (${drinkCat.name}): ${drinkCat.items.map((i) => `${i.name} — R$${i.price.toFixed(2)}`).join(", ")}`   : "Sem categoria de bebidas no cardápio.";
  const dessertLine = dessertCat ? `Sobremesas disponíveis (${dessertCat.name}): ${dessertCat.items.map((i) => `${i.name} — R$${i.price.toFixed(2)}`).join(", ")}` : "Sem categoria de sobremesas no cardápio.";
  return [`━━━ PERFIL DO RESTAURANTE (use para calibrar sugestões) ━━━`,`Tipo: ${cuisine}`,`Categorias do cardápio: ${catNames}`,drinkLine,dessertLine,`REGRA CRÍTICA: Só sugira itens que existam EXATAMENTE no cardápio acima. Nunca invente ou assuma itens não listados.`].join("\n");
}

function buildMenuBlock(menu: MenuCategory[]): string {
  const active = menu.filter((c) => c.items.length > 0);
  if (active.length === 0) return "Cardápio temporariamente indisponível.";
  return active.map((cat) => {
    const rows = cat.items.map((item) => {
      const price = `R$ ${item.price.toFixed(2)}`;
      const desc  = item.description ? ` (${item.description})` : "";
      const ing   = item.ingredients ? `\n    Ingredientes: ${item.ingredients}` : "";
      return `  • ${item.name} — ${price}${desc}${ing}`;
    }).join("\n");
    const header = cat.description ? `[${cat.name.toUpperCase()}]\n↳ ${cat.description}` : `[${cat.name.toUpperCase()}]`;
    return `${header}\n${rows}`;
  }).join("\n\n");
}

// ── Cart block (Layer 3) ──────────────────────────────────────────────────────

function buildCartBlock(cart: TurnCartItem[], menu: MenuCategory[], deliveryMethod: string | null): string {
  if (cart.length === 0) return "PEDIDO ATUAL: Nenhum item adicionado ainda.";
  const cartNames    = new Set(cart.map((c) => c.name));
  const withItems    = menu.filter((c) => c.items.some((i) => cartNames.has(i.name))).map((c) => c.name);
  const withoutItems = menu.filter((c) => !c.items.some((i) => cartNames.has(i.name))).map((c) => c.name);
  const lines        = cart.map((i) => `  • ${i.name} × ${i.qty} — R$ ${(i.price * i.qty).toFixed(2)}`);
  const total        = cart.reduce((s, i) => s + i.price * i.qty, 0);
  return [`PEDIDO ATUAL:`, ...lines, `Total parcial: R$ ${total.toFixed(2)}`, `Categorias COM itens: ${withItems.join(", ") || "nenhuma"}`, `Categorias SEM itens: ${withoutItems.join(", ") || "nenhuma"}`, `Entrega: ${deliveryMethod === "delivery" ? "ENTREGA" : deliveryMethod === "pickup" ? "RETIRADA" : "não definida"}`].join("\n");
}

// ── Sales layer (Layer 4) ─────────────────────────────────────────────────────

type UpsellKey = "gentle" | "moderate" | "proactive";

function resolveUpsellKey(style: UpsellStyle, intensity: UpsellIntens): UpsellKey {
  if (intensity === "high") return "proactive";
  if (intensity === "low")  return "gentle";
  if (style === "proactive" || style === "moderate") return style as UpsellKey;
  return "gentle";
}

function focusInstruction(focus: SalesFocus): string {
  if (focus === "ticket") return "Priorize itens de maior valor ao fazer sugestões. Mencione opções premium primeiro.";
  if (focus === "volume") return "Foco em agilidade — coloque itens no carrinho rapidamente e mantenha o ritmo.";
  return "Equilíbrio entre agilidade e experiência — bom fluxo, sugestões úteis.";
}

function buildSalesLayer(sales: SalesConfig, upsellOffered: "drink" | "dessert" | null, lastItemName: string | null, suggested: SuggestedItem | null): string {
  const focus = focusInstruction(sales.focus);
  if (sales.upsellStyle === "none" || !upsellOffered) {
    return [`━━━ ESTRATÉGIA — MODO EXPERIÊNCIA ━━━`, focus, ``, `MODO EXPERIÊNCIA ativo — o cliente está navegando pelo cardápio.`, `→ Quando um item for adicionado: valide a escolha e reforce o apelo (sabor, textura, popularidade).`, `→ Pode sugerir NO MÁXIMO UM item da MESMA categoria do item adicionado.`, `→ NUNCA invente pratos. Só mencione itens que existam no cardápio listado.`].join("\n");
  }
  const typeLabel = upsellOffered === "drink" ? "BEBIDA" : "SOBREMESA";
  if (suggested) {
    const tone = resolveUpsellKey(sales.upsellStyle, sales.upsellIntensity) === "proactive" ? "entusiasmado mas não insistente" : "consultivo e casual";
    return [`━━━ ESTRATÉGIA — MODO CONVERSÃO ━━━`, focus, ``, `UPSELL ATIVO — ${typeLabel}:`, `→ Reconheça o item que o cliente escolheu.`, `→ Sugira especificamente: "${suggested.itemName}"${suggested.itemDescription ? ` — ${suggested.itemDescription.slice(0, 70)}` : ""}`, `→ Motivo para usar: "${suggested.reason}"`, `→ Modelo de frase afirmativa: "${suggested.itemName} ${suggested.reason} 😊 — dá uma olhada 👇"`, `→ NUNCA use "Quer X?" — use sempre frases afirmativas que apresentam o item.`, `→ Tom: ${tone}. Uma única menção — se o cliente recusar, agradeça e continue.`].join("\n");
  }
  const key = resolveUpsellKey(sales.upsellStyle, sales.upsellIntensity);
  return [`━━━ ESTRATÉGIA — MODO CONVERSÃO ━━━`, focus, ``, `UPSELL ATIVO — ${typeLabel}:`, `→ Consulte o PERFIL DO RESTAURANTE acima para ver as opções disponíveis.`, `→ Escolha O item mais adequado para o pedido atual.`, `→ Sugira pelo nome exato que aparece no cardápio. NUNCA invente itens.`, `→ Use frase afirmativa (sem "Quer X?"). Tom: ${key === "proactive" ? "entusiasmado mas não insistente" : "consultivo e casual"}.`].join("\n");
}

// ── Protocol layer (Layer 5) ──────────────────────────────────────────────────

const ABSOLUTE_RULES = `━━━ REGRAS ABSOLUTAS — NÃO NEGOCIÁVEIS ━━━
1. NUNCA invente itens, preços ou categorias fora do cardápio.
2. NUNCA finalize, confirme, ou declare o pedido como pronto — isso é responsabilidade do sistema.
3. NUNCA liste o cardápio em texto — ele já aparece na interface visual do cliente.
4. NUNCA use bullets, listas numeradas ou opções em texto — máx. 3 linhas por resposta.
5. Sempre em português brasileiro.
6. Você REAGE ao estado atual — nunca avança etapas por conta própria.
7. Não contradiga nenhuma informação já confirmada pelo sistema (endereço, nome, pagamento).
8. NUNCA pergunte "Quer X?" ao sugerir — use frases afirmativas.
9. Em NENHUMA CIRCUNSTÂNCIA use frases passivas de encerramento: "estou por aqui", "se precisar de algo", "qualquer coisa me chama", "o que acha?", "que tal?", "posso te ajudar com mais algo?". Seja sempre diretivo e confiante.
10. Em etapas de CHECKOUT: execute EXCLUSIVAMENTE o script da etapa atual. A interface controla o fluxo.`;

function buildCheckoutScript(stage: OrderStage, deliveryMethod: string | null, collected: { address?: string | null; customerName?: string | null; paymentMethod?: string | null }): string {
  const addr = collected.address?.trim()       || null;
  const name = collected.customerName?.trim()  || null;
  const pay  = collected.paymentMethod?.trim() || null;
  const already = (label: string, value: string) => `  ✓ ${label}: "${value}" — JÁ COLETADO, NUNCA PERGUNTE NOVAMENTE.`;

  switch (stage) {
    case "DELIVERY_TYPE":  return [`ETAPA: FORMA DE ENTREGA`, `TAREFA ÚNICA: Direcionar para a interface de escolha (delivery ou retirada).`, `RESPOSTA: "Perfeito! 🎉 Como vai receber? 👇"`, `PROIBIDO: Mencionar endereço, pagamento, nome ou qualquer outra etapa. Máx. 1 linha.`].join("\n");
    case "ADDRESS_INPUT":  return [`ETAPA: RUA E NÚMERO`, `TAREFA ÚNICA: Pedir rua e número para entrega.`, `RESPOSTA: "Me diz a rua e o número 👇"`, `PROIBIDO: Pedir bairro, complemento, pagamento ou nome. Máx. 1 linha.`].join("\n");
    case "ADDRESS_DETAILS":return [addr ? already("Rua", addr) : "", `ETAPA: BAIRRO`, `TAREFA ÚNICA: Pedir bairro (complemento é opcional).`, `RESPOSTA: "Quase lá! Me passa o bairro 👇"`, `PROIBIDO: Pedir rua novamente. Pedir nome ou pagamento. Máx. 1 linha.`].filter(Boolean).join("\n");
    case "ADDRESS_CONFIRM":return [addr ? already("Endereço completo", addr) : "", `ETAPA: CONFIRMAR ENDEREÇO`, `TAREFA ÚNICA: Pedir que o cliente confira o endereço na interface e confirme.`, `RESPOSTA: "Confira o endereço abaixo 👇"`, `PROIBIDO: Digitar o endereço no chat. Pedir endereço novamente. Mencionar pagamento. Máx. 1 linha.`].filter(Boolean).join("\n");
    case "ASK_NAME":       return [addr ? already("Endereço", addr) : "", deliveryMethod === "pickup" ? `  ✓ Modo de recebimento: RETIRADA — endereço não necessário.` : "", `ETAPA: NOME DO CLIENTE`, `TAREFA ÚNICA: Perguntar o nome do cliente.`, `RESPOSTA: "Quase lá! 😊 Como posso chamar você?"`, `PROIBIDO: Mencionar endereço. Mencionar pagamento. Pedir mais de uma coisa. Máx. 1 linha.`].filter(Boolean).join("\n");
    case "PAYMENT":        return [name ? already("Nome", name) : "", addr ? already("Endereço", addr) : "", deliveryMethod ? `  ✓ Modo: ${deliveryMethod === "delivery" ? "ENTREGA" : "RETIRADA"} — confirmado.` : "", `ETAPA: PAGAMENTO`, `TAREFA ÚNICA: Direcionar para a interface de escolha de pagamento.`, `RESPOSTA: "💳 Última etapa — como vai pagar? 👇"`, `PROIBIDO: Pedir nome. Pedir endereço. Mencionar dados já coletados. Máx. 1 linha.`].filter(Boolean).join("\n");
    case "PAYMENT_METHOD": return [`ETAPA: FORMA DE PAGAMENTO`, `TAREFA ÚNICA: Direcionar para escolha do método de pagamento via interface.`, `RESPOSTA: "Ótimo! Como prefere pagar? 👇"`, `PROIBIDO: Perguntar dados pessoais ou de entrega. Máx. 1 linha.`].join("\n");
    case "PAYMENT_LINK":   return [`ETAPA: AGUARDANDO PAGAMENTO`, `TAREFA ÚNICA: Informar que o link de pagamento foi enviado.`, `RESPOSTA: "Link enviado! Aguardando confirmação 👇"`, `PROIBIDO: Pedir dados. Mencionar etapas anteriores. Máx. 1 linha.`].join("\n");
    case "REVIEW_ORDER":   return [name ? already("Nome", name) : "", addr ? already("Endereço", addr) : "", pay ? already("Pagamento", pay) : "", `ETAPA: REVISÃO FINAL`, `TAREFA ÚNICA: Pedir que o cliente revise e confirme via interface.`, `RESPOSTA: 1 linha. "Confere ali embaixo 👇 e me confirma"`, `PROIBIDO: Listar itens no chat. Pedir confirmação dos dados já coletados. Máx. 1 linha.`].filter(Boolean).join("\n");
    case "DONE":           return [`ETAPA: PEDIDO FINALIZADO — ENCERRADO`, `TAREFA ÚNICA: Mensagem de encerramento. Nada mais.`, `Mensagem: ${deliveryMethod === "pickup" ? '"Perfeito! Assim que estiver pronto te avisamos 👨‍🍳"' : '"Perfeito! Seu pedido já entrou na cozinha 🚀 Já já chega aí!"'}`, `PROIBIDO: Listar pedido. Perguntar qualquer coisa. Mencionar etapas anteriores. 1 linha absoluta.`].join("\n");
    default:               return `ETAPA: ${stage}`;
  }
}

const BROWSE_SCRIPT = `ETAPA: BROWSE — MODO EXPERIÊNCIA.\nVocê é um garçom que guia e encanta — não vende ainda.\n• Se o cliente visualizar uma categoria: apresente-a brevemente (máx. 2 frases).\n• Se o cliente adicionar um item: valide a escolha + reforce o desejo (sabor, textura, popularidade).\n• Pode sugerir NO MÁXIMO UM item da MESMA categoria do item adicionado.\nMáx. 2–3 linhas. Nunca liste categorias. Nunca mencione checkout ou finalização.`;

function buildProtocolLayer(stage: OrderStage, deliveryMethod: string | null, collected: { address?: string | null; customerName?: string | null; paymentMethod?: string | null } = {}): string {
  const script = stage === "BROWSE" ? BROWSE_SCRIPT : buildCheckoutScript(stage, deliveryMethod, collected);
  return `━━━ PROTOCOLO ━━━\n${ABSOLUTE_RULES}\n\n━━━ ETAPA ATUAL ━━━\n${script}`;
}

// ── Mode constraint block (LAST — highest recency weight) ─────────────────────

const DRINK_CONSTRAINT = [`━━━ MODO CONVERSÃO — FASE BEBIDA (PRIORIDADE ABSOLUTA) ━━━`,`ATENÇÃO: O cliente acabou de clicar em Finalizar. O MODO EXPERIÊNCIA ENCERROU.`,``,`PROIBIDO:`,`  ✗ Sugerir outro prato ou qualquer item fora de BEBIDA`,`  ✗ Perguntar "bebida ou sobremesa?", "algo mais?", "quer adicionar algo?"`,`  ✗ Listar múltiplos itens ou dar opções`,`  ✗ Usar qualquer pergunta fechada de sim/não`,``,`TAREFA ÚNICA: sugerir SOMENTE UMA bebida pelo nome.`,``,`OBRIGATÓRIO — 2–3 linhas: 1. Reconheça o pedido. 2. Sugira UMA bebida com frase afirmativa. 3. Dê o motivo.`,`Se o cliente aceitar, recusar ou ignorar — encerre o assunto. Não insista.`].join("\n");

const DESSERT_CONSTRAINT = [`━━━ MODO CONVERSÃO — FASE SOBREMESA (PRIORIDADE ABSOLUTA) ━━━`,`ATENÇÃO: O cliente acabou de clicar em Finalizar. O MODO EXPERIÊNCIA ENCERROU.`,``,`PROIBIDO:`,`  ✗ Sugerir bebidas ou qualquer item fora de SOBREMESA`,`  ✗ Perguntar "quer sobremesa?", "algo mais?", "quer adicionar algo?"`,`  ✗ Listar múltiplos itens ou dar opções`,`  ✗ Usar qualquer pergunta fechada de sim/não`,``,`TAREFA ÚNICA: sugerir SOMENTE UMA sobremesa pelo nome.`,``,`OBRIGATÓRIO — 2–3 linhas: 1. Reconheça o pedido. 2. Sugira UMA sobremesa com frase afirmativa. 3. Dê o motivo.`,`Se o cliente aceitar, recusar ou ignorar — encerre o assunto. Não insista.`].join("\n");

const EXPERIENCE_CONSTRAINT = [`━━━ RESTRIÇÃO MODO EXPERIÊNCIA — PRIORIDADE ABSOLUTA ━━━`,`FASE ATUAL: BROWSING. Você é um GUIA — não um vendedor.`,``,`PROIBIDO:`,`  ✗ Sugerir bebidas ou sobremesas`,`  ✗ Mencionar "finalizar pedido", "checkout", "endereço" ou "pagamento"`,`  ✗ Perguntar "quer mais alguma coisa?" ou "posso te ajudar com mais algo?"`,`  ✗ Frases passivas de encerramento: "o que acha?", "que tal?", "estou por aqui"`,``,`APRESENTAÇÃO DE CATEGORIA: máx. 2 frases curtas (≤18 palavras cada). Apresente diretamente.`,`PERMITIDO: apenas UM item da MESMA categoria do item que o cliente acabou de adicionar.`,`O momento de vender bebidas/sobremesas vem DEPOIS que o cliente clicar em Finalizar.`].join("\n");

function buildSalesConstraintBlock(upsellOffered: "drink" | "dessert" | null, stage: OrderStage): string {
  if (upsellOffered === "drink")   return DRINK_CONSTRAINT;
  if (upsellOffered === "dessert") return DESSERT_CONSTRAINT;
  if (stage === "BROWSE")          return EXPERIENCE_CONSTRAINT;
  return "";
}

// ── Informational preamble blocks ─────────────────────────────────────────────

function buildCustomerBlock(customer: CustomerCtx | null): string {
  if (!customer) return "";
  const firstName = customer.name.trim().split(/\s+/)[0];
  const lines = [`━━━ CLIENTE ━━━`, `Nome: ${firstName}`, customer.isRecurring ? `Cliente recorrente — ${customer.totalOrders} pedido(s).` : "Novo cliente ou primeira compra."];
  if (customer.preferences) {
    if (customer.preferences.dietary.length > 0)   lines.push(`Preferências alimentares: ${customer.preferences.dietary.join(", ")}`);
    if (customer.preferences.allergies.length > 0) lines.push(`Alergias: ${customer.preferences.allergies.join(", ")}`);
  }
  if (customer.segments.length > 0) lines.push(`Segmento: ${customer.segments.join(", ")}`);
  lines.push("Não mencione valores gastos ao cliente.");
  return lines.join("\n");
}

function buildPromotionsBlock(promos: Promotion[]): string {
  if (promos.length === 0) return "";
  const lines = promos.map((p) => {
    const discount = p.type === "PERCENTAGE" ? `${p.discountValue}% de desconto` : p.type === "FREE_DELIVERY" ? "frete grátis" : p.type === "FIXED" ? `R$ ${p.discountValue.toFixed(2)} de desconto` : p.name;
    const minOrder = p.minOrderValue != null ? ` (pedido mínimo R$ ${p.minOrderValue.toFixed(2)})` : "";
    const coupon   = p.couponCode ? ` — cupom: ${p.couponCode}` : "";
    const expiry   = p.endsAt ? ` — válido até ${new Date(p.endsAt).toLocaleDateString("pt-BR")}` : "";
    return `  • ${p.name}: ${discount}${minOrder}${coupon}${expiry}`;
  });
  return [`━━━ PROMOÇÕES ATIVAS ━━━`, ...lines, `Mencione promoções desta lista quando relevante. Nunca invente descontos.`].join("\n");
}

function buildSalesPhaseBlock(flow: SalesFlowResult, suggestion: SuggestedItem | null, customer: CustomerCtx | null): string {
  if (flow.salesResolved || !flow.type) return "";
  const typeLabel = flow.type === "drink" ? "BEBIDA" : "SOBREMESA";
  const lines = [`━━━ FASE COMERCIAL: ${typeLabel} ━━━`];
  if (suggestion) {
    lines.push(`Item para sugerir: "${suggestion.itemName}" — R$ ${suggestion.itemPrice.toFixed(2)}`, `Motivo contextual: ${suggestion.reason}`);
    if (suggestion.itemDescription) lines.push(`Descrição: ${suggestion.itemDescription}`);
    if (suggestion.promotionHint)   lines.push(`Promoção ativa: ${suggestion.promotionHint} — mencione de forma casual se couber.`);
    if (customer) {
      const ordered = customer.recentOrders.some((o) => o.items.some((i) => i.name.toLowerCase().includes(suggestion.itemName.toLowerCase())));
      if (ordered) lines.push(`Contexto CRM: este cliente já pediu "${suggestion.itemName}" antes — pode mencionar isso naturalmente.`);
      else if (customer.preferences?.dietary.length) lines.push(`Preferências do cliente: ${customer.preferences.dietary.join(", ")} — leve em conta ao enquadrar a sugestão.`);
    }
  } else {
    lines.push(flow.type === "drink"
      ? "Nenhum item específico selecionado. Escolha UMA bebida do cardápio que combine com o pedido. Nomeie-a diretamente."
      : "Nenhuma sobremesa específica selecionada. Escolha UMA sobremesa do cardápio. Nomeie-a diretamente.");
  }
  lines.push(`REGRA: Não use linguagem de finalização (endereço, pagamento, entrega) nesta fase.`, `Se o cliente recusar ou ignorar, continue o fluxo normalmente sem insistir.`);
  return lines.join("\n");
}

const HIGH_DEPTH_TRIGGERS = ["explica","me conta","me fala mais","me diz mais","o que e","o que é","o que sao","o que são","qual a diferenca","qual a diferença","como e feito","como é feito","ingredientes","mais detalhes","mais informacao","mais informação"];

function detectInfoDepth(msg: string): "LOW" | "HIGH" {
  const n = msg.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return HIGH_DEPTH_TRIGGERS.some((t) => n.includes(t)) ? "HIGH" : "LOW";
}

function buildInfoDepthBlock(depth: "LOW" | "HIGH", stage: OrderStage): string {
  if (stage !== "BROWSE") return "";
  return depth === "HIGH"
    ? [`━━━ PROFUNDIDADE DE RESPOSTA: ALTA ━━━`,`O cliente pediu mais detalhes. Você pode usar 3–4 frases curtas.`].join("\n")
    : [`━━━ PROFUNDIDADE DE RESPOSTA: BAIXA (padrão) ━━━`,`Máx. 2 frases curtas. Situe o cliente rapidamente.`,`NÃO explique demais, NÃO liste itens, NÃO antecipe perguntas que ele não fez.`].join("\n");
}

function buildBehaviorBlock(cfg: AIConfigCtx): string {
  const lines: string[] = [];
  if (!cfg.useClientName)         lines.push("NÃO use o nome do cliente nas mensagens — mantenha genérico.");
  if (!cfg.canInsistAfterRefusal) lines.push("Se o cliente recusar um item, NÃO sugira novamente. Respeite a decisão e siga em frente.");
  if (cfg.comboFocus)             lines.push("Prioridade: ofereça combos sempre que possível (item principal + complemento com valor percebido).");
  if (cfg.avgTicketFocus)         lines.push("Prioridade: maximize o ticket médio — sugira complementos, upgrades ou adicionais relevantes.");
  if (lines.length === 0) return "";
  return [`━━━ CONFIGURAÇÃO DE COMPORTAMENTO ━━━`, ...lines].join("\n");
}

function buildCategoryIntroBlock(intro: { name: string; description: string }): string {
  return [`━━━ NAVEGAÇÃO DE CATEGORIA ━━━`,`O cliente está visualizando: ${intro.name}`,`Descrição: ${intro.description}`,`→ Apresente esta categoria em 1–2 frases naturais. NÃO narre o clique. Máx. 2 frases curtas (≤18 palavras cada).`].join("\n");
}

// ─── Full prompt assembly ─────────────────────────────────────────────────────

interface PromptParams {
  ctx:           Context;
  filteredMenu:  MenuCategory[];
  cart:          TurnCartItem[];
  stage:         OrderStage;
  deliveryMethod: string | null;
  upsellOffered: "drink" | "dessert" | null;
  suggested:     SuggestedItem | null;
  promptFlow:    SalesFlowResult;
  message:       string;
  categoryIntro: { name: string; description: string } | null;
  address:       string | null;
  customerName:  string | null;
  paymentMethod: string | null;
}

function buildSystemPrompt(p: PromptParams): string {
  if (p.ctx.aiConfig.systemPromptOverride) return p.ctx.aiConfig.systemPromptOverride;

  const personality = toPersonality(p.ctx.aiConfig);
  const sales       = toSales(p.ctx.aiConfig);
  const isBrowse    = p.stage === "BROWSE";

  // Informational preamble (lowest LLM attention weight — prepended first)
  const preamble = [
    buildInfoDepthBlock(detectInfoDepth(p.message), p.stage),
    buildBehaviorBlock(p.ctx.aiConfig),
    p.categoryIntro ? buildCategoryIntroBlock(p.categoryIntro) : "",
    buildCustomerBlock(p.ctx.customer),
    buildPromotionsBlock(p.ctx.promotions),
    buildSalesPhaseBlock(p.promptFlow, p.suggested, p.ctx.customer),
  ].filter(Boolean).join("\n\n");

  // 5-layer behavioral prompt (personality → profile → menu → cart → sales → protocol → constraint)
  const lastItem = p.cart.at(-1)?.name ?? null;

  const agentLayers = [
    buildPersonalityLayer(personality, p.ctx.restaurant.name, p.stage),
    buildRestaurantProfileBlock(p.filteredMenu),
    `━━━ CARDÁPIO (referência interna — NÃO repita para o cliente) ━━━\n${buildMenuBlock(p.filteredMenu)}`,
    `━━━ CONTEXTO DO PEDIDO ━━━\n${buildCartBlock(p.cart, p.filteredMenu, p.deliveryMethod)}`,
    isBrowse ? buildSalesLayer(sales, p.upsellOffered, lastItem, p.suggested) : "",
    buildProtocolLayer(p.stage, p.deliveryMethod, { address: p.address, customerName: p.customerName, paymentMethod: p.paymentMethod }),
    isBrowse ? buildSalesConstraintBlock(p.upsellOffered, p.stage) : "",
  ].filter(Boolean).join("\n\n");

  return preamble ? `${preamble}\n\n${agentLayers}` : agentLayers;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 10. MAIN ENTRY POINT
// ═══════════════════════════════════════════════════════════════════════════════

const VALIDATE_AT = new Set<OrderStage>(["REVIEW_ORDER", "DONE"]);

export async function runTurn(input: TurnInput): Promise<TurnOutput> {
  const {
    restaurantId,
    message,
    history,
    cart           = [],
    stage          = "BROWSE",
    upsellOffered  = null,
    deliveryMethod = null,
    address        = null,
    paymentMethod  = null,
    customerId,
    customerPhone,
    customerName   = null,
    categoryIntro  = null,
  } = input;

  // Step 1: Build full context from DB
  const ctx = await buildContext(restaurantId, {
    customerId,
    customerPhone,
    customerName,
    orderStage:    stage,
    deliveryMethod,
    address,
    paymentMethod,
    cart: cart.map((i) => ({ name: i.name, quantity: i.qty, unitPrice: i.price })),
  });

  // Step 2: Order flow gate (only at REVIEW_ORDER and DONE)
  if (VALIDATE_AT.has(stage)) {
    const gate = validateOrderFlow(ctx);
    if (gate.block) return { reply: gate.message, forced: true, reason: gate.reason };
  }

  // Step 3: Sales phase resolution
  const salesFlow = resolveSalesPhase(ctx, upsellOffered ?? null);
  ctx.operational.salesPhase   = salesFlow.salesPhase;
  ctx.operational.salesResolved = salesFlow.salesResolved;

  // Step 4: Dietary menu filter
  const filteredMenu = filterMenuForAI(ctx.menu, {
    customerDietary: ctx.customer?.preferences?.dietary,
    userMessage:     message,
  });

  // Step 5: Derive active prompt sales phase
  // upsellOffered is authoritative when set (frontend controls this state).
  // When null the customer is freely browsing — suppress upsell directives.
  const promptFlow: SalesFlowResult = upsellOffered
    ? { ...salesFlow, salesResolved: false, type: upsellOffered }
    : { ...salesFlow, salesResolved: true, type: undefined };

  // Step 6: Select best suggestion item for active phase
  const sales     = toSales(ctx.aiConfig);
  const suggested = promptFlow.type
    ? selectSuggestion(ctx, filteredMenu, promptFlow.type, sales.priority)
    : null;

  // Step 7: Build system prompt
  const systemPrompt = buildSystemPrompt({
    ctx, filteredMenu, cart, stage, deliveryMethod, upsellOffered,
    suggested, promptFlow, message, categoryIntro,
    address, customerName, paymentMethod,
  });

  // Step 8: Validate model + cap history
  const model = ALLOWED_MODELS.has(ctx.aiConfig.aiModel) ? ctx.aiConfig.aiModel : "gpt-4o-mini";
  const cappedHistory = stage === "BROWSE"
    ? history.slice(-ctx.aiConfig.maxHistoryMessages)
    : [];

  // Step 9: Call OpenAI
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...cappedHistory.filter((m) => m.content.trim().length > 0).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: message.trim() },
  ];

  const completion = await openai.chat.completions.create({
    model,
    messages,
    temperature: 0.3,
  });

  const reply = completion.choices[0]?.message?.content?.trim() || "Desculpe, não consegui processar sua mensagem. 😅";
  return { reply, suggestedItemName: suggested?.itemName ?? undefined };
}
