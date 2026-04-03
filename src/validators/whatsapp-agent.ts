import { z } from "zod";

export const AGENT_TONES = ["informal", "neutral", "premium"] as const;
export const AGENT_STYLES = ["direct", "consultive", "sales_driven"] as const;

const optionalUrl = z
  .string()
  .nullable()
  .optional()
  .refine((val) => !val || /^https?:\/\/.+/.test(val), {
    message: "Deve ser uma URL válida (ex: https://...)",
  });

export const upsertAgentConfigSchema = z.object({
  agentName:       z.string().min(1, "Nome obrigatório").max(50).default("Agente"),
  tone:            z.enum(AGENT_TONES).default("informal"),
  style:           z.enum(AGENT_STYLES).default("sales_driven"),
  welcomeMessage:  z.string().min(1, "Mensagem obrigatória").max(1000)
                     .default("Olá! Bem-vindo! 😊 O que você deseja?"),
  btn1Label:       z.string().min(1).max(60).default("Fazer pedido"),
  btn2Label:       z.string().min(1).max(60).default("Falar com atendente"),
  btn3Label:       z.string().min(1).max(60).default("Ver promoções"),
  orderPreMessage: z.string().max(500).default("Ótimo! Aqui está nosso cardápio 👇"),
  menuUrl:         optionalUrl,
  handoffPhone:    z.string().max(30).nullable().optional(),
  handoffMessage:  z.string().max(500)
                     .default("Vou te conectar com um atendente. Um momento! 👋"),
});

export type UpsertAgentConfigInput = z.infer<typeof upsertAgentConfigSchema>;

export const AGENT_DEFAULTS: UpsertAgentConfigInput = {
  agentName:       "Agente",
  tone:            "informal",
  style:           "sales_driven",
  welcomeMessage:  "Olá! Bem-vindo! 😊 O que você deseja?",
  btn1Label:       "Fazer pedido",
  btn2Label:       "Falar com atendente",
  btn3Label:       "Ver promoções",
  orderPreMessage: "Ótimo! Aqui está nosso cardápio 👇",
  menuUrl:         null,
  handoffPhone:    null,
  handoffMessage:  "Vou te conectar com um atendente. Um momento! 👋",
};
