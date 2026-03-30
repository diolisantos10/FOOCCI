/**
 * FOOCCI QA — Scenario Driver
 *
 * Executes a sequence of QAActions against an initial QAState,
 * returning a log of every action taken and the final state.
 *
 * Loop detection:
 *   - If total actions exceed MAX_ACTIONS, execution is aborted.
 *   - If any single stage is visited more than MAX_STAGE_VISITS times,
 *     a loop is declared and execution stops.
 */

import type {
  QAAction,
  QAState,
  QAActionLog,
  MenuCategoryFixture,
} from "./types";
import {
  addToCart,
  removeFromCart,
  getCategoryByType,
  findProductByName,
  applyFinalize,
  applyDelivery,
  applyAddressLine1,
  applyAddressLine2,
  applyConfirmAddress,
  applyNameInput,
  applyPayment,
  applyConfirmOrder,
  applyBackToBrowse,
  syncUISnapshot,
} from "./state";

const MAX_ACTIONS = 100;

// A "return" is visiting a stage you've already left.
// 3 returns to the same stage indicates an unresolved loop.
const MAX_STAGE_RETURNS = 3;

export interface DriveResult {
  logs: QAActionLog[];
  finalState: QAState;
  loopDetected: boolean;
  abortedReason?: string;
}

export function driveScenario(
  initialState: QAState,
  actions: QAAction[],
  menu: MenuCategoryFixture[],
): DriveResult {
  const logs: QAActionLog[] = [];
  let state: QAState = { ...initialState };

  // Loop detection: track stage transitions.
  // A "return" is when the stage changes back to one already seen before.
  // Staying in BROWSE for many actions is normal; repeatedly cycling back
  // to the same stage is a loop.
  let prevStage: string = state.stage;
  const stageExits: string[] = [];   // ordered list of stages we've left
  const stageReturnCounts = new Map<string, number>();

  for (let seq = 0; seq < actions.length; seq++) {
    if (seq >= MAX_ACTIONS) {
      return {
        logs,
        finalState: state,
        loopDetected: false,
        abortedReason: `Exceeded MAX_ACTIONS (${MAX_ACTIONS})`,
      };
    }

    const action = actions[seq] as QAAction;
    const stateBefore: QAState = { ...state };
    const timestamp = new Date().toISOString();
    let assertionError: string | undefined;
    let error: string | undefined;

    try {
      switch (action.type) {

        // ── Product / category ─────────────────────────────────

        case "add_product": {
          const found = findProductByName(menu, action.productName);
          if (!found) {
            error = `Product not found in menu: "${action.productName}"`;
          } else {
            state = { ...state, cart: addToCart(state.cart, found.item) };
          }
          break;
        }

        case "add_first_from_category": {
          const cat = getCategoryByType(menu, action.categoryType);
          if (!cat || cat.items.length === 0) {
            error = `No items found in category type: "${action.categoryType}"`;
          } else {
            const item = cat.items[0] as MenuCategoryFixture["items"][0];
            state = { ...state, cart: addToCart(state.cart, item) };
          }
          break;
        }

        case "remove_product": {
          const found = findProductByName(menu, action.productName);
          if (!found) {
            error = `Product not found in menu: "${action.productName}"`;
          } else {
            state = { ...state, cart: removeFromCart(state.cart, found.item.id) };
          }
          break;
        }

        case "switch_category": {
          const cat = getCategoryByType(menu, action.categoryType);
          if (!cat) {
            error = `Category type not found: "${action.categoryType}"`;
          } else {
            state = { ...state, visibleCategoryId: cat.id };
          }
          break;
        }

        case "open_product_modal": {
          const found = findProductByName(menu, action.productName);
          if (!found) {
            error = `Product not found for modal: "${action.productName}"`;
          } else {
            state = { ...state, isModalOpen: true };
          }
          break;
        }

        case "close_modal": {
          state = { ...state, isModalOpen: false };
          break;
        }

        // ── Finalize / upsell ──────────────────────────────────

        case "finalize": {
          const { state: next } = applyFinalize(state, menu);
          state = next;
          break;
        }

        case "accept_upsell": {
          // 1. Add the first item from the upsell category
          if (state.upsellOffered !== null) {
            const catType = state.upsellOffered === "drink" ? "drink" : "dessert";
            const cat = getCategoryByType(menu, catType);
            if (cat && cat.items.length > 0) {
              const item = cat.items[0] as MenuCategoryFixture["items"][0];
              state = { ...state, cart: addToCart(state.cart, item) };
            }
          }
          // 2. Call finalize — advances upsell sequence or goes to checkout
          const { state: next } = applyFinalize(state, menu);
          state = next;
          break;
        }

        case "refuse_upsell": {
          // Call finalize again without adding anything — advances the upsell sequence
          const { state: next } = applyFinalize(state, menu);
          state = next;
          break;
        }

        // ── Checkout flow ──────────────────────────────────────

        case "select_delivery": {
          const { state: next } = applyDelivery(state, action.method);
          state = next;
          break;
        }

        case "input_address": {
          const { state: s1 } = applyAddressLine1(state, action.line1);
          state = s1;
          // Only process line2 if line1 successfully advanced to ADDRESS_DETAILS
          if (action.line2 !== undefined && state.stage === "ADDRESS_DETAILS") {
            const { state: s2 } = applyAddressLine2(state, action.line2);
            state = s2;
          }
          break;
        }

        case "confirm_address": {
          const { state: next } = applyConfirmAddress(state);
          state = next;
          break;
        }

        case "input_name": {
          const { state: next } = applyNameInput(state, action.name);
          state = next;
          break;
        }

        case "select_payment": {
          const { state: next } = applyPayment(state, action.method);
          state = next;
          break;
        }

        case "confirm_order": {
          const { state: next } = applyConfirmOrder(state);
          state = next;
          break;
        }

        case "go_back_to_browse": {
          const { state: next } = applyBackToBrowse(state);
          state = next;
          break;
        }

        // ── Inline assertions ──────────────────────────────────
        // These do NOT change state; they validate it in-place.

        case "assert_stage": {
          if (state.stage !== action.expected) {
            assertionError = `Expected stage "${action.expected}", got "${state.stage}"`;
          }
          break;
        }

        case "assert_upsell": {
          if (state.upsellOffered !== action.expected) {
            assertionError = `Expected upsellOffered=${String(action.expected)}, got ${String(state.upsellOffered)}`;
          }
          break;
        }

        case "assert_cart_qty": {
          const item = state.cart.find((c) => c.name === action.productName);
          const actual = item?.qty ?? 0;
          if (actual !== action.expected) {
            assertionError = `Expected qty ${action.expected} for "${action.productName}", got ${actual}`;
          }
          break;
        }

        case "assert_cart_total": {
          const total = state.cart.reduce((s, i) => s + i.price * i.qty, 0);
          if (total < action.minExpected) {
            assertionError = `Expected cart total ≥ ${action.minExpected.toFixed(2)}, got ${total.toFixed(2)}`;
          }
          break;
        }

        case "assert_checkout_visible": {
          if (state.isCheckoutVisible !== action.expected) {
            assertionError = `Expected isCheckoutVisible=${action.expected}, got ${state.isCheckoutVisible}`;
          }
          break;
        }

        case "assert_modal_open": {
          if (state.isModalOpen !== action.expected) {
            assertionError = `Expected isModalOpen=${action.expected}, got ${state.isModalOpen}`;
          }
          break;
        }
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    // Sync derived UI snapshot fields after every action
    state = syncUISnapshot(state);

    logs.push({
      seq,
      action,
      timestamp,
      stateBefore,
      stateAfter: { ...state },
      assertionError,
      error,
    });

    // Loop detection: if the stage changed, record the exit.
    // If we returned to a stage we've already left, increment its return count.
    if (state.stage !== prevStage) {
      stageExits.push(prevStage);
      prevStage = state.stage;
      if (stageExits.includes(state.stage)) {
        const returns = (stageReturnCounts.get(state.stage) ?? 0) + 1;
        stageReturnCounts.set(state.stage, returns);
        if (returns > MAX_STAGE_RETURNS) {
          return {
            logs,
            finalState: state,
            loopDetected: true,
            abortedReason: `Stage "${state.stage}" returned to ${returns} times (loop threshold: ${MAX_STAGE_RETURNS})`,
          };
        }
      }
    }
  }

  return { logs, finalState: state, loopDetected: false };
}
