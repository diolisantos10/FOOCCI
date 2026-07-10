import { isGuestIdentifier } from "@/lib/guest";
import { formatOrderNumber } from "@/lib/order-number";
import { parseTicketAddons, type ParsedAddon } from "@/lib/ticket-addons";

/**
 * Thermal receipt (80mm) in two faithful formats, modeled on what the restaurant
 * is used to (Saipos-style):
 *
 *   variant="kitchen"  — "notinha da cozinha": resumida, LETRAS GRANDES, NO prices.
 *                        Only what the kitchen needs to produce + route the order.
 *   variant="cashier"  — "nota do caixa": completa, com cabeçalho fiscal, valores,
 *                        totais e forma de pagamento.
 *
 * A single print run emits one of each (see the print pages), so the kitchen gets
 * its comanda and the caixa gets the full nota.
 */

// ── Formatting ────────────────────────────────────────────────────────────────

/** Money without the "R$" prefix, comma decimals — matches the reference notinhas. */
function money(value: unknown): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** "24/jun - 19:32" in the restaurant's timezone. */
function fmtReceiptDate(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
    const month = get("month").replace(".", "").toLowerCase();
    return `${get("day")}/${month} - ${get("hour")}:${get("minute")}`;
  } catch {
    return date.toLocaleString("pt-BR");
  }
}

/** "às 19:13" for the scheduled/estimated delivery time. */
function fmtTime(date: Date, tz: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: tz,
    }).format(date);
  } catch {
    return "";
  }
}

// Addon parsing lives in @/lib/ticket-addons (parseTicketAddons) — shared with the
// ESC/POS renderer and unit-tested for the { options, extras } checkout shape.

// ── Label maps ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  DELIVERY: "ENTREGA",
  PICKUP:   "RETIRADA",
  DINE_IN:  "MESA",
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH:          "Dinheiro",
  CREDIT_CARD:   "Cartão de Crédito",
  DEBIT_CARD:    "Cartão de Débito",
  PIX:           "Pix",
  ONLINE:        "Pago Online",
  CARD_MACHINE:  "Maquininha",
  PIX_IN_PERSON: "Pix na Entrega",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface OrderTicketOrder {
  id:           string;
  orderNumber?: number | null;
  type:         string;
  subtotal:     unknown;
  deliveryFee:  unknown;
  discount:     unknown;
  total:        unknown;
  notes:        string | null;
  createdAt:    Date;
  estimatedAt?: Date | null;
  source?:      string | null;
  customer: {
    name:  string;
    phone: string | null;
  };
  deliveryAddress: {
    street:       string;
    number:       string;
    complement:   string | null;
    neighborhood: string;
    city:         string;
    state:        string;
    zipCode:      string;
  } | null;
  items: Array<{
    name:        string;
    price:       unknown;
    quantity:    number;
    notes:       string | null;
    variantName?: string | null;
    addonsJson:  unknown;
  }>;
  payment: {
    method: string;
    amount: unknown;
    status?: string | null;
  } | null;
}

/** Fiscal/contact header for the cashier nota. */
export interface StoreInfo {
  cnpj?:     string | null;
  /** Address / contact lines shown under the restaurant name. */
  lines?:    string[];
  timezone?: string;
}

type Variant = "kitchen" | "cashier";

interface Props {
  order:          OrderTicketOrder;
  restaurantName: string;
  variant:        Variant;
  store?:         StoreInfo;
  /**
   * "print"   — raw ticket; visibility/placement controlled by the print page.
   * "preview" — visible on screen inside a receipt card.
   */
  mode?: "print" | "preview";
}

// ── Shared style constants ────────────────────────────────────────────────────

const BLACK   = "#000";
const DIM     = "#333";
const DIVIDER = "#000";

const BASE: React.CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
  color:      BLACK,
};

function Divider({ dashed }: { dashed?: boolean }) {
  return (
    <div
      style={{
        borderTop: `1px ${dashed ? "dashed" : "solid"} ${DIVIDER}`,
        margin:    "6px 0",
      }}
    />
  );
}

// ── Item observations (addons + item note) ────────────────────────────────────

function ItemObs({ variant, addons, note, showPrices }: { variant?: string | null; addons: ParsedAddon[]; note: string | null; showPrices: boolean }) {
  if (!variant && addons.length === 0 && !note) return null;
  return (
    <div style={{ paddingLeft: "14px", marginTop: "2px" }}>
      {variant && <div style={{ fontWeight: 700 }}>» {variant}</div>}
      {addons.map((a, i) => (
        <div
          key={i}
          style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}
        >
          <span>» {a.name}</span>
          {showPrices && a.price != null && <span>{money(a.price)}</span>}
        </div>
      ))}
      {note && <div>» {note}</div>}
    </div>
  );
}

