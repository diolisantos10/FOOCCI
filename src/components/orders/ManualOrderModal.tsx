"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { isDeliveryQuoteAuthorized } from "@/lib/delivery-authorization";

// ── Types ──────────────────────────────────────────────────────────────────────

interface MenuItem {
  id:           string;
  name:         string;
  price:        number;
  categoryName: string;
}

interface CartLine {
  menuItemId: string;
  name:       string;
  price:      number;
  quantity:   number;
}

interface DeliveryAddr {
  cep:          string;
  street:       string;
  number:       string;
  neighborhood: string;
  city:         string;
  state:        string;
  complement:   string;
}

interface DeliveryQuote {
  deliveryFee:       number;
  calculationStatus: string;
  reason:            string;
  distanceKm:        number | null;
}

interface AppliedCoupon {
  promotionId:    string;
  couponCode:     string;
  discountAmount: number;
  discountType:   string;
  name:           string;
}

type PaymentMethod = "CASH" | "PIX" | "CREDIT_CARD" | "DEBIT_CARD" | "CARD_MACHINE";
type PaymentStatus = "PAID" | "PAY_ON_DELIVERY";
type OrderType     = "DELIVERY" | "PICKUP";
type InternalStep  = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// ── Constants ──────────────────────────────────────────────────────────────────

const PAYMENT_LABELS: Record<string, string> = {
  CASH: "Dinheiro", PIX: "Pix", CREDIT_CARD: "Crédito",
  DEBIT_CARD: "Débito", CARD_MACHINE: "Máquina",
};

const EMPTY_ADDR: DeliveryAddr = {
  cep: "", street: "", number: "", neighborhood: "", city: "", state: "", complement: "",
};

const DELIVERY_STEPS = ["Cliente", "Itens", "Entrega", "Endereço", "Desconto", "Pagamento", "Revisão"];
const PICKUP_STEPS   = ["Cliente", "Itens", "Entrega", "Desconto", "Pagamento", "Revisão"];

const DRAFT_VERSION = 1;

interface ManualOrderDraft {
  v:             number;
  step:          InternalStep;
  customerName:  string;
  customerPhone: string;
  notes:         string;
  cart:          CartLine[];
  orderType:     OrderType;
  addr:          DeliveryAddr;
  quote:         DeliveryQuote | null;
  discountStr:   string;
  couponInput:   string;
  appliedCoupon: AppliedCoupon | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  savedAt:       number;
}

// ── Props ──────────────────────────────────────────────────────────────────────

export interface ManualOrderModalProps {
  conversationId?: string;
  prefillName?:    string | null;
  prefillPhone?:   string | null;
  source?:         "manual" | "whatsapp_manual";
  onClose:         () => void;
  onCreated:       (orderId: string, displayNumber?: string) => void;
}

// ── Component ──────────────────────────────────────────────────────────────────

