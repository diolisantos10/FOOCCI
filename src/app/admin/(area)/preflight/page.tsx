"use client";

import { useState, useCallback } from "react";

// ── Types (mirroring API response) ────────────────────────────────────────────

type CheckStatus = "PASS" | "WARNING" | "FAIL" | "NOT_TESTED";

interface CheckResult {
  key:      string;
  label:    string;
  status:   CheckStatus;
  message:  string;
  critical: boolean;
}

interface RestaurantSnapshot {
  id:               string;
  name:             string;
  slug:             string;
  isActive:         boolean;
  hasMenu:          boolean;
  hasDeliveryConfig: boolean;
  hasPaymentConfig: boolean;
  hasWhatsApp:      boolean;
  hasGoogleReview:  boolean;
  menuCategoryCount: number;
  menuItemCount:    number;
  customerCount:    number;
  orderCount:       number;
  deliveryUrl:      string;
  qrUrl:            string;
}

type Readiness = "NOT_STARTED" | "IN_PROGRESS" | "READY_WITH_WARNINGS" | "READY" | "BLOCKED";

interface PreflightReport {
  timestamp:    string;
  env:          CheckResult[];
  database:     CheckResult[];
  modules:      CheckResult[];
  restaurants:  RestaurantSnapshot[];
  counts: {
    restaurants: number;
    customers:   number;
    orders:      number;
    campaigns:   number;
  };
  readiness: Readiness;
}

// ── Manual checklist state ────────────────────────────────────────────────────

interface ManualItem { id: string; text: string; expected: string }

