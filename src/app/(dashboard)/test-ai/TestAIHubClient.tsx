"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { ChatSimClient } from "../chat-sim/ChatSimClient";

type ViewMode = "mobile" | "desktop";

interface Props {
  restaurantName: string;
  restaurantSlug: string;
  pedidoUrl:      string;
}

// ─── Right panel cards ────────────────────────────────────────────────────────

function ExternalTestCard({ pedidoUrl }: { pedidoUrl: string }) {
  const canvasRef           = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, pedidoUrl, {
      width: 180, margin: 2,
      color: { dark: "#0f172a", light: "#ffffff" },
    }).catch(() => {});
  }, [pedidoUrl]);

  async function copy() {
    await navigator.clipboard.writeText(pedidoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-bold text-gray-900">Teste externo</p>
      </div>
      <div className="flex flex-col items-center gap-4 p-4">
        <canvas ref={canvasRef} className="block rounded-xl border border-gray-100 shadow-sm" />
        <input
          readOnly
          value={pedidoUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-[10px] text-gray-500 focus:outline-none focus:ring-1 focus:ring-orange-300"
        />
        <div className="flex w-full flex-col gap-2">
          <button
            onClick={copy}
            className="w-full rounded-xl bg-orange-500 py-2 text-sm font-bold text-white transition-colors hover:bg-orange-600"
          >
            {copied ? "✓ Copiado!" : "📋 Copiar link"}
          </button>
          <a
            href={pedidoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl border border-gray-200 py-2 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            ↗ Abrir em nova aba
          </a>
        </div>
        <p className="text-center text-[10px] leading-relaxed text-gray-400">
          Escaneie o QR Code para testar a experiência real do cliente
        </p>
      </div>
    </div>
  );
}

function AIStatusCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-bold text-gray-900">Status da IA</p>
      </div>
      <div className="space-y-3 p-4">
        <div>
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Pipeline ativa
          </p>
          <div className="space-y-1">
            {["AIOrderService", "PromptBuilderService", "UpsellEngine"].map((name) => (
              <div key={name} className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                <span className="font-mono text-[11px] text-gray-700">{name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2">
          <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
          <span className="text-[11px] font-medium text-gray-600">
            Rodando — sem WhatsApp
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function TestAIHubClient({ restaurantName, restaurantSlug, pedidoUrl }: Props) {
  const [viewMode,    setViewMode]    = useState<ViewMode>("mobile");
  const [sessionKey,  setSessionKey]  = useState(0);

  const newSession = useCallback(() => setSessionKey((k) => k + 1), []);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-gray-100">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        {/* Title */}
        <p className="text-sm font-bold text-gray-900">Testar IA</p>

        {/* View toggle — center */}
        <div className="mx-auto flex overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => setViewMode("mobile")}
            className={`rounded-md px-4 py-1 text-sm font-semibold transition-colors ${
              viewMode === "mobile"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            📱 Mobile
          </button>
          <button
            onClick={() => setViewMode("desktop")}
            className={`rounded-md px-4 py-1 text-sm font-semibold transition-colors ${
              viewMode === "desktop"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            🖥 Desktop
          </button>
        </div>

        {/* Nova sessão */}
        <button
          onClick={newSession}
          className="rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-600"
        >
          Nova sessão
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-4 overflow-hidden p-4">

        {/* LEFT — chat preview */}
        <div className="flex flex-1 overflow-hidden">
          {viewMode === "desktop" ? (

            /* Desktop — max-width 900px centered */
            <div className="mx-auto flex w-full max-w-[900px] overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
              <ChatSimClient
                key={sessionKey}
                restaurantName={restaurantName}
                restaurantSlug={restaurantSlug}
                pedidoUrl={pedidoUrl}
              />
            </div>

          ) : (

            /* Mobile — phone frame centered */
            <div className="flex flex-1 items-center justify-center overflow-auto">
              <div
                className="flex shrink-0 flex-col overflow-hidden shadow-2xl"
                style={{
                  width:        390,
                  height:       700,
                  borderRadius: "2.5rem",
                  border:       "10px solid #0f172a",
                  background:   "#0f172a",
                }}
              >
                {/* Status bar */}
                <div className="flex shrink-0 items-center justify-between bg-slate-900 px-5 py-1.5 text-[10px] font-semibold text-white">
                  <span>9:41</span>
                  <span className="text-white/60">●●● WiFi 🔋</span>
                </div>
                {/* Chat */}
                <div
                  className="flex-1 overflow-hidden"
                  style={{ borderRadius: "0 0 1.8rem 1.8rem", background: "#fff" }}
                >
                  <ChatSimClient
                    key={sessionKey}
                    restaurantName={restaurantName}
                    restaurantSlug={restaurantSlug}
                    pedidoUrl={pedidoUrl}
                  />
                </div>
              </div>
            </div>

          )}
        </div>

        {/* RIGHT — side cards */}
        <div className="flex w-64 shrink-0 flex-col gap-4 overflow-y-auto">
          <ExternalTestCard pedidoUrl={pedidoUrl} />
          <AIStatusCard />
        </div>

      </div>
    </div>
  );
}
