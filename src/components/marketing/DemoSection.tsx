"use client";

/**
 * Product preview with tabs. Client component (tab state).
 *
 * Premium CSS mockups only — no real screenshots and no fake/specific data
 * (skeleton bars stand in for content).
 */

import { useState } from "react";

const TABS = ["Pedido", "WhatsApp", "CRM", "Campanhas", "Dados"] as const;
type Tab = (typeof TABS)[number];

export function DemoSection() {
  const [tab, setTab] = useState<Tab>("Pedido");

  return (
    <section id="produto" className="scroll-mt-20 bg-gray-50 py-20">
      <div className="mx-auto max-w-5xl px-5 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Veja a Foocci trabalhando no dia a dia do restaurante.
          </h2>
        </div>

        {/* Tabs */}
        <div className="mt-10 flex flex-wrap justify-center gap-2">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              aria-pressed={tab === t}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                tab === t
                  ? "bg-brand-500 text-white shadow-sm"
                  : "border border-gray-200 bg-white text-gray-600 hover:border-gray-300"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Preview surface */}
        <div className="mt-8 rounded-3xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="rounded-2xl bg-gray-50 p-4 sm:p-6">
            <Preview tab={tab} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Preview({ tab }: { tab: Tab }) {
  switch (tab) {
    case "Pedido":
      return (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Row key={i} />
          ))}
          <div className="flex items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3">
            <div className="h-8 w-8 rounded-lg bg-brand-100" />
            <div className="h-2.5 w-40 rounded-full bg-brand-200" />
          </div>
        </div>
      );
    case "WhatsApp":
      return (
        <div className="space-y-3">
          <Bubble side="in" w="w-44" />
          <Bubble side="out" w="w-52" />
          <Bubble side="out" w="w-36" />
          <Bubble side="in" w="w-28" />
        </div>
      );
    case "CRM":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3">
              <div className="h-9 w-9 rounded-full bg-gray-200" />
              <div className="flex-1">
                <div className="h-2.5 w-24 rounded-full bg-gray-300" />
                <div className="mt-2 h-2 w-16 rounded-full bg-gray-200" />
              </div>
            </div>
          ))}
        </div>
      );
    case "Campanhas":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-xl border border-gray-100 bg-white p-4">
              <div className="h-8 w-8 rounded-lg bg-brand-100" />
              <div className="mt-3 h-2.5 w-20 rounded-full bg-gray-300" />
              <div className="mt-2 h-2 w-28 rounded-full bg-gray-200" />
            </div>
          ))}
        </div>
      );
    case "Dados":
      return (
        <div className="flex h-40 items-end gap-3">
          {["h-16", "h-24", "h-20", "h-32", "h-28", "h-36", "h-24"].map((h, i) => (
            <div key={i} className={`flex-1 rounded-t-lg ${i === 5 ? "bg-brand-400" : "bg-gray-200"} ${h}`} />
          ))}
        </div>
      );
  }
}

function Row() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white p-3">
      <div className="h-10 w-10 rounded-lg bg-gray-200" />
      <div className="flex-1">
        <div className="h-2.5 w-28 rounded-full bg-gray-300" />
        <div className="mt-2 h-2 w-20 rounded-full bg-gray-200" />
      </div>
      <div className="h-2.5 w-10 rounded-full bg-gray-200" />
    </div>
  );
}

function Bubble({ side, w }: { side: "in" | "out"; w: string }) {
  return (
    <div className={`flex ${side === "out" ? "justify-start" : "justify-end"}`}>
      <div
        className={`h-8 ${w} rounded-2xl ${
          side === "out" ? "rounded-tl-sm bg-white" : "rounded-tr-sm bg-[#DCF8C6]"
        } border border-gray-100`}
      />
    </div>
  );
}
