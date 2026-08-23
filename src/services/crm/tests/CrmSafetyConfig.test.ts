import { describe, it, expect } from "vitest";
import { parseSafetyConfig, DEFAULT_SAFETY_CONFIG, applyEffectiveSafety, META_SAFE_DAILY_LIMIT, META_CYCLE_LIMIT } from "@/lib/crm-safety";

describe("parseSafetyConfig — weekly cap + per-customer + 0 semantics", () => {
  it("(2) exposes weeklyGlobalCap, default OFF (0)", () => {
    expect(DEFAULT_SAFETY_CONFIG.weeklyGlobalCap).toBe(0);
    expect(parseSafetyConfig({}).weeklyGlobalCap).toBe(0);
  });

  it("(1) exposes maxPerWeekPerCustomer", () => {
    expect(parseSafetyConfig({ maxPerWeekPerCustomer: 1 }).maxPerWeekPerCustomer).toBe(1);
    expect(parseSafetyConfig({}).maxPerWeekPerCustomer).toBe(DEFAULT_SAFETY_CONFIG.maxPerWeekPerCustomer);
  });

  it("(8) 0 is preserved exactly for caps (UI maps 0 → 'sem limite' via a switch, never ambiguous)", () => {
    const c = parseSafetyConfig({ dailyGlobalCap: 0, weeklyGlobalCap: 0, maxPerWeekPerCustomer: 0 });
    expect(c.dailyGlobalCap).toBe(0);
    expect(c.weeklyGlobalCap).toBe(0);
    expect(c.maxPerWeekPerCustomer).toBe(0);
  });

  it("round-trips a custom weekly cap", () => {
    expect(parseSafetyConfig({ weeklyGlobalCap: 500 }).weeklyGlobalCap).toBe(500);
  });
});

describe("applyEffectiveSafety — canal único (Meta)", () => {
  const base = parseSafetyConfig({});

  it("modo seguro usa o teto do tier, ritmo rápido e ciclos grandes", () => {
    const eff = applyEffectiveSafety(base);
    expect(eff.dailyGlobalCap).toBe(META_SAFE_DAILY_LIMIT);
    expect(eff.crmWhatsAppSafety?.globalDailyLimit).toBe(META_SAFE_DAILY_LIMIT);
    expect(eff.crmWhatsAppSafety?.globalCycleLimit).toBe(META_CYCLE_LIMIT);
    expect(eff.randomDelayMinSec).toBe(1);
    expect(eff.randomDelayMaxSec).toBe(2);
  });

  // O caso que este teste substitui provava a rampa de aquecimento (20→250/dia
  // conforme a idade do número) e o ciclo de 5. Aquilo existia para proteger uma
  // sessão de WhatsApp Web NÃO OFICIAL de banimento, e saiu com a Evolution em
  // 04/08. Agora não há um "modo sem Meta": não existe segundo canal, então o
  // teto seguro é sempre o da Meta — e é isso que o caso abaixo trava.
  it("não existe modo alternativo: sem argumentos extras, o teto é sempre o da Meta", () => {
    expect(applyEffectiveSafety(base).dailyGlobalCap).toBe(META_SAFE_DAILY_LIMIT);
    expect(applyEffectiveSafety(parseSafetyConfig({})).crmWhatsAppSafety?.globalCycleLimit)
      .toBe(META_CYCLE_LIMIT);
  });

  it("override manual vence (os números do dono ficam intactos)", () => {
    const manual = parseSafetyConfig({ manualOverride: true, dailyGlobalCap: 123 });
    expect(applyEffectiveSafety(manual).dailyGlobalCap).toBe(123);
  });
});

/**
 * OS DOIS CADEADOS SÃO DIFERENTES — e não podem voltar a ser um só.
 *
 * Decisão do CEO, 23/08/2026. Até então, mexer no **teto de contatos** — que é
 * limite de GASTO — exigia ligar "Assumir controle manual", que destrava as
 * regras **ANTI-BANIMENTO** (limite diário, intervalo por cliente, horário de
 * silêncio, delay entre envios). Um risco de dinheiro trancado com a mesma chave
 * de um risco de perder o WhatsApp: quem quisesse mexer no primeiro levava o
 * segundo junto.
 *
 * ⚠️ HONESTIDADE SOBRE O QUE ESTE ARQUIVO PROVA: o servidor JÁ estava certo — o
 * defeito morava na TELA, que desabilitava o campo. Estes casos não reprovam
 * contra o código antigo, e não são apresentados como se reprovassem. Eles são
 * uma TRAVA DE CONTRATO: existem para que ninguém, ao "arrumar" a configuração
 * efetiva um dia, volte a prender o teto de contatos junto com o anti-banimento
 * — que foi a divergência tela × código que custou esta rodada.
 */
describe("teto de contatos × regras anti-banimento — cadeados separados", () => {
  const guardado = parseSafetyConfig({
    manualOverride:        false, // modo seguro LIGADO
    contactBudgetTotal:    3000,  // ...e mesmo assim o teto é do dono
    // Valores que o dono NÃO pode impor no modo seguro:
    dailyGlobalCap:        99_999,
    customerCooldownHours: 1,
    quietHoursEnabled:     false,
    maxPerWeekPerCustomer: 99,
  });

  it("o teto de contatos do dono ATRAVESSA o modo seguro intacto", () => {
    expect(applyEffectiveSafety(guardado).contactBudgetTotal).toBe(3000);
  });

  it("as regras anti-banimento continuam TRANCADAS no mesmo cenário", () => {
    const efetiva = applyEffectiveSafety(guardado);
    expect(efetiva.dailyGlobalCap).toBe(META_SAFE_DAILY_LIMIT); // não os 99.999 pedidos
    expect(efetiva.customerCooldownHours).toBe(24);             // não 1 h
    expect(efetiva.quietHoursEnabled).toBe(true);               // não desligada
    expect(efetiva.quietHoursStart).toBe("21:00");
    expect(efetiva.quietHoursEnd).toBe("08:00");
    expect(efetiva.maxPerWeekPerCustomer).toBe(5);              // não 99
    expect(efetiva.manualOverride).toBe(false);
  });

  it("zerar o teto (= sem limite) também é do dono, e não destrava o anti-banimento", () => {
    const semTeto = applyEffectiveSafety(parseSafetyConfig({
      manualOverride: false, contactBudgetTotal: 0, dailyGlobalCap: 5000,
    }));
    expect(semTeto.contactBudgetTotal).toBe(0);
    expect(semTeto.dailyGlobalCap).toBe(META_SAFE_DAILY_LIMIT);
  });

  it("com controle manual LIGADO, o teto continua sendo o do dono", () => {
    const manual = applyEffectiveSafety(parseSafetyConfig({
      manualOverride: true, contactBudgetTotal: 3000,
    }));
    expect(manual.contactBudgetTotal).toBe(3000);
  });

  it("o padrão de produto para restaurante NOVO continua 0 = sem teto", () => {
    // Registrado de propósito: mudar o padrão é decisão de produto, não de
    // engenharia. Hoje um restaurante novo nasce SEM teto de contatos.
    expect(DEFAULT_SAFETY_CONFIG.contactBudgetTotal).toBe(0);
  });
});
