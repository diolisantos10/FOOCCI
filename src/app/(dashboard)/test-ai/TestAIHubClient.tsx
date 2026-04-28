"use client";

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { ChatSimClient } from "../chat-sim/ChatSimClient";

type Tab      = "manual" | "auto";
type ViewMode = "mobile" | "desktop";

// ─── QR + link panel ─────────────────────────────────────────────────────────

function QRPanel({ pedidoUrl }: { pedidoUrl: string }) {
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, pedidoUrl, {
      width:  160,
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
    <div className="flex h-full flex-col overflow-y-auto border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-indigo-50 bg-indigo-50 px-4 py-3">
        <p className="text-xs font-bold text-indigo-900">Link público / QR</p>
        <p className="mt-0.5 text-[10px] text-indigo-500">Página real de pedido do cliente</p>
      </div>

      <div className="flex flex-col items-center gap-4 p-4">
        {/* QR */}
        <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-gray-100">
          <canvas ref={canvasRef} className="block rounded-lg" />
        </div>

        {/* URL */}
        <input
          readOnly
          value={pedidoUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 font-mono text-[10px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-300"
        />

        {/* Buttons */}
        <div className="flex w-full flex-col gap-2">
          <a
            href={pedidoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors"
          >
            ↗ Abrir no navegador
          </a>
          <button
            onClick={copy}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {copied ? "✓ Copiado!" : "📋 Copiar link"}
          </button>
        </div>

        <p className="text-center text-[10px] leading-relaxed text-gray-400">
          📱 Escaneie o QR Code com um celular para testar sem estar logado.
        </p>
      </div>
    </div>
  );
}

// ─── Main HUB ────────────────────────────────────────────────────────────────

interface Props {
  restaurantName: string;
  restaurantSlug: string;
  pedidoUrl:      string;
}

export function TestAIHubClient({ restaurantName, restaurantSlug, pedidoUrl }: Props) {
  const [tab,      setTab]      = useState<Tab>("manual");
  const [viewMode, setViewMode] = useState<ViewMode>("desktop");

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-gray-50">

      {/* ── Tab bar ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-0 border-b border-gray-200 bg-white px-4">
        {/* Tabs */}
        <button
          onClick={() => setTab("manual")}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            tab === "manual"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Teste Manual
        </button>
        <button
          onClick={() => setTab("auto")}
          className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
            tab === "auto"
              ? "border-orange-500 text-orange-600"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Teste Automático
        </button>

        {/* View toggle — only in Manual tab */}
        {tab === "manual" && (
          <div className="ml-auto flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 p-0.5">
            <button
              onClick={() => setViewMode("desktop")}
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                viewMode === "desktop"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              🖥 Desktop
            </button>
            <button
              onClick={() => setViewMode("mobile")}
              className={`rounded-md px-3 py-1 text-[11px] font-medium transition-colors ${
                viewMode === "mobile"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-400 hover:text-gray-600"
              }`}
            >
              📱 Mobile
            </button>
          </div>
        )}
      </div>

      {/* ── Teste Manual ─────────────────────────────────────────────────── */}
      {tab === "manual" && (
        <div className="flex flex-1 overflow-hidden">

          {/* Chat area */}
          {viewMode === "desktop" ? (

            /* Desktop — chat fills available space */
            <div className="flex-1 overflow-hidden">
              <ChatSimClient
                restaurantName={restaurantName}
                restaurantSlug={restaurantSlug}
                pedidoUrl={pedidoUrl}
              />
            </div>

          ) : (

            /* Mobile — phone frame centered */
            <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-200 py-6">
              <div
                className="flex shrink-0 flex-col overflow-hidden shadow-2xl"
                style={{
                  width:        390,
                  height:       720,
                  borderRadius: "2.5rem",
                  border:       "10px solid #111827",
                  background:   "#111827",
                }}
              >
                {/* Status bar */}
                <div className="flex shrink-0 items-center justify-between bg-gray-900 px-5 py-1.5 text-[10px] font-semibold text-white">
                  <span>9:41</span>
                  <div className="flex items-center gap-1.5">
                    <span>▲▲▲</span>
                    <span>WiFi</span>
                    <span>🔋</span>
                  </div>
                </div>

                {/* Chat — fills remaining height inside frame */}
                <div className="flex-1 overflow-hidden bg-white" style={{ borderRadius: "0 0 1.8rem 1.8rem" }}>
                  <ChatSimClient
                    restaurantName={restaurantName}
                    restaurantSlug={restaurantSlug}
                    pedidoUrl={pedidoUrl}
                  />
                </div>
              </div>
            </div>

          )}

          {/* Right panel — QR + links */}
          <div className="w-64 shrink-0">
            <QRPanel pedidoUrl={pedidoUrl} />
          </div>

        </div>
      )}

      {/* ── Teste Automático ─────────────────────────────────────────────── */}
      {tab === "auto" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <div className="text-4xl">🔬</div>
          <p className="text-sm font-semibold text-gray-700">Simulador IA Automático</p>
          <p className="max-w-sm text-xs text-gray-400 leading-relaxed">
            O Simulador IA executa cenários automáticos com clientes sintéticos,
            métricas de conversão e relatórios de upsell.
          </p>
          <a
            href="/ai-simulator"
            className="mt-2 rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-orange-600 transition-colors"
          >
            Abrir Simulador IA →
          </a>
        </div>
      )}

    </div>
  );
}
