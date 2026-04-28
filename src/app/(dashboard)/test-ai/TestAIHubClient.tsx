"use client";

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { ChatSimClient } from "../chat-sim/ChatSimClient";

type Mode     = "humano" | "automatico";
type ViewMode = "mobile" | "desktop";

// ─── External test panel ──────────────────────────────────────────────────────

function ExternalTestPanel({
  pedidoUrl,
  viewMode,
}: {
  pedidoUrl: string;
  viewMode:  ViewMode;
}) {
  const canvasRef           = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
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
    <div className="flex h-full flex-col overflow-y-auto border-l border-gray-200 bg-white">
      {/* Header */}
      <div className="border-b border-indigo-50 bg-indigo-50 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm">🔗</span>
          <div>
            <p className="text-sm font-semibold text-indigo-900">Teste externo</p>
            <p className="text-[10px] text-indigo-500">
              Visão {viewMode === "mobile" ? "mobile" : "desktop"} · abre fora do painel
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center gap-4 p-4">
        {/* QR Code */}
        <div className="rounded-xl bg-white p-2 shadow-sm ring-1 ring-gray-100">
          <canvas ref={canvasRef} className="block rounded-lg" />
        </div>

        {/* URL */}
        <div className="w-full">
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Link direto
          </p>
          <input
            readOnly
            value={pedidoUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 font-mono text-[10px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </div>

        {/* Buttons */}
        <div className="flex w-full flex-col gap-2">
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
            ↗ Abrir em nova aba
          </a>
        </div>

        <p className="text-center text-[10px] leading-relaxed text-gray-400">
          Escaneie o QR Code com um celular para testar a experiência do cliente sem estar logado no painel.
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
  const [mode,     setMode]     = useState<Mode>("humano");
  const [viewMode, setViewMode] = useState<ViewMode>("mobile");

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-gray-100">

      {/* ── Control bar ──────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-6 border-b border-gray-200 bg-white px-5 py-2 shadow-sm">

        {/* MODO */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Modo
          </span>
          <div className="flex overflow-hidden rounded-full border border-gray-200 bg-gray-100">
            <button
              onClick={() => setMode("humano")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                mode === "humano"
                  ? "bg-green-500 text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              👤 Humano
            </button>
            <button
              onClick={() => setMode("automatico")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                mode === "automatico"
                  ? "bg-green-500 text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              🤖 Automático
            </button>
          </div>
        </div>

        {/* VISÃO */}
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
            Visão
          </span>
          <div className="flex overflow-hidden rounded-full border border-gray-200 bg-gray-100">
            <button
              onClick={() => setViewMode("mobile")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                viewMode === "mobile"
                  ? "bg-green-500 text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              📱 Mobile
            </button>
            <button
              onClick={() => setViewMode("desktop")}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                viewMode === "desktop"
                  ? "bg-green-500 text-white"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              🖥 Desktop
            </button>
          </div>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── MODO: Humano ─────────────────────────────────────────────── */}
        {mode === "humano" && (
          <>
            {/* Chat area */}
            {viewMode === "desktop" ? (

              /* Desktop — full width */
              <div className="flex-1 overflow-hidden">
                <ChatSimClient
                  restaurantName={restaurantName}
                  restaurantSlug={restaurantSlug}
                  pedidoUrl={pedidoUrl}
                />
              </div>

            ) : (

              /* Mobile — phone frame centered */
              <div className="flex flex-1 items-center justify-center overflow-auto bg-gray-200 py-4">
                <div
                  className="flex shrink-0 flex-col overflow-hidden shadow-2xl"
                  style={{
                    width:        390,
                    height:       700,
                    borderRadius: "2.8rem",
                    border:       "10px solid #111827",
                    background:   "#111827",
                  }}
                >
                  {/* Status bar */}
                  <div className="flex shrink-0 items-center justify-between bg-gray-900 px-5 py-1.5 text-[10px] font-semibold text-white">
                    <span>9:41</span>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span>▲▲▲</span>
                      <span>WiFi</span>
                      <span>🔋</span>
                    </div>
                  </div>

                  {/* Chat fills remaining frame */}
                  <div
                    className="flex-1 overflow-hidden bg-white"
                    style={{ borderRadius: "0 0 2rem 2rem" }}
                  >
                    <ChatSimClient
                      restaurantName={restaurantName}
                      restaurantSlug={restaurantSlug}
                      pedidoUrl={pedidoUrl}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Right — external test panel */}
            <div className="w-64 shrink-0">
              <ExternalTestPanel pedidoUrl={pedidoUrl} viewMode={viewMode} />
            </div>
          </>
        )}

        {/* ── MODO: Automático ────────────────────────────────────────── */}
        {mode === "automatico" && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <div className="text-5xl">🔬</div>
            <div>
              <p className="text-base font-bold text-gray-800">Simulador IA Automático</p>
              <p className="mt-1 max-w-sm text-xs leading-relaxed text-gray-400">
                Executa cenários com clientes sintéticos, mede conversão, upsell e
                comportamento do agente sem intervenção humana.
              </p>
            </div>
            <a
              href="/ai-simulator"
              className="rounded-xl bg-orange-500 px-6 py-2.5 text-sm font-bold text-white shadow hover:bg-orange-600 transition-colors"
            >
              Abrir Simulador IA →
            </a>
          </div>
        )}

      </div>
    </div>
  );
}
