"use client";

/**
 * LojaClient — a loja do plano de entrada: o MESMO cardápio da mesa (/qr/[slug],
 * QRMenuClient), com uma única diferença — o cliente pode comprar.
 *
 * Direção do CEO (04/08, manhã): o CORPO segue o módulo compartilhado
 * src/components/menu/* (cards, categorias, ProductModal com `commerce`, nav
 * fixa embaixo com a barra de carrinho no topSlot). O TOPO, por emenda do CEO à
 * regra "igual por construção", é de aplicativo de marketplace (iFood/Rappi):
 * - StoreHeader fixo: logomarca + nome + status à esquerda; Minha conta e
 *   Sacola (badge de quantidade) à direita.
 * - Faixa fina com as redes sociais (MenuSocialLinks, o mesmo markup do QR), a
 *   saudação do cliente identificado ("Olá, {nome}" — abre Minha conta) + a
 *   avaliação Google, e os banners/carrosséis compartilhados (MenuShowcase).
 * - StoreAccountDrawer: identidade, Meus cupons e Meus endereços — rotas
 *   read-only já existentes, gated por prova de posse do telefone (waToken).
 *
 * A máquina embaixo NÃO é nova: identify → finalize são as mesmas rotas
 * /api/pedido/* provadas com pedido real (#O2VKA1); o payload do carrinho
 * espelha o PedidoClient (baseItemId, selectedOptions, selectedExtras). O cupom
 * escolhido no drawer vai como customerCouponId — o SERVIDOR revalida e
 * recalcula o desconto no finalize. Preço no canal DELIVERY.
 *
 * White-label: a cor vem do restaurante via --brand-primary, como no QR.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  CategoryDescriptionStrip,
  CategoryNav,
  CategorySections,
  MenuShowcase,
  MenuSocialLinks,
  ProductModal,
  WelcomeModal,
  fmtPhone,
  type CartLine,
  type CustomerIdentity,
  type MenuDisplayCategory,
  type MenuDisplayItem,
  type PromotionBannerData,
} from "@/components/menu";
import { buildInstagramUrl, buildTikTokUrl, buildWhatsAppUrl } from "@/lib/social";
import { StoreHeader } from "./StoreHeader";
import { StoreAccountDrawer } from "./StoreAccountDrawer";
import {
  LOCKED_WALLET,
  fetchWallet,
  type CustomerAddress,
  type WalletCoupon,
  type WalletState,
} from "./lojaWallet";

/* ── Props ────────────────────────────────────────────────────────────────── */

interface KnownAddress {
  street: string; number: string; neighborhood: string; complement: string;
  cep?: string; city?: string; state?: string;
}

interface Props {
  slug: string;
  restaurantName: string;
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  categories: MenuDisplayCategory[];
  featured?: MenuDisplayItem[];
  promotedItems?: MenuDisplayItem[];
  promoBanner?: MenuDisplayItem | null;
  promotionBanners?: PromotionBannerData[];
  instagramUrl?: string | null;
  tiktokUrl?: string | null;
  restaurantPhone?: string | null;
  googleReviewUrl?: string | null;
  deliveryEnabled: boolean;
  pickupEnabled: boolean;
  deliveryFee: number | null;
  knownCustomerPhone?: string | null;
  knownCustomerName?: string | null;
  knownCustomerId?: string | null;
  /** Endereço padrão do cliente PROVADO (waToken) — pré-preenche a entrega. */
  knownDefaultAddress?: KnownAddress | null;
  /** waToken validado no servidor — destrava cupons/endereços (read-only). */
  pedidoToken?: string | null;
  restaurantIsOpen?: boolean;
  closedMessage?: string | null;
  /**
   * A identificação da entrada pode ser PULADA? Só a vitrine de demonstração
   * recebe `true` — quem decide é o servidor, por `Restaurant.isDemo`
   * (`src/lib/identificacao-loja.ts`). Padrão `false`: falha fechada, porque
   * prop esquecida em loja de cliente não pode virar loja anônima.
   */
  identificacaoOpcional?: boolean;
}

type Step =
  | "browse"
  | "cart"
  | "identify"
  | "method"
  | "address"
  | "payment"
  | "review"
  | "done";

interface Address {
  cep: string; street: string; number: string; neighborhood: string;
  city: string; state: string; complement: string; referencePoint: string;
}

const EMPTY_ADDRESS: Address = {
  cep: "", street: "", number: "", neighborhood: "",
  city: "", state: "", complement: "", referencePoint: "",
};

function savedToAddress(a: CustomerAddress): Address {
  return {
    cep: a.zipCode ?? "", street: a.street, number: a.number,
    neighborhood: a.neighborhood, city: a.city ?? "", state: a.state ?? "",
    complement: a.complement ?? "", referencePoint: "",
  };
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/* sessionStorage compartilhado com o QR — a identidade atravessa as superfícies. */
type StoredIdentity = { phone?: string; name?: string; customerId?: string; displayPhone?: string };

function readStoredIdentity(slug: string): StoredIdentity | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(`foocci-customer-${slug}`);
    if (raw) return JSON.parse(raw) as StoredIdentity;
  } catch { /* ignore */ }
  return null;
}