export function ManualOrderModal({
  conversationId,
  prefillName,
  prefillPhone,
  source = "manual",
  onClose,
  onCreated,
}: ManualOrderModalProps) {

  const [step, setStep] = useState<InternalStep>(1);

  // Step 1: Customer
  const [customerName,  setCustomerName]  = useState(prefillName  ?? "");
  const [customerPhone, setCustomerPhone] = useState(prefillPhone ?? "");
  const [notes,         setNotes]         = useState("");

  // Step 2: Products
  const [menuItems,   setMenuItems]   = useState<MenuItem[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [itemSearch,  setItemSearch]  = useState("");
  const [cart,        setCart]        = useState<CartLine[]>([]);

  // Step 3: Order type
  const [orderType, setOrderType] = useState<OrderType>("PICKUP");

  // Step 4: Delivery address (DELIVERY only)
  const [addr,         setAddr]         = useState<DeliveryAddr>(EMPTY_ADDR);
  const [cepLoading,   setCepLoading]   = useState(false);
  const [cepError,     setCepError]     = useState<string | null>(null);
  const [quote,        setQuote]        = useState<DeliveryQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError,   setQuoteError]   = useState<string | null>(null);

  // Step 5: Discount / Coupon
  const [discountStr,    setDiscountStr]    = useState("");
  const [couponInput,    setCouponInput]    = useState("");
  const [appliedCoupon,  setAppliedCoupon]  = useState<AppliedCoupon | null>(null);
  const [couponError,    setCouponError]    = useState<string | null>(null);
  const [couponLoading,  setCouponLoading]  = useState(false);

  // Step 6: Payment
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>("PAID");

  // Submission
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Draft persistence
  const [draftRecovered,    setDraftRecovered]    = useState(false);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const hydratedRef = useRef(false);

  // Draft key — scoped to the operator's context so the Atendimento thread, a
  // specific phone, and the generic Orders entry each keep their own draft.
  const draftKey = useMemo(() => {
    const scope = conversationId || (prefillPhone ?? "") || "orders";
    return `manualOrderDraft:v${DRAFT_VERSION}:${source}:${scope}`;
  }, [conversationId, prefillPhone, source]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const cartSubtotal   = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const deliveryFee    = orderType === "DELIVERY" ? (quote?.deliveryFee ?? 0) : 0;
  // coupon discount takes precedence over the manual freeform discount field
  const discountAmount = appliedCoupon
    ? appliedCoupon.discountAmount
    : Math.max(0, parseFloat(discountStr.replace(",", ".")) || 0);
  const cartTotal      = Math.max(0, cartSubtotal + deliveryFee - discountAmount);

  const stepLabels = orderType === "DELIVERY" ? DELIVERY_STEPS : PICKUP_STEPS;
  const totalSteps = stepLabels.length;
  const visualStep = step <= 3 ? step : orderType === "PICKUP" ? step - 1 : step;
  const stepLabel  = stepLabels[visualStep - 1] ?? "";

  // Allowlist-based guard lives in @/lib/delivery-authorization (shared with the
  // backend). Local alias keeps the JSX terse.
  const isQuoteAuthorized = isDeliveryQuoteAuthorized;

  // Delivery is allowed ONLY when there is an authorized quote with a valid fee
  // and no outstanding quote error (e.g. a 401 "Não autorizado" response or a
  // network failure). PICKUP never needs a quote.
  const deliveryAllowed =
    orderType !== "DELIVERY"
      ? true
      : isQuoteAuthorized(quote) && !quoteError;

  const hasRequiredAddress =
    !!addr.cep.trim() && !!addr.street.trim() && !!addr.number.trim() && !!addr.city.trim();

  const isAdvanceBlocked =
    step === 4 && (!hasRequiredAddress || !deliveryAllowed);

  // Show the blocked banner whenever a calculation was attempted and delivery
  // is not allowed: a blocked quote status OR a quote error (401/out_of_range/etc).
  const showDeliveryBlocked =
    step === 4 &&
    orderType === "DELIVERY" &&
    ((quote != null && !isQuoteAuthorized(quote)) || quoteError != null);

  // ── Load menu items on mount ───────────────────────────────────────────────

  useEffect(() => {
    setMenuLoading(true);
    fetch("/api/menu/items")
      .then((r) => r.json())
      .then((res: { success?: boolean; data?: MenuItem[] }) => {
        if (res.success && Array.isArray(res.data)) setMenuItems(res.data);
      })
      .catch(() => {})
      .finally(() => setMenuLoading(false));
  }, []);

  const filteredItems = useMemo(() => {
    const q = itemSearch.toLowerCase();
    return q
      ? menuItems.filter((m) => m.name.toLowerCase().includes(q) || m.categoryName.toLowerCase().includes(q))
      : menuItems;
  }, [menuItems, itemSearch]);

  // ── Draft: restore on mount ────────────────────────────────────────────────

  useEffect(() => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const d = JSON.parse(raw) as ManualOrderDraft;
        if (d && d.v === DRAFT_VERSION) {
          if (d.customerName)  setCustomerName(d.customerName);
          if (d.customerPhone) setCustomerPhone(d.customerPhone);
          setNotes(d.notes ?? "");
          if (Array.isArray(d.cart)) setCart(d.cart);
          if (d.orderType) setOrderType(d.orderType);
          if (d.addr) setAddr(d.addr);
          setQuote(d.quote ?? null);
          setDiscountStr(d.discountStr ?? "");
          setCouponInput(d.couponInput ?? "");
          setAppliedCoupon(d.appliedCoupon ?? null);
          if (d.paymentMethod) setPaymentMethod(d.paymentMethod);
          if (d.paymentStatus) setPaymentStatus(d.paymentStatus);
          if (d.step) setStep(d.step);
          const hasContent = (d.cart?.length ?? 0) > 0 || !!d.customerName?.trim() || !!d.notes?.trim();
          if (hasContent) setDraftRecovered(true);
        }
      }
    } catch {
      // Corrupt draft — ignore and start fresh.
    } finally {
      hydratedRef.current = true;
    }
    // Restore once per mount, scoped to the resolved draft key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  // ── Draft: persist on change ───────────────────────────────────────────────

  useEffect(() => {
    if (!hydratedRef.current) return; // don't overwrite before the restore runs
    const hasContent =
      cart.length > 0 || customerName.trim() !== "" || notes.trim() !== "" ||
      addr.cep.trim() !== "" || addr.street.trim() !== "";
    // Nothing meaningful yet — don't write (and don't delete, to avoid racing
    // the restore on mount). Explicit clears handle removal on success/discard.
    if (!hasContent) return;
    try {
      const draft: ManualOrderDraft = {
        v: DRAFT_VERSION, step, customerName, customerPhone, notes, cart,
        orderType, addr, quote, discountStr, couponInput, appliedCoupon,
        paymentMethod, paymentStatus,
        savedAt: Date.now(),
      };
      localStorage.setItem(draftKey, JSON.stringify(draft));
    } catch {
      // Storage full / unavailable — non-fatal.
    }
  }, [
    draftKey, step, customerName, customerPhone, notes, cart, orderType,
    addr, quote, discountStr, couponInput, appliedCoupon, paymentMethod, paymentStatus,
  ]);

  function clearDraft() {
    try { localStorage.removeItem(draftKey); } catch { /* noop */ }
  }

  function discardDraft() {
    clearDraft();
    setShowDiscardConfirm(false);
    onClose();
  }

  // ── Coupon helpers ────────────────────────────────────────────────────────

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    setCouponLoading(true);
    setCouponError(null);
    try {
      const res  = await fetch("/api/orders/validate-coupon", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          couponCode:  code,
          subtotal:    cartSubtotal,
          deliveryFee: deliveryFee,
          type:        orderType,
        }),
      });
      const json = await res.json() as {
        valid: boolean; error?: string;
        promotionId?: string; couponCode?: string;
        discountAmount?: number; discountType?: string; name?: string;
      };
      if (!res.ok || !json.valid) {
        setCouponError(json.error ?? "Cupom inválido, expirado ou não aplicável");
      } else {
        setAppliedCoupon({
          promotionId:    json.promotionId!,
          couponCode:     json.couponCode!,
          discountAmount: json.discountAmount!,
          discountType:   json.discountType!,
          name:           json.name!,
        });
        setDiscountStr("");   // clear manual discount when coupon is applied
        setCouponInput("");
      }
    } catch {
      setCouponError("Falha de rede ao validar cupom");
    } finally {
      setCouponLoading(false);
    }
  }

  function removeCoupon() {
    setAppliedCoupon(null);
    setCouponError(null);
  }

  // ── Cart helpers ──────────────────────────────────────────────────────────

  function addToCart(item: MenuItem) {
    setCart((prev) => {
      const ex = prev.find((l) => l.menuItemId === item.id);
      if (ex) return prev.map((l) => l.menuItemId === item.id ? { ...l, quantity: l.quantity + 1 } : l);
      return [...prev, { menuItemId: item.id, name: item.name, price: item.price, quantity: 1 }];
    });
  }

  function adjustQty(id: string, delta: number) {
    setCart((prev) =>
      prev.map((l) => l.menuItemId === id ? { ...l, quantity: l.quantity + delta } : l)
          .filter((l) => l.quantity > 0)
    );
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  function nextStep() {
    setError(null);
    if (step === 1) {
      if (!customerName.trim()) { setError("Nome do cliente é obrigatório"); return; }
      setStep(2);
    } else if (step === 2) {
      if (cart.length === 0) { setError("Adicione pelo menos um item"); return; }
      setStep(3);
    } else if (step === 3) {
      setStep(orderType === "DELIVERY" ? 4 : 5);
    } else if (step === 4) {
      if (!addr.cep.trim() || !addr.street.trim() || !addr.number.trim() || !addr.city.trim()) {
        setError("Preencha CEP, rua, número e cidade"); return;
      }
      if (!quote) { setError("Calcule o frete antes de continuar"); return; }
      if (!isQuoteAuthorized(quote)) {
        setError("Endereço fora da área de entrega ou entrega não autorizada. Escolha Retirada ou informe outro endereço.");
        return;
      }
      setStep(5);
    } else if (step === 5) {
      setStep(6);
    } else if (step === 6) {
      setStep(7);
    }
  }

  function prevStep() {
    setError(null);
    if (step === 7)      setStep(6);
    else if (step === 6) setStep(5);
    else if (step === 5) setStep(orderType === "DELIVERY" ? 4 : 3);
    else if (step === 4) setStep(3);
    else if (step === 3) setStep(2);
    else if (step === 2) setStep(1);
  }


  // ── CEP lookup ────────────────────────────────────────────────────────────

  async function lookupCep() {
    const cep = addr.cep.replace(/\D/g, "");
    if (cep.length !== 8) { setCepError("CEP deve ter 8 dígitos"); return; }
    setCepLoading(true);
    setCepError(null);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (data.erro) { setCepError("CEP não encontrado"); return; }
      setAddr((prev) => ({
        ...prev, cep,
        street:       data.logradouro ?? prev.street,
        neighborhood: data.bairro     ?? prev.neighborhood,
        city:         data.localidade ?? prev.city,
        state:        data.uf         ?? prev.state,
      }));
      resetQuote();
    } catch {
      setCepError("Erro ao buscar CEP");
    } finally {
      setCepLoading(false);
    }
  }

  // ── Freight calculation ───────────────────────────────────────────────────

  // Any change to an address field invalidates a previous quote: clear both the
  // quote and its error so deliveryAllowed becomes false and a recalculation is
  // required before the operator can advance.
  function resetQuote() {
    setQuote(null);
    setQuoteError(null);
  }

  async function calcFreight() {
    if (!addr.street.trim() || !addr.number.trim()) {
      setQuoteError("Preencha rua e número antes de calcular"); return;
    }
    setQuoteLoading(true);
    setQuoteError(null);
    try {
      const res  = await fetch("/api/orders/delivery-quote", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          subtotal:     cartSubtotal,
          cep:          addr.cep,
          street:       addr.street,
          number:       addr.number,
          neighborhood: addr.neighborhood,
          city:         addr.city,
          state:        addr.state,
        }),
      });
      const json = await res.json() as DeliveryQuote & { error?: string };
      if (!res.ok) { setQuoteError(json.error ?? "Erro ao calcular frete"); return; }
      setQuote(json);
    } catch {
      setQuoteError("Falha de rede ao calcular frete");
    } finally {
      setQuoteLoading(false);
    }
  }

  // ── Submission ────────────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {
        customerName:   customerName.trim(),
        customerPhone:  customerPhone.trim() || undefined,
        notes:          notes.trim() || undefined,
        deliveryFee,
        // When a coupon is applied, the backend re-validates and computes the
        // discount itself — do not send discountAmount alongside couponCode.
        ...(appliedCoupon
          ? { couponCode: appliedCoupon.couponCode }
          : { discountAmount: discountAmount > 0 ? discountAmount : undefined }),
        type:           orderType,
        paymentMethod,
        paymentStatus,
        source,
        conversationId: conversationId || undefined,
        items:          cart.map((l) => ({ menuItemId: l.menuItemId, quantity: l.quantity })),
      };
      if (orderType === "DELIVERY" && addr.street.trim()) {
        body.deliveryAddress = {
          cep:          addr.cep,
          street:       addr.street,
          number:       addr.number,
          neighborhood: addr.neighborhood,
          city:         addr.city,
          state:        addr.state,
          complement:   addr.complement || undefined,
        };
      }
      const res  = await fetch("/api/orders/manual", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      const json = await res.json() as { success?: boolean; orderId?: string; displayNumber?: string; error?: string };
      if (!res.ok || !json.success) {
        setError(json.error ?? "Erro ao criar pedido");
        setStep(1);
        return;
      }
      clearDraft();
      onCreated(json.orderId!, json.displayNumber);
    } catch {
      setError("Falha de rede. Tente novamente.");
      setStep(1);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Styles ────────────────────────────────────────────────────────────────

  const inputCls  = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100";
  const selectCls = "w-full rounded-lg border border-gray-200 px-2 py-2 text-sm text-gray-700 focus:border-orange-300 focus:outline-none focus:ring-1 focus:ring-orange-100";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-0 sm:px-4">
      <div className="relative flex h-[92vh] sm:h-auto sm:max-h-[90vh] w-full sm:max-w-xl flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl">

        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <div>
            <p className="text-sm font-bold text-gray-900">Criar pedido manual</p>
            <p className="text-xs text-gray-400 mt-0.5">{stepLabel} — passo {visualStep} de {totalSteps}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none transition-colors">✕</button>
        </div>

        {/* Progress bar */}
        <div className="shrink-0 h-1 bg-gray-100">
          <div
            className="h-full bg-orange-400 transition-all duration-300"
            style={{ width: `${(visualStep / totalSteps) * 100}%` }}
          />
        </div>

        {/* Step dots */}
        <div className="shrink-0 flex items-center justify-center gap-1 px-4 py-2.5">
          {stepLabels.map((label, i) => {
            const vs   = i + 1;
            const done = vs < visualStep;
            const cur  = vs === visualStep;
            return (
              <div key={label} className="flex items-center gap-1">
                <div title={label} className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors
                  ${done ? "bg-orange-500 text-white" : cur ? "bg-orange-100 border-2 border-orange-500 text-orange-700" : "bg-gray-100 text-gray-400"}`}>
                  {done ? "✓" : vs}
                </div>
                {i < stepLabels.length - 1 && (
                  <div className={`h-px w-3 ${done ? "bg-orange-300" : "bg-gray-200"}`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {draftRecovered && (
            <div className="flex items-center justify-between gap-2 rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
              <p className="text-xs font-medium text-blue-700">↩︎ Rascunho recuperado — continue de onde parou.</p>
              <button type="button"
                onClick={() => setShowDiscardConfirm(true)}
                className="shrink-0 text-[11px] font-semibold text-blue-500 hover:text-red-500 transition-colors">
                Descartar
              </button>
            </div>
          )}

          {/* ── Step 1: Customer ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nome *</label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="Nome do cliente" className={inputCls} autoFocus />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Telefone</label>
                <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="(11) 99999-9999" className={inputCls} />
              </div>
            </div>
          )}

          {/* ── Step 2: Products ─────────────────────────────────────── */}
          {step === 2 && (
            <>
              <input type="text" value={itemSearch} onChange={(e) => setItemSearch(e.target.value)}
                placeholder="Buscar produto…" className={inputCls} autoFocus />
              {menuLoading ? (
                <p className="text-center text-xs text-gray-400 py-4">Carregando produtos…</p>
              ) : (
                <div className="max-h-44 overflow-y-auto rounded-xl border border-gray-100 divide-y divide-gray-50">
                  {filteredItems.length === 0 ? (
                    <p className="py-3 text-center text-xs text-gray-400">Nenhum produto encontrado</p>
                  ) : filteredItems.slice(0, 80).map((item) => (
                    <button key={item.id} type="button" onClick={() => addToCart(item)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-orange-50 transition-colors">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-gray-800">{item.name}</p>
                        <p className="text-[10px] text-gray-400">{item.categoryName}</p>
                      </div>
                      <span className="ml-3 shrink-0 text-xs font-semibold text-orange-600">
                        + R$ {item.price.toFixed(2).replace(".", ",")}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {cart.length > 0 && (
                <>
                  <p className="text-xs font-semibold text-gray-600">
                    Carrinho ({cart.length} item{cart.length > 1 ? "s" : ""})
                  </p>
                  <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100">
                    {cart.map((line) => (
                      <div key={line.menuItemId} className="flex items-center gap-3 px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="truncate text-xs font-medium text-gray-800">{line.name}</p>
                          <p className="text-[10px] text-gray-400">
                            R$ {(line.price * line.quantity).toFixed(2).replace(".", ",")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button type="button" onClick={() => adjustQty(line.menuItemId, -1)}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 hover:bg-gray-100 text-sm leading-none">
                            −
                          </button>
                          <span className="w-5 text-center text-xs font-semibold text-gray-700">{line.quantity}</span>
                          <button type="button" onClick={() => adjustQty(line.menuItemId, 1)}
                            className="flex h-6 w-6 items-center justify-center rounded-full border border-orange-200 bg-orange-50 text-orange-600 hover:bg-orange-100 text-sm leading-none">
                            +
                          </button>
                        </div>
                        <button type="button"
                          onClick={() => setCart((p) => p.filter((l) => l.menuItemId !== line.menuItemId))}
                          className="text-gray-300 hover:text-red-500 transition-colors text-xs leading-none">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-between rounded-lg bg-orange-50 px-3 py-2 text-sm font-semibold">
                    <span className="text-gray-700">Subtotal</span>
                    <span className="text-orange-700">R$ {cartSubtotal.toFixed(2).replace(".", ",")}</span>
                  </div>
                </>
              )}

              {/* Order-level observations — captured while selecting items, where
                  staff usually receive prep/delivery notes from the customer. */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Observações de preparo/entrega</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
                  placeholder="Ex: sem cream cheese, trocar molho, ponto da carne, referência de entrega…"
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 placeholder:text-gray-400 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100" />
              </div>
            </>
          )}

          {/* ── Step 3: Order Type ───────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">Como o cliente vai receber o pedido?</p>
              {(["PICKUP", "DELIVERY"] as const).map((t) => (
                <button key={t} type="button"
                  onClick={() => { setOrderType(t); if (t === "PICKUP") { setQuote(null); setQuoteError(null); } }}
                  className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left transition-colors
                    ${orderType === t ? "border-orange-400 bg-orange-50" : "border-gray-200 bg-white hover:border-gray-300"}`}>
                  <span className="text-2xl">{t === "PICKUP" ? "🏠" : "🛵"}</span>
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{t === "PICKUP" ? "Retirada" : "Entrega"}</p>
                    <p className="text-xs text-gray-500">
                      {t === "PICKUP" ? "Cliente retira no local" : "Entregamos no endereço do cliente"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 4: Delivery Address ─────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-700 mb-1">CEP *</label>
                  <input type="text" value={addr.cep}
                    onChange={(e) => { setAddr((p) => ({ ...p, cep: e.target.value })); resetQuote(); }}
                    placeholder="00000-000" maxLength={9} className={inputCls} autoFocus />
                </div>
                <div className="flex items-end">
                  <button type="button" onClick={lookupCep} disabled={cepLoading}
                    className="rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors">
                    {cepLoading ? "…" : "Buscar"}
                  </button>
                </div>
              </div>
              {cepError && <p className="text-xs text-red-500">{cepError}</p>}

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Rua *</label>
                  <input type="text" value={addr.street}
                    onChange={(e) => { setAddr((p) => ({ ...p, street: e.target.value })); resetQuote(); }}
                    placeholder="Rua / Avenida" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Número *</label>
                  <input type="text" value={addr.number}
                    onChange={(e) => { setAddr((p) => ({ ...p, number: e.target.value })); resetQuote(); }}
                    placeholder="123" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Complemento</label>
                  <input type="text" value={addr.complement}
                    onChange={(e) => { setAddr((p) => ({ ...p, complement: e.target.value })); resetQuote(); }}
                    placeholder="Apto, bloco…" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Bairro *</label>
                  <input type="text" value={addr.neighborhood}
                    onChange={(e) => { setAddr((p) => ({ ...p, neighborhood: e.target.value })); resetQuote(); }}
                    placeholder="Bairro" className={inputCls} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cidade *</label>
                  <input type="text" value={addr.city}
                    onChange={(e) => { setAddr((p) => ({ ...p, city: e.target.value })); resetQuote(); }}
                    placeholder="Cidade" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">UF</label>
                  <input type="text" value={addr.state}
                    onChange={(e) => { setAddr((p) => ({ ...p, state: e.target.value })); resetQuote(); }}
                    placeholder="SP" maxLength={2} className={inputCls} />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button type="button" onClick={calcFreight}
                  disabled={quoteLoading || !addr.street.trim() || !addr.number.trim()}
                  className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-50 disabled:opacity-50 transition-colors">
                  {quoteLoading ? "Calculando…" : "Calcular entrega"}
                </button>
                {isQuoteAuthorized(quote) && quote && (
                  <span className="text-xs font-semibold text-green-700">
                    Frete: {quote.deliveryFee === 0 ? "Grátis" : `R$ ${quote.deliveryFee.toFixed(2).replace(".", ",")}`}
                    {quote.distanceKm != null ? ` (${quote.distanceKm.toFixed(1)} km)` : ""}
                  </span>
                )}
              </div>
              {quoteError && <p className="text-xs text-red-500">{quoteError}</p>}
              {showDeliveryBlocked && (
                <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5">
                  <p className="text-xs font-semibold text-red-700">Endereço fora da área de entrega ou entrega não autorizada.</p>
                  <p className="text-xs text-red-600 mt-0.5">Escolha <strong>Retirada</strong> ou informe outro endereço.</p>
                  <p className="text-[11px] text-red-500 mt-1">Você pode trocar para Retirada ou testar outro endereço.</p>
                </div>
              )}
              {isQuoteAuthorized(quote) && quote?.calculationStatus === "manual" && (
                <p className="rounded-lg bg-yellow-50 px-3 py-2 text-xs text-yellow-700">
                  Modo manual — confirme o frete com o cliente.
                </p>
              )}
            </div>
          )}

          {/* ── Step 5: Discount / Coupon ────────────────────────────── */}
          {step === 5 && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Opcional. Use um cupom de desconto ou informe um valor manual.
              </p>

              {/* Coupon section */}
              {!appliedCoupon ? (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Cupom de desconto</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponInput}
                      onChange={(e) => { setCouponInput(e.target.value.toUpperCase()); setCouponError(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") void applyCoupon(); }}
                      placeholder="CÓDIGO DO CUPOM"
                      className={inputCls + " uppercase tracking-widest"}
                      disabled={couponLoading}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => void applyCoupon()}
                      disabled={couponLoading || !couponInput.trim()}
                      className="shrink-0 rounded-lg bg-orange-500 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-600 disabled:opacity-50 transition-colors"
                    >
                      {couponLoading ? "…" : "Aplicar"}
                    </button>
                  </div>
                  {couponError && (
                    <p className="mt-1.5 text-xs text-red-600">{couponError}</p>
                  )}
                </div>
              ) : (
                <div className="flex items-start justify-between gap-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5">
                  <div>
                    <p className="text-xs font-bold text-green-800 tracking-wide">{appliedCoupon.couponCode}</p>
                    <p className="text-xs text-green-700 mt-0.5">
                      {appliedCoupon.name} — desconto: −&nbsp;R$&nbsp;{appliedCoupon.discountAmount.toFixed(2).replace(".", ",")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={removeCoupon}
                    className="shrink-0 text-xs font-semibold text-green-600 hover:text-red-500 transition-colors whitespace-nowrap pt-0.5"
                  >
                    Remover
                  </button>
                </div>
              )}

              {/* Manual discount — hidden while a coupon is active */}
              {!appliedCoupon && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Desconto manual em R$ (opcional)</label>
                  <input type="text" inputMode="decimal" value={discountStr}
                    onChange={(e) => setDiscountStr(e.target.value)}
                    placeholder="0,00" className={inputCls} />
                </div>
              )}

              {/* Order summary */}
              <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 text-sm">
                <div className="flex justify-between px-3 py-2">
                  <span className="text-gray-500">Subtotal</span>
                  <span>R$ {cartSubtotal.toFixed(2).replace(".", ",")}</span>
                </div>
                {orderType === "DELIVERY" && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-gray-500">Frete</span>
                    <span>{deliveryFee === 0 ? "Grátis" : `R$ ${deliveryFee.toFixed(2).replace(".", ",")}`}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between px-3 py-2 text-green-700">
                    <span>Desconto{appliedCoupon ? ` (${appliedCoupon.couponCode})` : ""}</span>
                    <span>− R$ {discountAmount.toFixed(2).replace(".", ",")}</span>
                  </div>
                )}
                <div className="flex justify-between px-3 py-2 font-bold">
                  <span>Total</span>
                  <span className="text-orange-600">R$ {cartTotal.toFixed(2).replace(".", ",")}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 6: Payment ──────────────────────────────────────── */}
          {step === 6 && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Forma de pagamento</label>
                  <select value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className={selectCls}>
                    <option value="CASH">Dinheiro</option>
                    <option value="PIX">Pix</option>
                    <option value="CREDIT_CARD">Cartão crédito</option>
                    <option value="DEBIT_CARD">Cartão débito</option>
                    <option value="CARD_MACHINE">Maquininha</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Status do pagamento</label>
                  <select value={paymentStatus}
                    onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}
                    className={selectCls}>
                    <option value="PAID">Pago</option>
                    <option value="PAY_ON_DELIVERY">Pagar na entrega</option>
                  </select>
                </div>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 divide-y divide-gray-100 text-sm">
                <div className="flex justify-between px-3 py-2">
                  <span className="text-gray-500">Subtotal</span>
                  <span>R$ {cartSubtotal.toFixed(2).replace(".", ",")}</span>
                </div>
                {orderType === "DELIVERY" && (
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-gray-500">Frete</span>
                    <span>{deliveryFee === 0 ? "Grátis" : `R$ ${deliveryFee.toFixed(2).replace(".", ",")}`}</span>
                  </div>
                )}
                {discountAmount > 0 && (
                  <div className="flex justify-between px-3 py-2 text-green-700">
                    <span>Desconto{appliedCoupon ? ` (${appliedCoupon.couponCode})` : ""}</span>
                    <span>− R$ {discountAmount.toFixed(2).replace(".", ",")}</span>
                  </div>
                )}
                <div className="flex justify-between px-3 py-2 font-bold">
                  <span>Total</span>
                  <span className="text-orange-600">R$ {cartTotal.toFixed(2).replace(".", ",")}</span>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 7: Review ───────────────────────────────────────── */}
          {step === 7 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Cliente</p>
                <p className="text-sm font-semibold text-gray-900">{customerName}</p>
                {customerPhone && <p className="text-xs text-gray-500">{customerPhone}</p>}
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Observações</p>
                {notes.trim()
                  ? <p className="text-sm text-gray-800 whitespace-pre-wrap">{notes}</p>
                  : <p className="text-sm text-gray-400 italic">Nenhuma observação</p>}
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Itens</p>
                {cart.map((l) => (
                  <div key={l.menuItemId} className="flex items-center justify-between py-0.5 text-sm">
                    <span className="text-gray-800">{l.quantity}× {l.name}</span>
                    <span className="font-semibold">R$ {(l.price * l.quantity).toFixed(2).replace(".", ",")}</span>
                  </div>
                ))}
                <div className="mt-2 flex justify-between border-t border-gray-200 pt-2 text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-semibold">R$ {cartSubtotal.toFixed(2).replace(".", ",")}</span>
                </div>
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Entrega</p>
                {orderType === "PICKUP" ? (
                  <p className="text-sm text-gray-800">🏠 Retirada — sem taxa de entrega</p>
                ) : (
                  <>
                    <p className="text-sm font-medium text-gray-800">
                      {addr.street}, {addr.number}{addr.complement ? `, ${addr.complement}` : ""}
                    </p>
                    <p className="text-xs text-gray-500">
                      {addr.neighborhood}{addr.city ? ` — ${addr.city}` : ""}{addr.state ? `/${addr.state}` : ""}{addr.cep ? ` — CEP ${addr.cep}` : ""}
                    </p>
                    <div className="mt-2 flex justify-between text-sm">
                      <span className="text-gray-500">Taxa de entrega</span>
                      <span className="font-semibold">
                        {deliveryFee === 0 ? "Grátis" : `R$ ${deliveryFee.toFixed(2).replace(".", ",")}`}
                      </span>
                    </div>
                    {quote?.reason && <p className="mt-0.5 text-[10px] text-gray-400">{quote.reason}</p>}
                  </>
                )}
              </div>

              <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">Pagamento</p>
                <p className="text-sm text-gray-800">
                  {PAYMENT_LABELS[paymentMethod] ?? paymentMethod} — {paymentStatus === "PAID" ? "Pago" : "Pagar na entrega"}
                </p>
              </div>

              {discountAmount > 0 && (
                <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-green-400">Desconto</p>
                  {appliedCoupon && (
                    <p className="text-xs font-bold text-green-700 mb-0.5 tracking-wide">{appliedCoupon.couponCode}</p>
                  )}
                  {appliedCoupon && (
                    <p className="text-[11px] text-green-600 mb-1">{appliedCoupon.name}</p>
                  )}
                  <p className="text-sm font-semibold text-green-700">
                    − R$ {discountAmount.toFixed(2).replace(".", ",")}
                  </p>
                </div>
              )}

              <div className="flex items-center justify-between rounded-xl border border-orange-200 bg-orange-50 px-4 py-3">
                <p className="text-sm font-bold text-gray-900">Total</p>
                <p className="text-lg font-bold text-orange-600">R$ {cartTotal.toFixed(2).replace(".", ",")}</p>
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>
          )}

        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-100 bg-gray-50 px-5 py-4 flex items-center gap-3">
          {step > 1 ? (
            <button type="button" onClick={prevStep}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
              ← Voltar
            </button>
          ) : (
            <button type="button" onClick={() => setShowDiscardConfirm(true)}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-100 transition-colors">
              Cancelar
            </button>
          )}
          {step < 7 ? (
            <button type="button" onClick={nextStep}
              disabled={isAdvanceBlocked}
              className="flex-1 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              Avançar →
            </button>
          ) : (
            <button type="button" onClick={handleSubmit} disabled={submitting}
              className="flex-1 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
              {submitting ? "Criando…" : "✓ Confirmar e criar pedido"}
            </button>
          )}
        </div>

        {/* Discard confirmation */}
        {showDiscardConfirm && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 rounded-t-2xl sm:rounded-2xl px-6">
            <div className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl">
              <p className="text-sm font-bold text-gray-900">Descartar este pedido em andamento?</p>
              <p className="mt-1 text-xs text-gray-500">As informações preenchidas serão apagadas.</p>
              <div className="mt-4 flex flex-col gap-2">
                <button type="button" onClick={() => setShowDiscardConfirm(false)}
                  className="rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-600 transition-colors">
                  Continuar editando
                </button>
                <button type="button" onClick={discardDraft}
                  className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
                  Descartar
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
