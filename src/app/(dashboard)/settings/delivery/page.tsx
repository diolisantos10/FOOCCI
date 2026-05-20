"use client";

import { useState, useEffect, type FormEvent } from "react";
import {
  apiFetch,
  Field,
  INPUT,
  Feedback,
  SaveButton,
  Toggle,
  PageCard,
  SectionHeading,
} from "../_shared";
import { calcDeliveryFee } from "@/lib/delivery";

// ── Types ──────────────────────────────────────────────────────────────────────

interface DeliveryZone {
  id: string;
  name: string;
  sortOrder: number;
  maxDistanceKm: number;
  fee: string | number;
  estimatedMinutes: number;
  minOrderValue: string | number | null;
  isActive: boolean;
  peakFee: string | number | null;
}

interface DeliveryFormState {
  enabled: boolean;
  pickupEnabled: boolean;
  mode: "simple" | "advanced" | "distance" | "manual";
  fee: string;
  estimatedMinutes: string;
  areaDescription: string;
  minOrderValue: string;
  freeDeliveryAbove: string;
  peakHoursEnabled: boolean;
  // Phase 5 placeholders
  geoCenter: string;
  geoRadiusKm: string;
  // Distance mode fields
  distanceBaseFee: string;
  distancePricePerKm: string;
  distanceMaxKm: string;
  distanceMinFee: string;
  distanceMinFeeKm: string;
  distanceMaxFee: string;
  distanceEstimatedBase: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function toNum(v: string): number | null {
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function fmtCurrency(v: string | number | null): string {
  if (v == null || v === "") return "";
  return String(Number(v));
}

// Thin adapter so call-sites keep the same signature (baseFee + minFee + minFeeKm).
// Delegates entirely to the shared calcDeliveryFee utility so both the settings
// preview and the order finalize path use the exact same formula.
function calcDistanceFee(
  km:       number,
  baseFee:  number,
  perKm:    number,
  minFee:   number | null,
  minFeeKm: number | null,
  maxFee:   number | null,
): number {
  const effectiveMin  = (minFee != null && minFee > 0) ? minFee : baseFee;
  const effectiveIncl = (minFeeKm != null && minFeeKm >= 0) ? minFeeKm : 0;
  return calcDeliveryFee(km, effectiveMin, perKm, effectiveIncl, maxFee);
}

// ── Zone-bar color palettes ───────────────────────────────────────────────────

const ZONE_BAR_COLORS = [
  "bg-indigo-400",
  "bg-violet-500",
  "bg-purple-500",
  "bg-fuchsia-500",
  "bg-pink-400",
];

const ZONE_BG_COLORS = [
  "bg-indigo-50",
  "bg-violet-50",
  "bg-purple-50",
  "bg-fuchsia-50",
  "bg-pink-50",
];

// ── CoverageOverview ──────────────────────────────────────────────────────────
//  Visual summary of active delivery coverage.
//  Simple mode: single full-width bar.
//  Advanced mode: proportional bars per zone sorted by distance.

function CoverageOverview({
  mode,
  form,
  zones,
}: {
  mode: "simple" | "advanced" | "distance" | "manual";
  form: DeliveryFormState;
  zones: DeliveryZone[];
}) {
  const freeAbove = toNum(form.freeDeliveryAbove);

  if (mode === "simple") {
    const fee = toNum(form.fee);
    const min = toNum(form.minOrderValue);
    const minutes = form.estimatedMinutes ? parseInt(form.estimatedMinutes, 10) : null;

    return (
      <PageCard>
        <SectionHeading
          title="Visão da cobertura"
          subtitle="Como o cliente verá sua entrega."
        />
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-indigo-900">Toda a área de entrega</span>
            <span className="text-sm font-bold text-indigo-700">
              {fee == null || fee === 0
                ? <span className="text-green-600">Grátis</span>
                : `R$ ${fee.toFixed(2).replace(".", ",")}`}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100">
            <div className="h-2 w-full rounded-full bg-indigo-400" />
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {minutes != null && minutes > 0 && (
              <Chip color="indigo">⏱ ~{minutes} min</Chip>
            )}
            {min != null && min > 0 && (
              <Chip color="amber">📦 Pedido mínimo R$ {min.toFixed(2).replace(".", ",")}</Chip>
            )}
            {freeAbove != null && freeAbove > 0 && (
              <Chip color="green">🎁 Grátis acima de R$ {freeAbove.toFixed(2).replace(".", ",")}</Chip>
            )}
          </div>
        </div>
      </PageCard>
    );
  }

  // Distance mode
  if (mode === "distance") {
    const baseFee    = toNum(form.distanceBaseFee);
    const perKm      = toNum(form.distancePricePerKm);
    const maxKm      = toNum(form.distanceMaxKm);
    const minFee     = toNum(form.distanceMinFee);
    const minFeeKm   = toNum(form.distanceMinFeeKm);
    const maxFee     = toNum(form.distanceMaxFee);
    const estBase    = form.distanceEstimatedBase ? parseInt(form.distanceEstimatedBase, 10) : null;

    const feeAt = (km: number) => {
      return calcDistanceFee(km, baseFee ?? 0, perKm ?? 0, minFee, minFeeKm, maxFee);
    };

    const exampleKm = maxKm != null ? Math.round(maxKm / 2 * 10) / 10 : null;

    return (
      <PageCard>
        <SectionHeading
          title="Visão da cobertura"
          subtitle="Preço por distância com limites configuráveis."
        />
        <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-indigo-900">Cobertura por distância</span>
            {maxKm != null && (
              <span className="text-sm font-bold text-indigo-700">até {maxKm} km</span>
            )}
          </div>
          {/* Gradient bar representing escalating fee */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100">
            <div className="h-2 w-full rounded-full bg-gradient-to-r from-indigo-300 to-indigo-600" />
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            {baseFee != null && (
              <Chip color="indigo">
                Base R$ {baseFee.toFixed(2).replace(".", ",")}
              </Chip>
            )}
            {perKm != null && (
              <Chip color="indigo">
                + R$ {perKm.toFixed(2).replace(".", ",")} / km
              </Chip>
            )}
            {exampleKm != null && (
              <Chip color="gray">
                Ex: {exampleKm} km → R$ {feeAt(exampleKm).toFixed(2).replace(".", ",")}
              </Chip>
            )}
            {minFee != null && minFee > 0 && (
              <Chip color="amber">Mín. R$ {minFee.toFixed(2).replace(".", ",")}</Chip>
            )}
            {maxFee != null && maxFee > 0 && (
              <Chip color="amber">Máx. R$ {maxFee.toFixed(2).replace(".", ",")}</Chip>
            )}
            {estBase != null && estBase > 0 && (
              <Chip color="indigo">⏱ ~{estBase} min (base)</Chip>
            )}
            {freeAbove != null && freeAbove > 0 && (
              <Chip color="green">🎁 Grátis acima de R$ {freeAbove.toFixed(2).replace(".", ",")}</Chip>
            )}
          </div>
        </div>
      </PageCard>
    );
  }

  // Advanced mode
  const active = zones.filter((z) => z.isActive).sort((a, b) => a.maxDistanceKm - b.maxDistanceKm);
  if (active.length === 0) return null;

  const maxDist = active[active.length - 1]!.maxDistanceKm;

  return (
    <PageCard>
      <SectionHeading
        title="Visão da cobertura"
        subtitle={`${active.length} zona${active.length !== 1 ? "s" : ""} ativa${active.length !== 1 ? "s" : ""} — do mais próximo ao mais distante.`}
      />
      <div className="space-y-2.5">
        {active.map((zone, i) => {
          const fee = Number(zone.fee);
          const widthPct = Math.max(12, Math.round((zone.maxDistanceKm / maxDist) * 100));
          const zoneMin = zone.minOrderValue != null ? Number(zone.minOrderValue) : null;
          const barColor = ZONE_BAR_COLORS[i % ZONE_BAR_COLORS.length]!;
          const bgColor  = ZONE_BG_COLORS[i % ZONE_BG_COLORS.length]!;

          return (
            <div key={zone.id} className={`rounded-xl border border-white/80 p-3.5 ${bgColor}`}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-900">{zone.name}</span>
                <span className="shrink-0 text-sm font-bold text-gray-800">
                  {fee === 0
                    ? <span className="text-green-600">Grátis</span>
                    : `R$ ${fee.toFixed(2).replace(".", ",")}`}
                </span>
              </div>

              {/* Proportional distance bar */}
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-black/10">
                <div
                  className={`h-1.5 rounded-full ${barColor} transition-all duration-500`}
                  style={{ width: `${widthPct}%` }}
                />
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-xs text-gray-600">
                  até <strong>{zone.maxDistanceKm} km</strong>
                </span>
                <span className="text-xs text-gray-600">
                  ~<strong>{zone.estimatedMinutes} min</strong>
                </span>
                {zoneMin != null && zoneMin > 0 && (
                  <Chip color="amber">⚠ Mín. R$ {zoneMin.toFixed(2).replace(".", ",")}</Chip>
                )}
                {freeAbove != null && freeAbove > 0 && (
                  <Chip color="green">🎁 Grátis acima de R$ {freeAbove.toFixed(2).replace(".", ",")}</Chip>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </PageCard>
  );
}

// ── CommercialSummary ─────────────────────────────────────────────────────────
//  Plain-language chips summarizing the commercial rules currently configured.
//  Shows at the bottom of the commercial rules card, below the inputs.

function CommercialSummary({
  mode,
  form,
  zones,
}: {
  mode: "simple" | "advanced" | "distance" | "manual";
  form: DeliveryFormState;
  zones: DeliveryZone[];
}) {
  const freeAbove  = toNum(form.freeDeliveryAbove);
  const globalMin  = toNum(form.minOrderValue);

  type ChipColor = "indigo" | "green" | "amber" | "gray";
  const chips: { label: string; color: ChipColor }[] = [];

  if (mode === "simple") {
    const fee = toNum(form.fee);
    if (fee == null || fee === 0) {
      chips.push({ label: "Frete grátis", color: "green" });
    } else {
      chips.push({ label: `Frete R$ ${fee.toFixed(2).replace(".", ",")}`, color: "indigo" });
    }
    if (globalMin != null && globalMin > 0) {
      chips.push({ label: `Pedido mínimo R$ ${globalMin.toFixed(2).replace(".", ",")}`, color: "amber" });
    }
  } else if (mode === "distance") {
    const baseFee  = toNum(form.distanceBaseFee);
    const perKm    = toNum(form.distancePricePerKm);
    const maxKm    = toNum(form.distanceMaxKm);
    const minFee   = toNum(form.distanceMinFee);
    const minFeeKm = toNum(form.distanceMinFeeKm);
    const maxFee   = toNum(form.distanceMaxFee);
    if (perKm != null) {
      if (minFee != null && minFee > 0 && minFeeKm != null && minFeeKm > 0) {
        chips.push({ label: `R$ ${minFee.toFixed(2).replace(".", ",")} até ${minFeeKm} km. Após isso, R$ ${perKm.toFixed(2).replace(".", ",")}/km adicional.`, color: "indigo" });
      } else {
        chips.push({ label: `R$ ${(baseFee ?? 0).toFixed(2).replace(".", ",")} + R$ ${perKm.toFixed(2).replace(".", ",")}/km`, color: "indigo" });
      }
    }
    if (maxKm != null) {
      chips.push({ label: `Máx. ${maxKm} km`, color: "gray" });
    }
    if (minFee != null && minFee > 0) {
      chips.push({ label: `Frete mín. R$ ${minFee.toFixed(2).replace(".", ",")}`, color: "amber" });
    }
    if (maxFee != null && maxFee > 0) {
      chips.push({ label: `Frete máx. R$ ${maxFee.toFixed(2).replace(".", ",")}`, color: "amber" });
    }
    if (globalMin != null && globalMin > 0) {
      chips.push({ label: `Pedido mínimo R$ ${globalMin.toFixed(2).replace(".", ",")}`, color: "amber" });
    }
  } else {
    const active = zones.filter((z) => z.isActive);
    if (active.length > 0) {
      const fees = active.map((z) => Number(z.fee));
      const lo = Math.min(...fees);
      const hi = Math.max(...fees);
      chips.push({
        label: lo === hi
          ? (lo === 0 ? "Frete grátis" : `Frete R$ ${lo.toFixed(2).replace(".", ",")}`)
          : `Frete R$ ${lo.toFixed(2).replace(".", ",")} – R$ ${hi.toFixed(2).replace(".", ",")}`,
        color: "indigo",
      });

      const zonesWithMin = active.filter((z) => z.minOrderValue != null && Number(z.minOrderValue) > 0);
      if (zonesWithMin.length > 0) {
        chips.push({ label: `${zonesWithMin.length} zona${zonesWithMin.length !== 1 ? "s" : ""} com pedido mínimo`, color: "amber" });
      }
    } else {
      chips.push({ label: "Nenhuma zona ativa", color: "gray" });
    }

    if (globalMin != null && globalMin > 0) {
      chips.push({ label: `Mínimo global R$ ${globalMin.toFixed(2).replace(".", ",")}`, color: "amber" });
    }
  }

  if (freeAbove != null && freeAbove > 0) {
    chips.push({ label: `Grátis acima de R$ ${freeAbove.toFixed(2).replace(".", ",")}`, color: "green" });
  }

  if (chips.length === 0) return null;

  return (
    <div className="mt-4 border-t border-gray-100 pt-4">
      <p className="mb-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
        Resumo para o cliente
      </p>
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <Chip key={c.label} color={c.color}>{c.label}</Chip>
        ))}
      </div>
    </div>
  );
}

// ── Delivery simulator ───────────────────────────────────────────────────────

interface SimResult {
  allowed: boolean;
  blockedReason?: string;
  zoneName?: string;
  fee: number;
  effectiveFee: number;
  estimatedMinutes?: number;
  freeDeliveryApplied: boolean;
  minOrderBlocked: boolean;
  minOrderRequired?: number;
}

function simulateDelivery(
  distanceKm: number,
  orderValue: number,
  form: DeliveryFormState,
  zones: DeliveryZone[]
): SimResult {
  if (!form.enabled) {
    return { allowed: false, blockedReason: "Delivery está desativado.", fee: 0, effectiveFee: 0, freeDeliveryApplied: false, minOrderBlocked: false };
  }

  if (form.mode === "manual") {
    return { allowed: true, zoneName: "Frete manual", fee: 0, effectiveFee: 0, freeDeliveryApplied: false, minOrderBlocked: false };
  }

  const freeAbove = toNum(form.freeDeliveryAbove);

  if (form.mode === "simple") {
    const fee     = toNum(form.fee) ?? 0;
    const minOrder = toNum(form.minOrderValue) ?? 0;
    const minutes  = form.estimatedMinutes ? parseInt(form.estimatedMinutes, 10) : undefined;

    if (minOrder > 0 && orderValue < minOrder) {
      return { allowed: false, blockedReason: `Pedido mínimo não atingido.`, zoneName: "Área de entrega", fee, effectiveFee: fee, estimatedMinutes: minutes, freeDeliveryApplied: false, minOrderBlocked: true, minOrderRequired: minOrder };
    }

    const freeDeliveryApplied = freeAbove != null && freeAbove > 0 && orderValue >= freeAbove;
    return { allowed: true, zoneName: "Área de entrega", fee, effectiveFee: freeDeliveryApplied ? 0 : fee, estimatedMinutes: minutes, freeDeliveryApplied, minOrderBlocked: false };
  }

  if (form.mode === "distance") {
    const baseFee   = toNum(form.distanceBaseFee) ?? 0;
    const perKm     = toNum(form.distancePricePerKm) ?? 0;
    const maxKm     = toNum(form.distanceMaxKm);
    const minFee    = toNum(form.distanceMinFee);
    const minFeeKm  = toNum(form.distanceMinFeeKm);
    const maxFee    = toNum(form.distanceMaxFee);
    const estBase   = form.distanceEstimatedBase ? parseInt(form.distanceEstimatedBase, 10) : undefined;
    const globalMin = toNum(form.minOrderValue) ?? 0;

    if (maxKm != null && distanceKm > maxKm) {
      return { allowed: false, blockedReason: `${distanceKm} km está fora da cobertura (máx. ${maxKm} km).`, fee: 0, effectiveFee: 0, freeDeliveryApplied: false, minOrderBlocked: false };
    }

    if (globalMin > 0 && orderValue < globalMin) {
      return { allowed: false, blockedReason: `Pedido mínimo não atingido.`, fee: 0, effectiveFee: 0, estimatedMinutes: estBase, freeDeliveryApplied: false, minOrderBlocked: true, minOrderRequired: globalMin };
    }

    const fee = calcDistanceFee(distanceKm, baseFee, perKm, minFee, minFeeKm, maxFee);
    const freeDeliveryApplied = freeAbove != null && freeAbove > 0 && orderValue >= freeAbove;
    return { allowed: true, zoneName: "Por distância", fee, effectiveFee: freeDeliveryApplied ? 0 : fee, estimatedMinutes: estBase, freeDeliveryApplied, minOrderBlocked: false };
  }

  // Advanced — find lowest zone that covers the distance
  const active = zones.filter((z) => z.isActive).sort((a, b) => a.maxDistanceKm - b.maxDistanceKm);
  const matched = active.find((z) => distanceKm <= z.maxDistanceKm);

  if (!matched) {
    const maxCoverage = active[active.length - 1]?.maxDistanceKm ?? 0;
    return { allowed: false, blockedReason: `${distanceKm} km está fora da cobertura (máx. ${maxCoverage} km).`, fee: 0, effectiveFee: 0, freeDeliveryApplied: false, minOrderBlocked: false };
  }

  const fee      = Number(matched.fee);
  const zoneMin  = matched.minOrderValue != null ? Number(matched.minOrderValue) : (toNum(form.minOrderValue) ?? 0);

  if (zoneMin > 0 && orderValue < zoneMin) {
    return { allowed: false, blockedReason: `Pedido mínimo para ${matched.name}: R$ ${zoneMin.toFixed(2).replace(".", ",")}.`, zoneName: matched.name, fee, effectiveFee: fee, estimatedMinutes: matched.estimatedMinutes, freeDeliveryApplied: false, minOrderBlocked: true, minOrderRequired: zoneMin };
  }

  const freeDeliveryApplied = freeAbove != null && freeAbove > 0 && orderValue >= freeAbove;
  return { allowed: true, zoneName: matched.name, fee, effectiveFee: freeDeliveryApplied ? 0 : fee, estimatedMinutes: matched.estimatedMinutes, freeDeliveryApplied, minOrderBlocked: false };
}

function DeliverySimulator({
  form,
  zones,
}: {
  form: DeliveryFormState;
  zones: DeliveryZone[];
}) {
  const [distanceKm, setDistanceKm] = useState("");
  const [orderValue, setOrderValue]  = useState("");
  const [result, setResult]          = useState<SimResult | null>(null);

  function handleSimulate(e: FormEvent) {
    e.preventDefault();
    const dist = parseFloat(distanceKm);
    const val  = parseFloat(orderValue);
    if (isNaN(dist) || isNaN(val)) return;
    setResult(simulateDelivery(dist, val, form, zones));
  }

  return (
    <PageCard>
      <SectionHeading
        title="Simulador de entrega"
        subtitle="Teste como suas regras se aplicam para um pedido específico."
      />

      <form onSubmit={handleSimulate}>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Distância do cliente (km)">
            <input
              className={INPUT}
              type="number"
              min="0"
              step="0.1"
              required
              value={distanceKm}
              onChange={(e) => { setDistanceKm(e.target.value); setResult(null); }}
              placeholder="Ex: 3,5"
            />
          </Field>
          <Field label="Valor do pedido (R$)">
            <input
              className={INPUT}
              type="number"
              min="0"
              step="0.01"
              required
              value={orderValue}
              onChange={(e) => { setOrderValue(e.target.value); setResult(null); }}
              placeholder="Ex: 65,00"
            />
          </Field>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            type="submit"
            className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Simular →
          </button>
          {result && (
            <button
              type="button"
              onClick={() => { setResult(null); setDistanceKm(""); setOrderValue(""); }}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-500 hover:bg-gray-50"
            >
              Limpar
            </button>
          )}
        </div>
      </form>

      {result && (
        <div
          className={`mt-5 rounded-xl border p-4 ${
            result.allowed
              ? "border-green-200 bg-green-50"
              : "border-red-100 bg-red-50"
          }`}
        >
          {/* Header */}
          <div className="mb-3 flex items-center gap-2">
            <span className={`text-lg leading-none ${result.allowed ? "text-green-500" : "text-red-400"}`}>
              {result.allowed ? "✓" : "✕"}
            </span>
            <span className={`text-sm font-semibold ${result.allowed ? "text-green-800" : "text-red-700"}`}>
              {result.allowed ? "Entrega disponível" : "Entrega não disponível"}
            </span>
          </div>

          {!result.allowed && result.blockedReason && (
            <p className="mb-3 rounded-lg bg-red-100 px-3 py-2 text-xs font-medium text-red-700">
              {result.blockedReason}
            </p>
          )}

          {/* Result grid */}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-xs">
            {result.zoneName && (
              <>
                <dt className="text-gray-500">Zona</dt>
                <dd className="font-semibold text-gray-900">{result.zoneName}</dd>
              </>
            )}
            {result.estimatedMinutes != null && (
              <>
                <dt className="text-gray-500">Prazo estimado</dt>
                <dd className="font-semibold text-gray-900">~{result.estimatedMinutes} min</dd>
              </>
            )}
            <>
              <dt className="text-gray-500">Taxa de entrega</dt>
              <dd className="font-semibold text-gray-900">
                {result.fee === 0
                  ? "Grátis"
                  : `R$ ${result.fee.toFixed(2).replace(".", ",")}`}
              </dd>
            </>
            {result.freeDeliveryApplied && (
              <>
                <dt className="text-gray-500">Frete cobrado</dt>
                <dd className="font-semibold text-green-700">Grátis 🎁</dd>
              </>
            )}
            {result.minOrderBlocked && result.minOrderRequired != null && (
              <>
                <dt className="text-gray-500">Pedido mínimo</dt>
                <dd className="font-semibold text-red-600">
                  R$ {result.minOrderRequired.toFixed(2).replace(".", ",")} — não atingido
                </dd>
              </>
            )}
          </dl>
        </div>
      )}
    </PageCard>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────

const CHIP_STYLES = {
  indigo: "bg-indigo-100 text-indigo-700",
  green:  "bg-green-100  text-green-700",
  amber:  "bg-amber-100  text-amber-700",
  gray:   "bg-gray-100   text-gray-500",
} as const;

function Chip({
  color,
  children,
}: {
  color: keyof typeof CHIP_STYLES;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP_STYLES[color]}`}>
      {children}
    </span>
  );
}

// ── Zone card sub-component ────────────────────────────────────────────────────

interface ZoneRowProps {
  zone: DeliveryZone;
  index: number;
  onDelete: (id: string) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onEdit: (zone: DeliveryZone) => void;
}

function ZoneRow({ zone, index, onDelete, onToggle, onEdit }: ZoneRowProps) {
  return (
    <div
      className={`rounded-xl border bg-white p-4 transition ${
        zone.isActive ? "border-gray-200" : "border-dashed border-gray-200 opacity-60"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-600">
            {index + 1}
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">{zone.name}</p>
            <p className="text-xs text-gray-500">
              até {zone.maxDistanceKm} km · {zone.estimatedMinutes} min
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-800">
            {Number(zone.fee) === 0
              ? "Grátis"
              : `R$ ${Number(zone.fee).toFixed(2).replace(".", ",")}`}
          </span>
          <button
            type="button"
            onClick={() => onEdit(zone)}
            className="rounded-lg border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            Editar
          </button>
          <button
            type="button"
            onClick={() => onToggle(zone.id, !zone.isActive)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
              zone.isActive
                ? "border-gray-200 text-gray-500 hover:bg-gray-50"
                : "border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100"
            }`}
          >
            {zone.isActive ? "Desativar" : "Ativar"}
          </button>
          <button
            type="button"
            onClick={() => onDelete(zone.id)}
            className="rounded-lg border border-red-100 px-2 py-1 text-xs font-medium text-red-400 hover:bg-red-50 hover:text-red-600"
          >
            ✕
          </button>
        </div>
      </div>

      {zone.minOrderValue != null && Number(zone.minOrderValue) > 0 && (
        <p className="mt-2 text-[11px] text-gray-400">
          Pedido mínimo: R$ {Number(zone.minOrderValue).toFixed(2).replace(".", ",")}
        </p>
      )}
    </div>
  );
}

// ── Zone editor modal ──────────────────────────────────────────────────────────

interface ZoneEditorProps {
  initial: Partial<DeliveryZone> | null;
  onSave: (data: Omit<DeliveryZone, "id" | "sortOrder">) => void;
  onCancel: () => void;
  saving: boolean;
}

function ZoneEditor({ initial, onSave, onCancel, saving }: ZoneEditorProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [maxDistanceKm, setMaxDistanceKm] = useState(
    initial?.maxDistanceKm != null ? String(initial.maxDistanceKm) : ""
  );
  const [fee, setFee] = useState(
    initial?.fee != null ? fmtCurrency(initial.fee) : ""
  );
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    initial?.estimatedMinutes != null ? String(initial.estimatedMinutes) : ""
  );
  const [minOrderValue, setMinOrderValue] = useState(
    initial?.minOrderValue != null ? fmtCurrency(initial.minOrderValue) : ""
  );
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSave({
      name,
      maxDistanceKm: parseFloat(maxDistanceKm),
      fee: parseFloat(fee) || 0,
      estimatedMinutes: parseInt(estimatedMinutes, 10),
      minOrderValue: minOrderValue ? parseFloat(minOrderValue) : null,
      isActive,
      peakFee: initial?.peakFee ?? null,
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <h3 className="mb-4 text-base font-semibold text-gray-900">
          {initial?.id ? "Editar zona" : "Nova zona de entrega"}
        </h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nome da zona *">
            <input
              className={INPUT}
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Centro, Zona 1 — até 3km"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Distância máxima (km) *">
              <input
                className={INPUT}
                type="number"
                required
                min="0.1"
                step="0.1"
                value={maxDistanceKm}
                onChange={(e) => setMaxDistanceKm(e.target.value)}
                placeholder="5"
              />
            </Field>
            <Field label="Tempo estimado (min) *">
              <input
                className={INPUT}
                type="number"
                required
                min="1"
                max="300"
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(e.target.value)}
                placeholder="30"
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Taxa de entrega (R$) *" hint="0 = grátis">
              <input
                className={INPUT}
                type="number"
                required
                min="0"
                step="0.01"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
                placeholder="0,00"
              />
            </Field>
            <Field label="Pedido mínimo (R$)" hint="Opcional">
              <input
                className={INPUT}
                type="number"
                min="0"
                step="0.01"
                value={minOrderValue}
                onChange={(e) => setMinOrderValue(e.target.value)}
                placeholder="0,00"
              />
            </Field>
          </div>

          <Toggle
            label="Zona ativa"
            desc="Zona inativa não aparece para o cliente."
            checked={isActive}
            onChange={setIsActive}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-indigo-600 px-5 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "Salvando…" : "Salvar zona"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function DeliveryPage() {
  const [form, setForm] = useState<DeliveryFormState>({
    enabled: true,
    pickupEnabled: true,
    mode: "simple",
    fee: "",
    estimatedMinutes: "",
    areaDescription: "",
    minOrderValue: "",
    freeDeliveryAbove: "",
    peakHoursEnabled: false,
    geoCenter: "",
    geoRadiusKm: "",
    distanceBaseFee: "",
    distancePricePerKm: "",
    distanceMaxKm: "",
    distanceMinFee: "",
    distanceMinFeeKm: "",
    distanceMaxFee: "",
    distanceEstimatedBase: "",
  });

  const [zones, setZones] = useState<DeliveryZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [zoneSaving, setZoneSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showZoneEditor, setShowZoneEditor] = useState(false);
  const [editingZone, setEditingZone] = useState<DeliveryZone | null>(null);

  // Load config + zones
  useEffect(() => {
    apiFetch("/api/settings/delivery").then(({ ok: isOk, data }) => {
      if (isOk) {
        setForm({
          enabled:          data.enabled ?? true,
          pickupEnabled:    data.pickupEnabled ?? true,
          mode:             data.mode ?? "simple",
          fee:              fmtCurrency(data.fee),
          estimatedMinutes: data.estimatedMinutes != null ? String(data.estimatedMinutes) : "",
          areaDescription:  data.areaDescription ?? "",
          minOrderValue:    fmtCurrency(data.minOrderValue),
          freeDeliveryAbove: fmtCurrency(data.freeDeliveryAbove),
          peakHoursEnabled: data.peakHoursEnabled ?? false,
          geoCenter:        data.geoCenter ?? "",
          geoRadiusKm:      data.geoRadiusKm != null ? String(data.geoRadiusKm) : "",
          distanceBaseFee:       fmtCurrency(data.distanceBaseFee),
          distancePricePerKm:    fmtCurrency(data.distancePricePerKm),
          distanceMaxKm:         data.distanceMaxKm    != null ? String(data.distanceMaxKm)    : "",
          distanceMinFee:        fmtCurrency(data.distanceMinFee),
          distanceMinFeeKm:      data.distanceMinFeeKm != null ? String(data.distanceMinFeeKm) : "",
          distanceMaxFee:        fmtCurrency(data.distanceMaxFee),
          distanceEstimatedBase: data.distanceEstimatedBase != null ? String(data.distanceEstimatedBase) : "",
        });
        setZones(data.zones ?? []);
      }
      setLoading(false);
    });
  }, []);

  // Save global config
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSuccess(null);
    setError(null);
    const { ok: isOk, data } = await apiFetch("/api/settings/delivery", "PUT", {
      enabled:           form.enabled,
      pickupEnabled:     form.pickupEnabled,
      mode:              form.mode,
      fee:               toNum(form.fee),
      estimatedMinutes:  form.estimatedMinutes ? parseInt(form.estimatedMinutes, 10) : null,
      areaDescription:   form.areaDescription || null,
      minOrderValue:     toNum(form.minOrderValue),
      freeDeliveryAbove: toNum(form.freeDeliveryAbove),
      distanceBaseFee:       toNum(form.distanceBaseFee),
      distancePricePerKm:    toNum(form.distancePricePerKm),
      distanceMaxKm:         toNum(form.distanceMaxKm),
      distanceMinFee:        toNum(form.distanceMinFee),
      distanceMinFeeKm:      toNum(form.distanceMinFeeKm),
      distanceMaxFee:        toNum(form.distanceMaxFee),
      distanceEstimatedBase: form.distanceEstimatedBase ? parseInt(form.distanceEstimatedBase, 10) : null,
      peakHoursEnabled:  form.peakHoursEnabled,
      geoCenter:         form.geoCenter || null,
      geoRadiusKm:       toNum(form.geoRadiusKm),
    });
    if (isOk) setSuccess("Configurações de entrega salvas.");
    else setError(data?.error ?? "Erro ao salvar.");
    setSaving(false);
  }

  // Zone operations
  async function handleZoneSave(data: Omit<DeliveryZone, "id" | "sortOrder">) {
    setZoneSaving(true);
    if (editingZone?.id) {
      const res = await apiFetch(`/api/settings/delivery/zones/${editingZone.id}`, "PUT", {
        ...data,
        sortOrder: editingZone.sortOrder,
      });
      if (res.ok) {
        setZones((prev) =>
          prev.map((z) => (z.id === editingZone.id ? res.data : z))
        );
        setShowZoneEditor(false);
        setEditingZone(null);
      } else {
        setError(res.data?.error ?? "Erro ao salvar zona.");
      }
    } else {
      const res = await apiFetch("/api/settings/delivery/zones", "POST", {
        ...data,
        sortOrder: zones.length,
      });
      if (res.ok) {
        setZones((prev) => [...prev, res.data]);
        setShowZoneEditor(false);
        setEditingZone(null);
      } else {
        setError(res.data?.error ?? "Erro ao criar zona.");
      }
    }
    setZoneSaving(false);
  }

  async function handleZoneDelete(id: string) {
    if (!confirm("Remover esta zona de entrega?")) return;
    const res = await apiFetch(`/api/settings/delivery/zones/${id}`, "DELETE");
    if (res.ok) setZones((prev) => prev.filter((z) => z.id !== id));
    else setError(res.data?.error ?? "Erro ao remover zona.");
  }

  async function handleZoneToggle(id: string, isActive: boolean) {
    const zone = zones.find((z) => z.id === id);
    if (!zone) return;
    const res = await apiFetch(`/api/settings/delivery/zones/${id}`, "PUT", {
      ...zone,
      fee:          Number(zone.fee),
      minOrderValue: zone.minOrderValue != null ? Number(zone.minOrderValue) : null,
      peakFee:       zone.peakFee != null ? Number(zone.peakFee) : null,
      isActive,
    });
    if (res.ok) setZones((prev) => prev.map((z) => (z.id === id ? res.data : z)));
    else setError(res.data?.error ?? "Erro ao atualizar zona.");
  }

  function openNewZone() {
    setEditingZone(null);
    setShowZoneEditor(true);
  }

  function openEditZone(zone: DeliveryZone) {
    setEditingZone(zone);
    setShowZoneEditor(true);
  }

  if (loading) return <p className="py-8 text-sm text-gray-400">Carregando…</p>;

  const activeZones = zones.filter((z) => z.isActive);

  return (
    <>
      {showZoneEditor && (
        <ZoneEditor
          initial={editingZone}
          onSave={handleZoneSave}
          onCancel={() => { setShowZoneEditor(false); setEditingZone(null); }}
          saving={zoneSaving}
        />
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Feedback success={success} error={error} onDismiss={() => setError(null)} />

        {/* ── Fulfillment toggles (Phase 9 — clarity) ──────────────────────────── */}
        <PageCard>
          <div className="mb-5 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Modalidades de atendimento</h2>
              <p className="mt-0.5 text-sm text-gray-500">Defina como seu restaurante recebe pedidos.</p>
            </div>
            {/* Live status chips — read-only summary */}
            <div className="flex shrink-0 items-center gap-1.5">
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  form.enabled
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {form.enabled ? "Delivery ativo" : "Delivery off"}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                  form.pickupEnabled
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-400"
                }`}
              >
                {form.pickupEnabled ? "Retirada ativa" : "Retirada off"}
              </span>
            </div>
          </div>

          <div className="space-y-4">
            <Toggle
              label="Delivery ativo"
              desc="Aceitar pedidos para entrega no endereço do cliente."
              checked={form.enabled}
              onChange={(v) => setForm((f) => ({ ...f, enabled: v }))}
            />
            <div className="border-t border-gray-100" />
            <Toggle
              label="Retirada no balcão ativa"
              desc="Aceitar pedidos para retirada pelo cliente."
              checked={form.pickupEnabled}
              onChange={(v) => setForm((f) => ({ ...f, pickupEnabled: v }))}
            />
          </div>

          {/* Quick context: what the current delivery config means */}
          {form.enabled && (
            <div className="mt-4 border-t border-gray-100 pt-4">
              <div className="flex flex-wrap gap-2">
                {form.mode === "simple" && toNum(form.fee) === 0 && (
                  <Chip color="green">Frete grátis</Chip>
                )}
                {form.mode === "simple" && (toNum(form.fee) ?? 0) > 0 && (
                  <Chip color="indigo">Frete R$ {Number(toNum(form.fee)).toFixed(2).replace(".", ",")}</Chip>
                )}
                {form.mode === "advanced" && (
                  <Chip color="indigo">
                    {zones.filter(z => z.isActive).length} zona{zones.filter(z => z.isActive).length !== 1 ? "s" : ""} ativa{zones.filter(z => z.isActive).length !== 1 ? "s" : ""}
                  </Chip>
                )}
                {form.mode === "distance" && toNum(form.distancePricePerKm) != null && (
                  <Chip color="indigo">
                    {(() => {
                      const minF   = toNum(form.distanceMinFee);
                      const minFKm = toNum(form.distanceMinFeeKm);
                      const perK   = toNum(form.distancePricePerKm) ?? 0;
                      if (minF != null && minF > 0 && minFKm != null && minFKm > 0) {
                        return `R$ ${minF.toFixed(2).replace(".", ",")} até ${minFKm} km. Depois R$ ${perK.toFixed(2).replace(".", ",")}/km.`;
                      }
                      return `R$ ${(toNum(form.distanceBaseFee) ?? 0).toFixed(2).replace(".", ",")} + R$ ${perK.toFixed(2).replace(".", ",")}/km`;
                    })()}
                  </Chip>
                )}
                {form.mode === "distance" && toNum(form.distanceMaxKm) != null && (
                  <Chip color="gray">até {toNum(form.distanceMaxKm)} km</Chip>
                )}
                {form.estimatedMinutes && form.mode === "simple" && (
                  <Chip color="gray">~{form.estimatedMinutes} min</Chip>
                )}
                {(toNum(form.freeDeliveryAbove) ?? 0) > 0 && (
                  <Chip color="green">Grátis acima de R$ {Number(toNum(form.freeDeliveryAbove)).toFixed(2).replace(".", ",")}</Chip>
                )}
              </div>
            </div>
          )}
        </PageCard>

        {form.enabled && (
          <>
            {/* ── Mode selector ───────────────────────────────────────────────── */}
            <PageCard>
              <SectionHeading
                title="Configuração de entrega"
                subtitle="Escolha como deseja estruturar sua política de entrega."
              />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mode: "simple" }))}
                  className={`rounded-xl border p-4 text-left transition ${
                    form.mode === "simple"
                      ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">Simples</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Taxa única para toda a área de entrega.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mode: "advanced" }))}
                  className={`rounded-xl border p-4 text-left transition ${
                    form.mode === "advanced"
                      ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">Por zonas</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Taxas e tempos diferentes por distância ou bairro.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mode: "distance" }))}
                  className={`rounded-xl border p-4 text-left transition ${
                    form.mode === "distance"
                      ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">Por distância</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Taxa calculada com base nos km percorridos.
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, mode: "manual" }))}
                  className={`rounded-xl border p-4 text-left transition ${
                    form.mode === "manual"
                      ? "border-indigo-400 bg-indigo-50 ring-1 ring-indigo-300"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">Manual</p>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Frete combinado pelo restaurante a cada pedido.
                  </p>
                </button>
              </div>
            </PageCard>

            {/* ── Simple mode ─────────────────────────────────────────────────── */}
            {form.mode === "simple" && (
              <PageCard>
                <SectionHeading
                  title="Taxa e prazo"
                  subtitle="Uma configuração única para toda sua área de entrega."
                />
                <div className="grid grid-cols-3 gap-4">
                  <Field label="Taxa de entrega (R$)" hint="Deixe em branco para grátis.">
                    <input
                      className={INPUT}
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.fee}
                      onChange={(e) => setForm((f) => ({ ...f, fee: e.target.value }))}
                      placeholder="0,00"
                    />
                  </Field>
                  <Field label="Pedido mínimo (R$)">
                    <input
                      className={INPUT}
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.minOrderValue}
                      onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))}
                      placeholder="0,00"
                    />
                  </Field>
                  <Field label="Tempo estimado (min)">
                    <input
                      className={INPUT}
                      type="number"
                      min="1"
                      max="300"
                      value={form.estimatedMinutes}
                      onChange={(e) => setForm((f) => ({ ...f, estimatedMinutes: e.target.value }))}
                      placeholder="30"
                    />
                  </Field>
                </div>

                <div className="mt-4">
                  <Field label="Área de cobertura" hint="Descreva onde você entrega — o agente usará essa info para responder clientes.">
                    <textarea
                      className={INPUT + " resize-none"}
                      rows={3}
                      maxLength={500}
                      value={form.areaDescription}
                      onChange={(e) => setForm((f) => ({ ...f, areaDescription: e.target.value }))}
                      placeholder="Ex: Pinheiros, Vila Madalena, Bela Vista — raio de 5 km"
                    />
                  </Field>
                </div>
              </PageCard>
            )}

            {/* ── Advanced mode — zones ────────────────────────────────────────── */}
            {form.mode === "advanced" && (
              <PageCard>
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-gray-900">Zonas de entrega</h2>
                    <p className="mt-0.5 text-sm text-gray-500">
                      {zones.length === 0
                        ? "Adicione zonas para definir taxas por distância."
                        : `${activeZones.length} zona${activeZones.length !== 1 ? "s" : ""} ativa${activeZones.length !== 1 ? "s" : ""}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openNewZone}
                    className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    + Adicionar zona
                  </button>
                </div>

                {zones.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 py-10 text-center">
                    <p className="text-sm text-gray-400">Nenhuma zona configurada.</p>
                    <button
                      type="button"
                      onClick={openNewZone}
                      className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                    >
                      Criar primeira zona →
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {zones
                      .slice()
                      .sort((a, b) => a.maxDistanceKm - b.maxDistanceKm)
                      .map((zone, i) => (
                        <ZoneRow
                          key={zone.id}
                          zone={zone}
                          index={i}
                          onDelete={handleZoneDelete}
                          onToggle={handleZoneToggle}
                          onEdit={openEditZone}
                        />
                      ))}
                  </div>
                )}

                {zones.length > 0 && (
                  <div className="mt-4 border-t border-gray-100 pt-4">
                    <Field label="Área de cobertura (descrição)">
                      <textarea
                        className={INPUT + " resize-none"}
                        rows={2}
                        maxLength={500}
                        value={form.areaDescription}
                        onChange={(e) => setForm((f) => ({ ...f, areaDescription: e.target.value }))}
                        placeholder="Informação extra para o agente sobre sua área de cobertura."
                      />
                    </Field>
                  </div>
                )}
              </PageCard>
            )}

            {/* ── Distance mode ────────────────────────────────────────────────── */}
            {form.mode === "distance" && (
              <PageCard>
                <SectionHeading
                  title="Configuração por distância"
                  subtitle={(() => {
                    const minF   = toNum(form.distanceMinFee);
                    const minFKm = toNum(form.distanceMinFeeKm);
                    const perK   = toNum(form.distancePricePerKm);
                    if (minF != null && minF > 0 && minFKm != null && minFKm > 0) {
                      return `Taxa mínima R$ ${minF.toFixed(2).replace(".", ",")} até ${minFKm} km; depois soma R$ ${(perK ?? 0).toFixed(2).replace(".", ",")}/km adicional.`;
                    }
                    return "Fórmula: taxa = base + (km × preço/km) — com piso e teto opcionais.";
                  })()}
                />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Taxa base (R$)" hint="Taxa cobrada mesmo em distância zero.">
                    <input
                      className={INPUT}
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.distanceBaseFee}
                      onChange={(e) => setForm((f) => ({ ...f, distanceBaseFee: e.target.value }))}
                      placeholder="Ex: 3,00"
                    />
                  </Field>
                  <Field label="Preço por km (R$/km)" hint="Valor adicional por quilômetro rodado.">
                    <input
                      className={INPUT}
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.distancePricePerKm}
                      onChange={(e) => setForm((f) => ({ ...f, distancePricePerKm: e.target.value }))}
                      placeholder="Ex: 1,50"
                    />
                  </Field>
                  <Field label="Distância máxima (km)" hint="Entregas além desse raio não são aceitas.">
                    <input
                      className={INPUT}
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={form.distanceMaxKm}
                      onChange={(e) => setForm((f) => ({ ...f, distanceMaxKm: e.target.value }))}
                      placeholder="Ex: 10"
                    />
                  </Field>
                  <Field label="Tempo estimado base (min)" hint="Tempo mínimo de entrega para qualquer distância.">
                    <input
                      className={INPUT}
                      type="number"
                      min="1"
                      max="300"
                      value={form.distanceEstimatedBase}
                      onChange={(e) => setForm((f) => ({ ...f, distanceEstimatedBase: e.target.value }))}
                      placeholder="Ex: 25"
                    />
                  </Field>
                  <Field label="Taxa mínima (R$)" hint="Piso para a taxa calculada. Opcional.">
                    <input
                      className={INPUT}
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.distanceMinFee}
                      onChange={(e) => setForm((f) => ({ ...f, distanceMinFee: e.target.value }))}
                      placeholder="Ex: 5,00"
                    />
                  </Field>
                  <Field
                    label="Km incluídos na taxa mínima"
                    hint="Até essa distância, será cobrada apenas a taxa mínima."
                  >
                    <input
                      className={INPUT}
                      type="number"
                      step="0.1"
                      min="0"
                      value={form.distanceMinFeeKm}
                      onChange={(e) => setForm((f) => ({ ...f, distanceMinFeeKm: e.target.value }))}
                      placeholder="Ex: 3"
                    />
                  </Field>
                  <Field label="Taxa máxima (R$)" hint="Teto para a taxa calculada. Opcional.">
                    <input
                      className={INPUT}
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.distanceMaxFee}
                      onChange={(e) => setForm((f) => ({ ...f, distanceMaxFee: e.target.value }))}
                      placeholder="Ex: 20,00"
                    />
                  </Field>
                </div>

                {/* Live formula preview */}
                {(toNum(form.distancePricePerKm) != null) && (
                  <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3">
                    <p className="text-xs font-semibold text-indigo-700 mb-1.5">Prévia da fórmula</p>
                    <div className="flex flex-wrap gap-3 text-xs text-indigo-800">
                      {[1, 3, 5, 10].filter((km) => toNum(form.distanceMaxKm) == null || km <= (toNum(form.distanceMaxKm) ?? 0)).map((km) => {
                        const base   = toNum(form.distanceBaseFee) ?? 0;
                        const perK   = toNum(form.distancePricePerKm) ?? 0;
                        const minF   = toNum(form.distanceMinFee);
                        const minFKm = toNum(form.distanceMinFeeKm);
                        const maxF   = toNum(form.distanceMaxFee);
                        const fee    = calcDistanceFee(km, base, perK, minF, minFKm, maxF);
                        return (
                          <span key={km} className="rounded-full bg-indigo-100 px-2.5 py-0.5 font-medium">
                            {km} km → R$ {fee.toFixed(2).replace(".", ",")}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="mt-4">
                  <Field label="Área de cobertura" hint="Descrição textual para o agente de IA.">
                    <textarea
                      className={INPUT + " resize-none"}
                      rows={2}
                      maxLength={500}
                      value={form.areaDescription}
                      onChange={(e) => setForm((f) => ({ ...f, areaDescription: e.target.value }))}
                      placeholder="Ex: Entregamos em toda a cidade num raio de 10 km do restaurante."
                    />
                  </Field>
                </div>
              </PageCard>
            )}

            {/* ── Manual mode ─────────────────────────────────────────────────── */}
            {form.mode === "manual" && (
              <PageCard>
                <SectionHeading
                  title="Frete manual"
                  subtitle="O frete será combinado com o cliente após cada pedido."
                />
                <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-semibold">Como funciona</p>
                  <p className="mt-1 text-xs leading-relaxed">
                    No checkout, o cliente verá <strong>&quot;Frete a combinar&quot;</strong>. Você entra em contato para confirmar o valor antes de aceitar o pedido.
                    Ideal para áreas irregulares ou quando o frete varia por região.
                  </p>
                </div>
              </PageCard>
            )}

            {/* ── Coverage overview (Phase 6) ──────────────────────────────────── */}
            {(form.mode === "simple" ||
              form.mode === "distance" ||
              (form.mode === "advanced" && zones.some((z) => z.isActive))) && (
              <CoverageOverview mode={form.mode} form={form} zones={zones} />
            )}

            {/* ── Commercial rules ─────────────────────────────────────────────── */}
            <PageCard>
              <SectionHeading
                title="Regras comerciais"
                subtitle="Incentivos e limites que se aplicam a todos os pedidos."
              />
              <div className="grid grid-cols-2 gap-4">
                <Field
                  label="Entrega grátis acima de (R$)"
                  hint="Pedidos acima deste valor têm frete grátis. Deixe em branco para não usar."
                >
                  <input
                    className={INPUT}
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.freeDeliveryAbove}
                    onChange={(e) => setForm((f) => ({ ...f, freeDeliveryAbove: e.target.value }))}
                    placeholder="Ex: 80,00"
                  />
                </Field>
                {(form.mode === "advanced" || form.mode === "distance") && (
                  <Field
                    label="Pedido mínimo global (R$)"
                    hint={form.mode === "advanced" ? "Aplica a todas as zonas que não têm mínimo específico." : "Valor mínimo obrigatório para aceitar o pedido."}
                  >
                    <input
                      className={INPUT}
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.minOrderValue}
                      onChange={(e) => setForm((f) => ({ ...f, minOrderValue: e.target.value }))}
                      placeholder="0,00"
                    />
                  </Field>
                )}
              </div>

              {/* Commercial clarity summary (Phase 8) */}
              <CommercialSummary mode={form.mode} form={form} zones={zones} />
            </PageCard>

            {/* ── Delivery simulator (Phase 7) ─────────────────────────────────── */}
            <DeliverySimulator form={form} zones={zones} />

            {/* ── Phase 3 placeholder — peak hours ─────────────────────────────── */}
            <div className="rounded-2xl border border-dashed border-amber-200 bg-amber-50/60 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">⏱</span>
                <div>
                  <p className="text-sm font-semibold text-amber-800">
                    Preço dinâmico por horário
                    <span className="ml-2 rounded-full bg-amber-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                      em breve
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-amber-700 opacity-80">
                    Configure taxas diferenciadas para horários de pico (ex: sexta noite, almoço).
                    A estrutura já está preparada — funcionalidade chegará em breve.
                  </p>
                </div>
              </div>
            </div>

            {/* ── Phase 5 placeholder — map zones ──────────────────────────────── */}
            <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/50 p-5">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 text-lg">🗺</span>
                <div>
                  <p className="text-sm font-semibold text-indigo-800">
                    Zonas desenhadas no mapa
                    <span className="ml-2 rounded-full bg-indigo-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-indigo-600">
                      em breve
                    </span>
                  </p>
                  <p className="mt-1 text-xs text-indigo-600 opacity-80">
                    Defina áreas de entrega diretamente no mapa, com precisão geográfica por polígonos.
                    O modelo de dados já suporta isso — a interface está em desenvolvimento.
                  </p>
                </div>
              </div>
            </div>
          </>
        )}

        <SaveButton saving={saving} />
      </form>
    </>
  );
}