export function LojaClient({
  slug, restaurantName, logoUrl, brandPrimaryColor, categories,
  featured = [], promotedItems = [], promoBanner = null, promotionBanners = [],
  instagramUrl = null, tiktokUrl = null, restaurantPhone = null, googleReviewUrl = null,
  deliveryEnabled, pickupEnabled, deliveryFee,
  knownCustomerPhone = null, knownCustomerName = null, knownCustomerId = null,
  knownDefaultAddress = null, pedidoToken = null,
  restaurantIsOpen = true, closedMessage = null,
  identificacaoOpcional = false,
}: Props) {
  const pc = brandPrimaryColor || "#f97316";

  /* ── Catálogo / navegação (mesma mecânica do QRMenuClient) ── */
  const [selectedItem, setSelectedItem] = useState<MenuDisplayItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id ?? "");
  const navRef = useRef<HTMLDivElement>(null);

  /* ── Identidade (WelcomeModal por telefone, como no QR) ──
   * O estado inicial usa SÓ o que o servidor conhece (props). A identidade do
   * sessionStorage entra num efeito de mount — ler storage no useState fazia o
   * HTML do servidor divergir do cliente (hydration mismatch no avatar do topo). */
  const [showWelcome, setShowWelcome] = useState(false);
  const [identifiedName, setIdentifiedName] = useState<string | null>(knownCustomerName);
  const [identifiedPhone, setIdentifiedPhone] = useState<string | null>(
    knownCustomerPhone ? fmtPhone(knownCustomerPhone) : null);

  /* ── Carrinho ── */
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cart.reduce((s, l) => s + l.price * l.qty, 0);

  /* ── Checkout (máquina preservada — mesmas rotas /api/pedido/*) ── */
  const [step, setStep] = useState<Step>("browse");
  const [phone, setPhone] = useState(knownCustomerPhone ?? "");
  const [custName, setCustName] = useState(knownCustomerName ?? "");
  const [custId, setCustId] = useState<string | null>(knownCustomerId);

  /* Identidade guardada na sessão (compartilhada com o QR) — só no cliente. */
  useEffect(() => {
    const stored = readStoredIdentity(slug);
    if (!stored) return;
    setIdentifiedName((v) => v ?? stored.name ?? null);
    setIdentifiedPhone((v) =>
      v ?? stored.displayPhone ?? (stored.phone ? fmtPhone(stored.phone) : null));
    setPhone((v) => v || (stored.phone ?? ""));
    setCustName((v) => v || (stored.name ?? ""));
    setCustId((v) => v ?? stored.customerId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);
  const [needName, setNeedName] = useState(false);
  const [method, setMethod] = useState<"delivery" | "pickup" | null>(null);
  const [address, setAddress] = useState<Address>(() =>
    knownDefaultAddress
      ? {
          ...EMPTY_ADDRESS,
          street: knownDefaultAddress.street, number: knownDefaultAddress.number,
          neighborhood: knownDefaultAddress.neighborhood, complement: knownDefaultAddress.complement,
          cep: knownDefaultAddress.cep ?? "", city: knownDefaultAddress.city ?? "",
          state: knownDefaultAddress.state ?? "",
        }
      : EMPTY_ADDRESS);
  const [paySub, setPaySub] = useState<"cash" | "card_machine" | "pix_in_person" | null>(null);
  const [changeFor, setChangeFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<{ orderId: string } | null>(null);

  /* ── Minha conta: carteira (cupons + endereços) — rotas gated por waToken ── */
  const [accountOpen, setAccountOpen] = useState(false);
  const [authToken, setAuthToken] = useState<string | null>(() => pedidoToken ?? null);
  useEffect(() => {
    // SSR não resolveu o token mas ele pode estar na URL (link do WhatsApp).
    if (authToken || typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("waToken");
    if (t) setAuthToken(t);
  }, [authToken]);

  const [wallet, setWallet] = useState<WalletState>(LOCKED_WALLET);
  const [appliedCoupon, setAppliedCoupon] = useState<WalletCoupon | null>(null);
  const [usedAddressId, setUsedAddressId] = useState<string | null>(null);

  const loadWallet = useCallback(async () => {
    if (!authToken) { setWallet(LOCKED_WALLET); return; }
    setWallet((w) => ({ ...w, status: "loading" }));
    try {
      const { coupons, addresses } = await fetchWallet(slug, authToken);
      setWallet({ status: "ready", coupons, addresses });
    } catch {
      setWallet({ status: "error", coupons: [], addresses: [] });
    }
  }, [slug, authToken]);

  useEffect(() => { void loadWallet(); }, [loadWallet]);

  /* Pré-preenche a entrega com o endereço padrão salvo (uma vez, ao carregar). */
  const walletPrefillDone = useRef(false);
  useEffect(() => {
    if (wallet.status !== "ready" || walletPrefillDone.current) return;
    walletPrefillDone.current = true;
    const def = wallet.addresses.find((a) => a.isDefault) ?? wallet.addresses[0];
    if (!def) return;
    const empty = !address.street.trim();
    const same  = address.street === def.street && address.number === def.number;
    if (empty) setAddress(savedToAddress(def));
    if (empty || same) setUsedAddressId(def.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallet.status]);

  /* Identificação OBRIGATÓRIA na Loja (decisão do CEO, 04/08) — igual ao chat
   * com IA; só o QR da mesa continua pulável.
   *
   * O gate olha APENAS para identidade real (waToken do link do WhatsApp ou
   * sessionStorage `foocci-customer-<slug>`). Ele NÃO olha a marca
   * `qr-welcome-seen-<slug>`, que é COMPARTILHADA com o QR da mesa: quem pulou
   * a identificação sentado no salão carregaria essa marca para cá e entraria
   * na Loja sem se identificar — obrigatoriedade que uma tela anterior desliga
   * não é obrigatoriedade. */
  useEffect(() => {
    const identified = !!sessionStorage.getItem(`foocci-customer-${slug}`);
    if (!identified && !knownCustomerPhone) setShowWelcome(true);
  }, [slug, knownCustomerPhone]);

  function handleWelcomeClose(identity: CustomerIdentity | null) {
    // Fechou sem se identificar (×, Esc, clique fora ou "Pular").
    //
    // Na loja de um cliente de verdade isso NÃO acontece — o modal abre com
    // `required` e nenhuma dessas saídas existe. Se acontecer mesmo assim (um
    // caminho futuro chamando com null), a tela continua barrada em vez de
    // liberar em silêncio: obrigatoriedade que um bug desliga não é obrigatória.
    //
    // Na vitrine, fechar é uma escolha legítima: o visitante navega o cardápio
    // inteiro anônimo. O telefone volta a ser pedido só no `openCheckout`, que é
    // onde o contato passa a ser mesmo necessário.
    if (!identity?.name) {
      if (identificacaoOpcional) setShowWelcome(false);
      return;
    }

    setIdentifiedName(identity.name);
    setIdentifiedPhone(identity.displayPhone);
    // Pré-preenche o checkout: com nome+telefone+cliente, a etapa identify é pulada.
    if (identity.phone) setPhone(identity.phone);
    setCustName(identity.name);
    if (identity.customerId) setCustId(identity.customerId);

    setShowWelcome(false);
    sessionStorage.setItem(`qr-welcome-seen-${slug}`, "1");
  }

  function handleResetIdentity() {
    try { sessionStorage.removeItem(`foocci-customer-${slug}`); } catch { /* ignore */ }
    try { sessionStorage.removeItem(`qr-welcome-seen-${slug}`);  } catch { /* ignore */ }
    setIdentifiedName(null);
    setIdentifiedPhone(null);
    setPhone("");
    setCustName("");
    setCustId(null);
    // Trocar de pessoa invalida a carteira anterior — cupom e endereço saem juntos.
    setAuthToken(null);
    setWallet(LOCKED_WALLET);
    setAppliedCoupon(null);
    setUsedAddressId(null);
    setAccountOpen(false);
    setShowWelcome(true);
  }

  /* IntersectionObserver: categoria ativa acompanha o scroll (igual ao QR). */
  useEffect(() => {
    if (categories.length === 0) return;
    const observers: IntersectionObserver[] = [];
    categories.forEach((cat) => {
      const el = document.getElementById(`cat-${cat.id}`);
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) setActiveCategory(cat.id);
        },
        { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, [categories]);

  useEffect(() => {
    if (!navRef.current || !activeCategory) return;
    const chip = navRef.current.querySelector(
      `[data-cat="${activeCategory}"]`
    ) as HTMLElement | null;
    chip?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeCategory]);

  function scrollToCategory(catId: string) {
    const el = document.getElementById(`cat-${catId}`);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 8;
    window.scrollTo({ top, behavior: "smooth" });
  }

  /* ── Carrinho: merge por id de linha (convenção do PedidoClient) ── */
  function addLine(line: CartLine) {
    setCart((prev) => {
      const ix = prev.findIndex((l) => l.id === line.id);
      if (ix >= 0) {
        const next = [...prev];
        next[ix] = { ...next[ix]!, qty: next[ix]!.qty + line.qty };
        return next;
      }
      return [...prev, line];
    });
    setSelectedItem(null);
  }

  function changeQty(index: number, delta: number) {
    setCart((prev) => {
      const next = [...prev];
      const line = next[index];
      if (!line) return prev;
      const qty = line.qty + delta;
      if (qty <= 0) next.splice(index, 1);
      else next[index] = { ...line, qty };
      return next;
    });
  }

  function openCheckout() {
    setError(null);
    setStep(custId && custName.trim() ? "method" : "identify");
  }

  /* Ícone da sacola no topo — abre a revisão da sacola (padrão iFood: o ícone
     mostra a sacola; a barra de baixo segue direto pro fechamento). */
  function openCartSheet() {
    setError(null);
    if (order) { setOrder(null); setMethod(null); setPaySub(null); }
    setStep("cart");
  }

  function applyCoupon(c: WalletCoupon) {
    setAppliedCoupon(c);
  }

  function useAddress(a: CustomerAddress) {
    setAddress(savedToAddress(a));
    setUsedAddressId(a.id);
  }

  /* ── Ações do checkout (máquina intocada) ── */

  async function submitIdentify() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pedido/${slug}/identify-customer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, ...(needName && custName.trim() ? { name: custName.trim() } : {}) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Não consegui validar o telefone.");
      if (json.found) {
        setCustId(json.customerId ?? null);
        const resolvedName = json.name ?? custName.trim();
        if (resolvedName) {
          setCustName(resolvedName);
          setIdentifiedName(resolvedName);
          setIdentifiedPhone(fmtPhone(phone));
          setStep("method");
        } else {
          // Cadastro existe mas sem nome legível — pede o nome; o reenvio corrige o cadastro.
          setNeedName(true);
          if (needName) setError("Digite seu nome para continuar.");
        }
      } else if (json.customerId) {
        // New customer created with the provided name.
        setCustId(json.customerId);
        setIdentifiedName(custName.trim() || null);
        setIdentifiedPhone(fmtPhone(phone));
        setStep("method");
      } else {
        // Phone ok but we still need a name for the order.
        setNeedName(true);
        if (needName) setError("Digite seu nome para continuar.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Algo deu errado. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  function chooseMethod(m: "delivery" | "pickup") {
    setMethod(m);
    setStep(m === "delivery" ? "address" : "payment");
  }

  function submitAddress() {
    if (!address.street.trim() || !address.number.trim() || !address.neighborhood.trim()) {
      setError("Preencha rua, número e bairro.");
      return;
    }
    setError(null);
    setStep("payment");
  }

  async function submitOrder() {
    if (!paySub || !method) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pedido/${slug}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // Linhas no formato do PedidoClient: id, baseItemId, name, price, qty,
          // notes, variantName, selectedOptions, selectedExtras (cartItemSchema).
          cart,
          customerName: custName.trim() || "Cliente",
          deliveryMethod: method,
          address: method === "delivery" ? address : EMPTY_ADDRESS,
          paymentMode: method === "delivery" ? "pay_on_delivery" : "pay_on_pickup",
          paymentMethodSub: paySub,
          ...(paySub === "cash" && Number(changeFor.replace(/\D/g, "")) > grandTotal
            ? { changeFor: Number(changeFor.replace(/\D/g, "")) }
            : {}),
          ...(phone ? { customerPhone: phone } : {}),
          ...(custId ? { customerId: custId } : {}),
          ...(method === "delivery" && deliveryFee != null ? { clientDeliveryFee: deliveryFee } : {}),
          // Cupom da carteira: o servidor revalida (findRedeemable) e recalcula
          // o desconto — o valor exibido aqui nunca é a autoridade.
          ...(appliedCoupon && custId ? { customerCouponId: appliedCoupon.id } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.orderId) throw new Error(json?.error ?? "Não consegui confirmar o pedido. Tente de novo.");
      setOrder({ orderId: json.orderId });
      setCart([]);
      setAppliedCoupon(null);
      if (authToken) void loadWallet(); // cupom consumido sai da carteira
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui confirmar o pedido. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const fee = method === "delivery" && deliveryFee != null ? deliveryFee : 0;

  /* Desconto de exibição — espelha a regra do PedidoClient.applyWalletCoupon;
     a autoridade é o recálculo do finalize no servidor. */
  const discount = (() => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.isReward || appliedCoupon.discountType === "CUSTOM") return 0;
    if (appliedCoupon.discountType === "FREE_SHIPPING") {
      return method === "delivery" ? Math.round(fee * 100) / 100 : 0;
    }
    if (appliedCoupon.discountType === "PERCENTAGE") {
      return Math.round(Math.min((cartTotal * appliedCoupon.discountValue) / 100, cartTotal) * 100) / 100;
    }
    return Math.round(Math.min(appliedCoupon.discountValue, cartTotal + fee) * 100) / 100;
  })();
  const grandTotal = Math.max(0, cartTotal + fee - discount);

  const couponCount = wallet.status === "ready" ? wallet.coupons.length : 0;

  /* ── Barra de carrinho — vive DENTRO do contêiner fixo da nav, acima dos chips ── */
  const showCartBar = cartCount > 0 && step === "browse" && !order;
  const showNav = categories.length > 1;
  const cartBar = showCartBar ? (
    <div className={`mx-auto max-w-2xl px-4 pt-3${showNav ? "" : " pb-3"}`}>
      <button
        type="button"
        onClick={openCheckout}
        className="flex w-full items-center justify-between rounded-2xl px-5 py-3.5 text-white shadow-lg hover:opacity-90 active:scale-[0.99] transition-all"
        style={{ backgroundColor: "var(--brand-primary)" }}
      >
        <span className="flex items-center gap-2 text-sm font-bold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-xs font-bold">{cartCount}</span>
          Finalizar pedido
        </span>
        <span className="text-sm font-bold">{fmt(cartTotal)}</span>
      </button>
    </div>
  ) : null;

  /* Padding inferior: libera a nav fixa + barra de carrinho (como o pb-24 do QR). */
  const bottomPad = showNav && showCartBar ? "pb-40" : (showNav || showCartBar) ? "pb-24" : "";

  /* Topo: faixa de sociais/avaliação + vitrine (banners e carrosséis do QR). */
  const hasSocialStrip = Boolean(
    buildInstagramUrl(instagramUrl) || buildTikTokUrl(tiktokUrl) ||
    buildWhatsAppUrl(restaurantPhone) || googleReviewUrl
  );
  const hasShowcase =
    promotionBanners.length > 0 || Boolean(promoBanner) ||
    promotedItems.length > 0 || featured.length > 0;

  return (
    <div style={{ '--brand-primary': pc } as React.CSSProperties}>
      {showWelcome && (
        /* `required` é o INVERSO do que o servidor liberou. Não existe literal
           aqui de propósito: quem decide é `Restaurant.isDemo`, no servidor. */
        <WelcomeModal slug={slug} onClose={handleWelcomeClose} required={!identificacaoOpcional} />
      )}

      {selectedItem && (
        <ProductModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          commerce={{ onAdd: addLine }}
        />
      )}

      {accountOpen && (
        <StoreAccountDrawer
          identifiedName={identifiedName}
          identifiedPhone={identifiedPhone}
          wallet={wallet}
          appliedCouponId={appliedCoupon?.id ?? null}
          usedAddressId={usedAddressId}
          onClose={() => setAccountOpen(false)}
          onIdentify={() => { setAccountOpen(false); setShowWelcome(true); }}
          onResetIdentity={handleResetIdentity}
          onRetry={() => void loadWallet()}
          onApplyCoupon={applyCoupon}
          onRemoveCoupon={() => setAppliedCoupon(null)}
          onUseAddress={useAddress}
        />
      )}

      <div className={`min-h-screen bg-[#fafaf9] ${bottomPad}`}>

        {/* ── TOPO DE APP (barra fixa estilo marketplace) ── */}
        <StoreHeader
          restaurantName={restaurantName}
          logoUrl={logoUrl}
          isOpen={restaurantIsOpen}
          deliveryEnabled={deliveryEnabled}
          pickupEnabled={pickupEnabled}
          cartCount={cartCount}
          couponCount={couponCount}
          identifiedName={identifiedName}
          onOpenAccount={() => setAccountOpen(true)}
          onOpenCart={openCartSheet}
        />

        {/* ── Faixa social + vitrine (banners/carrosséis compartilhados do QR) ── */}
        {(hasSocialStrip || hasShowcase) && (
          <div className="border-b border-gray-100 bg-white">
            {hasSocialStrip && (
              <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-4 py-3">
                <MenuSocialLinks
                  instagramUrl={instagramUrl}
                  tiktokUrl={tiktokUrl}
                  restaurantPhone={restaurantPhone}
                  className="flex shrink-0 items-center gap-2.5"
                />
                {/* O espaço à direita dos ícones é da identidade (pedido do CEO,
                    04/08): identificado → "Olá, {nome}", como a faixa do cardápio
                    da mesa; o toque abre Minha conta. Sem identificação → convite
                    discreto que abre o WelcomeModal (padrão marketplace: o iFood
                    mantém o "Entrar" no topo quando deslogado). O chip trunca com
                    ellipsis para conviver com o "Avaliar" a 375px. */}
                {identifiedName ? (
                  <button
                    type="button"
                    onClick={() => setAccountOpen(true)}
                    aria-label={`Minha conta — ${identifiedName}`}
                    className="ml-auto min-w-0 rounded-full border px-3 py-2 text-xs font-semibold transition active:scale-95"
                    style={{ backgroundColor: `${pc}14`, borderColor: `${pc}26`, color: pc }}
                  >
                    <span className="block truncate">
                      Olá, {identifiedName.trim().split(/\s+/)[0]}
                    </span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowWelcome(true)}
                    aria-label="Identificar meu WhatsApp"
                    className="ml-auto min-w-0 rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-600 transition hover:bg-gray-200 active:scale-95"
                  >
                    <span className="block truncate">Identificar-se</span>
                  </button>
                )}
                {googleReviewUrl && (
                  <a
                    href={googleReviewUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Avaliar restaurante no Google"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-yellow-300 bg-yellow-50 px-3.5 py-2 text-xs font-semibold text-yellow-800 shadow-sm transition hover:bg-yellow-100 active:scale-95"
                  >
                    <span aria-hidden="true">⭐</span>
                    Avaliar
                  </a>
                )}
              </div>
            )}
            {hasShowcase && (
              <div className={hasSocialStrip ? "" : "pt-4"}>
                <MenuShowcase
                  promotionBanners={promotionBanners}
                  promoBanner={promoBanner}
                  promotedItems={promotedItems}
                  featured={featured}
                  onSelectItem={setSelectedItem}
                />
              </div>
            )}
          </div>
        )}

        {/* Fechado agora — a Loja aceita montar o pedido, o envio é barrado no finalize */}
        {!restaurantIsOpen && (
          <div className="mx-auto max-w-2xl px-4 pt-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {closedMessage ?? "Estamos fechados no momento — mas você já pode montar o pedido."}
            </div>
          </div>
        )}

        {/* ── NAV DE CATEGORIAS FIXA EMBAIXO + barra de carrinho ── */}
        {(showNav || showCartBar) && (
          <CategoryNav
            navRef={navRef}
            categories={showNav ? categories : []}
            activeCategory={activeCategory}
            onSelect={scrollToCategory}
            topSlot={cartBar}
          />
        )}

        {/* ── FAIXA DE DESCRIÇÃO DA CATEGORIA ── */}
        <CategoryDescriptionStrip categories={categories} activeCategory={activeCategory} />

        {/* ── SEÇÕES DE PRODUTOS ── */}
        <CategorySections categories={categories} onSelectItem={setSelectedItem} />

        <footer className="py-8 text-center text-xs text-gray-400">
          Cardápio gerado por Foocci
        </footer>
      </div>

      {/* ── Sacola + checkout em folhas (máquina preservada, visual do QR) ── */}
      {step !== "browse" && step !== "done" && (
        <Sheet onClose={busy ? undefined : () => { setStep("browse"); setError(null); }}>
          {/* Resumo curto do carrinho no topo das etapas de checkout (a sacola já lista tudo) */}
          {step !== "cart" && (
            <div className="mb-3 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
              <span className="text-gray-600">{cartCount} {cartCount === 1 ? "item" : "itens"}</span>
              <span className="font-bold text-gray-900">{fmt(grandTotal)}</span>
            </div>
          )}

          {step === "cart" && (
            cart.length === 0 ? (
              <div className="py-6 text-center">
                <span aria-hidden="true" className="text-4xl">🛍️</span>
                <h3 className="mt-2 text-lg font-bold text-gray-900">Sua sacola está vazia</h3>
                <p className="mt-1 text-sm text-gray-500">Toque em um produto do cardápio para adicionar.</p>
                <button
                  type="button"
                  onClick={() => setStep("browse")}
                  className="mt-4 w-full rounded-2xl border border-gray-200 py-3 text-sm font-semibold text-gray-700 transition hover:bg-gray-50"
                >
                  Ver cardápio
                </button>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-bold text-gray-900">Sua sacola</h3>
                <CartLineList cart={cart} onChangeQty={changeQty} />
                <div className="mt-2 space-y-1 border-t border-gray-100 pt-3 text-sm">
                  <div className="flex justify-between text-gray-600"><span>Subtotal</span><span>{fmt(cartTotal)}</span></div>
                  {appliedCoupon && (
                    <div className="flex justify-between" style={{ color: "var(--brand-primary)" }}>
                      <span>Cupom · {appliedCoupon.label}</span>
                      <span>{appliedCoupon.isReward ? "no pedido" : "no fechamento"}</span>
                    </div>
                  )}
                </div>
                <PrimaryBtn disabled={busy} onClick={openCheckout}>
                  Continuar · {fmt(cartTotal)}
                </PrimaryBtn>
                <button
                  type="button"
                  onClick={() => setStep("browse")}
                  className="mt-2 w-full py-2 text-center text-xs font-semibold text-gray-400 transition-colors hover:text-gray-600"
                >
                  Escolher mais itens
                </button>
              </>
            )
          )}

          {step === "identify" && (
            <>
              <h3 className="text-lg font-bold text-gray-900">Seu WhatsApp</h3>
              {/* Aqui o contato deixa de ser cadastro e passa a ser NECESSÁRIO: é
                  por ele que o restaurante confirma o pedido e avisa quando sai.
                  Quem entrou sem se identificar (vitrine) chega neste ponto com o
                  carrinho montado — e o pedido explica a si mesmo. */}
              <p className="mt-1 text-sm text-gray-500">
                É por ele que o restaurante confirma seu pedido e avisa quando ele sai.
              </p>
              <input
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                style={{ fontSize: "16px" }}
                className={`mt-3 ${inputCls}`}
              />
              {needName && (
                <input
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="Seu nome"
                  style={{ fontSize: "16px" }}
                  className={`mt-3 ${inputCls}`}
                />
              )}
              <PrimaryBtn disabled={busy || phone.replace(/\D/g, "").length < 10 || (needName && custName.trim().length < 2)} onClick={submitIdentify}>
                {busy ? "Verificando…" : "Continuar"}
              </PrimaryBtn>
            </>
          )}

          {step === "method" && (
            <>
              <h3 className="text-lg font-bold text-gray-900">{custName ? `${custName}, como` : "Como"} você quer receber?</h3>
              <div className="mt-3 grid gap-2">
                {pickupEnabled && (
                  <ChoiceBtn onClick={() => chooseMethod("pickup")} title="🏃 Retirada no local" subtitle="Sem taxa — você busca" />
                )}
                {deliveryEnabled && (
                  <ChoiceBtn onClick={() => chooseMethod("delivery")} title="🛵 Entrega" subtitle={deliveryFee != null ? `Taxa de ${fmt(deliveryFee)}` : "Taxa combinada na confirmação"} />
                )}
              </div>
            </>
          )}

          {step === "address" && (
            <>
              <h3 className="text-lg font-bold text-gray-900">Endereço de entrega</h3>
              {usedAddressId && address.street.trim() && (
                <p className="mt-1 text-xs text-gray-500">Usando seu endereço salvo — é só conferir.</p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input value={address.street} onChange={(e) => { setAddress({ ...address, street: e.target.value }); setUsedAddressId(null); }} placeholder="Rua" className={`col-span-2 ${inputSmCls}`} />
                <input value={address.number} onChange={(e) => { setAddress({ ...address, number: e.target.value }); setUsedAddressId(null); }} placeholder="Número" className={inputSmCls} />
                <input value={address.neighborhood} onChange={(e) => { setAddress({ ...address, neighborhood: e.target.value }); setUsedAddressId(null); }} placeholder="Bairro" className={inputSmCls} />
                <input value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} placeholder="Complemento (opcional)" className={`col-span-2 ${inputSmCls}`} />
              </div>
              <PrimaryBtn disabled={busy} onClick={submitAddress}>Continuar</PrimaryBtn>
            </>
          )}

          {step === "payment" && (
            <>
              <h3 className="text-lg font-bold text-gray-900">
                Como você paga na {method === "delivery" ? "entrega" : "retirada"}?
              </h3>
              <div className="mt-3 grid gap-2">
                <ChoiceBtn active={paySub === "pix_in_person"} pc={pc} onClick={() => setPaySub("pix_in_person")} title="PIX na hora" subtitle="Você paga ao receber" />
                <ChoiceBtn active={paySub === "card_machine"} pc={pc} onClick={() => setPaySub("card_machine")} title="Cartão na maquininha" subtitle="Crédito ou débito" />
                <ChoiceBtn active={paySub === "cash"} pc={pc} onClick={() => setPaySub("cash")} title="Dinheiro" subtitle="Precisa de troco? Avise abaixo" />
              </div>
              {paySub === "cash" && (
                <input
                  inputMode="numeric"
                  value={changeFor}
                  onChange={(e) => setChangeFor(e.target.value)}
                  placeholder={`Troco para quanto? (pedido: ${fmt(grandTotal)})`}
                  className={`mt-2 ${inputSmCls}`}
                />
              )}
              <PrimaryBtn disabled={!paySub || busy} onClick={() => setStep("review")}>Revisar pedido</PrimaryBtn>
            </>
          )}

          {step === "review" && (
            <>
              <h3 className="text-lg font-bold text-gray-900">Confira seu pedido</h3>
              <CartLineList cart={cart} onChangeQty={changeQty} />
              <CheckoutCoupons
                wallet={wallet}
                appliedCoupon={appliedCoupon}
                onApply={applyCoupon}
                onRemove={() => setAppliedCoupon(null)}
              />
              <div className="mt-2 space-y-1 border-t border-gray-100 pt-3 text-sm">
                {method === "delivery" && (
                  <div className="flex justify-between text-gray-600"><span>Entrega</span><span>{deliveryFee != null ? fmt(fee) : "a combinar"}</span></div>
                )}
                {appliedCoupon && (
                  <div className="flex justify-between" style={{ color: "var(--brand-primary)" }}>
                    <span>Cupom · {appliedCoupon.label}</span>
                    <span>
                      {discount > 0
                        ? `−${fmt(discount)}`
                        : appliedCoupon.isReward
                        ? "no pedido"
                        : appliedCoupon.discountType === "FREE_SHIPPING" && method === "pickup"
                        ? "vale na entrega — fica guardado"
                        : "—"}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold text-gray-900"><span>Total</span><span>{fmt(grandTotal)}</span></div>
              </div>
              {cart.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">Seu carrinho ficou vazio — volte ao cardápio para escolher.</p>
              ) : (
                <PrimaryBtn disabled={busy} onClick={submitOrder}>
                  {busy ? "Enviando…" : `Confirmar pedido · ${fmt(grandTotal)}`}
                </PrimaryBtn>
              )}
            </>
          )}

          {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </Sheet>
      )}

      {/* ── Confirmação ── */}
      {step === "done" && order && (
        <Sheet>
          <div className="py-4 text-center">
            <span aria-hidden className="text-5xl">✅</span>
            <h3 className="mt-3 text-xl font-bold text-gray-900">Pedido confirmado!</h3>
            <p className="mt-2 text-sm text-gray-600">
              {custName ? `${custName}, o` : "O"} {restaurantName} já recebeu seu pedido
              {method === "delivery" ? " e vai preparar para a entrega." : " — retire no balcão quando avisarem."}
            </p>
            <PrimaryBtn onClick={() => { setOrder(null); setStep("browse"); setMethod(null); setPaySub(null); }}>
              Fazer novo pedido
            </PrimaryBtn>
          </div>
        </Sheet>
      )}
    </div>
  );
}

/* ── Primitivos do checkout — visual alinhado ao QR (WelcomeModal) ─────────── */

const inputCls   = "w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:opacity-60";
const inputSmCls = "w-full rounded-2xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-100 disabled:opacity-60";

/**
 * Cupons dentro do checkout (pedido do CEO, 04/08).
 *
 * Antes, o cupom só existia no drawer "Minha conta" — quem chegava à revisão
 * não tinha como usar um, e nada na tela dizia que cupom existia. Aqui ele
 * aparece onde o total é decidido.
 *
 * Os quatro estados da carteira viram quatro respostas HONESTAS. O caso que
 * mais importa é o `locked`: as rotas de cupom exigem prova de posse do
 * telefone (waToken do link do WhatsApp), então para quem só digitou o número
 * não dá para listar cupons — seriam cupons de terceiros. Mostrar "nenhum
 * cupom" nesse caso seria transformar ausência de acesso em ausência de cupom,
 * que é exatamente o guardrail 1. Então a tela diz o que é e como destravar.
 */
function CheckoutCoupons({
  wallet,
  appliedCoupon,
  onApply,
  onRemove,
}: {
  wallet: WalletState;
  appliedCoupon: WalletCoupon | null;
  onApply: (c: WalletCoupon) => void;
  onRemove: () => void;
}) {
  const [aberto, setAberto] = useState(false);

  const moldura = "mt-3 rounded-2xl border border-gray-100 bg-gray-50/60 px-3.5 py-3";

  if (wallet.status === "loading") {
    return (
      <div className={moldura} aria-label="Carregando seus cupons">
        <div className="h-4 w-32 animate-pulse rounded-full bg-gray-200" />
      </div>
    );
  }

  if (wallet.status === "locked") {
    return (
      <div className={moldura}>
        <p className="text-xs font-semibold text-gray-700">🎟️ Cupons</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
          Seus cupons aparecem aqui quando você abre a loja pelo link que o
          restaurante te manda no WhatsApp.
        </p>
      </div>
    );
  }

  if (wallet.status === "error") {
    return (
      <div className={moldura}>
        <p className="text-xs font-semibold text-gray-700">🎟️ Cupons</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-gray-500">
          Não conseguimos carregar seus cupons agora. Seu pedido segue normal —
          se tiver cupom, avise o restaurante.
        </p>
      </div>
    );
  }

  if (wallet.coupons.length === 0) {
    return (
      <div className={moldura}>
        <p className="text-xs font-semibold text-gray-700">🎟️ Cupons</p>
        <p className="mt-0.5 text-[11px] text-gray-500">
          Você não tem cupom disponível no momento.
        </p>
      </div>
    );
  }

  return (
    <div className={moldura}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold text-gray-700">🎟️ Cupons</span>
          <span className="mt-0.5 block truncate text-[11px] text-gray-500">
            {appliedCoupon
              ? `Em uso: ${appliedCoupon.label}`
              : `${wallet.coupons.length} disponíve${wallet.coupons.length === 1 ? "l" : "is"}`}
          </span>
        </span>
        <span
          className="shrink-0 text-[11px] font-bold"
          style={{ color: "var(--brand-primary)" }}
        >
          {aberto ? "Fechar" : appliedCoupon ? "Trocar" : "Escolher"}
        </span>
      </button>

      {aberto && (
        <ul className="mt-2.5 space-y-2">
          {wallet.coupons.map((c) => {
            const emUso = appliedCoupon?.id === c.id;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => { if (emUso) { onRemove(); } else { onApply(c); setAberto(false); } }}
                  className={`flex w-full items-center gap-3 rounded-xl border bg-white px-3 py-2.5 text-left transition ${
                    emUso ? "border-transparent ring-2" : "border-gray-100 hover:bg-gray-50"
                  }`}
                  style={emUso ? ({ ["--tw-ring-color" as string]: "var(--brand-primary)" } as React.CSSProperties) : undefined}
                >
                  <span aria-hidden="true" className="text-lg">{c.isReward ? "🎁" : "🎟️"}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-gray-900">{c.label}</span>
                    <span className="block text-[10px] text-gray-400">
                      {c.expiresAt
                        ? `Válido até ${new Date(c.expiresAt).toLocaleDateString("pt-BR")}`
                        : "Sem validade"}
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-[11px] font-bold"
                    style={{ color: emUso ? undefined : "var(--brand-primary)" }}
                  >
                    {emUso ? "Remover" : "Usar"}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Linhas do carrinho com controle de quantidade — usada na sacola e na revisão. */
function CartLineList({ cart, onChangeQty }: { cart: CartLine[]; onChangeQty: (index: number, delta: number) => void }) {
  return (
    <ul className="mt-3 divide-y divide-gray-100">
      {cart.map((l, i) => (
        <li key={`${l.id}-${i}`} className="flex items-center justify-between py-2.5">
          <div className="min-w-0 flex-1 pr-3">
            <p className="text-sm font-semibold text-gray-900">{l.name}</p>
            {(l.selectedOptions?.length || l.selectedExtras?.length || l.notes) && (
              <p className="text-xs text-gray-500">
                {[
                  l.selectedOptions?.map((o) => `${o.qty}× ${o.optionName}`).join(", "),
                  l.selectedExtras?.map((e) => `${e.qty}× ${e.name}`).join(", "),
                  l.notes,
                ].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label={`tirar um ${l.name}`} onClick={() => onChangeQty(i, -1)} className="h-7 w-7 rounded-full bg-gray-100 font-bold text-gray-600">−</button>
            <span className="w-5 text-center text-sm font-semibold">{l.qty}</span>
            <button type="button" aria-label={`mais um ${l.name}`} onClick={() => onChangeQty(i, +1)} className="h-7 w-7 rounded-full bg-gray-100 font-bold text-gray-600">+</button>
            <span className="w-20 text-right text-sm font-semibold text-gray-900">{fmt(l.price * l.qty)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:max-w-md sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        {onClose ? (
          <div className="mb-1 flex justify-center sm:hidden"><span className="h-1 w-10 rounded-full bg-gray-200" /></div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

function PrimaryBtn({ disabled, onClick, children }: { disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-4 w-full rounded-2xl py-3.5 text-sm font-bold text-white shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:opacity-50"
      style={{ backgroundColor: "var(--brand-primary)" }}
    >
      {children}
    </button>
  );
}

function ChoiceBtn({ title, subtitle, onClick, active, pc }: { title: string; subtitle: string; onClick: () => void; active?: boolean; pc?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border px-4 py-3 text-left transition-colors"
      style={active && pc ? { borderColor: pc, backgroundColor: `${pc}0d` } : { borderColor: "#e5e7eb" }}
    >
      <span className="block font-semibold text-gray-900">{title}</span>
      <span className="mt-0.5 block text-sm text-gray-500">{subtitle}</span>
    </button>
  );
}
