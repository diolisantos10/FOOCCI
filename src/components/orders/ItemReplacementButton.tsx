"use client";

import { useState } from "react";
import { ItemReplacementModal } from "./ItemReplacementModal";

interface OrderItemProps {
  id:          string;
  name:        string;
  quantity:    number;
  price:       number;
  total:       number;
  variantName: string | null;
  notes:       string | null;
}

interface Props {
  orderId:      string;
  orderTotal:   number;
  orderStatus:  string;
  item:         OrderItemProps;
  canEdit:      boolean; // OWNER or MANAGER
}

// Statuses that are editable without extra warning
const EDITABLE_STATUSES = new Set(["PENDING", "AWAITING_PAYMENT", "CONFIRMED", "PREPARING"]);

export function ItemReplacementButton({ orderId, orderTotal, orderStatus, item, canEdit }: Props) {
  const [open, setOpen]             = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!canEdit) return null;

  // DELIVERED and CANCELLED are never editable from UI
  if (orderStatus === "DELIVERED" || orderStatus === "CANCELLED") return null;

  const isLateStage = !EDITABLE_STATUSES.has(orderStatus);

  function handleSuccess(priceDiff: number, newTotal: number) {
    setOpen(false);
    const diffText =
      priceDiff > 0
        ? `Diferença a cobrar: R$ ${priceDiff.toFixed(2)}`
        : priceDiff < 0
        ? `Diferença a devolver/absorver: R$ ${Math.abs(priceDiff).toFixed(2)}`
        : "Sem diferença de valor";
    setSuccessMsg(`Pedido alterado. Total: R$ ${newTotal.toFixed(2)}. ${diffText}`);
    // Reload the page after a short delay so the server component refreshes
    setTimeout(() => window.location.reload(), 1800);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={isLateStage ? "Trocar item (pedido em fase avançada)" : "Trocar item"}
        className={`ml-2 rounded-lg border px-2 py-0.5 text-xs transition ${
          isLateStage
            ? "border-orange-200 text-orange-600 hover:bg-orange-50"
            : "border-gray-200 text-gray-500 hover:bg-gray-50"
        }`}
      >
        Trocar
      </button>

      {successMsg && (
        <span className="ml-2 text-xs font-medium text-green-600">{successMsg}</span>
      )}

      {open && (
        <ItemReplacementModal
          orderId={orderId}
          orderTotal={orderTotal}
          currentItem={item}
          onClose={() => setOpen(false)}
          onSuccess={handleSuccess}
        />
      )}
    </>
  );
}
