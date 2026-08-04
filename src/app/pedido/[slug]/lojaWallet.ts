/**
 * lojaWallet — tipos e busca da "carteira" do cliente na Loja (Cardápio sem IA):
 * cupons ativos + endereços salvos, vindos das rotas read-only já existentes
 * (/api/pedido/[slug]/coupons e /customer-profile).
 *
 * As duas rotas exigem prova de posse do telefone (waToken via header
 * x-pedido-token — CR C1). Sem token, a carteira fica "locked" e a UI explica
 * honestamente, em vez de mostrar vazio como se fosse verdade ("ausência de
 * informação não é informação").
 */

/** Shape do cupom devolvido por CustomerCouponService.listActive (JSON). */
export type WalletCoupon = {
  id: string;
  label: string;
  discountType: string; // PERCENTAGE | FIXED | FREE_SHIPPING | CUSTOM
  discountValue: number;
  description?: string | null;
  isReward?: boolean;
  expiresAt: string | null;
};

/** Endereço salvo, como devolvido por /customer-profile. */
export type CustomerAddress = {
  id: string;
  label: string | null;
  street: string;
  number: string;
  complement: string | null;
  neighborhood: string;
  city: string;
  state: string;
  zipCode: string;
  isDefault: boolean;
};

export type WalletState = {
  /** locked = sem prova de posse do telefone (waToken) — nada é buscado. */
  status: "locked" | "loading" | "ready" | "error";
  coupons: WalletCoupon[];
  addresses: CustomerAddress[];
};

export const LOCKED_WALLET: WalletState = { status: "locked", coupons: [], addresses: [] };

/** Busca cupons + perfil em paralelo. Lança em falha de rede/HTTP (UI mostra erro). */
export async function fetchWallet(
  slug: string,
  token: string,
): Promise<{ coupons: WalletCoupon[]; addresses: CustomerAddress[] }> {
  const headers = { "x-pedido-token": token };
  const [couponsRes, profileRes] = await Promise.all([
    fetch(`/api/pedido/${slug}/coupons`, { headers }),
    fetch(`/api/pedido/${slug}/customer-profile`, { headers }),
  ]);
  if (!couponsRes.ok || !profileRes.ok) throw new Error("wallet fetch failed");
  const couponsJson = (await couponsRes.json()) as { coupons?: WalletCoupon[] };
  const profileJson = (await profileRes.json()) as {
    profile?: { addresses?: CustomerAddress[] } | null;
  };
  return {
    coupons: Array.isArray(couponsJson.coupons) ? couponsJson.coupons : [],
    addresses: Array.isArray(profileJson.profile?.addresses) ? profileJson.profile!.addresses! : [],
  };
}
