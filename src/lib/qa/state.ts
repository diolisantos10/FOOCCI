/**
 * FOOCCI QA — Pure State Machine
 *
 * Re-implements the ordering logic from page.tsx as pure functions
 * so the QA runner can drive state transitions without React or a browser.
 *
 * Every function is referentially transparent:
 *   newState = applyXxx(currentState, menu, ...args)
 *
 * The logic is kept deliberately in sync with page.tsx handlers.
 * If page.tsx changes its finalize/upsell logic, update here too.
 */

import type {
  QAState,
  CartItem,
  Address,
  Stage,
  DeliveryMethod,
  PaymentMethod,
  MenuCategoryFixture,
  MenuItemFixture,
} from "./types";

// ─── Initial state ────────────────────────────────────────────

export function initialState(menu: MenuCategoryFixture[]): QAState {
  const first = menu[0];
  return {
    stage: "BROWSE",
    cart: [],
    offeredDrink:       false,
    offeredDessert:     false,
    refusedDrink:       false,
    refusedDessert:     false,
    lastUpsellCategory: null,
    deliveryMethod: null,
    address: { street: "", number: "", neighborhood: "", complement: "" },
    customerName: "",
    paymentMethod: null,
    visibleCategoryId: first?.id ?? null,
    isCheckoutVisible: false,
    isModalOpen: false,
  };
}

// ─── Menu helpers (mirrors page.tsx) ─────────────────────────

function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function findBeverageCat(menu: MenuCategoryFixture[]): MenuCategoryFixture | null {
  return (
    menu.find((c) => {
      const n = norm(c.name);
      return (
        n.includes("bebida") ||
        n.includes("drink") ||
        n.includes("suco") ||
        n.includes("refri")
      );
    }) ?? null
  );
}

export function findDessertCat(menu: MenuCategoryFixture[]): MenuCategoryFixture | null {
  return (
    menu.find((c) => {
      const n = norm(c.name);
      return n.includes("sobremesa") || n.includes("doce");
    }) ?? null
  );
}

export function findMainCat(menu: MenuCategoryFixture[]): MenuCategoryFixture | null {
  const drinkCat = findBeverageCat(menu);
  const dessertCat = findDessertCat(menu);
  return menu.find((c) => c !== drinkCat && c !== dessertCat) ?? null;
}

export function getCategoryByType(
  menu: MenuCategoryFixture[],
  type: "main" | "drink" | "dessert",
): MenuCategoryFixture | null {
  if (type === "drink") return findBeverageCat(menu);
  if (type === "dessert") return findDessertCat(menu);
  return findMainCat(menu);
}

export function findProductByName(
  menu: MenuCategoryFixture[],
  name: string,
): { item: MenuItemFixture; category: MenuCategoryFixture } | null {
  for (const cat of menu) {
    for (const item of cat.items) {
      if (item.name === name) return { item, category: cat };
    }
  }
  return null;
}

// ─── Cart operations ──────────────────────────────────────────

export function addToCart(
  cart: CartItem[],
  product: { id: string; name: string; price: number },
): CartItem[] {
  const existing = cart.find((c) => c.id === product.id);
  return existing
    ? cart.map((c) =>
        c.id === product.id ? { ...c, qty: c.qty + 1 } : c,
      )
    : [...cart, { id: product.id, name: product.name, price: product.price, qty: 1 }];
}

export function decrementCart(cart: CartItem[], id: string): CartItem[] {
  return cart
    .map((c) => (c.id === id ? { ...c, qty: c.qty - 1 } : c))
    .filter((c) => c.qty > 0);
}

export function removeFromCart(cart: CartItem[], id: string): CartItem[] {
  return cart.filter((c) => c.id !== id);
}

export function cartTotal(cart: CartItem[]): number {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}

// ─── Address parsing (mirrors page.tsx) ──────────────────────

export function parseStreetLine(raw: string): { street: string; number: string } {
  const m = raw.trim().match(/^(.*?),?\s*(\d+\S*)\s*$/);
  return m
    ? { street: (m[1] ?? "").trim(), number: (m[2] ?? "").trim() }
    : { street: raw.trim(), number: "" };
}

