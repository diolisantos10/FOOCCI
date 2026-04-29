"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import QRCode from "qrcode";
import { ChatSimClient } from "../chat-sim/ChatSimClient";
import { TestViewportWrapper, type ViewMode } from "./TestViewportWrapper";

const LS_KEY = "foocci_testViewMode";

interface Props {
  restaurantName: string;
  restaurantSlug: string;
  pedidoUrl:      string;
}

// ─── Right panel: external test card ─────────────────────────────────────────

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
        <p className="mt-0.5 text-[10px] text-gray-400">
          Acesse a experiência real do cliente
        </p>
      </div>

      <div className="flex flex-col items-center gap-4 p-4">
        {/* QR code */}
        <div className="rounded-xl border border-gray-100 bg-white p-2 shadow-sm">
          <canvas ref={canvasRef} className="block rounded-lg" />
        </div>

        {/* Read-only link */}
        <input
          readOnly
          value={pedidoUrl}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-[10px] text-gray-500 focus:outline-none focus:ring-1 focus:ring-orange-300"
        />

        {/* Action buttons */}
        <div className="flex w-full flex-col gap-2">
          <button
            onClick={copy}
            className="w-full rounded-xl bg-orange-500 py-2 text-sm font-bold text-white transition-colors hover:bg-orange-600 active:bg-orange-700"
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
          Escaneie com o celular para testar como cliente real
        </p>
      </div>
    </div>
  );
}

// ─── Right panel: AI status card ─────────────────────────────────────────────

const AI_PIPELINE = [
  "AIOrderService",
  "PromptBuilderService",
  "UpsellEngine",
  "AI_TOOL_DEFINITIONS",
] as const;

function AIStatusCard() {
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-100 px-4 py-3">
        <p className="text-sm font-bold text-gray-900">Status da IA</p>
      </div>
      <div className="space-y-3 p-4">
        {/* Pipeline components */}
        <div>
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Pipeline ativa
          </p>
          <div className="space-y-1.5">
            {AI_PIPELINE.map((name) => (
              <div key={name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-400" />
                  <span className="font-mono text-[11px] text-gray-700">{name}</span>
                </div>
                <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-green-600">
                  ativo
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Live indicator */}
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

// ─── Main hub ─────────────────────────────────────────────────────────────────

export function TestAIHubClient({ restaurantName, restaurantSlug, pedidoUrl }: Props) {
  const [viewMode,    setViewMode]    = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "mobile";
    const saved = localStorage.getItem(LS_KEY);
    return saved === "desktop" ? "desktop" : "mobile";
  });
  const [sessionKey,  setSessionKey]  = useState(0);
  const [toolsOpen,   setToolsOpen]   = useState(false);

  // Persist view mode preference
  useEffect(() => {
    localStorage.setItem(LS_KEY, viewMode);
  }, [viewMode]);

  const newSession = useCallback(() => setSessionKey((k) => k + 1), []);

  return (
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-gray-100">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-4 py-2.5 shadow-sm">

        {/* Page title */}
        <p className="hidden text-sm font-bold text-gray-900 sm:block">Testar IA</p>

        {/* View mode toggle — centered on desktop */}
        <div className="mx-auto flex overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-0.5">
          <button
            onClick={() => setViewMode("mobile")}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              viewMode === "mobile"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            📱 Mobile
          </button>
          <button
            onClick={() => setViewMode("desktop")}
            className={`flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-semibold transition-colors ${
              viewMode === "desktop"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-400 hover:text-gray-600"
            }`}
          >
            🖥 Desktop
          </button>
        </div>

        {/* Tools toggle — visible on small screens only */}
        <button
          onClick={() => setToolsOpen((v) => !v)}
          title="Ferramentas de teste"
          className={`rounded-lg border p-1.5 text-sm transition-colors lg:hidden ${
            toolsOpen
              ? "border-orange-200 bg-orange-50 text-orange-600"
              : "border-gray-200 text-gray-500 hover:bg-gray-50"
          }`}
        >
          🛠
        </button>

        {/* Nova sessão */}
        <button
          onClick={newSession}
          className="shrink-0 rounded-lg bg-orange-500 px-4 py-1.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-600 active:bg-orange-700"
        >
          Nova sessão
        </button>
      </div>

      {/* ── Body: 70 / 30 split ───────────────────────────────────────────────── */}
      <div className="relative flex flex-1 gap-4 overflow-hidden p-4">

        {/* LEFT — 70% — chat testing area */}
        <div className="flex min-w-0 flex-1 overflow-hidden">
          <TestViewportWrapper mode={viewMode}>
            <ChatSimClient
              key={sessionKey}
              restaurantName={restaurantName}
              restaurantSlug={restaurantSlug}
              pedidoUrl={pedidoUrl}
              embedded
            />
          </TestViewportWrapper>
        </div>

        {/* RIGHT — 30% — tools panel
            Hidden on small screens; revealed by the 🛠 toggle.
            On lg+ always visible as a sidebar.                     */}
        <aside
          className={`
            flex-col gap-4 overflow-y-auto
            lg:flex lg:w-[30%] lg:min-w-[260px] lg:max-w-[380px] lg:shrink-0
            ${toolsOpen
              ? "absolute inset-y-0 right-0 z-20 flex w-[280px] bg-gray-100 p-4 shadow-2xl"
              : "hidden"
            }
          `}
        >
          {/* Close button — only on small-screen overlay */}
          <button
            onClick={() => setToolsOpen(false)}
            className="ml-auto rounded-lg p-1.5 text-gray-400 hover:bg-gray-200 lg:hidden"
          >
            ✕
          </button>

          <ExternalTestCard pedidoUrl={pedidoUrl} />
          <AIStatusCard />
        </aside>

      </div>
    </div>
  );
}
