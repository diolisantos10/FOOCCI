"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export function QRCard({ url, slug }: { url: string; slug: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 180,
        margin: 2,
        color: { dark: "#111827", light: "#ffffff" },
      });
    }
  }, [url]);

  async function copyLink() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function downloadQR() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `cardapio-qr-${slug}.png`;
    a.click();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white shadow-sm">
      {/* Header strip */}
      <div className="flex items-center gap-3 border-b border-orange-100 bg-white px-5 py-3.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 text-white text-base">
          📲
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900">Cardápio Online</p>
          <p className="text-[11px] text-gray-400">Compartilhe com seus clientes</p>
        </div>
        <span className="ml-auto rounded-full bg-green-100 px-2.5 py-0.5 text-[11px] font-semibold text-green-700">
          Ativo
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-col items-center gap-5 px-5 py-6 sm:flex-row sm:items-start">
        {/* QR Code */}
        <div className="shrink-0 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-gray-100">
          <canvas ref={canvasRef} className="block rounded-xl" />
        </div>

        {/* Right side */}
        <div className="flex w-full flex-col gap-4">
          {/* Link input */}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              Link público
            </p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="min-w-0 flex-1 rounded-xl border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-700 focus:border-orange-300 focus:outline-none focus:ring-2 focus:ring-orange-100"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={copyLink}
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-700 shadow-sm transition-all hover:border-orange-200 hover:bg-orange-50 hover:text-orange-600 active:scale-95"
            >
              {copied ? "✓ Copiado!" : "📋 Copiar link"}
            </button>
            <button
              onClick={downloadQR}
              className="flex items-center gap-1.5 rounded-xl bg-orange-500 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all hover:bg-orange-600 active:scale-95"
            >
              ⬇ Baixar QR
            </button>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-600 shadow-sm transition-all hover:bg-gray-50 active:scale-95"
            >
              👁 Visualizar
            </a>
          </div>

          {/* Tip */}
          <p className="text-[11px] leading-relaxed text-gray-400">
            Imprima o QR code e cole nas mesas, embalagens ou stories. Qualquer alteração no cardápio aparece instantaneamente.
          </p>
        </div>
      </div>
    </div>
  );
}
