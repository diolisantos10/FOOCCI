/**
 * Shared product-mockup language for the marketing site. Server component.
 *
 * PRE-LAUNCH: these are ILLUSTRATIVE CSS mockups — no real screenshots, no
 * invented numbers/metrics, no fake testimonials, no fake restaurant logos and
 * no real personal data. They evoke the product UI (so the site feels like a
 * real product) without pretending to be exact dashboards. Only neutral,
 * approved labels are used.
 *
 * One frame, one set of primitives, five composed previews — so every mockup on
 * the site shares the same visual language:
 *   OrderMockup · CrmProfileMockup · WhatsAppContextMockup · CampaignMockup · InsightMockup
 */

import type { ReactNode } from "react";
import {
  SparklesIcon,
  UsersIcon,
  RepeatIcon,
  StarIcon,
  MegaphoneIcon,
  CartRefreshIcon,
  WhatsAppIcon,
  CheckIcon,
} from "./icons";

/* ── Depth token ──────────────────────────────────────────────────────────────
 * One layered shadow so every framed mockup reads with the same premium depth. */
export const MOCKUP_SHADOW =
  "shadow-[0_2px_4px_rgba(15,23,42,0.04),0_18px_40px_-20px_rgba(15,23,42,0.25)]";

/* ── Primitives ─────────────────────────────────────────────────────────────── */

/** App/window chrome frame. The single container used by every product preview. */
export function AppFrame({
  label,
  children,
  className = "",
  tone = "light",
}: {
  label: string;
  children: ReactNode;
  className?: string;
  tone?: "light" | "whatsapp";
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-gray-200/80 bg-white ring-1 ring-gray-900/[0.03] ${MOCKUP_SHADOW} ${className}`}
    >
      <div
        className={`flex items-center gap-2 border-b px-4 py-2.5 ${
          tone === "whatsapp"
            ? "border-transparent bg-[#075E54] text-white"
            : "border-gray-100 bg-gray-50/70"
        }`}
      >
        {tone === "whatsapp" ? (
          <>
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20">
              <WhatsAppIcon className="h-3.5 w-3.5" />
            </span>
            <span className="text-xs font-semibold">{label}</span>
          </>
        ) : (
          <>
            <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
            <span className="h-2.5 w-2.5 rounded-full bg-gray-200" />
            <span className="ml-1.5 truncate text-[11px] font-medium text-gray-400">{label}</span>
          </>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

/** Neutral skeleton line — stands in for content with no fabricated text/numbers. */
export function Bar({ w = "w-20", className = "" }: { w?: string; className?: string }) {
  return <span className={`block h-2 rounded-full bg-gray-200 ${w} ${className}`} />;
}

type Tone = "neutral" | "brand" | "success" | "amber" | "sky" | "rose";

const TONE_TILE: Record<Tone, string> = {
  neutral: "bg-gray-100 text-gray-500",
  brand: "bg-brand-50 text-brand-600",
  success: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  sky: "bg-sky-50 text-sky-600",
  rose: "bg-rose-50 text-rose-600",
};

const TONE_TAG: Record<Tone, string> = {
  neutral: "bg-gray-100 text-gray-600",
  brand: "bg-brand-50 text-brand-700",
  success: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  sky: "bg-sky-50 text-sky-700",
  rose: "bg-rose-50 text-rose-700",
};

/** Rounded icon container. */
export function IconTile({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONE_TILE[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/** Pill tag. */
export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE_TAG[tone]}`}
    >
      {children}
    </span>
  );
}

