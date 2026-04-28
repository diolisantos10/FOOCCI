"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { ChatSimClient } from "../chat-sim/ChatSimClient";

type ViewMode = "mobile" | "desktop";

function ExternalTestCard({ pedidoUrl }: { pedidoUrl: string }) {
  const canvasRef           = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, pedidoUrl, {
      width: 180, margin: 2,
      color: { dark: "#111827", light: "#ffffff" },
    }).catch(() => {});
  }, [pedidoUrl]);

  async function copy() {
    await navigator.clipboard.writeText(pedidoUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-bold text-gray-800">Teste externo</p>
        <p className="mt-0.5 text-[11px] text-gray-400">Página real de pedido do cliente</p>
      </div>
      <div className="flex flex-col items-center gap-4 p-4">
        <canvas ref={canvasRef} className="block rounded-xl border border-gray-100" />
        <input
          readOnly
          value={pedidoUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-[10px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-300"
        />
        <div className="flex w-full flex-col gap-2">
          <button
            onClick={copy}
            className="w-full rounded-xl bg-orange-500 py-2 text-sm font-semibold text-white hover:bg-orange-600 transition-colors"
          >
            {copied ? "✓ Copiado!" : "Copiar link"}
          </button>
          <a
            href={pedidoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-xl border border-gray-200 py-2 text-center text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
          >
            Abrir em nova aba
          </a>
        </div>
      </div>
    </div>
  );
}

interface Props {
  restaurantName: string;
  restaurantSlug: string;
  pedidoUrl:      string;
}

export function TestAIHubClient({ restaurantName, restaurantSlug, pedidoUrl }: Props) {
  const [viewMode,  setViewMode]  = useState<ViewMode>("mobile");
  const [sessionKey, setSessionKey] = useState(0);

  const newSession = useCallback(() => setSessionKey((k) => k + 1), []);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-gray-100">

      {/* ── Top bar ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-4 border-b border-gray-200 bg-white px-5 py-2.5 shadow-sm">
        {/* View toggle */}
        <div className="flex overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          <button
            onClick={() => setViewMode("mobile")}
            className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
              viewMode === "mobile"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            📱 Mobile
          </button>
          <button
            onClick={() => setViewMode("desktop")}
            className={`px-4 py-1.5 text-sm font-semibold transition-colors ${
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
          className="ml-auto rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-bold text-white shadow-sm hover:bg-orange-600 transition-colors"
        >
          Nova sessão
        </button>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-4 overflow-hidden p-4">

        {/* LEFT — chat (70%) */}
        <div className="flex flex-1 overflow-hidden">
          {viewMode === "desktop" ? (
            <div className="flex-1 overflow-hidden rounded-2xl border border-gray-200 shadow-sm">
              <ChatSimClient
                key={sessionKey}
                restaurantName={restaurantName}
                restaurantSlug={restaurantSlug}
                pedidoUrl={pedidoUrl}
              />
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center overflow-auto">
              <div
                className="flex shrink-0 flex-col overflow-hidden shadow-2xl"
                style={{
                  width: 390, height: 680,
                  borderRadius: "2.8rem",
                  border: "10px solid #111827",
                  background: "#111827",
                }}
              >
                {/* Status bar */}
                <div className="flex shrink-0 items-center justify-between bg-gray-900 px-5 py-1.5 text-[10px] font-semibold text-white">
                  <span>9:41</span>
                  <span>●●● WiFi 🔋</span>
                </div>
                {/* Chat */}
                <div className="flex-1 overflow-hidden bg-white" style={{ borderRadius: "0 0 2.1rem 2.1rem" }}>
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

        {/* RIGHT — external test card (30%) */}
        <div className="w-72 shrink-0 overflow-y-auto">
          <ExternalTestCard pedidoUrl={pedidoUrl} />
        </div>

      </div>
    </div>
  );
}
