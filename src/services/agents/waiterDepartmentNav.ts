/**
 * waiterDepartmentNav — pure, testable definition of the Waiter Department
 * navigation (the operator-facing tabs of the Waiter Room).
 *
 * Product decision: Perfil + Operação + Brain & Skills are UNIFIED into a single
 * "Perfil do Agente" tab; Library/Simulador/Runtime Merge keep their technical
 * modules but are presented as Biblioteca de Treinamento / Centro de Treinamento /
 * Versão de Teste; Provas de Resultado is a NEW separate area (commercial
 * evidence ≠ training). Tab KEYS are stable identifiers; labels are what the
 * operator reads.
 */

export type WaiterNavKey =
  | "dashboard"
  | "perfil"
  | "biblioteca"
  | "treinamento"
  | "versao-teste"
  | "provas"
  | "qualidade"
  | "governanca";

export interface WaiterNavTab {
  key: WaiterNavKey;
  label: string;
  subtitle: string;
}

export const WAITER_NAV_TABS: readonly WaiterNavTab[] = [
  { key: "dashboard", label: "Dashboard", subtitle: "Visão executiva do Waiter." },
  {
    key: "perfil",
    label: "Perfil do Agente",
    subtitle: "Identidade, regras de atendimento, habilidades e forma de operação do Waiter.",
  },
  {
    key: "biblioteca",
    label: "Biblioteca de Treinamento",
    subtitle: "Envie materiais; a IA transforma em técnicas prontas para treino.",
  },
  {
    key: "treinamento",
    label: "Centro de Treinamento",
    subtitle: "O Waiter aprende com materiais, conversas reais e simulações. Você aprova o que vira treinamento.",
  },
  {
    key: "versao-teste",
    label: "Versão de Teste",
    subtitle: "Monte uma versão de teste com os treinamentos aprovados. O Quality Gate protege a ativação.",
  },
  {
    key: "provas",
    label: "Provas de Resultado",
    subtitle: "Evidências documentadas de venda, upsell e atendimento — para uso comercial após sua aprovação.",
  },
  {
    key: "qualidade",
    label: "Qualidade",
    subtitle: "Componentes do runtime, Test Center e critérios de avaliação.",
  },
  {
    key: "governanca",
    label: "Governança",
    subtitle: "Mapa de risco, backlog e garantias de rollback.",
  },
];

export const waiterNavLabel = (key: WaiterNavKey): string =>
  WAITER_NAV_TABS.find((t) => t.key === key)?.label ?? key;
