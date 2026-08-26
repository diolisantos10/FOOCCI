"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

/**
 * O que cada papel alcança no menu.
 *
 * ── POR QUE O MENU FILTRA, SE O SERVIDOR JÁ NEGA ──
 *
 * Não é segurança: a fechadura está em cada rota, e ela nega mesmo com o menu
 * aberto. É honestidade de controle.
 *
 * Abrindo a Sala de Vendas num navegador de verdade, o SDR humano via a barra
 * lateral inteira — Departamentos, Agentes, Qualidade, Brain, Restaurantes. Vinte
 * portas que batem na cara dele com 403. Um menu assim não é neutro: ensina que
 * o sistema é imprevisível, e a pessoa passa a não confiar no que ela PODE
 * clicar.
 *
 * `null` = vê tudo. Os papéis com escopo veem só o que existe para eles.
 */
const MENU_POR_PAPEL: Readonly<Record<string, readonly string[] | null>> = {
  MASTER_CEO: null,
  DIRETOR_FOOCCI: null,
  // O gerente vê a estrutura e a área de trabalho do time dele. O resto do
  // Admin continua fora — crescer dentro do departamento, não para os lados.
  GERENTE_DEPARTAMENTO: ["/admin/departamentos", "/comercial", "/admin/foocci-crm"],
  // Critério 6 do CEO: a Sala de Vendas e nada mais.
  AGENTE_HUMANO: ["/comercial"],
  AUDITOR_QA: ["/admin/departamentos", "/comercial", "/admin/quality"],
};

/** O nome de cada papel em português de gente. */
const NOME_DO_PAPEL: Readonly<Record<string, string>> = {
  MASTER_CEO: "CEO",
  DIRETOR_FOOCCI: "Diretor",
  GERENTE_DEPARTAMENTO: "Gerente comercial",
  AGENTE_HUMANO: "Vendedor (SDR)",
  AUDITOR_QA: "Auditoria",
};

/** Quem pode espiar o menu dos outros. Não é permissão — é conferência. */
const PODE_ESPIAR = new Set(["MASTER_CEO", "DIRETOR_FOOCCI"]);

