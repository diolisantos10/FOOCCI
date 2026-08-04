"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

export function AdminSidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  // Mobile: o menu vira drawer. Sem isso o aside fixo de 208px deixava ~167px
  // úteis num celular de 375px e TODA página do admin estourava na horizontal.
  const [open, setOpen] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } catch { /* ignore */ }
    router.replace("/admin/login");
  }

  // Grupos com título. Nenhum link foi removido — apenas reorganizado.
  // Os itens de teste WhatsApp/labs ficam agrupados em TESTES por ora (faxina é outra fase).
  const navGroups: Array<{
    title: string;
    items: Array<{ href: string; label: string; icon: string }>;
  }> = [
    {
      title: "🧠 Inteligência",
      items: [
        { href: "/admin/agents",           label: "Agentes",         icon: "🤖" },
        { href: "/admin/agentes/training", label: "Treinamento IA",  icon: "🧠" },
        { href: "/admin/quality",          label: "Qualidade",       icon: "🛡️" },
        { href: "/admin/brain",            label: "Brain",           icon: "⚡" },
        { href: "/admin/brain/free-form",  label: "Escada do Brain", icon: "🪜" },
        { href: "/admin/agentes/crm",      label: "Agente de CRM",   icon: "🎚️" },
      ],
    },
    {
      title: "Operação",
      items: [
        { href: "/admin/leads",              label: "Contatos do site", icon: "📨" },
        { href: "/admin/agenda",             label: "Agenda de demos",  icon: "📅" },
        { href: "/admin/demo-videos",        label: "Vídeos do site",   icon: "🎬" },
        { href: "/admin/restaurants",        label: "Restaurantes", icon: "🏪" },
        { href: "/admin/preflight",          label: "Pré-piloto",   icon: "✅" },
        { href: "/admin/manual-operacional", label: "Manual",       icon: "📖" },
        { href: "/admin/support-inbox",      label: "Suporte",      icon: "💬" },
      ],
    },
    {
      title: "Crescimento",
      items: [
        { href: "/admin/branding-book", label: "Branding Book", icon: "🎨" },
      ],
    },
    {
      // Faxina: as telas de WhatsApp viraram ABAS da Central (barra no topo de
      // cada página) — a sidebar entra no hub (Cockpit) e o resto é aba. QA
      // Recovery é fluxo de negócio, fica separado.
      title: "Central WhatsApp",
      items: [
        { href: "/admin/agents/whatsapp",              label: "Central WhatsApp", icon: "🎛️" },
        { href: "/admin/diagnostics/cart-recovery-qa", label: "QA Recovery",      icon: "🧪" },
      ],
    },
    {
      title: "Sistema",
      items: [
        { href: "/admin/assinaturas",    label: "Assinaturas",       icon: "💳" },
        { href: "/admin/meta",           label: "Aplicativo Meta",   icon: "🔑" },
        { href: "/admin/site-analytics", label: "Analytics do site", icon: "📈" },
        { href: "/admin/build-os", label: "Build OS",        icon: "🛠️" },
      ],
    },
  ];

  return (
    <>
      {/* Top bar mobile — abre o drawer. Some no desktop (lg). */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-gray-800 bg-gray-900 px-3 lg:hidden">
        <button
          type="button"
          aria-label="Abrir menu"
          onClick={() => setOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:bg-gray-800"
        >
          ☰
        </button>
        <span className="text-sm font-bold tracking-tight text-white">Foocci</span>
        <span className="rounded-full bg-violet-900/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-300">
          admin
        </span>
      </div>

      {/* Backdrop do drawer (só mobile, só aberto) */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-52 shrink-0 flex-col border-r border-gray-800 bg-gray-900 transition-transform lg:static lg:z-auto lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
      {/* Brand */}
      <div className="flex h-14 items-center gap-2 border-b border-gray-800 px-4">
        <span className="text-base font-bold tracking-tight text-white">Foocci</span>
        <span className="rounded-full bg-violet-900/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-violet-300">
          admin
        </span>
        <button
          type="button"
          aria-label="Fechar menu"
          onClick={() => setOpen(false)}
          className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-800 lg:hidden"
        >
          ✕
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navGroups.map((group, gi) => (
          <div key={group.title} className={gi > 0 ? "mt-4" : undefined}>
            <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest text-gray-500">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                        active
                          ? "bg-violet-900/50 text-violet-200"
                          : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                      }`}
                    >
                      <span className="text-[15px] leading-none">{item.icon}</span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-800 px-3 py-3">
        <p className="text-[11px] text-gray-500 mb-2 px-1">Admin Foocci</p>
        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-gray-500 hover:bg-gray-800 hover:text-gray-300 transition-colors disabled:opacity-50"
        >
          <span className="text-[13px]">↩</span>
          {loggingOut ? "Saindo…" : "Sair"}
        </button>
      </div>
      </aside>
    </>
  );
}
