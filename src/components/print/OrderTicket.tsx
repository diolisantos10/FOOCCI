import { isGuestIdentifier } from "@/lib/guest";

// ── Money helpers ─────────────────────────────────────────────────────────────

function brl(value: unknown): string {
  const n = Number(value);
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function displayId(orderId: string): string {
  return `#${orderId.slice(-6).toUpperCase()}`;
}

function fmtDate(date: Date): string {
  return date.toLocaleString("pt-BR", {
    day:    "2-digit",
    month:  "2-digit",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
  });
}

// ── Addon parsing ─────────────────────────────────────────────────────────────
// addonsJson has no guaranteed shape — parse defensively and never throw.

interface ParsedAddon {
  name:   string;
  price?: number;
}

function parseAddons(raw: unknown): ParsedAddon[] {
  if (raw == null) return [];
  try {
    const arr = typeof raw === "string" ? (JSON.parse(raw) as unknown) : raw;
    if (!Array.isArray(arr)) return [];
    const result: ParsedAddon[] = [];
    for (const entry of arr) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Record<string, unknown>;
      const name =
        e.name ?? e.label ?? e.desc_item_choice ?? e.description ?? e.desc;
      if (typeof name !== "string" || !name) continue;
      const rawPrice =
        e.price ?? e.unitPrice ?? e.unit_price ??
        e.aditional_price ?? e.additionalPrice;
      const price = rawPrice != null ? Number(rawPrice) : undefined;
      result.push({ name, price: price != null && !isNaN(price) ? price : undefined });
    }
    return result;
  } catch {
    return [];
  }
}

// ── Label maps ────────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  DELIVERY: "DELIVERY",
  PICKUP:   "RETIRADA",
  DINE_IN:  "MESA",
};

const PAYMENT_LABELS: Record<string, string> = {
  CASH:           "Dinheiro",
  CREDIT_CARD:    "Cartão de Crédito",
  DEBIT_CARD:     "Cartão de Débito",
  PIX:            "Pix",
  ONLINE:         "Online",
  CARD_MACHINE:   "Maquininha",
  PIX_IN_PERSON:  "Pix na Entrega",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface OrderTicketOrder {
  id:          string;
  type:        string;
  subtotal:    unknown;
  deliveryFee: unknown;
  discount:    unknown;
  total:       unknown;
  notes:       string | null;
  createdAt:   Date;
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
    name:       string;
    price:      unknown;
    quantity:   number;
    notes:      string | null;
    addonsJson: unknown;
  }>;
  payment: {
    method: string;
    amount: unknown;
  } | null;
}

interface Props {
  order:          OrderTicketOrder;
  restaurantName: string;
}

// ── Component ─────────────────────────────────────────────────────────────────
// Hidden on screen. Visible only inside @media print via the page-level style tag.

export function OrderTicket({ order, restaurantName }: Props) {
  const phone =
    !order.customer.phone || isGuestIdentifier(order.customer.phone)
      ? null
      : order.customer.phone;

  const discountCents = Number(order.discount);
  const deliveryFeeCents = Number(order.deliveryFee);

  return (
    <div id="foocci-print-ticket" className="hidden">
      <div
        style={{
          fontFamily:  "monospace, monospace",
          fontSize:    "12px",
          lineHeight:  "1.5",
          width:       "72mm",
          padding:     "4mm",
          color:       "#000",
          background:  "#fff",
        }}
      >
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "8px" }}>
          <div style={{ fontWeight: "bold", fontSize: "14px", textTransform: "uppercase" }}>
            {restaurantName}
          </div>
          <div style={{ fontSize: "11px", marginTop: "2px" }}>
            {TYPE_LABELS[order.type] ?? order.type}
          </div>
        </div>

        <Divider />

        {/* Order ID + date */}
        <Row label="Pedido" value={displayId(order.id)} />
        <Row label="Data"   value={fmtDate(order.createdAt)} />

        <Divider />

        {/* Customer */}
        <Row label="Cliente" value={order.customer.name} />
        {phone && <Row label="Tel" value={phone} />}

        {/* Delivery address */}
        {order.type === "DELIVERY" && order.deliveryAddress && (
          <>
            <Divider dashed />
            <div style={{ marginBottom: "4px" }}>
              <span style={{ fontWeight: "bold" }}>Endereço:</span>
            </div>
            <div style={{ paddingLeft: "4px" }}>
              <div>
                {order.deliveryAddress.street}, {order.deliveryAddress.number}
                {order.deliveryAddress.complement
                  ? ` — ${order.deliveryAddress.complement}`
                  : ""}
              </div>
              <div>{order.deliveryAddress.neighborhood}</div>
              <div>
                {order.deliveryAddress.city}/{order.deliveryAddress.state}
              </div>
              <div>CEP: {order.deliveryAddress.zipCode}</div>
            </div>
          </>
        )}

        <Divider />

        {/* Items */}
        <div style={{ fontWeight: "bold", marginBottom: "4px" }}>ITENS</div>
        {order.items.map((item, i) => {
          const addons = parseAddons(item.addonsJson);
          return (
            <div key={i} style={{ marginBottom: "6px" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>
                  {item.quantity}× {item.name}
                </span>
                <span>{brl(Number(item.price) * item.quantity)}</span>
              </div>
              {item.notes && (
                <div style={{ paddingLeft: "12px", fontSize: "11px", color: "#444" }}>
                  obs: {item.notes}
                </div>
              )}
              {addons.map((a, ai) => (
                <div
                  key={ai}
                  style={{
                    paddingLeft: "12px",
                    fontSize:    "11px",
                    display:     "flex",
                    justifyContent: "space-between",
                  }}
                >
                  <span>+ {a.name}</span>
                  {a.price != null && <span>{brl(a.price)}</span>}
                </div>
              ))}
            </div>
          );
        })}

        <Divider />

        {/* Totals */}
        <Row label="Subtotal" value={brl(order.subtotal)} />
        {deliveryFeeCents > 0 && (
          <Row label="Entrega" value={brl(order.deliveryFee)} />
        )}
        {discountCents > 0 && (
          <Row label="Desconto" value={`– ${brl(order.discount)}`} />
        )}
        <div
          style={{
            display:       "flex",
            justifyContent: "space-between",
            fontWeight:    "bold",
            fontSize:      "13px",
            marginTop:     "4px",
            paddingTop:    "4px",
            borderTop:     "1px solid #000",
          }}
        >
          <span>TOTAL</span>
          <span>{brl(order.total)}</span>
        </div>

        <Divider />

        {/* Payment */}
        <Row
          label="Pagamento"
          value={
            order.payment
              ? (PAYMENT_LABELS[order.payment.method] ?? order.payment.method)
              : "—"
          }
        />

        {/* Order notes */}
        {order.notes && (
          <>
            <Divider dashed />
            <div style={{ fontSize: "11px" }}>
              <span style={{ fontWeight: "bold" }}>Obs: </span>
              {order.notes}
            </div>
          </>
        )}

        <Divider />

        <div style={{ textAlign: "center", fontSize: "10px", color: "#666" }}>
          Foocci — {fmtDate(new Date())}
        </div>
      </div>
    </div>
  );
}

// ── Small layout helpers ──────────────────────────────────────────────────────

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display:        "flex",
        justifyContent: "space-between",
        marginBottom:   "2px",
      }}
    >
      <span style={{ color: "#555" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Divider({ dashed }: { dashed?: boolean }) {
  return (
    <div
      style={{
        borderTop:    `1px ${dashed ? "dashed" : "solid"} #ccc`,
        margin:       "6px 0",
      }}
    />
  );
}
