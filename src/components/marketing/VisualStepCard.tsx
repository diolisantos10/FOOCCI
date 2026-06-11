/**
 * VisualStepCard — a numbered step with icon, title, copy and an optional mini
 * visual (chips / bars). Server component, presentation only. Used on the
 * internal "como funciona" and "demonstração" flows.
 */

import type { ComponentType, ReactNode } from "react";

type Props = {
  index: number;
  icon: ComponentType<{ className?: string }>;
  title: string;
  copy: string;
  children?: ReactNode;
  className?: string;
};

export function VisualStepCard({ index, icon: Icon, title, copy, children, className = "" }: Props) {
  return (
    <div
      className={`relative flex h-full flex-col rounded-2xl border border-gray-200/80 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_16px_34px_-22px_rgba(15,23,42,0.22)] ring-1 ring-gray-900/[0.02] ${className}`}
    >
      <span aria-hidden className="absolute right-5 top-5 text-sm font-semibold tabular-nums text-gray-200">
        0{index}
      </span>
      <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
        <Icon className="h-5 w-5" />
      </span>
      <h3 className="mt-4 text-lg font-semibold text-[#0B0B0B]">{title}</h3>
      <p className="mt-1.5 text-base leading-relaxed text-gray-600">{copy}</p>
      {children && <div className="mt-5">{children}</div>}
    </div>
  );
}
