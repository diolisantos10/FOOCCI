/**
 * Shared helper for building "returned to AI" messages that include
 * the configured WhatsApp menu options (so customers always see the menu
 * when conversations transition back to AI mode).
 *
 * Server-only. Never import from client components.
 */

import { signWaToken } from "@/lib/wa-token";
import type { MenuOption } from "@/validators/whatsapp-agent";

const EMOJI_NUMBERS = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣"] as const;

function buildMenuList(options: MenuOption[]): string {
  if (options.length === 0) return "";
  return "\n\n" + options.map((o, i) => `${EMOJI_NUMBERS[i] ?? `${i + 1}.`} ${o.label}`).join("\n");
}

function buildIdentifiedUrl(baseUrl: string, phone: string, name: string | null): string {
  try {
    const token = signWaToken({
      phone,
      ...(name ? { name: name.trim().split(/\s+/)[0] } : {}),
    });
    const url = new URL(baseUrl);
    url.searchParams.set("waToken", token);
    url.searchParams.set("src", "whatsapp");
    return url.toString();
  } catch {
    return baseUrl;
  }
}

/**
 * Builds a complete return-to-AI message: preamble text + menu options list
 * (or menu link if no options are configured).
 *
 * @param preamble  - Short opening sentence (e.g., "A equipe pode estar ocupada agora 😊")
 * @param menuOptions - Configured WhatsApp menu options for this restaurant
 * @param baseMenuUrl - Base pedido/cardápio URL (before waToken is appended)
 * @param phone     - Customer phone number (used to sign the waToken)
 * @param name      - Customer first name (optional, included in waToken)
 */
export function buildReturnToAiMessage(params: {
  preamble:    string;
  menuOptions: MenuOption[];
  baseMenuUrl: string | null;
  phone:       string;
  name:        string | null;
}): string {
  const { preamble, menuOptions, baseMenuUrl, phone, name } = params;

  const pedidoUrl = baseMenuUrl ? buildIdentifiedUrl(baseMenuUrl, phone, name) : null;
  const menuList  = buildMenuList(menuOptions);

  let message = preamble;
  if (menuList) {
    message += "\n\nComo posso te ajudar?" + menuList + "\n\nResponda com o número da opção 😊";
  } else if (pedidoUrl) {
    message += `\n\nComo posso te ajudar? Acesse nosso cardápio:\n${pedidoUrl}`;
  }

  return message;
}
