/**
 * Contrato da vitrine "Novidades" — UM cardápio, não dois.
 *
 * A regra da vitrine mora em UM lugar (`menuNovidades.ts`). Este arquivo reprova
 * o dia em que alguém montar a seção por conta própria em um dos caminhos: é
 * assim que nasce a divergência entre o que a tela mostra e o que o atendente de
 * WhatsApp responde — e ninguém percebe até o cliente pedir o que não existe.
 *
 * Também reprova o caminho que ignora a janela escolhida pelo dono
 * (`StoreProfile.novidadesDias`) e volta a usar número fixo escondido no código.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";
import { NOVIDADES_DIAS_MIN, NOVIDADES_DIAS_MAX } from "./menuNovidades";

const raiz = join(__dirname, "..", "..", "..");
const ler = (p: string) => readFileSync(join(raiz, p), "utf8");

/** Todo caminho que ENTREGA cardápio a alguém — tela do cliente e agente. */
const CAMINHOS_DO_CARDAPIO: Array<{ arquivo: string; quem: string }> = [
  { arquivo: "src/app/qr/[slug]/page.tsx",        quem: "cardápio da mesa (QR), tela do cliente" },
  { arquivo: "src/app/api/qr/[slug]/route.ts",    quem: "API do cardápio da mesa" },
  { arquivo: "src/app/pedido/[slug]/page.tsx",    quem: "loja / cardápio de delivery, tela do cliente" },
  { arquivo: "src/app/api/pedido/[slug]/route.ts", quem: "API do cardápio de delivery" },
  { arquivo: "src/lib/ai-context/builder.ts",     quem: "cardápio que o agente de IA lê para montar pedido" },
  { arquivo: "src/services/ai/WhatsAppReceptionistService.ts", quem: "catálogo que o atendente de WhatsApp lê" },
];

describe("todo cardápio monta a seção pelo MESMO cálculo", () => {
  for (const { arquivo, quem } of CAMINHOS_DO_CARDAPIO) {
    it(`${quem} usa services/menu/menuNovidades`, () => {
      const src = ler(arquivo);
      expect(
        src.includes('from "@/services/menu/menuNovidades"'),
        `${arquivo} não usa a regra compartilhada — duas versões do cardápio é como se cria o dia em que a tela e o atendente discordam.`,
      ).toBe(true);
      expect(src).toMatch(/montarCategoriaNovidades|selecionarNovidades/);
    });

    it(`${quem} respeita a janela escolhida pelo dono`, () => {
      const src = ler(arquivo);
      expect(
        src.includes("novidadesDias"),
        `${arquivo} não lê StoreProfile.novidadesDias — o número que o dono configurou seria ignorado neste caminho.`,
      ).toBe(true);
    });
  }
});

describe("a janela é travada no código, não no aviso da tela", () => {
  it("a API de configurações rejeita valor inválido com os limites compartilhados", () => {
    const src = ler("src/validators/settings.ts");
    expect(src).toContain("novidadesDias");
    expect(src).toContain("NOVIDADES_DIAS_MIN");
    expect(src).toContain("NOVIDADES_DIAS_MAX");
  });

  it("o schema de configuração recusa zero, negativo e número absurdo", async () => {
    const { upsertStoreSchema } = await import("@/validators/settings");
    const base = { name: "Loja" };
    for (const ruim of [0, -1, NOVIDADES_DIAS_MAX + 1, 5000, 2.5]) {
      expect(
        upsertStoreSchema.safeParse({ ...base, novidadesDias: ruim }).success,
        `novidadesDias = ${ruim} não pode ser aceito`,
      ).toBe(false);
    }
    for (const bom of [NOVIDADES_DIAS_MIN, 14, NOVIDADES_DIAS_MAX, null, undefined]) {
      expect(
        upsertStoreSchema.safeParse({ ...base, novidadesDias: bom }).success,
        `novidadesDias = ${String(bom)} deveria ser aceito`,
      ).toBe(true);
    }
  });

  it("o dono tem onde mexer, escrito na língua dele", () => {
    const src = ler("src/app/(dashboard)/settings/store/page.tsx");
    expect(src).toContain("novidadesDias");
    expect(src).toMatch(/Por quantos dias um produto fica em/i);
  });

  it("a configuração é gravada e devolvida pelo serviço de configurações", () => {
    const src = ler("src/services/settings/RestaurantSettingsService.ts");
    expect(src).toContain("novidadesDias");
  });
});
