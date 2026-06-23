import { z } from "zod";

// ── Enums ──────────────────────────────────────────────────────────────────────

export const AGENT_MODES  = ["RECEPTIONIST_ONLY", "HUMAN_ASSISTED", "AI_ORDERING_EXPERIMENTAL", "MENU_ONLY"] as const;
export const AGENT_TONES  = ["informal", "neutral", "premium"] as const;
export const AGENT_STYLES = ["direct", "consultive", "sales_driven"] as const;
export const FLOW_TYPES   = ["order", "handoff", "menu", "promotions", "custom", "text_order", "rodizio", "club", "submenu"] as const;

export type AgentMode = (typeof AGENT_MODES)[number];

export type FlowType = (typeof FLOW_TYPES)[number];

// ── Menu option ────────────────────────────────────────────────────────────────

// A leaf menu option (no further nesting). Used at the top level and as a
// submenu child; only top-level options may carry `submenuOptions` (one level).
const menuOptionFields = {
  id:      z.string().min(1),
  label:   z.string().min(1, "Rótulo obrigatório").max(60),
  flow:    z.enum(FLOW_TYPES),
  message: z.string().max(500).optional(),  // only used when flow = 'custom'
};

export const subMenuOptionSchema = z.object(menuOptionFields);

export type SubMenuOption = z.infer<typeof subMenuOptionSchema>;

// A top-level option. When flow = 'submenu' it opens a one-level submenu built
// from `submenuOptions` instead of running a terminal action.
export const menuOptionSchema = z.object({
  ...menuOptionFields,
  submenuOptions: z.array(subMenuOptionSchema).max(8).optional(),
});

export type MenuOption = z.infer<typeof menuOptionSchema>;

export const DEFAULT_MENU_OPTIONS: MenuOption[] = [
  { id: "preset-order",   label: "Fazer pedido",             flow: "order"   },
  { id: "preset-menu",    label: "Ver cardápio",             flow: "menu"    },
  { id: "preset-hours",   label: "Horário de funcionamento", flow: "custom"  },
  { id: "preset-status",  label: "Acompanhar pedido",        flow: "custom",  message: "Para acompanhar seu pedido, fale com nossa equipe de atendimento. 😊" },
  { id: "preset-handoff", label: "Falar com atendente",      flow: "handoff" },
];

// ── URL validation ─────────────────────────────────────────────────────────────

const optionalUrl = z
  .string()
  .nullable()
  .optional()
  .refine((val) => !val || /^https?:\/\/.+/.test(val), {
    message: "Deve ser uma URL válida (ex: https://...)",
  });

// ── Main schema ────────────────────────────────────────────────────────────────

export const upsertAgentConfigSchema = z.object({
  agentMode:       z.enum(AGENT_MODES).default("RECEPTIONIST_ONLY"),
  agentName:       z.string().min(1, "Nome obrigatório").max(50).default("Agente"),
  tone:            z.enum(AGENT_TONES).default("informal"),
  style:           z.enum(AGENT_STYLES).default("sales_driven"),
  welcomeMessage:  z.string().min(1, "Mensagem obrigatória").max(1000)
                     .default("Olá! Bem-vindo! 😊 O que você deseja?"),
  menuOptions:     z.array(menuOptionSchema).max(10).optional(),
  orderPreMessage: z.string().max(500).default("Ótimo! Aqui está nosso cardápio 👇"),
  menuUrl:         optionalUrl,
  handoffPhone:    z.string().max(30).nullable().optional(),
  handoffMessage:  z.string().max(500)
                     .default("Vou te conectar com um atendente. Um momento! 👋"),
});

export type UpsertAgentConfigInput = z.infer<typeof upsertAgentConfigSchema>;

export const AGENT_DEFAULTS: UpsertAgentConfigInput = {
  agentMode:       "RECEPTIONIST_ONLY",
  agentName:       "Agente",
  tone:            "informal",
  style:           "sales_driven",
  welcomeMessage:  "Oi! 👋 Como posso te ajudar hoje?",
  menuOptions:     DEFAULT_MENU_OPTIONS,
  orderPreMessage: "Acesse nosso cardápio e faça seu pedido diretamente:",
  menuUrl:         null,
  handoffPhone:    null,
  handoffMessage:  "Vou deixar nossa equipe te atender. Um momento! 👋",
};
