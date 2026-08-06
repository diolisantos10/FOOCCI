/**
 * Tipos compartilhados do cardápio white-label (loja do cliente final).
 *
 * Fonte visual: src/app/qr/[slug]/QRMenuClient.tsx — o cardápio da mesa.
 * A Loja (/pedido/[slug] sem IA) replica o MESMO cardápio; a única diferença é
 * que ela compra. Estes tipos são deliberadamente permissivos (campos opcionais)
 * para aceitar tanto o shape do QR (DINE_IN, variantes com foto) quanto o do
 * /pedido (DELIVERY, mapPedidoItem — variantes sem foto, com optionGroups).
 */

export type MenuVariant = {
  id: string;
  name: string;
  price: number;
  /** Foto da variante — só o QR (DINE_IN) fornece hoje. */
  imageUrl?: string | null;
};

export type MenuExtra = {
  id: string;
  name: string;
  /** Quantidade inclusa (ex.: 2× molho) — exibida quando > 1. */
  quantity?: number;
  price: number;
};

export type MenuOptionGroup = {
  id: string;
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: { id: string; name: string; price: number }[];
};

export type PromotionInfo = {
  promotionId: string;
  originalPrice: number;
  promotionalPrice: number;
  discountAmount: number;
  discountPercent: number;
  badgeText: string;
};

export type MenuDisplayItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  /** A CAPA. É ela no card, no thumbnail e no primeiro slide da ficha. */
  imageUrl: string | null;
  /** Fotos EXTRAS da ficha. Só entram no carrossel com `carouselEnabled`. */
  images?: string[];
  /** Opt-in do lojista por item. Sem ele a ficha é uma foto só. */
  carouselEnabled?: boolean;
  ingredients: string | null;
  servingSize: number | null;
  portionInfo: string | null;
  promotion: PromotionInfo | null;
  variants: MenuVariant[];
  extras: MenuExtra[];
  /** Só o /pedido fornece; no QR fica indefinido (fallback: variants.length > 0). */
  hasVariants?: boolean;
  /** Grupos de opções (personalização) — só o /pedido fornece. */
  optionGroups?: MenuOptionGroup[];
};

export type MenuDisplayCategory = {
  id: string;
  name: string;
  description: string | null;
  items: MenuDisplayItem[];
};

export type PromotionBannerData = { id: string; name: string; imageUrl: string };

/** Identidade devolvida pelo WelcomeModal (telefone-primeiro). */
export type CustomerIdentity = {
  name: string | null;
  displayPhone: string | null;
  /** Telefone cru como digitado — usado pela Loja para pré-preencher o checkout. */
  phone?: string | null;
  customerId?: string;
};

/* ── Convenções de carrinho — ESPELHAM o PedidoClient (não inventar formato) ──
 * O finalize (/api/pedido/[slug]/finalize) valida cartItemSchema com baseItemId,
 * selectedOptions (optionGroups) e selectedExtras. Ver route.ts linhas 50–99. */

export interface SelectedOption {
  groupId: string;
  groupName: string;
  optionId: string;
  optionName: string;
  qty: number;
  priceAdjustment: number;
}

export interface SelectedExtra {
  extraId: string;
  name: string;
  unitPrice: number;
  qty: number;
}

export interface CartLine {
  /** Id da LINHA do carrinho (item.id, `${item.id}_${variant.id}` ou `${item.id}_c<uid>`). */
  id: string;
  /** Id do MenuItem de verdade — o finalize resolve o preço por ele. */
  baseItemId: string;
  name: string;
  price: number;
  qty: number;
  notes?: string;
  variantId?: string;
  variantName?: string;
  selectedOptions?: SelectedOption[];
  selectedExtras?: SelectedExtra[];
}