// ── Kitchen ticket (resumido, letras grandes, sem preços) ─────────────────────

function KitchenContent({
  order,
  restaurantName,
  tz,
}: {
  order: OrderTicketOrder;
  restaurantName: string;
  tz: string;
}) {
  const totalQty = order.items.reduce((s, it) => s + it.quantity, 0);
  const bairro =
    order.type === "DELIVERY" && order.deliveryAddress
      ? order.deliveryAddress.neighborhood
      : null;

  return (
    <div style={{ fontSize: "16px", lineHeight: 1.45 }}>
      {/* Order type — big and centered */}
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "22px", fontWeight: 800, letterSpacing: "2px" }}>
          {TYPE_LABELS[order.type] ?? order.type}
        </div>
        <div style={{ fontSize: "14px" }}>{fmtReceiptDate(order.createdAt, tz)}</div>
      </div>

      <Divider />

      {/* Order number + who */}
      <div style={{ fontSize: "26px", fontWeight: 800 }}>
        Pedido: {formatOrderNumber(order.orderNumber, order.id)}
      </div>
      <div style={{ fontSize: "20px", fontWeight: 700 }}>{order.customer.name}</div>
      {bairro && <div style={{ fontSize: "17px" }}>Bairro: {bairro}</div>}

      <Divider />

      <div style={{ fontWeight: 700, marginBottom: "2px" }}>Qt.Descrição</div>

      <Divider dashed />

      {/* Items — quantity prominent, NO prices */}
      {order.items.map((item, i) => {
        const addons = parseTicketAddons(item.addonsJson);
        return (
          <div
            key={i}
            style={{ marginBottom: "8px", pageBreakInside: "avoid", breakInside: "avoid" }}
          >
            <div style={{ fontSize: "19px", fontWeight: 700 }}>
              <span style={{ fontSize: "22px" }}>{item.quantity}</span>{"  "}
              {item.name}
            </div>
            <ItemObs variant={item.variantName} addons={addons} note={item.notes} showPrices={false} />
          </div>
        );
      })}

      <Divider />

      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: "17px" }}>
        <span>Quantidade de itens:</span>
        <span>{totalQty}</span>
      </div>

      {/* Order-level note — the kitchen must not miss this */}
      {order.notes && (
        <>
          <Divider dashed />
          <div style={{ fontSize: "17px", fontWeight: 700 }}>
            ** {order.notes} **
          </div>
        </>
      )}

      <Divider />

      <div style={{ textAlign: "center", fontSize: "16px", fontWeight: 700, letterSpacing: "1px" }}>
        {restaurantName.toUpperCase()}
      </div>
    </div>
  );
}

// ── Cashier nota (completa, com valores) ──────────────────────────────────────

