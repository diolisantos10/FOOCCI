"use client";

/**
 * LojaClient — a loja do plano de entrada: o MESMO cardápio da mesa (/qr/[slug],
 * QRMenuClient), com uma única diferença — o cliente pode comprar.
 *
 * Direção do CEO (04/08): lado a lado, as duas telas são o mesmo cardápio; uma
 * só olha, a outra compra. Por isso o visual inteiro vem do módulo compartilhado
 * src/components/menu/* (extraído do QRMenuClient): hero, banners, carrosséis,
 * nav de categorias fixa embaixo, ProductCard e ProductModal. A camada de compra
 * é o `commerce` do ProductModal (quantidade/observação/variantes/adicionais) +
 * a barra de carrinho encaixada ACIMA dos chips no mesmo contêiner fixo.
 *
 * A máquina embaixo NÃO é nova: identify → finalize são as mesmas rotas
 * /api/pedido/* provadas com pedido real (#O2VKA1); o payload do carrinho
 * espelha o PedidoClient (baseItemId, selectedOptions, selectedExtras — ver
 * /api/pedido/[slug]/finalize, cartItemSchema). Preço no canal DELIVERY.
 *
 * White-label: a cor vem do restaurante via --brand-primary, como no QR.
 */

import React, { useEffect, useRef, useState } from "react";
import {
  CategoryDescriptionStrip,
  CategoryNav,
  CategorySections,
  MenuHero,
  ProductModal,
  WelcomeModal,
  fmtPhone,
  type CartLine,
  type CustomerIdentity,
  type MenuDisplayCategory,
  type MenuDisplayItem,
  type PromotionBannerData,
} from "@/components/menu";

/* ── Props ────────────────────────────────────────────────────────────────── */

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
  restaurantIsOpen?: boolean;
  closedMessage?: string | null;
}