export function parseNeighborhoodLine(raw: string): {
  neighborhood: string;
  complement: string;
} {
  const parts = raw.split(",").map((p) => p.trim());
  return {
    neighborhood: parts[0] ?? "",
    complement: parts.slice(1).join(", "),
  };
}

// ─── Transition events ────────────────────────────────────────

export type TransitionEvent =
  | "PRODUCT_ADDED"
  | "PRODUCT_REMOVED"
  | "CATEGORY_SWITCHED"
  | "MODAL_OPENED"
  | "MODAL_CLOSED"
  | "EMPTY_CART_BLOCKED"
  | "ALREADY_IN_CHECKOUT_IGNORED"
  | "UPSELL_DRINK_TRIGGERED"
  | "UPSELL_DESSERT_TRIGGERED"
  | "CHECKOUT_STARTED"
  | "DELIVERY_SELECTED"
  | "ADDRESS_NUMBER_MISSING"
  | "ADDRESS_NEIGHBORHOOD_MISSING"
  | "ADDRESS_FIELDS_MISSING"
  | "ADDRESS_ACCEPTED"
  | "ADDRESS_CONFIRMED"
  | "NAME_SET"
  | "PAYMENT_SELECTED"
  | "ORDER_CONFIRMED"
  | "BACK_TO_BROWSE";

export interface Transition {
  state: QAState;
  event: TransitionEvent;
}

// ─── State transitions (mirror page.tsx handlers) ─────────────

/**
 * deriveUpsellOffered — maps new boolean upsell fields to the legacy
 * UpsellOffered type so assert_upsell scenario actions stay compatible.
 */
export function deriveUpsellOffered(
  state: QAState,
): "drink" | "dessert" | null {
  if (state.lastUpsellCategory === "drink"   && state.offeredDrink   && !state.refusedDrink)   return "drink";
  if (state.lastUpsellCategory === "dessert" && state.offeredDessert && !state.refusedDessert) return "dessert";
  return null;
}

/**
 * applyFinalize — mirrors handleFinalizeClick in page.tsx.
 *
 * Gate sequence (each offered at most once, skipped if refused):
 *   Gate 1: drink  — if no drink in cart AND not yet offered AND not refused
 *   Gate 2: dessert — if no dessert in cart AND not yet offered AND not refused
 *   Otherwise → proceed to checkout
 *
 * Refusal detection: only when the LAST category opened by the engine is
 * still absent from the cart on the next applyFinalize call.
 */
export function applyFinalize(
  state: QAState,
  menu: MenuCategoryFixture[],
): Transition {
  if (state.cart.length === 0) {
    return { state, event: "EMPTY_CART_BLOCKED" };
  }
  if (state.stage !== "BROWSE") {
    return { state, event: "ALREADY_IN_CHECKOUT_IGNORED" };
  }

  const cartIds    = new Set(state.cart.map((c) => c.id));
  const drinkCat   = findBeverageCat(menu);
  const dessertCat = findDessertCat(menu);
  const hasDrink   = drinkCat   ? drinkCat.items.some((i)   => cartIds.has(i.id)) : false;
  const hasDessert = dessertCat ? dessertCat.items.some((i) => cartIds.has(i.id)) : false;

  // Refusal detection — only for the last category the engine explicitly opened
  const justRefusedDrink   = state.lastUpsellCategory === "drink"   && !hasDrink;
  const justRefusedDessert = state.lastUpsellCategory === "dessert" && !hasDessert;
  const refusedDrink   = state.refusedDrink   || justRefusedDrink;
  const refusedDessert = state.refusedDessert || justRefusedDessert;

  // Gate 1: drink upsell
  if (!hasDrink && !state.offeredDrink && !refusedDrink && drinkCat) {
    return {
      state: {
        ...state,
        offeredDrink: true,
        refusedDrink,
        refusedDessert,
        lastUpsellCategory: "drink",
        visibleCategoryId: drinkCat.id,
      },
      event: "UPSELL_DRINK_TRIGGERED",
    };
  }

  // Gate 2: dessert upsell
  if (!hasDessert && !state.offeredDessert && !refusedDessert && dessertCat) {
    return {
      state: {
        ...state,
        offeredDessert: true,
        refusedDrink,
        refusedDessert,
        lastUpsellCategory: "dessert",
        visibleCategoryId: dessertCat.id,
      },
      event: "UPSELL_DESSERT_TRIGGERED",
    };
  }

  // All gates passed or skipped → proceed to checkout
  return {
    state: {
      ...state,
      refusedDrink,
      refusedDessert,
      stage: "DELIVERY_TYPE",
      isCheckoutVisible: true,
    },
    event: "CHECKOUT_STARTED",
  };
}

