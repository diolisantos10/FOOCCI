"use client";

// Primitivos da referência Dioli — `Pill`, `Ring`, `Head`, `TabTitle` — portados
// com o MESMO DOM e as MESMAS classes de `app/page.tsx`. Não trocar por
// primitivo genérico do kit `@/components/ui`: esta superfície tem folha de
// estilo própria, e o kit do painel Foocci desenharia outra coisa.
//
// O que foi acrescentado — e só isto: os três estados obrigatórios da casa
// (carregando / vazio / erro) e o `Metric`, que desenha "—" quando não existe
// fonte de dado ligada, no MESMO slot e com a MESMA classe do número real.
// Guardrail 1: ausência de informação não é informação.

import type { Metric } from "@/lib/agencia/views";

export function Pill({ children, t = "" }: { children: React.ReactNode; t?: string }) {
  return (
    <span className={"pill " + t}>
      <i />
      {children}
    </span>
  );
}

export function Ring({ n }: { n: number | null }) {
  const pct = n ?? 0;
  return (
    <div className="ring" style={{ "--p": `${pct * 3.6}deg` } as React.CSSProperties}>
      <div>
        <b>{n === null ? "—" : n}</b>
        <small>/100</small>
      </div>
    </div>
  );
}

export function Head({ over, title, action, onAction }: {
  over: string;
  title: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="head">
      <div>
        <small>{over}</small>
        <h3>{title}</h3>
      </div>
      {action && <button type="button" onClick={onAction}>{action} →</button>}
    </div>
  );
}

export function TabTitle({ status, title, desc, children }: {
  status: string;
  title: string;
  desc: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="tabTitle">
      <div>
        <Pill>{status}</Pill>
        <h2>{title}</h2>
        <p>{desc}</p>
      </div>
      <div>{children}</div>
    </div>
  );
}

/** A faixa de KPIs. Cada célula é a mesma da referência; quando `value` é
 *  `null`, ela desenha o traço e a razão em vez de um número inventado. */
export function Kpis({ items, className = "" }: { items: Metric[]; className?: string }) {
  return (
    <div className={"kpis " + className}>
      {items.map((m) => (
        <div key={m.label}>
          <small>{m.label}</small>
          <b className={m.value === null ? "noData" : ""}>{m.value ?? "—"}</b>
          <span>{m.hint ?? "sem dado conectado"}</span>
        </div>
      ))}
    </div>
  );
}

/** Estado VAZIO — dentro de um card, sem quebrar a grade. */
export function EmptyBlock({ title, hint, action, onAction }: {
  title: string;
  hint: string;
  action?: string;
  onAction?: () => void;
}) {
  return (
    <div className="emptyBlock">
      <i>◇</i>
      <b>{title}</b>
      <small>{hint}</small>
      {action && <button type="button" onClick={onAction}>{action} →</button>}
    </div>
  );
}

/** Estado de ERRO — carrega a própria evidência (guardrail 6). */
export function ErrorBlock({ detail, onRetry }: { detail: string; onRetry?: () => void }) {
  return (
    <div className="errorBlock" role="alert">
      <i>!</i>
      <span>
        <b>Não foi possível carregar</b>
        <small>{detail}</small>
      </span>
      {onRetry && <button type="button" onClick={onRetry}>Tentar de novo →</button>}
    </div>
  );
}

/** Estado CARREGANDO — esqueleto com a altura do conteúdo real, para a página
 *  não pular quando o dado chega. */
export function LoadingBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="loadingBlock" aria-busy="true" aria-live="polite">
      <span className="srOnly">Carregando…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <i key={i} />
      ))}
    </div>
  );
}
