import { isGuestIdentifier } from "@/lib/guest";

// ── Money ─────────────────────────────────────────────────────────────────────

function brl(value: unknown): string {
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
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
// addonsJson has no guaranteed shape. Parse defensively — never throw, never
// show raw JSON to the user.

interface ParsedAddon {
  name:   string;
  price?: number;
}

function parseAddons(raw: unknown): ParsedAddon[] {
  if (raw == null) return [];
  try {
    const arr: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!Array.isArray(arr)) return [];
    const result: ParsedAddon[] = [];
    for (const entry of arr) {
      if (typeof entry !== "object" || entry === null) continue;
      const e = entry as Record<string, unknown>;
      // Accept any reasonable name field from known Saipos / generic shapes
      const rawName =
        e.name ?? e.label ?? e.desc_item_choice ??
        e.description ?? e.desc ?? e.title;
      if (typeof rawName !== "string" || !rawName.trim()) continue;
      const rawPrice =
        e.price ?? e.unitPrice ?? e.unit_price ??
        e.aditional_price ?? e.additionalPrice ?? e.additional_price;
      const price = rawPrice != null ? Number(rawPrice) : undefined;
      result.push({
        name:  rawName.trim(),
        price: price != null && !isNaN(price) && price !== 0 ? price : undefined,
      });
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
  CASH:          "Dinheiro",
  CREDIT_CARD:   "Cartão de Crédito",
  DEBIT_CARD:    "Cartão de Débito",
  PIX:           "Pix",
  ONLINE:        "Online",
  CARD_MACHINE:  "Maquininha",
  PIX_IN_PERSON: "Pix na Entrega",
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
  /**
   * "hidden"  — invisible on screen, rendered for @media print only.
   *             Used on the order detail page alongside the full admin UI.
   * "preview" — visible on screen, centered receipt card.
   *             Used on the /imprimir preview page.
   */
  mode?: "hidden" | "preview";
}

// ── Receipt content ───────────────────────────────────────────────────────────

function ReceiptContent({
  order,
  restaurantName,
}: {
  order:          OrderTicketOrder;
  restaurantName: string;
}) {
  const phone =
    !order.customer.phone || isGuestIdentifier(order.customer.phone)
      ? null
      : order.customer.phone;

  const discountAmt    = Number(order.discount);
  const deliveryFeeAmt = Number(order.deliveryFee);

  return (
    <>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div style={{ fontWeight: "bold", fontSize: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
          {restaurantName}
        </div>
        <div style={{ fontSize: "13px", marginTop: "3px", color: "#000" }}>
          {TYPE_LABELS[order.type] ?? order.type}
        </div>
      </div>

      <Divider />

      {/* Order ID + date */}
      <Row label="Pedido" value={displayId(order.id)} bold />
      <Row label="Data"   value={fmtDate(order.createdAt)} />

      <Divider />

      {/* Customer */}
      <Row label="Cliente" value={order.customer.name} />
      {phone && <Row label="Tel" value={phone} />}

      {/* Delivery address */}
      {order.type === "DELIVERY" && order.deliveryAddress && (() => {
        const a = order.deliveryAddress!;
        return (
          <>
            <Divider dashed />
            <div style={{ fontWeight: "bold", marginBottom: "3px", fontSize: "13px" }}>
              ENDEREÇO DE ENTREGA
            </div>
            <div style={{ fontSize: "13px", lineHeight: "1.5", paddingLeft: "2px" }}>
              <div>{a.street}, {a.number}{a.complement ? ` — ${a.complement}` : ""}</div>
              <div>{a.neighborhood}</div>
              <div>{a.city}/{a.state}</div>
              <div style={{ color: "#000" }}>CEP: {a.zipCode}</div>
            </div>
          </>
        );
      })()}

      <Divider />

      {/* Items */}
      <div style={{ fontWeight: "bold", marginBottom: "5px", fontSize: "13px" }}>
        ITENS
      </div>
      {order.items.map((item, i) => {
        const addons = parseAddons(item.addonsJson);
        return (
          <div
            key={i}
            style={{
              marginBottom:    "7px",
              pageBreakInside: "avoid",
              breakInside:     "avoid",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
              <span style={{ flex: 1 }}>
                <strong>{item.quantity}×</strong> {item.name}
              </span>
              <span style={{ whiteSpace: "nowrap" }}>
                {brl(Number(item.price) * item.quantity)}
              </span>
            </div>
            {item.notes && (
              <div style={{ paddingLeft: "14px", fontSize: "13px", color: "#000", marginTop: "1px" }}>
                ↳ {item.notes}
              </div>
            )}
            {addons.length > 0 && (
              <div style={{ paddingLeft: "14px" }}>
                {addons.map((a, ai) => (
                  <div
                    key={ai}
                    style={{
                      display:        "flex",
                      justifyContent: "space-between",
                      fontSize:       "13px",
                      color:          "#000",
                      marginTop:      "1px",
                    }}
                  >
                    <span>+ {a.name}</span>
                    {a.price != null && <span>{brl(a.price)}</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      <Divider />

      {/* Totals */}
      <Row label="Subtotal" value={brl(order.subtotal)} />
      {deliveryFeeAmt > 0 && (
        <Row label="Entrega" value={brl(order.deliveryFee)} />
      )}
      {discountAmt > 0 && (
        <Row label="Desconto" value={`– ${brl(order.discount)}`} />
      )}
      <div
        style={{
          display:         "flex",
          justifyContent:  "space-between",
          fontWeight:      "bold",
          fontSize:        "15px",
          marginTop:       "5px",
          paddingTop:      "5px",
          borderTop:       "1px solid #000",
          pageBreakInside: "avoid",
          breakInside:     "avoid",
        }}
      >
        <span>TOTAL</span>
        <span>{brl(order.total)}</span>
      </div>

      <Divider />

      {/* Payment */}
      <Row
        label="Pagamento"
        value={order.payment
          ? (PAYMENT_LABELS[order.payment.method] ?? order.payment.method)
          : "—"}
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

      <div style={{ textAlign: "center", fontSize: "12px", color: "#444" }}>
        Foocci · {fmtDate(new Date())}
      </div>
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrderTicket({ order, restaurantName, mode = "hidden" }: Props) {
  const receiptStyle: React.CSSProperties = {
    fontFamily:  "'Courier New', Courier, monospace",
    fontSize:    "14px",
    lineHeight:  "1.6",
    width:       "72mm",
    padding:     "5mm",
    color:       "#000",
    background:  "#fff",
  };

  const ticketEl = (
    <div id="foocci-print-ticket" style={receiptStyle}>
      <ReceiptContent order={order} restaurantName={restaurantName} />
    </div>
  );

  if (mode === "preview") {
    return (
      // Screen: center the receipt card. Print: ignored — ticket is position:fixed.
      <div style={{ display: "flex", justifyContent: "center" }}>
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

  // hidden: not displayed on screen; revealed by @media print via page-level CSS
  return <div className="hidden">{ticketEl}</div>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      style={{
        display:         "flex",
        justifyContent:  "space-between",
        gap:             "4px",
        marginBottom:    "2px",
        fontWeight:      bold ? "bold" : undefined,
      }}
    >
      <span style={{ color: "#000" }}>{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Divider({ dashed }: { dashed?: boolean }) {
  return (
    <div
      style={{
        borderTop: `1px ${dashed ? "dashed" : "solid"} #666`,
        margin:    "6px 0",
      }}
    />
  );
}
