"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";

// ─── External Test Panel ──────────────────────────────────────

function ExternalTestPanel({
  pedidoUrl,
  viewMode,
}: {
  pedidoUrl: string;
  viewMode:  "desktop" | "mobile";
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied]   = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !pedidoUrl) return;
    QRCode.toCanvas(canvasRef.current, pedidoUrl, {
      width:  180,
      margin: 2,
      color:  { dark: "#111827", light: "#ffffff" },
    }).catch(() => {});
  }, [pedidoUrl]);

  async function copy() {
    await navigator.clipboard.writeText(pedidoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-indigo-50 bg-indigo-50 px-4 py-3">
        <span className="text-base leading-none">🔗</span>
        <div>
          <p className="text-sm font-semibold text-indigo-900">Teste externo</p>
          <p className="text-[10px] text-indigo-500">
            Visão {viewMode === "mobile" ? "mobile" : "desktop"} · abre fora do painel
          </p>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* QR Code */}
        <div className="flex justify-center">
          <canvas
            ref={canvasRef}
            className="rounded-xl border border-gray-200"
          />
        </div>

        {/* URL */}
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Link direto
          </p>
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-600">
              {pedidoUrl}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={copy}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            {copied ? "✓ Copiado!" : "📋 Copiar link"}
          </button>
          <a
            href={pedidoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            ↗ Abrir no navegador
          </a>
        </div>

        {/* Hint */}
        <p className="text-[10px] text-gray-400 leading-relaxed text-center">
          📱 Escaneie o QR Code com um celular para testar a experiência do cliente sem estar logado no painel.
        </p>
      </div>
    </div>
  );
}

// ─── Main HUB ─────────────────────────────────────────────────

interface Props {
  restaurantName: string;
  restaurantSlug: string;
  pedidoUrl:      string;
}

export function TestAIHubClient({ restaurantName, restaurantSlug, pedidoUrl }: Props) {
  const [viewMode, setViewMode] = useState<"desktop" | "mobile">("desktop");
  const [iframeKey, setIframeKey] = useState(0);

  const restart = useCallback(() => setIframeKey((k) => k + 1), []);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-gray-50">

      {/* ── Top bar ──────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5 shadow-sm">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">Testar IA</p>
          <p className="text-[11px] text-gray-400 truncate">{restaurantName}</p>
        </div>

        {/* Desktop / Mobile toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => setViewMode("desktop")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              viewMode === "desktop"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Desktop
          </button>
          <button
            onClick={() => setViewMode("mobile")}
            className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
              viewMode === "mobile"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            Mobile
          </button>
        </div>

        {/* Restart */}
        <button
          onClick={restart}
          className="flex items-center gap-1.5 rounded-lg bg-orange-500 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors"
        >
          Iniciar teste
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Chat preview ───────────────────────────── */}
        <div className="flex flex-1 flex-col overflow-hidden">
          {viewMode === "desktop" ? (
            /* Desktop — iframe fills full area */
            <iframe
              key={`desktop-${iframeKey}`}
              src="/chat-sim"
              className="flex-1 w-full border-0"
              title="Simulação IA — Desktop"
            />
          ) : (
            /* Mobile — phone frame centered */
            <div className="flex flex-1 items-center justify-center bg-gray-200 p-6">
              <div
                className="flex flex-col overflow-hidden rounded-[2.5rem] shadow-2xl"
                style={{
                  width:  390,
                  height: 720,
                  border: "10px solid #1f2937",
                  background: "#1f2937",
                }}
              >
                {/* Fake status bar */}
                <div className="flex items-center justify-between bg-gray-800 px-5 py-1.5 text-[10px] font-medium text-white shrink-0">
                  <span>9:41</span>
                  <div className="flex items-center gap-1">
                    <span>▲</span>
                    <span>WiFi</span>
                    <span>🔋</span>
                  </div>
                </div>
                <iframe
                  key={`mobile-${iframeKey}`}
                  src="/chat-sim"
                  className="flex-1 w-full border-0 bg-white"
                  title="Simulação IA — Mobile"
                  style={{ borderRadius: "0 0 1.8rem 1.8rem" }}
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Right: External test panel ───────────────────── */}
        <div className="w-72 shrink-0 overflow-y-auto border-l border-gray-200 bg-white p-4 space-y-4">
          <ExternalTestPanel pedidoUrl={pedidoUrl} viewMode={viewMode} />

          {/* Pipeline note */}
          <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
            <p className="text-[10px] font-semibold text-gray-600 mb-1">Pipeline ativa</p>
            <p className="text-[10px] text-gray-500 leading-relaxed">
              <strong>AIOrderService</strong> via{" "}
              <code className="text-[9px]">PromptBuilderService</code> +{" "}
              <code className="text-[9px]">UpsellEngine</code> +{" "}
              <code className="text-[9px]">AI_TOOL_DEFINITIONS</code>
            </p>
            <p className="mt-1 text-[10px] text-gray-400">
              Nenhuma mensagem é enviada ao WhatsApp.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
