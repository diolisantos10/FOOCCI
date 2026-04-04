"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { apiFetch, PageCard, SectionHeading } from "../_shared";

type EvolutionStatus = "connected" | "disconnected" | "loading";

function StatusBadge({ status }: { status: EvolutionStatus }) {
  if (status === "loading")
    return <span className="text-xs text-gray-400">Verificando…</span>;
  if (status === "connected")
    return (
      <span className="flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700">
        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
        Conectado
      </span>
    );
  return (
    <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-500">
      <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
      Não configurado
    </span>
  );
}

function ComingSoonCard({
  icon,
  name,
  desc,
}: {
  icon: string;
  name: string;
  desc: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-gray-100 px-4 py-4 opacity-60">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-xl">
        {icon}
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-gray-700">{name}</p>
        <p className="text-xs text-gray-400">{desc}</p>
      </div>
      <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400">
        Em breve
      </span>
    </div>
  );
}

export default function IntegrationsPage() {
  const [waStatus, setWaStatus] = useState<EvolutionStatus>("loading");
  const [instanceName, setInstanceName] = useState<string | null>(null);

  useEffect(() => {
    apiFetch("/api/evolution/status").then(({ ok, data }) => {
      if (ok && data?.connected) {
        setWaStatus("connected");
        setInstanceName(data?.instanceName ?? null);
      } else {
        setWaStatus("disconnected");
      }
    });
  }, []);

  return (
    <div className="space-y-5">

      {/* WhatsApp */}
      <PageCard>
        <SectionHeading
          title="WhatsApp"
          subtitle="Conecte sua conta do WhatsApp Business via Evolution API."
        />

        <div className="flex items-center gap-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-green-500 text-2xl text-white shadow-sm">
            💬
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-gray-900">Evolution API</p>
              <StatusBadge status={waStatus} />
            </div>
            {instanceName && (
              <p className="mt-0.5 text-xs text-gray-500">
                Instância: <span className="font-medium">{instanceName}</span>
              </p>
            )}
            {waStatus === "disconnected" && (
              <p className="mt-0.5 text-xs text-gray-400">
                Configure as credenciais para conectar o WhatsApp.
              </p>
            )}
          </div>
          <Link
            href="/settings/ai"
            className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition"
          >
            Configurar →
          </Link>
        </div>
      </PageCard>

      {/* Payment providers */}
      <PageCard>
        <SectionHeading
          title="Provedores de pagamento"
          subtitle="Aceite pagamentos online e acompanhe transações diretamente no painel."
        />
        <div className="space-y-3">
          <ComingSoonCard
            icon="💳"
            name="Stone"
            desc="Links de pagamento, recebimento via PIX e cartão"
          />
          <ComingSoonCard
            icon="🔵"
            name="Mercado Pago"
            desc="Checkout, links e cobranças recorrentes"
          />
          <ComingSoonCard
            icon="🟠"
            name="PicPay"
            desc="Pagamentos via QR code e link"
          />
        </div>
      </PageCard>

      {/* Other placeholders */}
      <PageCard>
        <SectionHeading
          title="Outros"
          subtitle="Conectores que chegam em breve."
        />
        <div className="space-y-3">
          <ComingSoonCard
            icon="🍔"
            name="iFood"
            desc="Sincronização de cardápio e pedidos do iFood"
          />
          <ComingSoonCard
            icon="📊"
            name="Google Analytics"
            desc="Rastreamento de conversões no cardápio web"
          />
        </div>
      </PageCard>
    </div>
  );
}
