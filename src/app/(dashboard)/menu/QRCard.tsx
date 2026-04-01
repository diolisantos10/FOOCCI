"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";

export function QRCard({ url, slug }: { url: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (open && canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, { width: 200, margin: 2 });
    }
  }, [open, url]);

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
    a.download = `qr-${slug}.png`;
    a.click();
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-5 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Cardápio QR</span>
          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-medium text-orange-600">
            /qr/{slug}
          </span>
        </div>
        <span className="text-xs text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="flex flex-col items-start gap-6 border-t border-gray-100 px-5 py-4 sm:flex-row">
          <canvas
            ref={canvasRef}
            className="rounded-lg border border-gray-200"
          />

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <div>
              <p className="mb-1 text-xs font-medium text-gray-500">Link público</p>
              <input
                readOnly
                value={url}
                onFocus={(e) => e.target.select()}
                className="w-full rounded border border-gray-200 bg-gray-50 px-3 py-1.5 font-mono text-sm text-gray-700 focus:outline-none"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={copyLink}
                className="rounded bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
              >
                {copied ? "Copiado!" : "Copiar link"}
              </button>
              <button
                onClick={downloadQR}
                className="rounded bg-orange-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-orange-600"
              >
                Baixar QR
              </button>
              <a
                href={`/qr/${slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Visualizar →
              </a>
            </div>
            <p className="text-[11px] text-gray-400">
              Cardápio público, somente leitura. Itens com &quot;Salão&quot; ativo aparecem aqui.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
