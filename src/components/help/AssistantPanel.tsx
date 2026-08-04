"use client";

/**
 * AssistantPanel — o que aparece assim que o lojista toca na barra do topo:
 * ações rápidas, sugestões da TELA em que ele está e a trilha de primeiros passos.
 *
 * No desktop desce como um painel ancorado embaixo da barra; no celular sobe como
 * folha, com a lista rolável e o campo de escrita ao alcance do polegar (quem
 * monta a moldura é o AssistantBar).
 */

import { useState } from "react";
import {
  ONBOARDING_STEPS,
  QUICK_ACTIONS,
  SUGGESTIONS,
  type ContextGuide,
  type QuickAction,
} from "./assistantCatalog";

interface Props {
  guide: ContextGuide | null;
  doneSteps: Set<string>;
  onToggleStep: (id: string) => void;
  onAsk: (question: string) => void;
  onQuickAction: (action: QuickAction) => void;
  trailOpen: boolean;
  onTrailToggle: (open: boolean) => void;
  unreadCount: number;
  onOpenAvisos: () => void;
}

export default function AssistantPanel({
  guide,
  doneSteps,
  onToggleStep,
  onAsk,
  onQuickAction,
  trailOpen,
  onTrailToggle,
  unreadCount,
  onOpenAvisos,
}: Props) {
  const contextual = [
    ...(guide ? [guide.question] : []),
    ...(guide?.also ?? []),
    ...SUGGESTIONS.filter((s) => s !== guide?.question),
  ].slice(0, 4);

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      {/* ── Ações rápidas ─────────────────────────────────────────────── */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-muted">
          Ações rápidas
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => onQuickAction(a)}
              className="flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2.5 text-left text-[12.5px] font-semibold text-ink2 transition-colors hover:border-brand-200 hover:bg-brand-50 hover:text-brand-700"
            >
              <span className="shrink-0 text-[15px] leading-none" aria-hidden>
                {a.icon}
              </span>
              <span className="min-w-0 leading-snug">{a.label}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ── Sugestões da tela ─────────────────────────────────────────── */}
      <section>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.06em] text-muted">
          {guide ? `Nesta tela · ${guide.label}` : "Dúvidas mais comuns"}
        </p>
        <ul className="flex flex-col gap-1">
          {contextual.map((q, i) => (
            <li key={q}>
              <button
                type="button"
                onClick={() => onAsk(q)}
                className={`flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] transition-colors ${
                  i === 0 && guide
                    ? "bg-brand-50 font-semibold text-brand-700 hover:bg-brand-100"
                    : "text-ink2 hover:bg-[#F4F4F2] hover:text-ink"
                }`}
              >
                <span className="shrink-0 text-[13px] leading-none text-muted" aria-hidden>
                  {i === 0 && guide ? "📍" : "›"}
                </span>
                <span className="min-w-0 flex-1">{q}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {/* ── Trilha de primeiros passos ────────────────────────────────── */}
      <Trail
        open={trailOpen}
        onOpenChange={onTrailToggle}
        done={doneSteps}
        onToggle={onToggleStep}
        onAsk={onAsk}
      />

      {/* ── Rodapé ────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
        <button
          type="button"
          onClick={onOpenAvisos}
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-ink2 transition-colors hover:text-brand-600"
        >
          🔔 Avisos da operação
          {unreadCount > 0 && (
            <span className="inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-500 px-1 text-[10px] font-semibold leading-none text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        <span className="text-right text-[11px] leading-snug text-muted">
          Sempre aprendendo — pode errar.
        </span>
      </div>
    </div>
  );
}

// ── Trilha ────────────────────────────────────────────────────────────────────

function Trail({
  open,
  onOpenChange,
  done,
  onToggle,
  onAsk,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  done: Set<string>;
  onToggle: (id: string) => void;
  onAsk: (question: string) => void;
}) {
  const total = ONBOARDING_STEPS.length;
  const completed = ONBOARDING_STEPS.filter((s) => done.has(s.id)).length;
  const pct = Math.round((completed / total) * 100);

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-paper">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-3.5 py-3 text-left"
      >
        <span className="text-[15px] leading-none" aria-hidden>
          🚀
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-semibold text-ink">Primeiros passos</span>
          <span className="mt-1 flex items-center gap-2">
            <span className="h-1 w-24 overflow-hidden rounded-full bg-line">
              <span
                className={`block h-full rounded-full ${completed === total ? "bg-green-500" : "bg-brand-500"}`}
                style={{ width: `${pct}%` }}
              />
            </span>
            <span className="text-[11.5px] text-muted">
              {completed} de {total}
            </span>
          </span>
        </span>
        <span className="shrink-0 text-[11px] text-muted" aria-hidden>
          {open ? "▲" : "▼"}
        </span>
      </button>

      {open && (
        <ul className="border-t border-line">
          {ONBOARDING_STEPS.map((s) => {
            const isDone = done.has(s.id);
            return (
              <li
                key={s.id}
                className="flex items-center gap-2.5 border-b border-line/60 px-3.5 py-2 last:border-b-0"
              >
                <button
                  type="button"
                  onClick={() => onToggle(s.id)}
                  aria-label={isDone ? "Desmarcar etapa" : "Marcar etapa como feita"}
                  className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border text-[10px] font-semibold transition-colors ${
                    isDone
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-line2 bg-canvas text-transparent hover:border-brand-400"
                  }`}
                >
                  ✓
                </button>
                <span
                  className={`min-w-0 flex-1 text-[12.5px] leading-snug ${
                    isDone ? "text-muted line-through" : "text-ink2"
                  }`}
                >
                  {s.label}
                </span>
                <button
                  type="button"
                  onClick={() => onAsk(s.question)}
                  className="shrink-0 rounded-lg px-2 py-1 text-[11.5px] font-semibold text-brand-600 transition-colors hover:bg-brand-50"
                >
                  como?
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
