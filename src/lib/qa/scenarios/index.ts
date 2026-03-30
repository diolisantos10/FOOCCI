/**
 * FOOCCI QA — Scenario Registry
 *
 * All scenarios in execution order (roughly: critical → high → medium).
 * Import this list to run the full suite.
 */

import type { QAScenario } from "../types";

import { directBuyer }       from "./direct-buyer";
import { finalizeEarly }     from "./finalize-early";
import { refuseDrink }       from "./refuse-drink";
import { duplicateQty }      from "./duplicate-qty";
import { multiCategory }     from "./multi-category";
import { incompleteAddress } from "./incomplete-address";
import { pickupFlow }        from "./pickup-flow";
import { stressFinalize }    from "./stress-finalize";
import { randomBehavior }    from "./random-behavior";
import { recovery }          from "./recovery";

export const allScenarios: QAScenario[] = [
  directBuyer,
  finalizeEarly,
  refuseDrink,
  duplicateQty,
  multiCategory,
  incompleteAddress,
  pickupFlow,
  stressFinalize,
  randomBehavior,
  recovery,
];

export {
  directBuyer,
  finalizeEarly,
  refuseDrink,
  duplicateQty,
  multiCategory,
  incompleteAddress,
  pickupFlow,
  stressFinalize,
  randomBehavior,
  recovery,
};
