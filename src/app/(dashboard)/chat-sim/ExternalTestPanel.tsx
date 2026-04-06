"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

interface Props {
  slug: string | null;
  viewMode: "mobile" | "desktop";
}

export function ExternalTestPanel({ slug, viewMode }: Props) {
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Resolve origin client-side only (avoids SSR mismatch)
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const url = slug && origin ? `${origin}/pedido/${slug}` : null;

  // Render QR whenever URL changes
  useEffect(() => {
    if (!url || !canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, { width: 180, margin: 2 }).catch(() => {});
  }, [url]);

  async function copyLink() {
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Placeholder when slug not yet available
  if (!slug) {
    return (
      <div className="w-72 shrink-0 rounded-2xl border border-dashed border-gray-300 bg-white p-5 text-center self-start mt-8">
        <p className="text-2xl mb-2">🔗</p>
        <p className="text-sm font-semibold text-gray-500">Acesso externo indisponível</p>
        <p className="mt-1 text-xs text-gray-400">
          Configure um <strong>slug</strong> para o restaurante em Configurações → Loja para
          gerar o link de teste externo.
        </p>
      </div>
    );
  }

  return (
    <div className="w-72 shrink-0 self-start rounded-2xl border border-indigo-100 bg-white shadow-sm overflow-hidden">
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
          {url ? (
            <canvas
              ref={canvasRef}
              className="rounded-xl border border-gray-200"
            />
          ) : (
            <div className="h-[180px] w-[180px] rounded-xl border border-gray-200 bg-gray-50" />
          )}
        </div>

        {/* URL display */}
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">
            Link direto
          </p>
          <div className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-gray-600">
              {url ?? "—"}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={copyLink}
            disabled={!url}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-40 transition"
          >
            {copied ? "✓ Copiado!" : "📋 Copiar link"}
          </button>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              ↗ Abrir em nova aba
            </a>
          )}
        </div>

        {/* Hint */}
        <p className="text-[10px] text-gray-400 leading-relaxed">
          Escaneie o QR Code com um celular para testar a experiência do cliente sem estar logado no painel.
        </p>
      </div>
    </div>
  );
}
