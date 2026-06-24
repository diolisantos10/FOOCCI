/**
 * Shared helpers for the printed comandas (kitchen + cashier).
 *
 * `buildStoreInfo` assembles the fiscal/address header for the cashier nota from
 * the StoreProfile (preferred) with a fallback to the base Restaurant row.
 *
 * `TICKET_PRINT_CSS` is the @media print rule used by every page that prints a
 * ticket. It must hide the dashboard chrome (sidebar, top bar) — which is NOT
 * print-hidden and lives inside an `overflow:hidden h-screen` container — and let
 * the two stacked tickets paginate, one cut per notinha. We hide everything with
 * `visibility`, reveal the print area, and pull it to the page origin with
 * `position: absolute` (NOT `fixed`, which would repeat on every page).
 */

import type { StoreInfo } from "@/components/print/OrderTicket";

interface RestaurantLike {
  name:     string;
  address:  string | null;
  timezone: string;
}

interface StoreProfileLike {
  cnpj:         string | null;
  street:       string | null;
  streetNumber: string | null;
  complement:   string | null;
  neighborhood: string | null;
  city:         string | null;
  state:        string | null;
  cep:          string | null;
}

export function buildStoreInfo(
  restaurant: RestaurantLike,
  profile: StoreProfileLike | null,
): StoreInfo {
  const lines: string[] = [];

  if (profile?.street) {
    const l1 = [profile.street, profile.streetNumber].filter(Boolean).join(", ");
    const withComp = l1 && profile.complement ? `${l1}, ${profile.complement}` : l1;
    if (withComp) lines.push(withComp);
    const l2 = [profile.city, profile.neighborhood].filter(Boolean).join(" - ");
    if (l2) lines.push(l2);
  } else if (restaurant.address) {
    lines.push(restaurant.address);
  }

  return {
    cnpj:     profile?.cnpj ?? null,
    lines,
    timezone: restaurant.timezone || "America/Sao_Paulo",
  };
}

export const TICKET_PRINT_CSS = `
  @media print {
    * { visibility: hidden !important; }
    #foocci-print-area, #foocci-print-area * { visibility: visible !important; }
    #foocci-print-area {
      display: block !important;
      position: absolute;
      left: 0;
      top: 0;
      width: 80mm;
    }
    #foocci-print-area .foocci-ticket-block { display: block !important; }
    #foocci-print-area .foocci-ticket-block { break-after: page; page-break-after: always; }
    #foocci-print-area .foocci-ticket-block:last-child { break-after: auto; page-break-after: auto; }
    #foocci-print-area .foocci-ticket { box-shadow: none !important; border-radius: 0 !important; }
    @page { margin: 0; size: 80mm auto; }
    html, body { margin: 0 !important; background: #fff; }
  }
`;