type Step =
  | "browse"
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
  restaurantIsOpen = true, closedMessage = null,
}: Props) {
  const pc = brandPrimaryColor || "#f97316";

  /* ── Catálogo / navegação (mesma mecânica do QRMenuClient) ── */
  const [selectedItem, setSelectedItem] = useState<MenuDisplayItem | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(categories[0]?.id ?? "");
  const navRef = useRef<HTMLDivElement>(null);

  /* ── Identidade (WelcomeModal por telefone, como no QR) ── */
  const [showWelcome, setShowWelcome] = useState(false);
  const [identifiedName, setIdentifiedName] = useState<string | null>(() =>
    knownCustomerName ?? readStoredIdentity(slug)?.name ?? null);
  const [identifiedPhone, setIdentifiedPhone] = useState<string | null>(() => {
    if (knownCustomerPhone) return fmtPhone(knownCustomerPhone);
    const stored = readStoredIdentity(slug);
    return stored?.displayPhone ?? (stored?.phone ? fmtPhone(stored.phone) : null);
  });

  /* ── Carrinho ── */
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cart.reduce((s, l) => s + l.price * l.qty, 0);

  /* ── Checkout (máquina preservada — mesmas rotas /api/pedido/*) ── */
  const [step, setStep] = useState<Step>("browse");
  const [phone, setPhone] = useState(() =>
    knownCustomerPhone ?? readStoredIdentity(slug)?.phone ?? "");
  const [custName, setCustName] = useState(() =>
    knownCustomerName ?? readStoredIdentity(slug)?.name ?? "");
  const [custId, setCustId] = useState<string | null>(() =>
    knownCustomerId ?? readStoredIdentity(slug)?.customerId ?? null);
  const [needName, setNeedName] = useState(false);
  const [method, setMethod] = useState<"delivery" | "pickup" | null>(null);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [paySub, setPaySub] = useState<"cash" | "card_machine" | "pix_in_person" | null>(null);
  const [changeFor, setChangeFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<{ orderId: string } | null>(null);

  /* Welcome uma vez por sessão — pulado se já identificado (URL ou sessão). */
  useEffect(() => {
    const seen = sessionStorage.getItem(`qr-welcome-seen-${slug}`);
    const identified = !!sessionStorage.getItem(`foocci-customer-${slug}`);
    if (!seen && !identified && !knownCustomerPhone) setShowWelcome(true);
  }, [slug, knownCustomerPhone]);

  function handleWelcomeClose(identity: CustomerIdentity | null) {
    if (identity?.name) {
      setIdentifiedName(identity.name);
      setIdentifiedPhone(identity.displayPhone);
      // Pré-preenche o checkout: com nome+telefone+cliente, a etapa identify é pulada.
      if (identity.phone) setPhone(identity.phone);
      setCustName(identity.name);
      if (identity.customerId) setCustId(identity.customerId);
    }
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
          ...(paySub === "cash" && Number(changeFor.replace(/\D/g, "")) > cartTotal
            ? { changeFor: Number(changeFor.replace(/\D/g, "")) }
            : {}),
          ...(phone ? { customerPhone: phone } : {}),
          ...(custId ? { customerId: custId } : {}),
          ...(method === "delivery" && deliveryFee != null ? { clientDeliveryFee: deliveryFee } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.orderId) throw new Error(json?.error ?? "Não consegui confirmar o pedido. Tente de novo.");
      setOrder({ orderId: json.orderId });
      setCart([]);
      setStep("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não consegui confirmar o pedido. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  const fee = method === "delivery" && deliveryFee != null ? deliveryFee : 0;

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

  return (
    <div style={{ '--brand-primary': pc } as React.CSSProperties}>
      {showWelcome && (
        <WelcomeModal slug={slug} onClose={handleWelcomeClose} />
      )}

      {selectedItem && (
        <ProductModal
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          commerce={{ onAdd: addLine }}
        />
      )}

      <div className={`min-h-screen bg-[#fafaf9] ${bottomPad}`}>

        {/* ── HERO (idêntico ao QR; subtítulo diz que aqui se pede) ── */}
        <MenuHero
          restaurant={{ name: restaurantName, logoUrl }}
          subtitle="Cardápio digital — peça online"
          instagramUrl={instagramUrl}
          tiktokUrl={tiktokUrl}
          restaurantPhone={restaurantPhone}
          googleReviewUrl={googleReviewUrl}
          identifiedName={identifiedName}
          identifiedPhone={identifiedPhone}
          onResetIdentity={handleResetIdentity}
          promotionBanners={promotionBanners}
          promoBanner={promoBanner}
          promotedItems={promotedItems}
          featured={featured}
          onSelectItem={setSelectedItem}
        />

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

      {/* ── Checkout em folhas (máquina preservada, visual do QR) ── */}
      {step !== "browse" && step !== "done" && (
        <Sheet onClose={busy ? undefined : () => { setStep("browse"); setError(null); }}>
          {/* Resumo curto do carrinho no topo de todas as etapas */}
          <div className="mb-3 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
            <span className="text-gray-600">{cartCount} {cartCount === 1 ? "item" : "itens"}</span>
            <span className="font-bold text-gray-900">{fmt(cartTotal + fee)}</span>
          </div>

          {step === "identify" && (
            <>
              <h3 className="text-lg font-bold text-gray-900">Seu WhatsApp</h3>
              <p className="mt-1 text-sm text-gray-500">Para acompanhar o pedido e agilizar as próximas compras.</p>
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
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} placeholder="Rua" className={`col-span-2 ${inputSmCls}`} />
                <input value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} placeholder="Número" className={inputSmCls} />
                <input value={address.neighborhood} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} placeholder="Bairro" className={inputSmCls} />
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
                  placeholder={`Troco para quanto? (pedido: ${fmt(cartTotal + fee)})`}
                  className={`mt-2 ${inputSmCls}`}
                />
              )}
              <PrimaryBtn disabled={!paySub || busy} onClick={() => setStep("review")}>Revisar pedido</PrimaryBtn>
            </>
          )}

          {step === "review" && (
            <>
              <h3 className="text-lg font-bold text-gray-900">Confira seu pedido</h3>
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
                      <button type="button" aria-label={`tirar um ${l.name}`} onClick={() => changeQty(i, -1)} className="h-7 w-7 rounded-full bg-gray-100 font-bold text-gray-600">−</button>
                      <span className="w-5 text-center text-sm font-semibold">{l.qty}</span>
                      <button type="button" aria-label={`mais um ${l.name}`} onClick={() => changeQty(i, +1)} className="h-7 w-7 rounded-full bg-gray-100 font-bold text-gray-600">+</button>
                      <span className="w-20 text-right text-sm font-semibold text-gray-900">{fmt(l.price * l.qty)}</span>
                    </div>
                  </li>
                ))}
              </ul>
              <div className="mt-2 space-y-1 border-t border-gray-100 pt-3 text-sm">
                {method === "delivery" && (
                  <div className="flex justify-between text-gray-600"><span>Entrega</span><span>{deliveryFee != null ? fmt(fee) : "a combinar"}</span></div>
                )}
                <div className="flex justify-between text-base font-bold text-gray-900"><span>Total</span><span>{fmt(cartTotal + fee)}</span></div>
              </div>
              {cart.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">Seu carrinho ficou vazio — volte ao cardápio para escolher.</p>
              ) : (
                <PrimaryBtn disabled={busy} onClick={submitOrder}>
                  {busy ? "Enviando…" : `Confirmar pedido · ${fmt(cartTotal + fee)}`}
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
