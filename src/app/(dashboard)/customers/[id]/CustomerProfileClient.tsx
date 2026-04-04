"use client";

import { useState } from "react";
import Link from "next/link";

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  totalOrders: number;
  totalSpend: number;
  lastOrderAt: string | null;
  createdAt: string;
  isActive: boolean;
}

// ─── Tab config ───────────────────────────────────────────────────────────────

type Tab = "overview" | "history" | "interactions" | "actions";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "overview",      label: "Visão Geral"      },
  { id: "history",       label: "Histórico"        },
  { id: "interactions",  label: "Interações"       },
  { id: "actions",       label: "Ações"            },
];

// ─── Placeholder block ────────────────────────────────────────────────────────

function Placeholder({
  label,
  height = "h-32",
}: {
  label: string;
  height?: string;
}) {
  return (
    <div
      className={`${height} flex items-center justify-center rounded-xl border-2 border-dashed border-gray-200 bg-white`}
    >
      <span className="text-sm font-medium text-gray-300">{label}</span>
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ─── Header section ───────────────────────────────────────────────────────────

function HeaderSection({ name, phone, email, isActive, createdAt }: Pick<Props, "name" | "phone" | "email" | "isActive" | "createdAt">) {
  return (
    <div className="border-b border-gray-200 bg-white px-6 py-5">
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/customers" className="hover:text-gray-600 transition-colors">
          Clientes
        </Link>
        <span>/</span>
        <span className="font-medium text-gray-700">{name}</span>
        {!isActive && (
          <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            Inativo
          </span>
        )}
      </div>

      {/* Identity row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          {/* Avatar placeholder */}
          <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white text-xl font-bold shadow-md">
            {name.charAt(0).toUpperCase()}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{name}</h1>
              {/* CRM tier badge — placeholder */}
              <span className="rounded-full border border-dashed border-gray-300 px-2.5 py-0.5 text-xs font-medium text-gray-300">
                Classificação CRM
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-sm text-gray-400">
              <span>{phone}</span>
              {email && <><span>·</span><span>{email}</span></>}
              <span>·</span>
              <span>
                desde{" "}
                {new Date(createdAt).toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row — placeholders */}
      <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          "Total pedidos",
          "Total gasto",
          "Ticket médio",
          "Último pedido",
          "Frequência",
        ].map((label) => (
          <div key={label} className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-300">
              {label}
            </p>
            <p className="mt-1 h-5 w-16 rounded bg-gray-100" />
          </div>
        ))}
      </div>

      {/* Tier progress — placeholder */}
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-xs text-gray-300">
          <span>Progresso para próximo nível</span>
          <span>—%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
          <div className="h-full w-1/3 rounded-full bg-gray-200" />
        </div>
      </div>
    </div>
  );
}

// ─── Tab nav ──────────────────────────────────────────────────────────────────

function TabNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <div className="border-b border-gray-200 bg-white px-6">
      <div className="flex">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
              active === t.id
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab() {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      {/* Left column — 2/3 */}
      <div className="lg:col-span-2 space-y-5">
        <Section title="Classificação CRM">
          <Placeholder label="Bronze / Silver / Gold / Diamond — em breve" height="h-24" />
        </Section>

        <Section title="Perfil de Comportamento">
          <Placeholder
            label="Horário preferido · Dias favoritos · Categorias · Pagamento"
            height="h-40"
          />
        </Section>

        <Section title="IA — Insights">
          <Placeholder
            label="Padrões de compra · Upsell · Risco de churn · Melhor horário para contato"
            height="h-48"
          />
        </Section>
      </div>

      {/* Right column — 1/3 */}
      <div className="space-y-5">
        <Section title="Tags">
          <Placeholder label="Alto valor · Frequente · Em risco · Preço sensível" height="h-20" />
        </Section>

        <Section title="Preferências">
          <Placeholder label="Restrições · Alergias · Prato favorito" height="h-24" />
        </Section>

        <Section title="Endereços">
          <Placeholder label="Endereços cadastrados" height="h-28" />
        </Section>
      </div>
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab() {
  return (
    <div className="space-y-5">
      <Section title="Histórico de Pedidos">
        <Placeholder
          label="Timeline de pedidos com valores e padrões de frequência"
          height="h-96"
        />
      </Section>
    </div>
  );
}

// ─── Interactions tab ─────────────────────────────────────────────────────────

function InteractionsTab() {
  return (
    <div className="space-y-5">
      <Section title="Histórico de Interações">
        <Placeholder
          label="Timeline unificada: WhatsApp · Pedidos · Cancelamentos · Reclamações"
          height="h-96"
        />
      </Section>
    </div>
  );
}

// ─── Actions tab ──────────────────────────────────────────────────────────────

function ActionsTab() {
  return (
    <div className="space-y-5">
      <Section title="Central de Ações">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { label: "Enviar mensagem",   desc: "Inicie uma conversa via WhatsApp"              },
            { label: "Criar campanha",    desc: "Adicione a uma campanha de marketing"          },
            { label: "Oferecer desconto", desc: "Envie um cupom ou promoção exclusiva"         },
            { label: "Reativar cliente",  desc: "Envie uma oferta de reativação personalizada" },
          ].map((a) => (
            <div
              key={a.label}
              className="flex items-center justify-between rounded-xl border-2 border-dashed border-gray-200 bg-white p-4"
            >
              <div>
                <p className="font-semibold text-gray-300">{a.label}</p>
                <p className="text-xs text-gray-200 mt-0.5">{a.desc}</p>
              </div>
              <div className="h-9 w-20 rounded-lg bg-gray-100" />
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ─── Root ─────────────────────────────────────────────────────────────────────

export default function CustomerProfileClient({
  name,
  phone,
  email,
  isActive,
  createdAt,
}: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <HeaderSection
        name={name}
        phone={phone}
        email={email}
        isActive={isActive}
        createdAt={createdAt}
      />

      {/* Tab navigation */}
      <TabNav active={activeTab} onChange={setActiveTab} />

      {/* Tab content */}
      <div className="p-6">
        {activeTab === "overview"     && <OverviewTab />}
        {activeTab === "history"      && <HistoryTab />}
        {activeTab === "interactions" && <InteractionsTab />}
        {activeTab === "actions"      && <ActionsTab />}
      </div>
    </div>
  );
}
