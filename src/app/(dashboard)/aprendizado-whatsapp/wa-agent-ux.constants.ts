/**
 * Constants for the "Agentes → WhatsApp" 7-tab UX consolidation.
 * Imported by both the client component and the unit tests.
 */

export const WA_TABS = [
  { id: "visao-geral",    label: "Visão Geral",          icon: "📊" },
  { id: "conversas",      label: "Conversas de hoje",    icon: "💬" },
  { id: "aprendizados",   label: "Aprendizados pendentes", icon: "🧠" },
  { id: "simulador",      label: "Simulador",            icon: "🧪" },
  { id: "saude",          label: "Saúde do WhatsApp",    icon: "❤️" },
  { id: "configuracoes",  label: "Configurações",        icon: "⚙️" },
  { id: "modo-avancado",  label: "Modo avançado",        icon: "🔬" },
] as const;

export type WaTabId = typeof WA_TABS[number]["id"];

export const APPROVAL_DISCLAIMER =
  "Aprovar não muda automaticamente o atendimento em produção. " +
  "Aprovar coloca este aprendizado na base de treinamento do WhatsApp Agent " +
  "para a próxima rodada de melhoria.";

export const MODO_AVANCADO_LINKS: Array<{ href: string; label: string; desc: string }> = [
  {
    href:  "/admin/diagnostics/whatsapp-text-ordering",
    label: "Diagnóstico do Pedido Texto",
    desc:  "Verificação completa do estado do anotador de pedidos.",
  },
  {
    href:  "/admin/diagnostics/whatsapp-text-ordering/simulator",
    label: "Simulador completo",
    desc:  "Simule conversas passo a passo sem enviar nada de verdade.",
  },
  {
    href:  "/admin/diagnostics/whatsapp-master",
    label: "Simulador Master",
    desc:  "Verificação técnica de todas as áreas: cardápio, pedido, Pix, entrega, transferência.",
  },
  {
    href:  "/admin/agents/whatsapp",
    label: "WA Cockpit",
    desc:  "Painel técnico do agente: configuração, escopo e testes completos.",
  },
  {
    href:  "/admin/quality",
    label: "Rodadas de treinamento",
    desc:  "Histórico de execuções de qualidade e melhorias aplicadas.",
  },
  {
    href:  "/admin/diagnostics/whatsapp-routing-test",
    label: "Teste de roteamento",
    desc:  "Verifica como o WhatsApp Host roteia cada tipo de mensagem.",
  },
];

/** Business-language labels for the Master Simulator status. */
export const MASTER_STATUS_LABEL: Record<string, string> = {
  PASS:    "Tudo certo",
  WARNING: "Atenção",
  FAIL:    "Falha crítica",
};

/** Tailwind color tokens for each Master Simulator status. */
export const MASTER_STATUS_COLOR: Record<string, string> = {
  PASS:    "bg-green-50 border-green-200 text-green-800",
  WARNING: "bg-amber-50 border-amber-200 text-amber-800",
  FAIL:    "bg-red-50 border-red-200 text-red-800",
};

/** Business-language labels for each Master Simulator area. */
export const MASTER_AREA_LABEL: Record<string, string> = {
  MENU:        "Cardápio",
  RECEPTIONIST:"Recepção",
  TEXT_ORDER:  "Pedido por texto",
  PIX:         "Pagamento Pix",
  DELIVERY:    "Entrega",
  HANDOFF:     "Transferência humana",
  REAL_CASES:  "Casos reais",
};

/** Business-language labels for Master Simulator severity levels. */
export const MASTER_SEVERITY_LABEL: Record<string, string> = {
  P0: "crítico",
  P1: "atenção",
  P2: "melhoria",
};

/** Terms that must never appear raw in the main (non-collapsed) text of a learning card. */
export const MAIN_LABEL_BLOCKLIST = ["intent", "runtime", "classifier", "UNKNOWN"] as const;

/** Business-language replacements for technical terms. */
export const TERM_REPLACEMENTS: Record<string, string> = {
  "AgentImprovementProposal": "Aprendizado sugerido",
  "WaiterTrainingSuggestion":  "Aprendizado do WhatsApp",
  "runtime":                   "atendimento real",
  "diagnostic":                "verificação",
  "classifier":                "leitura da mensagem",
  "UNKNOWN":                   "precisa revisar",
  "P0":                        "crítico",
  "P1":                        "atenção",
  "P2":                        "melhoria",
};
