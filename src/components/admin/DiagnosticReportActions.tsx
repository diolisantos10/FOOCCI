"use client";

import { useState, useCallback } from "react";
import { buildFilename } from "@/lib/admin/diagnosticReport";

interface Props {
  buildReport:    () => string;
  jsonData:       unknown;
  filenamePrefix: string;
  slug?:          string;
  ranAt?:         string;
  className?:     string;
}

function triggerDownload(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function DiagnosticReportActions({
  buildReport,
  jsonData,
  filenamePrefix,
  slug    = "report",
  ranAt,
  className,
}: Props) {
  const [copied, setCopied] = useState<"report" | null>(null);
  const ts = ranAt ?? new Date().toISOString();

  const copyReport = useCallback(async () => {
    const text = buildReport();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // clipboard blocked — fall back to download
      triggerDownload(text, buildFilename(filenamePrefix, slug, ts, "txt"), "text/plain");
    }
    setCopied("report");
    setTimeout(() => setCopied(null), 1500);
  }, [buildReport, filenamePrefix, slug, ts]);

  const downloadJson = useCallback(() => {
    const payload = typeof jsonData === "object" && jsonData !== null
      ? { exportedAt: new Date().toISOString(), ...(jsonData as object) }
      : { exportedAt: new Date().toISOString(), data: jsonData };
    triggerDownload(
      JSON.stringify(payload, null, 2),
      buildFilename(filenamePrefix, slug, ts, "json"),
      "application/json",
    );
  }, [jsonData, filenamePrefix, slug, ts]);

  const downloadTxt = useCallback(() => {
    triggerDownload(
      buildReport(),
      buildFilename(filenamePrefix, slug, ts, "txt"),
      "text/plain",
    );
  }, [buildReport, filenamePrefix, slug, ts]);

  const btn = "rounded-lg border border-gray-700 bg-gray-800 px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-gray-700 hover:text-white transition-colors";

  return (
    <div className={`flex flex-wrap gap-2 ${className ?? ""}`}>
      <button type="button" onClick={copyReport} className={btn}>
        {copied === "report" ? "✓ Copiado" : "Copiar relatório"}
      </button>
      <button type="button" onClick={downloadJson} className={btn}>
        Baixar JSON
      </button>
      <button type="button" onClick={downloadTxt} className={btn}>
        Baixar TXT
      </button>
    </div>
  );
}
