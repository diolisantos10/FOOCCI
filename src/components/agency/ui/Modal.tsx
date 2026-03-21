"use client";

import { ReactNode, useEffect } from "react";
import { X } from "lucide-react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  maxWidth?: string;
}

export function Modal({ open, onClose, title, subtitle, children, maxWidth = "520px" }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const handle = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handle);
    return () => document.removeEventListener("keydown", handle);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(10,10,10,0.35)", backdropFilter: "blur(2px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative w-full overflow-hidden rounded-2xl border border-[#E5E5E2] bg-white"
        style={{ maxWidth, boxShadow: "0 12px 40px 0 rgba(0,0,0,0.14), 0 2px 8px 0 rgba(0,0,0,0.06)" }}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#F0F0EE] px-6 py-4">
          <div>
            <h2 className="text-[14px] font-semibold text-[#0A0A0A]" style={{ letterSpacing: "-0.01em" }}>
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[11px] text-[#A1A1AA]">{subtitle}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="flex h-6 w-6 flex-none items-center justify-center rounded-md text-[#A1A1AA] transition-colors hover:bg-[#F4F4F5] hover:text-[#52525B]"
          >
            <X size={13} strokeWidth={2} />
          </button>
        </div>

        {/* Body */}
        {children}
      </div>
    </div>
  );
}

// ─── Shared form field styles ─────────────────────────────────────────────────
export const FIELD_LABEL = "mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[#71717A]";
export const INPUT_CLS   = "w-full rounded-lg border border-[#E5E5E2] bg-[#FAFAF9] px-3 py-2.5 text-[13px] text-[#0A0A0A] outline-none transition-colors focus:border-[#5B5BD6] focus:bg-white placeholder-[#D0D0CC]";
export const SELECT_CLS  = "w-full rounded-lg border border-[#E5E5E2] bg-[#FAFAF9] px-3 py-2.5 text-[13px] text-[#0A0A0A] outline-none transition-colors focus:border-[#5B5BD6] focus:bg-white";
