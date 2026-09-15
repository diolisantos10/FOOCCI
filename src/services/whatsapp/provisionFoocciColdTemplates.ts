import { MetaTemplateService } from "./MetaTemplateService";
import { COLD_GREETING_TEMPLATES } from "@/services/sales/coldContactDiscovery";

/**
 * Submete os templates mínimos da prospecção fria à WABA conectada e os espelha
 * localmente como PENDING. Deve ser chamado por uma ação autenticada da Sala
 * Comercial; não dispara mensagens e não contorna aprovação da Meta.
 */
export async function provisionFoocciColdGreetingTemplates(restaurantId: string) {
  await MetaTemplateService.syncFromMeta(restaurantId).catch(() => ({ ok: false, synced: 0 }));
  const existing = new Map((await MetaTemplateService.list(restaurantId)).map(t => [t.templateName, t]));
  const results: Array<{ name: string; status: "created" | "existed" | "failed"; error?: string }> = [];

  for (const template of COLD_GREETING_TEMPLATES) {
    const current = existing.get(template.name);
    if (current && current.status !== "MISSING") {
      results.push({ name: template.name, status: "existed" });
      continue;
    }
    const components: Array<Record<string, unknown>> = [{
      type: "BODY",
      text: template.body,
      ...(template.restaurantNameParam ? { example: { body_text: [["Restaurante Exemplo"]] } } : {}),
    }];
    const res = await MetaTemplateService.createOnMeta(restaurantId, {
      name: template.name,
      language: template.language,
      category: template.category,
      components,
    });
    if (res.ok || res.alreadyExists) {
      await MetaTemplateService.upsert({
        restaurantId,
        templateName: template.name,
        languageCode: template.language,
        category: template.category,
        bodyVariables: template.restaurantNameParam ? 1 : 0,
        ...(res.ok ? { status: "PENDING", metaTemplateId: res.id ?? null } : {}),
        mappedCampaignType: "COLD_CONTACT_DISCOVERY",
      });
      results.push({ name: template.name, status: res.ok ? "created" : "existed" });
    } else {
      results.push({ name: template.name, status: "failed", error: res.error });
    }
  }
  return { ok: results.every(r => r.status !== "failed"), results };
}
