/**
 * waiterOpening — pure contract for the Waiter's clean chat opening.
 *
 * The opening shows ONE optional action only: "Quero uma sugestão". There is no
 * "Me sugere algo", no "Agora não", no "Quer ajuda para escolher?", no second
 * card and no "Pedir novamente" in the chat ("Pedir de novo" is a menu
 * category, not a chat button). Kept pure so the contract is unit-tested.
 */

export const SUGGESTION_OPTION_VALUE = "see_suggestions";
export const SUGGESTION_OPTION_LABEL = "Quero uma sugestão";

export interface OpeningOption {
  label: string;
  value: string;
}

/** The single optional opening action. */
export function buildOpeningOptions(): OpeningOption[] {
  return [{ label: SUGGESTION_OPTION_LABEL, value: SUGGESTION_OPTION_VALUE }];
}

/** Labels that must NEVER appear in the clean opening. */
export const FORBIDDEN_OPENING_LABELS: readonly string[] = [
  "Me sugere algo",
  "Agora não",
  "Quer ajuda para escolher?",
  "Prefiro continuar",
  "Pedir novamente",
  "Ver sugestões",
];