/** Labeled list row — icon + title + optional trailing node. */
export function MockRow({
  icon,
  title,
  trailing,
  tone = "neutral",
  highlight = false,
}: {
  icon?: ReactNode;
  title: string;
  trailing?: ReactNode;
  tone?: Tone;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-2.5 ${
        highlight ? "border-brand-200 bg-brand-50/60" : "border-gray-100 bg-white"
      }`}
    >
      {icon && <IconTile tone={highlight ? "brand" : tone}>{icon}</IconTile>}
      <span
        className={`flex-1 truncate text-[13px] font-medium ${
          highlight ? "text-brand-700" : "text-gray-700"
        }`}
      >
        {title}
      </span>
      {trailing}
    </div>
  );
}

/** Tiny section caption inside a mockup. */
function Caption({ children }: { children: ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{children}</p>
  );
}

/* ── Composed previews (the five canonical mockups) ──────────────────────────── */

/** Mobile order screen — "Pedido guiado". */
export function OrderMockup({ className = "" }: { className?: string }) {
  return (
    <AppFrame label="Foocci · pedido guiado" className={`mx-auto max-w-sm ${className}`}>
      <div className="space-y-2.5">
        {["Prato principal", "Acompanhamento"].map((label) => (
          <MockRow
            key={label}
            icon={<span className="h-4 w-4 rounded bg-gray-300" />}
            title={label}
            trailing={<Bar w="w-8" />}
          />
        ))}
        <MockRow
          icon={<SparklesIcon className="h-4 w-4" />}
          title="Sugestão inteligente"
          highlight
          trailing={<Tag tone="brand">+ bebida</Tag>}
        />
      </div>
      <div className="mt-3.5 flex items-center justify-between border-t border-gray-100 pt-3.5">
        <span className="inline-flex items-center gap-2 text-xs font-medium text-gray-500">
          <IconTile tone="neutral" className="h-7 w-7">
            <UsersIcon className="h-3.5 w-3.5" />
          </IconTile>
          Cliente identificado
        </span>
        <span className="rounded-full bg-[#0B0B0B] px-2.5 py-1 text-[11px] font-semibold text-white">
          Histórico salvo
        </span>
      </div>
    </AppFrame>
  );
}

/** CRM customer profile — "Cliente identificado" + segments. */
export function CrmProfileMockup({ className = "" }: { className?: string }) {
  const segments: { icon: ReactNode; label: string; tone: Tone }[] = [
    { icon: <RepeatIcon className="h-4 w-4" />, label: "Cliente recorrente", tone: "success" },
    { icon: <StarIcon className="h-4 w-4" />, label: "Cliente VIP", tone: "brand" },
    { icon: <CartRefreshIcon className="h-4 w-4" />, label: "Oportunidade recuperada", tone: "amber" },
  ];
  return (
    <AppFrame label="Foocci · CRM" className={`mx-auto max-w-sm ${className}`}>
      <div className="flex items-center gap-3">
        <IconTile tone="brand" className="h-11 w-11">
          <UsersIcon className="h-5 w-5" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0B0B0B]">Cliente identificado</p>
          <div className="mt-1.5 flex items-center gap-1.5">
            <Bar w="w-16" />
            <Bar w="w-10" />
          </div>
        </div>
        <Tag tone="success">Recorrente</Tag>
      </div>
      <div className="mt-3.5 space-y-2">
        <Caption>Segmentos</Caption>
        {segments.map((s) => (
          <MockRow key={s.label} icon={s.icon} title={s.label} tone={s.tone} trailing={<Bar w="w-10" />} />
        ))}
      </div>
    </AppFrame>
  );
}

/** WhatsApp context card — conversation + customer context. */
export function WhatsAppContextMockup({ className = "" }: { className?: string }) {
  return (
    <AppFrame label="Atendimento do restaurante" tone="whatsapp" className={`mx-auto max-w-sm ${className}`}>
      <div className="-mx-4 -mt-4 space-y-2.5 bg-[#ECE5DD] px-3 py-4">
        <Bubble side="in" w="w-44" />
        <Bubble side="out" w="w-52" />
        <Bubble side="out" w="w-36" />
      </div>
      <div className="mt-4 space-y-2">
        <Caption>Contexto do cliente</Caption>
        <MockRow
          icon={<UsersIcon className="h-4 w-4" />}
          title="Cliente identificado"
          tone="brand"
          trailing={<Tag tone="brand">Histórico salvo</Tag>}
        />
      </div>
    </AppFrame>
  );
}

/** Campaign / recovery card — "Campanha CRM" + "Oportunidade recuperada". */
export function CampaignMockup({ className = "" }: { className?: string }) {
  return (
    <AppFrame label="Foocci · campanhas" className={`mx-auto max-w-sm ${className}`}>
      <div className="flex items-center gap-3">
        <IconTile tone="brand" className="h-11 w-11">
          <MegaphoneIcon className="h-5 w-5" />
        </IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-[#0B0B0B]">Campanha CRM</p>
          <Bar w="w-24" className="mt-1.5" />
        </div>
        <Tag tone="brand">Ativa</Tag>
      </div>
      <div className="mt-3.5 space-y-2">
        <MockRow
          icon={<CartRefreshIcon className="h-4 w-4" />}
          title="Oportunidade recuperada"
          tone="amber"
          trailing={<CheckIcon className="h-4 w-4 text-emerald-500" />}
        />
        <MockRow
          icon={<RepeatIcon className="h-4 w-4" />}
          title="Cliente recorrente"
          tone="success"
          trailing={<Bar w="w-10" />}
        />
      </div>
    </AppFrame>
  );
}

/** Dashboard insight card — "Dados comerciais", neutral bars (no numbers). */
export function InsightMockup({ className = "" }: { className?: string }) {
  const bars = ["h-10", "h-16", "h-12", "h-20", "h-16", "h-24", "h-16"];
  return (
    <AppFrame label="Foocci · dados comerciais" className={`mx-auto max-w-sm ${className}`}>
      <div className="flex items-center justify-between">
        <Caption>Dados comerciais</Caption>
        <Tag tone="success">Tendência</Tag>
      </div>
      <div className="mt-4 flex h-28 items-end gap-2">
        {bars.map((h, i) => (
          <span
            key={i}
            className={`flex-1 rounded-t-md ${i === bars.length - 1 ? "bg-brand-400" : "bg-gray-200"} ${h}`}
          />
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {["Vendas", "Recorrência"].map((label) => (
          <div key={label} className="rounded-xl border border-gray-100 bg-gray-50/60 p-2.5">
            <p className="text-[11px] font-medium text-gray-500">{label}</p>
            <Bar w="w-12" className="mt-2 h-2.5" />
          </div>
        ))}
      </div>
    </AppFrame>
  );
}

function Bubble({ side, w }: { side: "in" | "out"; w: string }) {
  return (
    <div className={`flex ${side === "out" ? "justify-start" : "justify-end"}`}>
      <span
        className={`block h-7 ${w} rounded-2xl border border-black/5 ${
          side === "out" ? "rounded-tl-sm bg-white" : "rounded-tr-sm bg-[#DCF8C6]"
        }`}
      />
    </div>
  );
}
