import { z } from "zod";

// ─── Evolution Config ─────────────────────────────────────────

export const upsertEvolutionConfigSchema = z.object({
  instanceName: z.string().min(1).max(100),
  baseUrl: z.string().url("baseUrl must be a valid URL"),
  apiKey: z.string().min(8, "apiKey must be at least 8 characters"),
  webhookSecret: z.string().min(8, "webhookSecret must be at least 8 characters"),
});

export type UpsertEvolutionConfigInput = z.infer<typeof upsertEvolutionConfigSchema>;
