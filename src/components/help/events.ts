/**
 * Tiny client event bus that lets the TopBar (and anything else) open the
 * floating Help widget on a given tab, without threading a provider through the
 * dashboard layout tree.
 */

export const HELP_OPEN_EVENT = "foocci:help-open";

export type HelpTab = "ajuda" | "avisos";

export interface HelpOpenDetail {
  tab: HelpTab;
}

/** Open the floating help widget, optionally on a specific tab. */
export function openHelpWidget(tab: HelpTab = "ajuda"): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<HelpOpenDetail>(HELP_OPEN_EVENT, { detail: { tab } }),
  );
}
