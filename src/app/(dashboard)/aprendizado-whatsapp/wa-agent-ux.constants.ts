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
