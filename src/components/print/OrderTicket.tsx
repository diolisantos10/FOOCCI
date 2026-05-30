import { isGuestIdentifier } from "@/lib/guest";
import { formatOrderNumber } from "@/lib/order-number";

// ── Money ─────────────────────────────────────────────────────────────────────

function brl(value: unknown): string {
  return `R$ ${Number(value).toFixed(2).replace(".", ",")}`;
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
  orderNumber?: number | null;
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
   * "preview" — visible on screen, centered receipt card.
   */
  mode?: "hidden" | "preview";
}

// ── Shared style constants ────────────────────────────────────────────────────

const BLACK   = "#000";
const DARK    = "#111";
const DIM     = "#444";
const DIVIDER = "#666";

const BASE: React.CSSProperties = {
  fontFamily: "'Courier New', Courier, monospace",
  fontSize:   "15px",
  lineHeight: "1.5",
  color:      BLACK,
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Divider({ dashed }: { dashed?: boolean }) {
  return (
    <div
      style={{
        borderTop: `1px ${dashed ? "dashed" : "solid"} ${DIVIDER}`,
        margin:    "7px 0",
      }}
    />
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontWeight:    "bold",
        fontSize:      "16px",
        letterSpacing: "0.5px",
        color:         BLACK,
        marginBottom:  "5px",
      }}
    >
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  large,
}: {
  label: string;
  value: React.ReactNode;
  large?: boolean;
}) {
  return (
    <div
      style={{
        display:        "flex",
        justifyContent: "space-between",
        gap:            "6px",
        marginBottom:   "3px",
        fontSize:       large ? "17px" : "15px",
        fontWeight:     large ? "bold" : undefined,
        color:          BLACK,
      }}
    >
      <span style={{ color: large ? BLACK : DIM }}>{label}</span>
      <span style={{ textAlign: "right" }}>{value}</span>
    </div>
  );
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
      {/* Restaurant header */}
      <div style={{ textAlign: "center", marginBottom: "8px" }}>
        <div
          style={{
            fontWeight:    "bold",
            fontSize:      "17px",
            textTransform: "uppercase",
            letterSpacing: "1px",
            color:         BLACK,
          }}
        >
          {restaurantName}
        </div>
        <div style={{ fontSize: "14px", color: DARK, marginTop: "2px" }}>
          {TYPE_LABELS[order.type] ?? order.type}
        </div>
      </div>

      <Divider />

      {/* Order number — very prominent */}
      <div style={{ textAlign: "center", margin: "8px 0" }}>
        <div
          style={{
            fontSize:      "28px",
            fontWeight:    "bold",
            letterSpacing: "2px",
            color:         BLACK,
            lineHeight:    "1.1",
          }}
        >
          {formatOrderNumber(order.orderNumber, order.id)}
        </div>
        <div style={{ fontSize: "13px", color: DARK, marginTop: "3px" }}>
          {fmtDate(order.createdAt)}
        </div>
      </div>

      <Divider />

      {/* Customer */}
      <div style={{ marginBottom: "4px" }}>
        <div style={{ fontSize: "19px", fontWeight: "bold", color: BLACK }}>
          {order.customer.name}
        </div>
        {phone && (
          <div style={{ fontSize: "15px", color: DARK }}>Tel: {phone}</div>
        )}
      </div>

      {/* Delivery address */}
      {order.type === "DELIVERY" && order.deliveryAddress && (() => {
        const a = order.deliveryAddress!;
        return (
          <>
            <Divider dashed />
            <SectionTitle>ENDEREÇO DE ENTREGA</SectionTitle>
            <div style={{ fontSize: "15px", lineHeight: "1.5", color: BLACK }}>
              <div>{a.street}, {a.number}{a.complement ? ` — ${a.complement}` : ""}</div>
              <div>{a.neighborhood}</div>
              <div>{a.city}/{a.state}</div>
              <div>CEP: {a.zipCode}</div>
            </div>
          </>
        );
      })()}

      <Divider />

      {/* Items */}
      <SectionTitle>ITENS</SectionTitle>
      {order.items.map((item, i) => {
        const addons = parseAddons(item.addonsJson);
        return (
          <div
            key={i}
            style={{ marginBottom: "9px", pageBreakInside: "avoid", breakInside: "avoid" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "4px" }}>
              <span style={{ flex: 1 }}>
                <strong style={{ fontSize: "21px", color: BLACK }}>{item.quantity}×</strong>
                {" "}
                <span style={{ fontSize: "17px", color: BLACK }}>{item.name}</span>
              </span>
              <span style={{ whiteSpace: "nowrap", fontSize: "15px", color: BLACK }}>
                {brl(Number(item.price) * item.quantity)}
              </span>
            </div>
            {item.notes && (
              <div style={{ paddingLeft: "16px", fontSize: "14px", color: DARK, marginTop: "2px" }}>
                ↳ {item.notes}
              </div>
            )}
            {addons.length > 0 && (
              <div style={{ paddingLeft: "16px" }}>
                {addons.map((a, ai) => (
                  <div
                    key={ai}
                    style={{
                      display:        "flex",
                      justifyContent: "space-between",
                      fontSize:       "14px",
                      color:          DARK,
                      marginTop:      "2px",
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
          fontSize:        "22px",
          color:           BLACK,
          marginTop:       "6px",
          paddingTop:      "6px",
          borderTop:       `2px solid ${BLACK}`,
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
        large
      />

      {/* Order notes */}
      {order.notes && (
        <>
          <Divider dashed />
          <SectionTitle>OBSERVAÇÕES</SectionTitle>
          <div style={{ fontSize: "15px", color: BLACK, lineHeight: "1.4" }}>
            {order.notes}
          </div>
        </>
      )}

      <Divider />

      <div style={{ textAlign: "center", fontSize: "13px", color: DIM }}>
        Foocci · {fmtDate(new Date())}
      </div>
    </>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

export function OrderTicket({ order, restaurantName, mode = "hidden" }: Props) {
  const receiptStyle: React.CSSProperties = {
    ...BASE,
    width:      "72mm",
    padding:    "5mm",
    background: "#fff",
  };

  const ticketEl = (
    <div id="foocci-print-ticket" style={receiptStyle}>
      <ReceiptContent order={order} restaurantName={restaurantName} />
    </div>
  );

  if (mode === "preview") {
    return (
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

  return <div className="hidden">{ticketEl}</div>;
}