export function AdminSidebar({ papel }: { papel?: string | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  // Mobile: o menu vira drawer. Sem isso o aside fixo de 208px deixava ~167px
  // úteis num celular de 375px e TODA página do admin estourava na horizontal.
  const [open, setOpen] = useState(false);

  /**
   * ── VER COMO ────────────────────────────────────────────────────────────
   *
   * O CEO abriu o Admin e viu o menu inteiro — e concluiu, com razão, que ele
   * é escancarado para todo mundo. Não é: o filtro por papel existe e funciona.
   * O que ele não conseguia era VER isso, porque entrou pela senha
   * compartilhada, que não carrega papel nenhum e por desenho mostra tudo.
   *
   * Um controle que só o dono enxerga não vale nada se ele não puder conferir.
   * Este seletor troca o menu para o de qualquer papel, na hora, sem sair.
   *
   * ⚠️ **Ele muda o que se VÊ, nunca o que se PODE.** As rotas continuam
   * negando pela sessão de verdade — espiar o menu do vendedor não dá ao CEO
   * menos poder, e espiar o do CEO não daria mais a ninguém. Se um dia isto
   * virar autorização, vira escalada de privilégio com cara de conveniência.
   */
  const [espiando, setEspiando] = useState<string | null>(null);

  async function handleLogout() {
    setLoggingOut(true);
    try {
      await fetch("/api/admin/session", { method: "DELETE" });
    } catch { /* ignore */ }
    router.replace("/admin/login");
  }

  const podeEspiar = !papel || PODE_ESPIAR.has(papel);
  // Espiar só vale para quem pode; papel efetivo cai no real em qualquer outro
  // caso, para que um `setEspiando` acidental nunca amplie o que alguém vê.
  const papelDoMenu = podeEspiar && espiando ? espiando : papel;
  const permitidos = papelDoMenu ? MENU_POR_PAPEL[papelDoMenu] : null;

  // Grupos com título. Nenhum link foi removido — apenas reorganizado.
  // Os itens de teste WhatsApp/labs ficam agrupados em TESTES por ora (faxina é outra fase).
  const navGroups: Array<{
    title: string;
    items: Array<{ href: string; label: string; icon: string }>;
  }> = [
    {
      title: "🧠 Inteligência",
      items: [
        // Item PRÓPRIO, não dentro de Configurações — ordem do CEO (doutrina 20
        // do kit): "quem trabalha aqui?" é pergunta de primeira ordem.
        { href: "/admin/sala-dos-agentes",  label: "Sala dos Agentes", icon: "🏛️" },
        // A estrutura da empresa (v3): quem responde por quê. Item próprio pelo
        // mesmo motivo da Sala dos Agentes.
        { href: "/admin/departamentos",    label: "Departamentos",   icon: "🗂️" },
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
        // A Sala de Vendas vem ANTES do CRM: ela é a tela de trabalho do dia, e
        // o CRM é a base inteira. Quem entra para trabalhar procura a fila, não
        // a listagem.
        { href: "/comercial",                label: "Comercial",        icon: "🎯" },
        { href: "/admin/foocci-crm",         label: "CRM da Foocci",    icon: "📨" },
        { href: "/admin/demo-videos",        label: "Vídeos do site",   icon: "🎬" },
        { href: "/admin/padaria-vitrine",    label: "Padaria de vitrine", icon: "🥐" },
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
        { href: "/admin/credenciais",    label: "Credenciais",       icon: "🔒" },
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

      {/* ── VER COMO ─────────────────────────────────────────────────────────
          Só aparece para quem manda na casa. Muda o MENU; as rotas continuam
          negando pela sessão de verdade. */}
      {podeEspiar && (
        <div className="border-b border-gray-800 px-3 py-2.5">
          <label
            htmlFor="ver-como"
            className="mb-1 block text-[10px] font-semibold uppercase tracking-widest text-gray-500"
          >
            Ver o menu como
          </label>
          <select
            id="ver-como"
            value={espiando ?? ""}
            onChange={(e) => setEspiando(e.target.value || null)}
            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-2 py-1.5 text-[12.5px] text-gray-100"
          >
            <option value="">
              {papel ? `${NOME_DO_PAPEL[papel] ?? papel} (você)` : "Tudo (senha do admin)"}
            </option>
            {Object.entries(NOME_DO_PAPEL).map(([valor, nome]) => (
              <option key={valor} value={valor}>
                {nome}
              </option>
            ))}
          </select>

          {/* O LIMITE, ESCRITO COM ESSE NOME: isto troca a BARRA LATERAL. As
              abas de dentro de cada área (as da Sala de Vendas, por exemplo) são
              desenhadas no servidor, pela sessão de verdade, e não seguem o
              seletor. Deixar isso implícito faria alguém concluir que o vendedor
              enxerga o Painel — quando ele não enxerga. */}
          {espiando && (
            <p className="mt-1.5 rounded-lg bg-amber-900/40 px-2 py-1.5 text-[11px] leading-snug text-amber-200">
              Você está vendo o menu de <strong>{NOME_DO_PAPEL[espiando] ?? espiando}</strong>.
              É só esta barra — o que você pode fazer não mudou, e as abas de
              dentro de cada área continuam mostrando as suas.
            </p>
          )}
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        {navGroups
          // Grupo que ficou sem item nenhum some inteiro — um título de seção
          // sozinho é pior que a ausência dele.
          .map((g) => ({
            ...g,
            items: permitidos ? g.items.filter((i) => permitidos.includes(i.href)) : g.items,
          }))
          .filter((g) => g.items.length > 0)
          .map((group, gi) => (
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
