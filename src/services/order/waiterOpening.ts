/**
 * waiterOpening — pure contract for the Waiter's clean chat opening.
 *
 * The opening shows "Quero uma sugestão" and, for a returning customer with
 * history, "Pedir novamente" right beside it — the customer chooses between a
 * suggestion or reordering what they had. "Pedir novamente" opens the "Comprar
 * novamente" menu category (it does NOT dump the last order into the cart).
 * Kept pure so the contract is unit-tested.
 */

export const SUGGESTION_OPTION_VALUE = "see_suggestions";
export const SUGGESTION_OPTION_LABEL = "Quero uma sugestão";

/** Opens the "Comprar novamente" menu category (customer's recent items). */
export const REPEAT_OPTION_VALUE = "open_repeat_category";
export const REPEAT_OPTION_LABEL = "Pedir novamente";

export interface OpeningOption {
  label: string;
  value: string;
}

/**
 * The opening actions: always "Quero uma sugestão"; plus "Pedir novamente" when
 * the customer has repeatable history (canRepeat).
 */
export function buildOpeningOptions(opts?: { canRepeat?: boolean }): OpeningOption[] {
  const options: OpeningOption[] = [{ label: SUGGESTION_OPTION_LABEL, value: SUGGESTION_OPTION_VALUE }];
  if (opts?.canRepeat) options.push({ label: REPEAT_OPTION_LABEL, value: REPEAT_OPTION_VALUE });
  return options;
}

/** Labels that must NEVER appear in the clean opening. */
export const FORBIDDEN_OPENING_LABELS: readonly string[] = [
  "Me sugere algo",
  "Agora não",
  "Quer ajuda para escolher?",
  "Prefiro continuar",
  "Ver sugestões",
];