export function applyDelivery(
  state: QAState,
  method: DeliveryMethod,
): Transition {
  if (method === "pickup") {
    return {
      state: { ...state, deliveryMethod: "pickup", stage: "ASK_NAME" },
      event: "DELIVERY_SELECTED",
    };
  }
  return {
    state: { ...state, deliveryMethod: "delivery", stage: "ADDRESS_INPUT" },
    event: "DELIVERY_SELECTED",
  };
}

export function applyAddressLine1(
  state: QAState,
  line1: string,
): Transition {
  const { street, number } = parseStreetLine(line1);
  if (!number) {
    return {
      state: { ...state, address: { ...state.address, street, number: "" } },
      event: "ADDRESS_NUMBER_MISSING",
    };
  }
  return {
    state: {
      ...state,
      stage: "ADDRESS_DETAILS",
      address: { ...state.address, street, number },
    },
    event: "ADDRESS_ACCEPTED",
  };
}

export function applyAddressLine2(
  state: QAState,
  line2: string,
): Transition {
  const { neighborhood, complement } = parseNeighborhoodLine(line2);
  if (!neighborhood.trim()) {
    return { state, event: "ADDRESS_NEIGHBORHOOD_MISSING" };
  }
  return {
    state: {
      ...state,
      stage: "ADDRESS_CONFIRM",
      address: { ...state.address, neighborhood, complement },
    },
    event: "ADDRESS_ACCEPTED",
  };
}

export function applyConfirmAddress(state: QAState): Transition {
  const { street, number, neighborhood } = state.address;
  if (!street.trim() || !number.trim() || !neighborhood.trim()) {
    return { state, event: "ADDRESS_FIELDS_MISSING" };
  }
  return {
    state: { ...state, stage: "ASK_NAME" },
    event: "ADDRESS_CONFIRMED",
  };
}

export function applyNameInput(state: QAState, name: string): Transition {
  return {
    state: { ...state, customerName: name.trim(), stage: "PAYMENT" },
    event: "NAME_SET",
  };
}

export function applyPayment(
  state: QAState,
  method: PaymentMethod,
): Transition {
  return {
    state: { ...state, paymentMethod: method, stage: "REVIEW_ORDER" },
    event: "PAYMENT_SELECTED",
  };
}

export function applyConfirmOrder(state: QAState): Transition {
  return {
    state: { ...state, stage: "DONE", isCheckoutVisible: false },
    event: "ORDER_CONFIRMED",
  };
}

export function applyBackToBrowse(state: QAState): Transition {
  return {
    state: {
      ...state,
      stage: "BROWSE",
      deliveryMethod: null,
      paymentMethod: null,
      isCheckoutVisible: false,
      // reset upsell — mirrors handleBackToBrowse / handleEditOrder in page.tsx
      offeredDrink:       false,
      offeredDessert:     false,
      refusedDrink:       false,
      refusedDessert:     false,
      lastUpsellCategory: null,
    },
    event: "BACK_TO_BROWSE",
  };
}

// ─── UI snapshot sync ─────────────────────────────────────────

/**
 * After every action, recompute derived UI snapshot fields to keep
 * them consistent with the business state.
 */
export function syncUISnapshot(state: QAState): QAState {
  return {
    ...state,
    isCheckoutVisible: state.stage !== "BROWSE" && state.stage !== "DONE",
  };
}
