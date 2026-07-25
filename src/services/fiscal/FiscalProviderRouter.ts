/**
 * FiscalProviderRouter — picks which gateway emits NFC-e for a restaurant.
 *
 * Mirrors PaymentRouter: resolve a provider from per-restaurant config, or null
 * when emission is disabled/unconfigured. Adding a gateway = one case in
 * `buildFiscalProvider` (+ its adapter). The emission engine (Etapa 4) never
 * knows which vendor ran the note.
 */

import type { FiscalProvider, FiscalEnvironment } from "./providers/types";
import { FocusNFeProvider } from "./providers/FocusNFeProvider";
import { NuvemFiscalProvider } from "./providers/NuvemFiscalProvider";
import { getFiscalConfig } from "./fiscalCredentials";

/**
 * Build a provider from explicit credentials — used by the settings
 * "testar conexão" BEFORE emission is enabled, so the owner can validate the
 * token without flipping the switch first.
 */
export function buildFiscalProvider(
  providerName: string,
  token: string,
  ambiente: FiscalEnvironment,
): FiscalProvider | null {
  switch (providerName) {
    case "FOCUS_NFE":
      return new FocusNFeProvider(token, ambiente);
    case "NUVEM_FISCAL":
      return new NuvemFiscalProvider(token, ambiente);
    default:
      return null;
  }
}

/** Resolve the active provider for a restaurant, or null if disabled/unconfigured. */
export async function resolveFiscalProvider(restaurantId: string): Promise<FiscalProvider | null> {
  const resolved = await getFiscalConfig(restaurantId);
  if (!resolved) return null;
  const { config, ambiente, providerToken } = resolved;
  if (!config.enabled || config.provider === "DISABLED" || !providerToken) return null;
  return buildFiscalProvider(config.provider, providerToken, ambiente);
}

/** Which gateways are wired (for diagnostics/UI). */
export function knownFiscalProviders(): string[] {
  return ["FOCUS_NFE", "NUVEM_FISCAL"];
}
