"use client";

/**
 * LojaClient — the entry-plan store: the QR menu's visual language, plus commerce.
 *
 * Born from the CEO's correction of 03/08 (docs/OS-loja-qr-com-checkout.md): the
 * entry plan's store is the CLEAN CATALOG people know from the table QR — no chat
 * bubbles, no avatar, no composer, nothing conversational — gaining a cart bar and
 * the delivery/pickup checkout.
 *
 * The machine underneath is NOT new: identify → cart → finalize are the exact
 * `/api/pedido/*` routes the no-AI funnel proved with a real confirmed order
 * (#O2VKA1). This component is a different shell over a proven engine — which is
 * why it holds no pricing or order logic of its own: the server routes decide.
 *
 * White-label: the restaurant's brand color drives the accents, like the QR menu.
 */

import { useMemo, useState } from "react";

/* ── Types (subset of the pedido page's data, no chat fields) ─────────────── */

export interface LojaMenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
}

export interface LojaCategory {
  id: string;
  name: string;
  items: LojaMenuItem[];
}

interface CartLine {
  id: string;        // menu item id — finalize's cartItemSchema `id`
  name: string;
  price: number;
  qty: number;
  notes?: string;
}

interface Props {
  slug: string;
  restaurantName: string;
  logoUrl: string | null;
  brandPrimaryColor: string | null;
  categories: LojaCategory[];
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

export function LojaClient({
  slug, restaurantName, logoUrl, brandPrimaryColor, categories,
  deliveryEnabled, pickupEnabled, deliveryFee,
  knownCustomerPhone = null, knownCustomerName = null, knownCustomerId = null,
  restaurantIsOpen = true, closedMessage = null,
}: Props) {
  const pc = brandPrimaryColor || "#f97316";

  /* ── Catalog ── */
  const nonEmpty = useMemo(() => categories.filter((c) => c.items.length > 0), [categories]);
  const [activeCat, setActiveCat] = useState<string | null>(nonEmpty[0]?.id ?? null);

  /* ── Cart ── */
  const [cart, setCart] = useState<CartLine[]>([]);
  const cartCount = cart.reduce((s, l) => s + l.qty, 0);
  const cartTotal = cart.reduce((s, l) => s + l.price * l.qty, 0);

  /* ── Product modal ── */
  const [modalItem, setModalItem] = useState<LojaMenuItem | null>(null);
  const [modalQty, setModalQty] = useState(1);
  const [modalNotes, setModalNotes] = useState("");

  /* ── Checkout state ── */
  const [step, setStep] = useState<Step>("browse");
  const [phone, setPhone] = useState(knownCustomerPhone ?? "");
  const [custName, setCustName] = useState(knownCustomerName ?? "");
  const [custId, setCustId] = useState<string | null>(knownCustomerId);
  const [needName, setNeedName] = useState(false);
  const [method, setMethod] = useState<"delivery" | "pickup" | null>(null);
  const [address, setAddress] = useState<Address>(EMPTY_ADDRESS);
  const [paySub, setPaySub] = useState<"cash" | "card_machine" | "pix_in_person" | null>(null);
  const [changeFor, setChangeFor] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<{ orderId: string } | null>(null);

  function openItem(item: LojaMenuItem) {
    setModalItem(item);
    setModalQty(1);
    setModalNotes("");
  }

  function addToCart() {
    if (!modalItem) return;
    const notes = modalNotes.trim() || undefined;
    setCart((prev) => {
      // Same item + same notes merges into one line; different notes stay separate.
      const ix = prev.findIndex((l) => l.id === modalItem.id && l.notes === notes);
      if (ix >= 0) {
        const next = [...prev];
        next[ix] = { ...next[ix]!, qty: next[ix]!.qty + modalQty };
        return next;
      }
      return [...prev, { id: modalItem.id, name: modalItem.name, price: modalItem.price, qty: modalQty, notes }];
    });
    setModalItem(null);
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

  /* ── Checkout actions ── */

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
          setStep("method");
        } else {
          // Cadastro existe mas sem nome legível — pede o nome; o reenvio corrige o cadastro.
          setNeedName(true);
          if (needName) setError("Digite seu nome para continuar.");
        }
      } else if (json.customerId) {
        // New customer created with the provided name.
        setCustId(json.customerId);
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
          cart: cart.map((l) => ({ id: l.id, name: l.name, price: l.price, qty: l.qty, ...(l.notes ? { notes: l.notes } : {}) })),
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

  /* ── Empty state: menu without items ── */
  if (nonEmpty.length === 0) {
    return (
      <Shell name={restaurantName} logoUrl={logoUrl} pc={pc}>
        <div className="mx-auto max-w-md px-5 py-16 text-center">
          <p className="text-lg font-semibold text-gray-800">Cardápio em preparação</p>
          <p className="mt-2 text-sm text-gray-500">
            O {restaurantName} ainda está montando o cardápio. Volte em breve!
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell name={restaurantName} logoUrl={logoUrl} pc={pc}>
      {/* Fechado agora */}
      {!restaurantIsOpen && (
        <div className="mx-4 mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {closedMessage ?? "Estamos fechados no momento — mas você já pode montar o pedido."}
        </div>
      )}

      {/* Category chips */}
      <nav className="sticky top-0 z-20 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {nonEmpty.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                setActiveCat(c.id);
                document.getElementById(`cat-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className="shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
              style={activeCat === c.id
                ? { backgroundColor: pc, color: "#fff" }
                : { backgroundColor: "#f3f4f6", color: "#374151" }}
            >
              {c.name}
            </button>
          ))}
        </div>
      </nav>

      {/* Catálogo */}
      <main className="mx-auto max-w-2xl px-4 pb-36 pt-2">
        {nonEmpty.map((c) => (
          <section key={c.id} id={`cat-${c.id}`} className="scroll-mt-16 pt-4">
            <h2 className="text-lg font-bold text-gray-900">{c.name}</h2>
            <div className="mt-2 space-y-3">
              {c.items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openItem(item)}
                  className="flex w-full items-stretch gap-3 rounded-2xl border border-gray-100 bg-white p-3 text-left shadow-sm transition-shadow hover:shadow"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-900">{item.name}</p>
                    {item.description ? (
                      <p className="mt-0.5 line-clamp-2 text-sm text-gray-500">{item.description}</p>
                    ) : null}
                    <p className="mt-1.5 text-sm font-bold" style={{ color: pc }}>{fmt(item.price)}</p>
                  </div>
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.imageUrl} alt={item.name} className="h-20 w-20 shrink-0 rounded-xl object-cover" />
                  ) : (
                    <span
                      aria-hidden
                      className="flex h-20 w-20 shrink-0 items-center justify-center self-center rounded-xl text-2xl"
                      style={{ backgroundColor: `${pc}14` }}
                    >
                      🍽️
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>
        ))}
      </main>

      {/* Barra de carrinho fixa */}
      {cartCount > 0 && step === "browse" && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => setStep(custId || knownCustomerPhone ? "method" : "identify")}
            className="mx-auto flex w-full max-w-2xl items-center justify-between rounded-2xl px-5 py-3.5 text-white shadow-lg"
            style={{ backgroundColor: pc }}
          >
            <span className="flex items-center gap-2 font-semibold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 text-sm">{cartCount}</span>
              Finalizar pedido
            </span>
            <span className="font-bold">{fmt(cartTotal)}</span>
          </button>
        </div>
      )}

      {/* ── Modal do produto ── */}
      {modalItem && (
        <Sheet onClose={() => setModalItem(null)}>
          {modalItem.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={modalItem.imageUrl} alt={modalItem.name} className="h-44 w-full rounded-2xl object-cover" />
          ) : null}
          <h3 className="mt-3 text-xl font-bold text-gray-900">{modalItem.name}</h3>
          {modalItem.description ? <p className="mt-1 text-sm text-gray-500">{modalItem.description}</p> : null}
          <p className="mt-2 text-lg font-bold" style={{ color: pc }}>{fmt(modalItem.price)}</p>

          <label className="mt-4 block text-sm font-semibold text-gray-700" htmlFor="obs">
            Alguma observação?
          </label>
          <textarea
            id="obs"
            value={modalNotes}
            onChange={(e) => setModalNotes(e.target.value)}
            placeholder="Ex.: sem cebola, ponto da carne…"
            maxLength={300}
            rows={2}
            className="mt-1 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-gray-400"
          />

          <div className="mt-4 flex items-center gap-3">
            <div className="flex items-center rounded-xl border border-gray-200">
              <button type="button" aria-label="menos um" onClick={() => setModalQty((q) => Math.max(1, q - 1))} className="px-4 py-2.5 text-lg font-bold text-gray-600">−</button>
              <span className="w-8 text-center font-semibold">{modalQty}</span>
              <button type="button" aria-label="mais um" onClick={() => setModalQty((q) => q + 1)} className="px-4 py-2.5 text-lg font-bold text-gray-600">+</button>
            </div>
            <button
              type="button"
              onClick={addToCart}
              className="flex-1 rounded-xl px-4 py-3 font-semibold text-white"
              style={{ backgroundColor: pc }}
            >
              Adicionar · {fmt(modalItem.price * modalQty)}
            </button>
          </div>
        </Sheet>
      )}

      {/* ── Checkout em folhas ── */}
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
                className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-gray-400"
              />
              {needName && (
                <input
                  value={custName}
                  onChange={(e) => setCustName(e.target.value)}
                  placeholder="Seu nome"
                  className="mt-3 w-full rounded-xl border border-gray-200 px-4 py-3 text-base outline-none focus:border-gray-400"
                />
              )}
              <PrimaryBtn pc={pc} disabled={busy || phone.replace(/\D/g, "").length < 10 || (needName && custName.trim().length < 2)} onClick={submitIdentify}>
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
                <input value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} placeholder="Rua" className="col-span-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
                <input value={address.number} onChange={(e) => setAddress({ ...address, number: e.target.value })} placeholder="Número" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
                <input value={address.neighborhood} onChange={(e) => setAddress({ ...address, neighborhood: e.target.value })} placeholder="Bairro" className="rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
                <input value={address.complement} onChange={(e) => setAddress({ ...address, complement: e.target.value })} placeholder="Complemento (opcional)" className="col-span-2 rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400" />
              </div>
              <PrimaryBtn pc={pc} disabled={busy} onClick={submitAddress}>Continuar</PrimaryBtn>
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
                  className="mt-2 w-full rounded-xl border border-gray-200 px-3 py-2.5 text-sm outline-none focus:border-gray-400"
                />
              )}
              <PrimaryBtn pc={pc} disabled={!paySub || busy} onClick={() => setStep("review")}>Revisar pedido</PrimaryBtn>
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
                      {l.notes ? <p className="text-xs text-gray-500">{l.notes}</p> : null}
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
                <PrimaryBtn pc={pc} disabled={busy} onClick={submitOrder}>
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
            <button
              type="button"
              onClick={() => { setOrder(null); setStep("browse"); setMethod(null); setPaySub(null); }}
              className="mt-5 w-full rounded-xl px-4 py-3 font-semibold text-white"
              style={{ backgroundColor: pc }}
            >
              Fazer novo pedido
            </button>
          </div>
        </Sheet>
      )}
    </Shell>
  );
}

/* ── Shell: header white-label, sem nada de chat ─────────────────────────── */

function Shell({ name, logoUrl, pc, children }: { name: string; logoUrl: string | null; pc: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="flex items-center gap-3 px-4 py-3" style={{ backgroundColor: pc }}>
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt={name} className="h-10 w-10 rounded-full object-cover" />
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white/25 text-lg font-bold text-white">
            {name.charAt(0).toUpperCase()}
          </span>
        )}
        <div>
          <p className="font-bold leading-tight text-white">{name}</p>
          <p className="text-xs text-white/80">Peça pelo cardápio</p>
        </div>
      </header>
      {children}
    </div>
  );
}

function Sheet({ children, onClose }: { children: React.ReactNode; onClose?: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center" onClick={onClose}>
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

function PrimaryBtn({ pc, disabled, onClick, children }: { pc: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="mt-4 w-full rounded-xl px-4 py-3 font-semibold text-white transition-opacity disabled:opacity-40"
      style={{ backgroundColor: pc }}
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
      className="rounded-xl border px-4 py-3 text-left transition-colors"
      style={active && pc ? { borderColor: pc, backgroundColor: `${pc}0d` } : { borderColor: "#e5e7eb" }}
    >
      <span className="block font-semibold text-gray-900">{title}</span>
      <span className="mt-0.5 block text-sm text-gray-500">{subtitle}</span>
    </button>
  );
}
