"use client";

import { useRef, useEffect, useState } from "react";
import QRCode from "qrcode";

interface Props {
  restaurantName: string;
  restaurantSlug: string;
  pedidoUrl:      string;
}

const AI_PIPELINE = [
  "AIOrderService",
  "PromptBuilderService",
  "UpsellEngine",
  "AI_TOOL_DEFINITIONS",
] as const;

export function TestAIHubClient({ restaurantName, pedidoUrl }: Props) {
  const canvasRef           = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, pedidoUrl, {
      width: 220, margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).catch(() => {});
  }, [pedidoUrl]);

  async function copy() {
    await navigator.clipboard.writeText(pedidoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="flex h-[calc(100vh-var(--topbar))] flex-col items-center justify-center overflow-y-auto bg-[#FAFAF8] px-4 py-10">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-brand-600">
            Testar IA
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink">
            Experiência real do cliente
          </h1>
          <p className="mt-1 text-sm text-muted">{restaurantName}</p>
        </div>

        {/* Main card */}
        <div className="overflow-hidden rounded-2xl border border-line2 bg-paper shadow-sm">

          {/* QR code */}
          <div className="flex justify-center border-b border-line bg-[#FAFAF8] py-8">
            <div className="rounded-2xl bg-paper p-3 shadow-sm ring-1 ring-gray-100">
              <canvas ref={canvasRef} className="block rounded-xl" />
            </div>
          </div>

          <div className="space-y-4 p-5">
            {/* Description */}
            <p className="text-center text-sm text-muted leading-relaxed">
              Escaneie com o celular ou abra o link abaixo para testar a
              experiência completa — mobile, tablet ou desktop, sem simulação.
            </p>

            {/* Copyable URL */}
            <div className="flex items-center gap-2 rounded-xl border border-line2 bg-[#FAFAF8] px-3 py-2.5">
              <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-ink2">
                {pedidoUrl}
              </span>
              <button
                onClick={copy}
                className="shrink-0 rounded-lg bg-line2 px-2.5 py-1 text-[11px] font-semibold text-ink2 transition-colors hover:bg-line2 active:bg-muted"
              >
                {copied ? "✓" : "Copiar"}
              </button>
            </div>

            {/* Primary CTA */}
            <a
              href={pedidoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-500 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-brand-600 active:bg-brand-700"
            >
              🔗 Abrir experiência real
            </a>
          </div>
        </div>

        {/* Pipeline status */}
        <div className="overflow-hidden rounded-2xl border border-line2 bg-paper shadow-sm">
          <div className="border-b border-line px-4 py-3">
            <p className="text-xs font-bold text-ink2">Pipeline ativa</p>
          </div>
          <div className="space-y-2 p-4">
            {AI_PIPELINE.map((name) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  <span className="font-mono text-[11px] text-ink2">{name}</span>
                </div>
                <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-green-600">
                  ativo
                </span>
              </div>
            ))}
            <div className="mt-1 flex items-center gap-2 rounded-lg bg-[#FAFAF8] px-3 py-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
              <span className="text-[11px] font-medium text-ink2">
                Rodando — sem WhatsApp
              </span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
