/**
 * Catálogo do Assistente Foocci — o que o lojista pode pedir.
 *
 * Vive fora dos componentes de propósito: a barra do topo, o painel de sugestões
 * e a conversa leem a MESMA lista. Quando um atalho nasce, ele nasce aqui e
 * aparece nos três lugares — nunca duplicado em três arquivos.
 */

// ── Ações rápidas ─────────────────────────────────────────────────────────────

export type QuickAction = {
  id: string;
  icon: string;
  label: string;
} & (
  | { kind: "ask"; question: string }
  | { kind: "mode"; mode: "diagnostico" | "avisos" }
  | { kind: "trail" }
);

/**
 * As ações reais do lojista. As três primeiras também aparecem como chips
 * dentro da barra do topo no desktop (ver `BAR_QUICK_ACTION_IDS`).
 */
export const QUICK_ACTIONS: QuickAction[] = [
  {
    id: "cardapio",
    icon: "🍽️",
    label: "Subir meu cardápio",
    kind: "ask",
    question: "Como subo o meu cardápio inteiro no Foocci?",
  },
  {
    id: "whatsapp",
    icon: "💬",
    label: "Conectar WhatsApp",
    kind: "ask",
    question: "Como conecto meu WhatsApp?",
  },
  {
    id: "diagnostico",
    icon: "🛠️",
    label: "Algo não funciona",
    kind: "mode",
    mode: "diagnostico",
  },
  {
    id: "pedidos",
    icon: "📋",
    label: "Acompanhar pedidos",
    kind: "ask",
    question: "Como acompanhar e gerenciar pedidos?",
  },
  {
    id: "campanha",
    icon: "📣",
    label: "Criar uma campanha",
    kind: "ask",
    question: "Como criar uma campanha no CRM?",
  },
  {
    id: "primeiros-passos",
    icon: "🚀",
    label: "Primeiros passos",
    kind: "trail",
  },
];

/** Os atalhos que cabem dentro da própria barra (desktop largo). */
export const BAR_QUICK_ACTION_IDS = ["cardapio", "whatsapp", "diagnostico"];

// ── Sugestões gerais ──────────────────────────────────────────────────────────

export const SUGGESTIONS = [
  "Como cadastro um produto no cardápio?",
  "Como conecto meu WhatsApp?",
  "Como crio uma promoção?",
  "Onde acompanho meus pedidos?",
];

// ── Guia da tela em que o lojista está ────────────────────────────────────────

export interface ContextGuide {
  prefix: string;
  label: string;
  question: string;
  /** Perguntas vizinhas da mesma tela — viram sugestões contextuais. */
  also?: string[];
}

/** Primeiro prefixo que casa vence (do mais específico para o mais genérico). */
export const CONTEXT_GUIDES: ContextGuide[] = [
  { prefix: "/settings/delivery", label: "Entrega", question: "Como configurar a área de entrega e as taxas?", also: ["Como cobrar taxa por bairro?"] },
  { prefix: "/settings/payments", label: "Pagamentos", question: "Como configurar as formas de pagamento?", also: ["Como recebo por Pix?"] },
  { prefix: "/settings/operation", label: "Horários", question: "Como definir o horário de funcionamento?", also: ["Como pausar os pedidos em uma emergência?"] },
  { prefix: "/settings/impressoras", label: "Impressoras", question: "Como configurar a impressão de comandas?", also: ["A comanda está saindo cortada, o que faço?"] },
  { prefix: "/settings/sons", label: "Sons e alertas", question: "Como configurar os sons e alertas?" },
  { prefix: "/settings/policies", label: "Políticas", question: "Como definir termos e políticas da loja?" },
  { prefix: "/settings/team", label: "Equipe", question: "Como adicionar membros da equipe?" },
  { prefix: "/settings/store", label: "Loja", question: "Como preencher os dados da loja?" },
  { prefix: "/settings", label: "Configurações", question: "Onde fica cada configuração?" },
  { prefix: "/orders", label: "Pedidos", question: "Como acompanhar e gerenciar pedidos?", also: ["Como imprimo a comanda de um pedido?"] },
  { prefix: "/atendimento", label: "Central de Conversas", question: "Como atender clientes na Central de Conversas?" },
  { prefix: "/menu-enhancement", label: "Fotos do Cardápio", question: "Como melhorar as fotos do cardápio?" },
  { prefix: "/menu", label: "Cardápio", question: "Como cadastro um produto no cardápio?", also: ["Como crio uma categoria e organizo o cardápio?", "Como coloco foto nos produtos?"] },
  { prefix: "/precificacao", label: "CMV & Precificação", question: "Como calcular o CMV e o preço de venda?" },
  { prefix: "/agente-ia", label: "Agentes IA", question: "Como configurar os Agentes de IA?" },
  { prefix: "/analytics", label: "Analytics", question: "Como entender meus números no Analytics?" },
  { prefix: "/promotions", label: "Promoções", question: "Como criar uma promoção?" },
  { prefix: "/crm", label: "CRM", question: "Como criar uma campanha no CRM?", also: ["Como funcionam os níveis de cliente?"] },
  { prefix: "/canais", label: "Canais", question: "Como criar links rastreáveis?" },
  { prefix: "/marca", label: "Marca", question: "Como personalizar a marca (logo, nome e cores)?" },
  { prefix: "/integracoes", label: "Integrações", question: "Quais integrações existem e como conectar?" },
  { prefix: "/dashboard", label: "Início", question: "O que eu consigo ver na tela de Início?" },
];

export function guideForPath(pathname: string | null): ContextGuide | null {
  if (!pathname) return null;
  return CONTEXT_GUIDES.find((c) => pathname.startsWith(c.prefix)) ?? null;
}

// ── Trilha de primeiros passos ────────────────────────────────────────────────

export interface OnboardingStep {
  id: string;
  label: string;
  question: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: "marca", label: "Personalizar a marca", question: "Como personalizar a marca (logo, nome e cores)?" },
  { id: "cardapio", label: "Montar o cardápio", question: "Como cadastro um produto no cardápio?" },
  { id: "horario", label: "Definir os horários", question: "Como definir o horário de funcionamento?" },
  { id: "entrega", label: "Configurar entrega/retirada", question: "Como configurar a área de entrega e as taxas?" },
  { id: "pagamentos", label: "Formas de pagamento", question: "Como configurar as formas de pagamento?" },
  { id: "whatsapp", label: "Conectar o WhatsApp", question: "Como conecto meu WhatsApp?" },
  { id: "divulgar", label: "Divulgar o cardápio (QR/link)", question: "Como compartilhar o cardápio digital (QR Code e link)?" },
  { id: "teste", label: "Fazer um pedido de teste", question: "Como acompanhar e gerenciar pedidos?" },
];

export const ONBOARDING_KEY = "foocci_onboarding_v1";
