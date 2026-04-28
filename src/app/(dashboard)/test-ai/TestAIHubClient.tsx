"use client";

import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";

interface Props {
  restaurantName: string;
  restaurantSlug: string;
  pedidoUrl:      string;
}

export function TestAIHubClient({ restaurantName, pedidoUrl }: Props) {
  const canvasRef   = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!canvasRef.current || !pedidoUrl) return;
    QRCode.toCanvas(canvasRef.current, pedidoUrl, {
      width:  200,
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
    <div className="flex h-[calc(100vh-56px)] flex-col overflow-hidden bg-gray-50">

      {/* ── Top bar ───────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <div>
          <p className="text-sm font-bold text-gray-900">Testar IA</p>
          <p className="text-[11px] text-gray-400">{restaurantName}</p>
        </div>
        <a
          href="/chat-sim"
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 transition-colors"
        >
          ▶ Nova sessão de teste
        </a>
      </div>

      {/* ── Body ─────────────────────────────────────────────── */}
      <div className="flex flex-1 gap-6 overflow-y-auto px-6 py-6">

        {/* ── Left column ─────────────────────────────────── */}
        <div className="flex flex-1 flex-col gap-6">

          {/* DESKTOP TEST */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 flex items-center gap-2">
              <span className="text-base">🖥️</span>
              <div>
                <p className="text-sm font-bold text-gray-800">Teste — Desktop</p>
                <p className="text-[11px] text-gray-400">Abre o agente em uma nova aba do navegador</p>
              </div>
            </div>
            <div className="px-5 py-5 flex items-center justify-between gap-4">
              <p className="text-sm text-gray-500 max-w-md">
                Clique no botão para abrir a interface de teste do agente IA. A sessão inicia automaticamente e simula uma conversa real pelo WhatsApp — sem enviar mensagens.
              </p>
              <a
                href="/chat-sim"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 flex items-center gap-2 rounded-xl bg-orange-500 px-5 py-2.5 text-sm font-bold text-white shadow hover:bg-orange-600 transition-colors"
              >
                ↗ Abrir teste no navegador
              </a>
            </div>
          </div>

          {/* MOBILE TEST */}
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50 px-5 py-3 flex items-center gap-2">
              <span className="text-base">📱</span>
              <div>
                <p className="text-sm font-bold text-gray-800">Teste — Celular</p>
                <p className="text-[11px] text-gray-400">Escaneie o QR Code para abrir no celular</p>
              </div>
            </div>
            <div className="px-5 py-5 flex items-center gap-8">
              {/* Phone mockup */}
              <div
                className="shrink-0 flex flex-col items-center justify-center rounded-[2rem] shadow-xl"
                style={{
                  width: 160,
                  height: 280,
                  border: "8px solid #1f2937",
                  background: "#1f2937",
                }}
              >
                <div className="w-full bg-gray-800 py-1 text-center text-[9px] text-white font-medium rounded-t-[1.4rem]">
                  9:41
                </div>
                <div className="flex-1 w-full bg-gray-50 flex flex-col items-center justify-center gap-2 p-3">
                  <div className="h-7 w-7 rounded-full bg-orange-100 flex items-center justify-center text-base">🍕</div>
                  <p className="text-[9px] font-semibold text-gray-700 text-center">{restaurantName}</p>
                  <div className="w-full space-y-1.5 mt-1">
                    <div className="rounded-xl bg-white border border-gray-200 px-2 py-1 text-[8px] text-gray-500 shadow-sm">Olá! O que deseja pedir?</div>
                    <div className="rounded-xl bg-orange-500 px-2 py-1 text-[8px] text-white text-right shadow-sm">Quero 1 pizza!</div>
                  </div>
                </div>
                <div className="w-full bg-gray-800 py-1 text-center text-[9px] text-white rounded-b-[1.4rem]">
                  ●
                </div>
              </div>

              <div className="flex flex-col gap-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  Escaneie o QR Code com o celular para abrir a <strong>página de pedido real do cliente</strong>.
                  <br /><br />
                  Para testar o agente WhatsApp no celular, abra o link da página de pedido no navegador mobile.
                </p>
                <a
                  href={pedidoUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors w-fit"
                >
                  ↗ Abrir no celular
                </a>
              </div>
            </div>
          </div>

          {/* Pipeline info */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm px-5 py-4">
            <p className="text-xs font-bold text-gray-700 mb-1">Pipeline ativa</p>
            <p className="text-[11px] text-gray-500 leading-relaxed">
              O teste usa <strong>AIOrderService</strong> via{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">PromptBuilderService</code> +{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">UpsellEngine</code> +{" "}
              <code className="rounded bg-gray-100 px-1 py-0.5 text-[10px]">AI_TOOL_DEFINITIONS</code> — exatamente a mesma pipeline de produção.
              Nenhuma mensagem é enviada ao WhatsApp.
            </p>
          </div>
        </div>

        {/* ── Right column: QR + links ─────────────────────── */}
        <div className="w-72 shrink-0 flex flex-col gap-4">

          <div className="rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center gap-2 border-b border-indigo-50 bg-indigo-50 px-4 py-3">
              <span className="text-base">🔗</span>
              <div>
                <p className="text-sm font-semibold text-indigo-900">Link público / QR</p>
                <p className="text-[10px] text-indigo-500">Página real de pedido do cliente</p>
              </div>
            </div>

            <div className="p-4 flex flex-col items-center gap-4">
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
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 font-mono text-[10px] text-gray-600 focus:outline-none focus:ring-1 focus:ring-orange-300"
                />
              </div>

              {/* Buttons */}
              <div className="w-full flex flex-col gap-2">
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

              <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                📱 Escaneie o QR Code com um celular para testar a experiência do cliente sem estar logado no painel.
              </p>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