const MANUAL_SECTIONS: Array<{ title: string; icon: string; items: ManualItem[] }> = [
  {
    title: "Cardápio público (/pedido)",
    icon: "🍽️",
    items: [
      { id: "pedido_loads",       text: "Abrir /pedido/[slug]",              expected: "Cardápio carrega com categorias e itens visíveis" },
      { id: "pedido_identify",    text: "Informar telefone para identificação", expected: "Cliente identificado; nome aparece no topo" },
      { id: "pedido_add_cart",    text: "Adicionar produto ao carrinho",     expected: "Item aparece no carrinho com preço correto" },
      { id: "pedido_finalize",    text: "Finalizar pedido (pay_on_delivery)", expected: "Pedido confirmado; aparece no dashboard de pedidos" },
      { id: "pedido_customer_crm", text: "Cliente aparece no CRM",          expected: "Cliente criado/atualizado em /crm > Clientes" },
    ],
  },
  {
    title: "QR / Menu público (/qr)",
    icon: "📱",
    items: [
      { id: "qr_loads",          text: "Abrir /qr/[slug]",                  expected: "Menu QR carrega; faixa de categorias visível" },
      { id: "qr_review_btn",     text: "Botão de avaliação Google",         expected: "Aparece se googleReviewUrl configurado" },
      { id: "qr_social",         text: "Ícones sociais funcionam",          expected: "Links abrem corretamente" },
    ],
  },
  {
    title: "Pagamento",
    icon: "💳",
    items: [
      { id: "pay_delivery",      text: "Pagamento na entrega (pay_on_delivery)", expected: "Pedido confirmado sem redirecionar para gateway" },
      { id: "pay_pickup",        text: "Pagamento na retirada (pay_on_pickup)",  expected: "Pedido confirmado sem redirecionar para gateway" },
      { id: "pay_now_mp",        text: "MercadoPago sandbox (pay_now)",          expected: "Link de pagamento gerado; checkout abre" },
      { id: "pay_no_creds",      text: "pay_now sem credenciais configuradas",   expected: "Retorna 503 com mensagem clara; pedido não criado" },
    ],
  },
  {
    title: "WhatsApp & Chat Inbox",
    icon: "💬",
    items: [
      { id: "wa_receive",        text: "Enviar mensagem do WhatsApp de teste", expected: "Conversa aparece em /atendimento" },
      { id: "wa_receptionist",   text: "Recepcionista responde automaticamente", expected: "Mensagem de boas-vindas enviada" },
      { id: "wa_handoff",        text: "Humano assume conversa",              expected: "IA para de responder; status = HUMAN" },
      { id: "wa_unknown_inst",   text: "Webhook com instanceName desconhecido", expected: "console.warn registrado; sem erro 500" },
    ],
  },
  {
    title: "CRM — Campanhas",
    icon: "📢",
    items: [
      { id: "crm_campaign_create",  text: "Criar campanha para segmento FRIO",   expected: "Audiência calculada; mensagens personalizadas" },
      { id: "crm_optout_excluded",  text: "Cliente com hasOptedOut=true",        expected: "Excluído da audiência e da execução" },
      { id: "crm_send_no_wa",       text: "Enviar sem WhatsApp configurado",     expected: "Erro claro: WhatsApp não configurado" },
      { id: "crm_send_ok",          text: "Enviar com WhatsApp configurado",     expected: "Mensagens enviadas; execuções marcadas SENT" },
    ],
  },
  {
    title: "Importação de Histórico",
    icon: "📥",
    items: [
      { id: "import_preview",    text: "Upload de CSV com pedidos históricos",  expected: "Preview mostra contagens corretas" },
      { id: "import_execute",    text: "Executar importação",                   expected: "Pedidos e clientes criados; métricas atualizadas" },
      { id: "import_idempotent", text: "Reimportar mesmo arquivo",             expected: "Nenhum pedido duplicado (idempotencyKey)" },
      { id: "import_category",   text: "Itens sem coluna de categoria",        expected: "Categoria resolvida do MenuItem ou null; sem erro" },
    ],
  },
  {
    title: "Analytics",
    icon: "📊",
    items: [
      { id: "analytics_loads",   text: "Página /analytics carrega",             expected: "KPIs visíveis; sem erros no console" },
      { id: "analytics_imported", text: "Pedidos importados aparecem no período", expected: "KPIs incluem pedidos importados (importedAt)" },
      { id: "analytics_agent",   text: "Painel Gerente Comercial IA exibe",    expected: "Resumo e insights gerados corretamente" },
      { id: "analytics_attach",  text: "Taxas de attach calculadas",           expected: "Bebidas/Sobremesas mostram % correto" },
    ],
  },
  {
    title: "Isolamento de Tenant",
    icon: "🔒",
    items: [
      { id: "tenant_api",        text: "API com restaurantId de outro tenant", expected: "Retorna 401 ou dados vazios; sem vazamento" },
      { id: "tenant_admin_block", text: "URL /admin sem cookie admin",         expected: "Redireciona para /admin/login" },
      { id: "tenant_crm_block",  text: "URL /crm sem autenticação",           expected: "Redireciona para login" },
    ],
  },
  {
    title: "Setup de Restaurante (Admin)",
    icon: "🏪",
    items: [
      { id: "admin_create",      text: "Criar restaurante via /admin",         expected: "Restaurante + dono + padrões criados" },
      { id: "admin_login",       text: "Logar com credenciais do novo dono",   expected: "Acesso ao dashboard do restaurante" },
      { id: "admin_menu_create", text: "Criar categoria e produto",           expected: "Produto aparece no /pedido/[slug]" },
    ],
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusBadge(status: CheckStatus) {
  const map: Record<CheckStatus, string> = {
    PASS:       "bg-emerald-900/40 text-emerald-300 border border-emerald-800",
    WARNING:    "bg-amber-900/40  text-amber-300  border border-amber-800",
    FAIL:       "bg-red-900/40    text-red-300    border border-red-800",
    NOT_TESTED: "bg-gray-800      text-gray-400   border border-gray-700",
  };
  const labels: Record<CheckStatus, string> = {
    PASS: "PASS", WARNING: "ALERTA", FAIL: "FALHA", NOT_TESTED: "N/A",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${map[status]}`}>
      {labels[status]}
    </span>
  );
}

const READINESS_CONFIG: Record<Readiness, { label: string; color: string; icon: string }> = {
  NOT_STARTED:         { label: "Não iniciado",       color: "text-gray-400 bg-gray-800 border-gray-700", icon: "⏳" },
  IN_PROGRESS:         { label: "Em validação",        color: "text-blue-300 bg-blue-900/40 border-blue-800", icon: "🔄" },
  READY_WITH_WARNINGS: { label: "Pronto com alertas", color: "text-amber-300 bg-amber-900/40 border-amber-800", icon: "⚠️" },
  READY:               { label: "Pronto para piloto", color: "text-emerald-300 bg-emerald-900/40 border-emerald-800", icon: "✅" },
  BLOCKED:             { label: "Bloqueado",          color: "text-red-300 bg-red-900/40 border-red-800", icon: "🚫" },
};

// ── Components ────────────────────────────────────────────────────────────────

function CheckRow({ check }: { check: CheckResult }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-800 last:border-0">
      <div className="pt-0.5 shrink-0">{statusBadge(check.status)}</div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-gray-200">{check.label}</span>
          {check.critical && (
            <span className="text-[10px] font-bold uppercase text-red-500 tracking-wide">crítico</span>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{check.message}</p>
      </div>
    </div>
  );
}

function Section({ title, icon, checks }: { title: string; icon: string; checks: CheckResult[] }) {
  const hasFail    = checks.some((c) => c.status === "FAIL");
  const hasWarning = checks.some((c) => c.status === "WARNING");
  const allPass    = checks.every((c) => c.status === "PASS");

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className={`flex items-center gap-2 px-4 py-3 border-b border-gray-800 ${
        hasFail ? "bg-red-950/30" : hasWarning ? "bg-amber-950/30" : allPass ? "bg-emerald-950/20" : ""
      }`}>
        <span className="text-base">{icon}</span>
        <span className="font-semibold text-sm text-gray-100">{title}</span>
        <div className="ml-auto flex gap-1">
          {checks.map((c) => (
            <div key={c.key} className={`w-2 h-2 rounded-full ${
              c.status === "PASS" ? "bg-emerald-500" :
              c.status === "WARNING" ? "bg-amber-500" :
              c.status === "FAIL" ? "bg-red-500" :
              "bg-gray-600"
            }`} title={c.label} />
          ))}
        </div>
      </div>
      <div className="px-4 divide-y divide-gray-800">
        {checks.map((c) => <CheckRow key={c.key} check={c} />)}
      </div>
    </div>
  );
}

function ManualSection({
  section,
  checked,
  onToggle,
}: {
  section: typeof MANUAL_SECTIONS[0];
  checked: Set<string>;
  onToggle: (id: string) => void;
}) {
  const done = section.items.filter((i) => checked.has(i.id)).length;
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
        <span className="text-base">{section.icon}</span>
        <span className="font-semibold text-sm text-gray-100">{section.title}</span>
        <span className="ml-auto text-xs text-gray-500">{done}/{section.items.length}</span>
      </div>
      <div className="divide-y divide-gray-800">
        {section.items.map((item) => (
          <label key={item.id} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-gray-800/50 transition-colors">
            <input
              type="checkbox"
              checked={checked.has(item.id)}
              onChange={() => onToggle(item.id)}
              className="mt-0.5 h-4 w-4 accent-violet-500 rounded shrink-0"
            />
            <div>
              <p className={`text-sm ${checked.has(item.id) ? "line-through text-gray-500" : "text-gray-200"}`}>
                {item.text}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">Esperado: {item.expected}</p>
            </div>
          </label>
        ))}
      </div>
    </div>
  );
}

function RestaurantCard({ snap, appUrl }: { snap: RestaurantSnapshot; appUrl: string }) {
  const readyItems: { label: string; ok: boolean }[] = [
    { label: "Menu com produtos",      ok: snap.hasMenu },
    { label: "Config. de entrega",     ok: snap.hasDeliveryConfig },
    { label: "Config. de pagamento",   ok: snap.hasPaymentConfig },
    { label: "WhatsApp ativo",         ok: snap.hasWhatsApp },
    { label: "Link de avaliação",      ok: snap.hasGoogleReview },
  ];

  const score = readyItems.filter((r) => r.ok).length;
  const pct   = Math.round((score / readyItems.length) * 100);

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <p className="font-semibold text-gray-100 text-sm">{snap.name}</p>
          <p className="text-xs text-gray-500">/{snap.slug}</p>
        </div>
        <div className="text-right">
          <span className={`text-xs font-bold ${pct === 100 ? "text-emerald-400" : pct >= 60 ? "text-amber-400" : "text-red-400"}`}>
            {pct}% pronto
          </span>
          <div className="mt-1 h-1 w-20 rounded-full bg-gray-700 overflow-hidden">
            <div
              className={`h-full rounded-full ${pct === 100 ? "bg-emerald-500" : pct >= 60 ? "bg-amber-500" : "bg-red-500"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1 mb-3">
        {readyItems.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5 text-xs">
            <span className={r.ok ? "text-emerald-400" : "text-gray-600"}>
              {r.ok ? "✓" : "○"}
            </span>
            <span className={r.ok ? "text-gray-300" : "text-gray-600"}>{r.label}</span>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
        {[
          { label: "Categorias", val: snap.menuCategoryCount },
          { label: "Produtos",   val: snap.menuItemCount },
          { label: "Pedidos",    val: snap.orderCount },
        ].map((stat) => (
          <div key={stat.label} className="rounded-lg bg-gray-800 py-1.5">
            <p className="text-sm font-bold text-gray-100">{stat.val}</p>
            <p className="text-[10px] text-gray-500">{stat.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <a
          href={snap.deliveryUrl}
          target="_blank"
          rel="noreferrer"
          className="flex-1 text-center rounded-lg bg-gray-800 hover:bg-gray-700 py-1.5 text-xs text-gray-300 transition-colors"
        >
          /pedido
        </a>
        <a
          href={snap.qrUrl}
          target="_blank"
          rel="noreferrer"
          className="flex-1 text-center rounded-lg bg-gray-800 hover:bg-gray-700 py-1.5 text-xs text-gray-300 transition-colors"
        >
          /qr
        </a>
      </div>
    </div>
  );
}

// ── Copy report ───────────────────────────────────────────────────────────────

function buildTextReport(
  report: PreflightReport | null,
  checked: Set<string>,
  readiness: Readiness,
): string {
  const now = new Date().toISOString();
  const lines: string[] = [];

  lines.push("══════════════════════════════════");
  lines.push("FOOCCI — RELATÓRIO PRÉ-PILOTO");
  lines.push(`Data: ${now}`);
  lines.push("══════════════════════════════════");
  lines.push("");

  const rd = READINESS_CONFIG[readiness];
  lines.push(`STATUS: ${rd.icon} ${rd.label.toUpperCase()}`);
  lines.push("");

  if (report) {
    lines.push("── Ambiente ──────────────────────");
    for (const c of report.env) {
      lines.push(`[${c.status.padEnd(7)}] ${c.label}: ${c.message}`);
    }
    lines.push("");

    lines.push("── Banco de Dados ────────────────");
    for (const c of report.database) {
      lines.push(`[${c.status.padEnd(7)}] ${c.label}: ${c.message}`);
    }
    lines.push("");

    lines.push("── Módulos ───────────────────────");
    for (const c of report.modules) {
      lines.push(`[${c.status.padEnd(7)}] ${c.label}: ${c.message}`);
    }
    lines.push("");

    lines.push("── Restaurantes ──────────────────");
    for (const r of report.restaurants) {
      lines.push(`• ${r.name} (/${r.slug}) — Menu: ${r.hasMenu ? "OK" : "Pendente"} | WhatsApp: ${r.hasWhatsApp ? "OK" : "N/A"} | Pedidos: ${r.orderCount}`);
    }
    lines.push("");
  }

  lines.push("── Checklists manuais ────────────");
  let totalItems  = 0;
  let checkedItems = 0;
  for (const section of MANUAL_SECTIONS) {
    const sectionDone = section.items.filter((i) => checked.has(i.id)).length;
    totalItems  += section.items.length;
    checkedItems += sectionDone;
    lines.push(`${section.icon} ${section.title}: ${sectionDone}/${section.items.length}`);
    for (const item of section.items) {
      lines.push(`  ${checked.has(item.id) ? "[x]" : "[ ]"} ${item.text}`);
    }
  }
  lines.push(`\nTotal manual: ${checkedItems}/${totalItems}`);
  lines.push("");
  lines.push("══════════════════════════════════");

  return lines.join("\n");
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PreflightPage() {
  const [report,   setReport]   = useState<PreflightReport | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [runAt,    setRunAt]    = useState<string | null>(null);
  const [checked,  setChecked]  = useState<Set<string>>(new Set());
  const [copied,   setCopied]   = useState(false);

  const readiness: Readiness = report ? report.readiness : "NOT_STARTED";

  const runChecks = useCallback(async () => {
    setLoading(true);
    try {
      const res  = await fetch("/api/admin/preflight");
      const json = await res.json() as { data?: PreflightReport };
      if (json.data) {
        setReport(json.data);
        setRunAt(new Date().toLocaleString("pt-BR"));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  function toggleCheck(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else               next.add(id);
      return next;
    });
  }

  async function copyReport() {
    const text = buildTextReport(report, checked, readiness);
    await navigator.clipboard.writeText(text).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const rd = READINESS_CONFIG[readiness];

  // Manual completeness
  const totalManual   = MANUAL_SECTIONS.reduce((s, sec) => s + sec.items.length, 0);
  const checkedManual = checked.size;

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900 px-8 py-5">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div>
            <h1 className="text-xl font-bold text-white">Pré-piloto</h1>
            <p className="text-sm text-gray-400 mt-0.5">
              Validação antes do primeiro restaurante real
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => void copyReport()}
              className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 transition-colors"
            >
              {copied ? "✓ Copiado!" : "Copiar relatório"}
            </button>
            <button
              onClick={() => void runChecks()}
              disabled={loading}
              className="rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 px-4 py-2 text-sm font-semibold text-white transition-colors"
            >
              {loading ? "Verificando…" : "Executar verificações"}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 space-y-8">

        {/* Readiness Score */}
        <div className={`rounded-2xl border p-6 ${rd.color}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl">{rd.icon}</span>
            <div>
              <p className="text-xs font-bold uppercase tracking-wide opacity-70">Status do pré-piloto</p>
              <p className="text-2xl font-bold mt-0.5">{rd.label}</p>
            </div>
            <div className="ml-auto text-right">
              {runAt && <p className="text-xs opacity-60">Verificado em {runAt}</p>}
              <p className="text-sm font-medium mt-1">
                Manual: {checkedManual}/{totalManual} itens concluídos
              </p>
            </div>
          </div>

          {report && (
            <div className="mt-4 grid grid-cols-4 gap-3 text-center">
              {[
                { label: "Restaurantes", val: report.counts.restaurants },
                { label: "Clientes",     val: report.counts.customers },
                { label: "Pedidos",      val: report.counts.orders },
                { label: "Campanhas",    val: report.counts.campaigns },
              ].map((s) => (
                <div key={s.label} className="rounded-xl bg-black/20 py-3">
                  <p className="text-xl font-bold">{s.val}</p>
                  <p className="text-xs opacity-70">{s.label}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Automated checks */}
        {!report && !loading && (
          <div className="rounded-xl border border-gray-800 bg-gray-900 p-12 text-center">
            <p className="text-gray-500 text-sm">Clique em <strong className="text-gray-300">Executar verificações</strong> para iniciar o diagnóstico automático.</p>
          </div>
        )}

        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl bg-gray-800" />
            ))}
          </div>
        )}

        {report && !loading && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-200">Verificações automáticas</h2>
            <Section title="Ambiente" icon="🔧" checks={report.env} />
            <Section title="Banco de dados" icon="🗄️" checks={report.database} />
            <Section title="Módulos e features" icon="⚙️" checks={report.modules} />
          </div>
        )}

        {/* Restaurant details */}
        {report && report.restaurants.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-gray-200">Restaurantes cadastrados</h2>
            <div className="grid grid-cols-2 gap-4">
              {report.restaurants.map((snap) => (
                <RestaurantCard key={snap.id} snap={snap} appUrl="" />
              ))}
            </div>
          </div>
        )}

        {/* Manual checklists */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-gray-200">Checklists manuais</h2>
            <span className="text-sm text-gray-400">{checkedManual}/{totalManual} concluídos</span>
          </div>
          <div className="space-y-4">
            {MANUAL_SECTIONS.map((section) => (
              <ManualSection
                key={section.title}
                section={section}
                checked={checked}
                onToggle={toggleCheck}
              />
            ))}
          </div>
        </div>

        {/* Critical checks legend */}
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Regras de prontidão</p>
          <ul className="space-y-1 text-xs text-gray-500">
            <li>🚫 <strong className="text-gray-300">Bloqueado</strong>: qualquer check crítico com FALHA</li>
            <li>⚠️ <strong className="text-gray-300">Pronto com alertas</strong>: checks críticos passam, mas há alertas</li>
            <li>✅ <strong className="text-gray-300">Pronto para piloto</strong>: todos os checks críticos passam</li>
          </ul>
          <p className="mt-3 text-xs text-gray-600">
            Checks críticos: DATABASE_URL · NEXTAUTH_SECRET · ADMIN_SECRET · ENCRYPTION_KEY · Conexão DB · Migrações · hasOptedOut
          </p>
        </div>
      </div>
    </div>
  );
}