function CashierContent({
  order,
  restaurantName,
  store,
  tz,
}: {
  order: OrderTicketOrder;
  restaurantName: string;
  store?: StoreInfo;
  tz: string;
}) {
  const phone =
    !order.customer.phone || isGuestIdentifier(order.customer.phone)
      ? null
      : order.customer.phone;

  const totalQty       = order.items.reduce((s, it) => s + it.quantity, 0);
  const deliveryFeeAmt = Number(order.deliveryFee || 0);
  const discountAmt    = Number(order.discount || 0);
  const a              = order.type === "DELIVERY" ? order.deliveryAddress : null;

  const paymentLabel = order.payment
    ? PAYMENT_LABELS[order.payment.method] ?? order.payment.method
    : null;
  const isPaid =
    !!order.payment &&
    (order.payment.status === "PAID" ||
      order.payment.method === "ONLINE" ||
      order.payment.method === "PIX");

  return (
    <div style={{ fontSize: "13px", lineHeight: 1.4 }}>
      {/* Fiscal header */}
      <div>
        <div style={{ fontSize: "16px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {restaurantName}
        </div>
        {store?.cnpj && <div>CNPJ: {store.cnpj}</div>}
        {(store?.lines ?? []).map((l, i) => (
          <div key={i}>{l}</div>
        ))}
      </div>

      <Divider />

      {/* Type + date */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: "15px", fontWeight: 800, letterSpacing: "1px" }}>
          {TYPE_LABELS[order.type] ?? order.type}
        </span>
        <span>{fmtReceiptDate(order.createdAt, tz)}</span>
      </div>

      <div style={{ fontSize: "15px", fontWeight: 800, marginTop: "3px" }}>
        Pedido: {formatOrderNumber(order.orderNumber, order.id)}
      </div>
      <div style={{ fontWeight: 700 }}>{order.customer.name}</div>
      {phone && <div>Telefone: {phone}</div>}

      {/* Delivery address */}
      {a && (
        <div style={{ marginTop: "4px" }}>
          <div>
            {a.street}, {a.number}
            {a.complement ? `, ${a.complement}` : ""}
          </div>
          <div>
            {a.city} - {a.neighborhood}
          </div>
          {a.zipCode && <div>CEP: {a.zipCode}</div>}
        </div>
      )}

      {/* Obs block */}
      {(isPaid || order.estimatedAt || order.notes) && (
        <>
          <Divider />
          {isPaid && <div>Obs: {paymentLabel}</div>}
          {order.estimatedAt && <div>Entrega para às: {fmtTime(order.estimatedAt, tz)}</div>}
          {order.notes && <div>** {order.notes} **</div>}
        </>
      )}

      <Divider />

      {/* Items with value column */}
      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>Qt.Descrição</span>
        <span>Valor</span>
      </div>
      <Divider dashed />

      {order.items.map((item, i) => {
        const addons   = parseTicketAddons(item.addonsJson);
        const lineTotal = Number(item.price) * item.quantity;
        return (
          <div
            key={i}
            style={{ marginBottom: "5px", pageBreakInside: "avoid", breakInside: "avoid" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "6px" }}>
              <span style={{ flex: 1 }}>
                <strong>{item.quantity}</strong> {item.name}
              </span>
              <span style={{ whiteSpace: "nowrap" }}>{money(lineTotal)}</span>
            </div>
            <ItemObs variant={item.variantName} addons={addons} note={item.notes} showPrices />
          </div>
        );
      })}

      <Divider />

      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
        <span>Quantidade de itens:</span>
        <span>{totalQty}</span>
      </div>

      {/* Totals breakdown */}
      <div style={{ marginTop: "6px" }}>
        <TotalRow label="Total itens(=)" value={money(order.subtotal)} />
        <TotalRow label="Taxa de entrega(+)" value={money(deliveryFeeAmt)} />
        <TotalRow label="Acréscimo(+)" value={money(0)} />
        <TotalRow label="Desconto(-)" value={money(discountAmt)} />
      </div>

      {/* TOTAL — inverted bar, like the reference */}
      <div
        style={{
          display:        "flex",
          justifyContent: "space-between",
          background:     BLACK,
          color:          "#fff",
          fontWeight:     800,
          fontSize:       "15px",
          padding:        "3px 6px",
          marginTop:      "4px",
        }}
      >
        <span>TOTAL(=)</span>
        <span>{money(order.total)}</span>
      </div>

      {/* Payment */}
      {order.payment && (
        <div style={{ marginTop: "8px" }}>
          <div style={{ fontWeight: 700 }}>Forma de pagamento</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{paymentLabel}</span>
            <span>{money(order.payment.amount)}</span>
          </div>
        </div>
      )}

      <Divider />

      <div style={{ textAlign: "center", fontSize: "13px", fontWeight: 700, letterSpacing: "1px" }}>
        {restaurantName.toUpperCase()}
      </div>
      <div style={{ textAlign: "center", fontSize: "11px", color: DIM, marginTop: "2px" }}>
        Foocci
      </div>
    </div>
  );
}

function TotalRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between" }}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrderTicket({ order, restaurantName, variant, store, mode = "print" }: Props) {
  const tz = store?.timezone || "America/Sao_Paulo";

  const receiptStyle: React.CSSProperties = {
    ...BASE,
    width:      "72mm",
    padding:    "4mm",
    background: "#fff",
  };

  const content =
    variant === "kitchen" ? (
      <KitchenContent order={order} restaurantName={restaurantName} tz={tz} />
    ) : (
      <CashierContent order={order} restaurantName={restaurantName} store={store} tz={tz} />
    );

  const ticketEl = (
    <div className="foocci-ticket" style={receiptStyle}>
      {content}
    </div>
  );

  if (mode === "preview") {
    return (
      <div className="foocci-ticket-block" style={{ display: "flex", justifyContent: "center" }}>
        <div
          style={{
            boxShadow:    "0 2px 20px rgba(0,0,0,0.12)",
            borderRadius: "4px",
            overflow:     "hidden",
          }}
        >
          {ticketEl}
        </div>
      </div>
    );
  }

  return <div className="foocci-ticket-block">{ticketEl}</div>;
}
