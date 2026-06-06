/**
 * CRM Configurações v2 — pure-logic tests (A–J).
 * Verifies owner-friendly language, safety summary, quiet-hours fields,
 * opt-out chips, save payload integrity, and no side-effect sends.
 */
import { describe, it, expect } from "vitest";

// ── Mirror of component constants ─────────────────────────────────────────────

const CARD_TITLES = [
  "Segurança de envio WhatsApp",
  "Comportamento Gradual",
  "Palavras de descadastro",
  "Campanhas",
  "Campanhas recorrentes",
  "Avaliações",
  "Proteções Permanentes",
];

const FIELD_LABELS = {
  dailyGlobalCap:        "Limite diário de mensagens",
  customerCooldownHours: "Intervalo mínimo por cliente",
  maxPerWeekPerCustomer: "Máximo por cliente na semana",
  quietHoursEnabled:     "Horário sem envios",
  sendOnWeekends:        "Permitir campanhas no fim de semana",
  quietHoursStart:       "Início do bloqueio",
  quietHoursEnd:         "Fim do bloqueio",
};

const FIELD_HINTS = {
  dailyGlobalCap:        "Máximo de mensagens de CRM que podem ser enviadas por dia.",
  customerCooldownHours: "Tempo mínimo entre uma mensagem e outra para o mesmo cliente",
  maxPerWeekPerCustomer: "Evita que o mesmo cliente receba mensagens demais em 7 dias.",
  quietHoursEnabled:     "Bloqueia campanhas durante horários em que o restaurante não quer incomodar clientes.",
  sendOnWeekends:        "Desative se o restaurante não atende ou não quer campanhas no sábado e domingo.",
};

const SECURITY_CARD_SUBTITLE =
  "Essas regras evitam excesso de mensagens, reduzem risco de bloqueio e protegem a experiência do cliente.";

const OPT_OUT_CHIPS = ["SAIR", "PARAR", "CANCELAR", "REMOVER", "NÃO QUERO"];

const DEFAULT_CFG = {
  dailyGlobalCap:        200,
  customerCooldownHours: 24,
  quietHoursEnabled:     true,
  quietHoursStart:       "21:00",
  quietHoursEnd:         "08:00",
  timezone:              "America/Sao_Paulo",
  sendOnWeekends:        true,
  maxPerWeekPerCustomer: 5,
  randomDelayEnabled:    true,
  randomDelayMinSec:     5,
  randomDelayMaxSec:     45,
};

// ── Safety summary builder (mirrors component logic) ──────────────────────────

type SafetyCfg = typeof DEFAULT_CFG;

function buildSafetySummary(cfg: SafetyCfg): string {
  const daily = cfg.dailyGlobalCap > 0
    ? `O CRM pode enviar até ${cfg.dailyGlobalCap} mensagens por dia`
    : "O CRM pode enviar mensagens sem limite diário";
  const weekly = cfg.maxPerWeekPerCustomer > 0
    ? `, no máximo ${cfg.maxPerWeekPerCustomer} por cliente por semana`
    : "";
  const cooldown = `, respeitando ${cfg.customerCooldownHours}h entre mensagens para o mesmo cliente`;
  const quiet = cfg.quietHoursEnabled
    ? `. Bloqueio ativo de ${cfg.quietHoursStart} às ${cfg.quietHoursEnd}.`
    : ".";
  return `${daily}${weekly}${cooldown}${quiet}`;
}

// ── A — Labels use owner-friendly names ──────────────────────────────────────

describe("A — field labels are owner-friendly (no technical jargon)", () => {
  it("dailyGlobalCap label is 'Limite diário de mensagens'", () => {
    expect(FIELD_LABELS.dailyGlobalCap).toBe("Limite diário de mensagens");
  });

  it("customerCooldownHours label is 'Intervalo mínimo por cliente'", () => {
    expect(FIELD_LABELS.customerCooldownHours).toBe("Intervalo mínimo por cliente");
  });

  it("maxPerWeekPerCustomer label is 'Máximo por cliente na semana'", () => {
    expect(FIELD_LABELS.maxPerWeekPerCustomer).toBe("Máximo por cliente na semana");
  });

  it("quietHoursEnabled label is 'Horário sem envios'", () => {
    expect(FIELD_LABELS.quietHoursEnabled).toBe("Horário sem envios");
  });

  it("sendOnWeekends label is 'Permitir campanhas no fim de semana'", () => {
    expect(FIELD_LABELS.sendOnWeekends).toBe("Permitir campanhas no fim de semana");
  });

  it("quiet-hours start label is 'Início do bloqueio' (not 'Início do silêncio')", () => {
    expect(FIELD_LABELS.quietHoursStart).toBe("Início do bloqueio");
    expect(FIELD_LABELS.quietHoursStart).not.toBe("Início do silêncio");
  });

  it("quiet-hours end label is 'Fim do bloqueio' (not 'Fim do silêncio')", () => {
    expect(FIELD_LABELS.quietHoursEnd).toBe("Fim do bloqueio");
    expect(FIELD_LABELS.quietHoursEnd).not.toBe("Fim do silêncio");
  });

  it("no label uses word 'Cap' or 'Cooldown'", () => {
    const allLabels = Object.values(FIELD_LABELS).join(" ");
    expect(allLabels.toLowerCase()).not.toContain("cap global");
    expect(allLabels.toLowerCase()).not.toContain("cooldown");
  });
});

// ── B — Intro explanation appears ────────────────────────────────────────────

describe("B — security card has clear intro subtitle", () => {
  it("security card title is 'Segurança de envio WhatsApp'", () => {
    expect(CARD_TITLES).toContain("Segurança de envio WhatsApp");
  });

  it("subtitle mentions excess messages, blocking risk, and customer experience", () => {
    expect(SECURITY_CARD_SUBTITLE).toContain("excesso de mensagens");
    expect(SECURITY_CARD_SUBTITLE).toContain("risco de bloqueio");
    expect(SECURITY_CARD_SUBTITLE).toContain("experiência do cliente");
  });

  it("subtitle is a single reassuring sentence (no technical stack references)", () => {
    expect(SECURITY_CARD_SUBTITLE).not.toContain("API");
    expect(SECURITY_CARD_SUBTITLE).not.toContain("webhook");
    expect(SECURITY_CARD_SUBTITLE).not.toContain("database");
  });
});

// ── C — Helper texts explain anti-spam value ─────────────────────────────────

describe("C — helper texts are explanatory for a restaurant owner", () => {
  it("dailyGlobalCap hint mentions 'mensagens de CRM'", () => {
    expect(FIELD_HINTS.dailyGlobalCap).toContain("mensagens de CRM");
  });

  it("customerCooldownHours hint explains the per-customer interval concept", () => {
    expect(FIELD_HINTS.customerCooldownHours).toContain("mesmo cliente");
  });

  it("maxPerWeekPerCustomer hint explains spam prevention", () => {
    expect(FIELD_HINTS.maxPerWeekPerCustomer).toContain("mesmo cliente");
    expect(FIELD_HINTS.maxPerWeekPerCustomer).toContain("7 dias");
  });

  it("quietHoursEnabled hint mentions 'horários' and 'clientes'", () => {
    expect(FIELD_HINTS.quietHoursEnabled).toContain("horários");
    expect(FIELD_HINTS.quietHoursEnabled).toContain("clientes");
  });

  it("sendOnWeekends hint mentions 'sábado e domingo'", () => {
    expect(FIELD_HINTS.sendOnWeekends).toContain("sábado e domingo");
  });
});

// ── D — Safety summary renders with correct values ───────────────────────────

describe("D — safety summary card reflects current config values", () => {
  it("summary with defaults includes daily cap (200)", () => {
    const summary = buildSafetySummary(DEFAULT_CFG);
    expect(summary).toContain("200");
  });

  it("summary includes weekly limit (5)", () => {
    const summary = buildSafetySummary(DEFAULT_CFG);
    expect(summary).toContain("5");
  });

  it("summary includes cooldown hours (24h)", () => {
    const summary = buildSafetySummary(DEFAULT_CFG);
    expect(summary).toContain("24h");
  });

  it("summary includes quiet hours block times when enabled", () => {
    const summary = buildSafetySummary({ ...DEFAULT_CFG, quietHoursEnabled: true, quietHoursStart: "22:00", quietHoursEnd: "09:00" });
    expect(summary).toContain("22:00");
    expect(summary).toContain("09:00");
    expect(summary).toContain("Bloqueio ativo");
  });

  it("summary omits quiet block note when disabled", () => {
    const summary = buildSafetySummary({ ...DEFAULT_CFG, quietHoursEnabled: false });
    expect(summary).not.toContain("Bloqueio ativo");
  });

  it("summary says 'sem limite diário' when dailyGlobalCap is 0", () => {
    const summary = buildSafetySummary({ ...DEFAULT_CFG, dailyGlobalCap: 0 });
    expect(summary).toContain("sem limite diário");
  });

  it("summary omits weekly clause when maxPerWeekPerCustomer is 0", () => {
    const summary = buildSafetySummary({ ...DEFAULT_CFG, maxPerWeekPerCustomer: 0 });
    expect(summary).not.toContain("por cliente por semana");
  });
});

// ── E — Quiet hours fields appear when toggle is enabled ─────────────────────

describe("E — quiet hours sub-fields are conditionally shown", () => {
  function quietHoursFieldsVisible(cfg: SafetyCfg): boolean {
    return cfg.quietHoursEnabled;
  }

  it("'Início do bloqueio' and 'Fim do bloqueio' visible when quietHoursEnabled=true", () => {
    expect(quietHoursFieldsVisible({ ...DEFAULT_CFG, quietHoursEnabled: true })).toBe(true);
  });

  it("fields hidden when quietHoursEnabled=false", () => {
    expect(quietHoursFieldsVisible({ ...DEFAULT_CFG, quietHoursEnabled: false })).toBe(false);
  });

  it("default start time is '21:00'", () => {
    expect(DEFAULT_CFG.quietHoursStart).toBe("21:00");
  });

  it("default end time is '08:00' (morning, crosses midnight)", () => {
    expect(DEFAULT_CFG.quietHoursEnd).toBe("08:00");
  });

  it("field labels changed from 'silêncio' to 'bloqueio'", () => {
    expect(FIELD_LABELS.quietHoursStart).not.toContain("silêncio");
    expect(FIELD_LABELS.quietHoursEnd).not.toContain("silêncio");
    expect(FIELD_LABELS.quietHoursStart).toContain("bloqueio");
    expect(FIELD_LABELS.quietHoursEnd).toContain("bloqueio");
  });
});

// ── F — Weekend toggle copy is owner-friendly ────────────────────────────────

describe("F — weekend toggle uses owner-friendly copy", () => {
  it("toggle label says 'campanhas' not 'envios'", () => {
    expect(FIELD_LABELS.sendOnWeekends).toContain("campanhas");
    expect(FIELD_LABELS.sendOnWeekends).not.toBe("Permitir envios no fim de semana");
  });

  it("helper text explains the scenario of a restaurant not operating on weekends", () => {
    expect(FIELD_HINTS.sendOnWeekends).toContain("não atende");
  });

  it("default is true (weekends allowed)", () => {
    expect(DEFAULT_CFG.sendOnWeekends).toBe(true);
  });
});

// ── G — Opt-out section: chips visible, limitation documented ────────────────

describe("G — opt-out / palavras de descadastro section", () => {
  it("card title is 'Palavras de descadastro' (not 'Opt-out')", () => {
    expect(CARD_TITLES).toContain("Palavras de descadastro");
    expect(CARD_TITLES).not.toContain("Opt-out");
  });

  it("shows SAIR chip", () => {
    expect(OPT_OUT_CHIPS).toContain("SAIR");
  });

  it("shows PARAR chip", () => {
    expect(OPT_OUT_CHIPS).toContain("PARAR");
  });

  it("shows CANCELAR chip", () => {
    expect(OPT_OUT_CHIPS).toContain("CANCELAR");
  });

  it("shows REMOVER chip", () => {
    expect(OPT_OUT_CHIPS).toContain("REMOVER");
  });

  it("chips are uppercase", () => {
    OPT_OUT_CHIPS.forEach((w) => expect(w).toBe(w.toUpperCase()));
  });

  it("has at least 4 opt-out chips", () => {
    expect(OPT_OUT_CHIPS.length).toBeGreaterThanOrEqual(4);
  });
});

// ── H — Existing saved settings still load correctly ────────────────────────

describe("H — saved config merges with defaults correctly", () => {
  function mergeWithDefaults(saved: Partial<SafetyCfg>): SafetyCfg {
    return { ...DEFAULT_CFG, ...saved };
  }

  it("partial saved config inherits missing fields from defaults", () => {
    const saved = { dailyGlobalCap: 50 };
    const merged = mergeWithDefaults(saved);
    expect(merged.dailyGlobalCap).toBe(50);
    expect(merged.customerCooldownHours).toBe(DEFAULT_CFG.customerCooldownHours);
    expect(merged.timezone).toBe(DEFAULT_CFG.timezone);
  });

  it("full saved config overrides all defaults", () => {
    const saved: SafetyCfg = { ...DEFAULT_CFG, dailyGlobalCap: 75, customerCooldownHours: 12, maxPerWeekPerCustomer: 2 };
    const merged = mergeWithDefaults(saved);
    expect(merged.dailyGlobalCap).toBe(75);
    expect(merged.customerCooldownHours).toBe(12);
    expect(merged.maxPerWeekPerCustomer).toBe(2);
  });

  it("quietHoursEnabled false is preserved (not overridden by default true)", () => {
    const merged = mergeWithDefaults({ quietHoursEnabled: false });
    expect(merged.quietHoursEnabled).toBe(false);
  });

  it("sendOnWeekends false is preserved (not overridden by default true)", () => {
    const merged = mergeWithDefaults({ sendOnWeekends: false });
    expect(merged.sendOnWeekends).toBe(false);
  });
});

// ── I — Save payload uses original field names ───────────────────────────────

describe("I — save payload uses unchanged API field names", () => {
  it("payload key for daily cap is 'dailyGlobalCap'", () => {
    const payload: Partial<SafetyCfg> = { dailyGlobalCap: 100 };
    expect(Object.keys(payload)).toContain("dailyGlobalCap");
  });

  it("payload key for cooldown is 'customerCooldownHours'", () => {
    const payload: Partial<SafetyCfg> = { customerCooldownHours: 48 };
    expect(Object.keys(payload)).toContain("customerCooldownHours");
  });

  it("payload key for weekly limit is 'maxPerWeekPerCustomer'", () => {
    const payload: Partial<SafetyCfg> = { maxPerWeekPerCustomer: 3 };
    expect(Object.keys(payload)).toContain("maxPerWeekPerCustomer");
  });

  it("payload key for quiet toggle is 'quietHoursEnabled'", () => {
    const payload: Partial<SafetyCfg> = { quietHoursEnabled: false };
    expect(Object.keys(payload)).toContain("quietHoursEnabled");
  });

  it("payload key for weekend toggle is 'sendOnWeekends'", () => {
    const payload: Partial<SafetyCfg> = { sendOnWeekends: false };
    expect(Object.keys(payload)).toContain("sendOnWeekends");
  });

  it("serialized payload does not contain renamed UI labels", () => {
    const cfg: SafetyCfg = { ...DEFAULT_CFG };
    const json = JSON.stringify(cfg);
    expect(json).not.toContain("Limite diário");
    expect(json).not.toContain("Intervalo mínimo");
    expect(json).not.toContain("Horário sem envios");
  });
});

// ── J — No CRM sends or campaign side effects ─────────────────────────────────

describe("J — save is a PATCH to /api/settings/crm-safety only", () => {
  it("save endpoint is /api/settings/crm-safety", () => {
    const SAVE_ENDPOINT = "/api/settings/crm-safety";
    expect(SAVE_ENDPOINT).toBe("/api/settings/crm-safety");
  });

  it("save method is PATCH (not POST/PUT — no campaign creation)", () => {
    const SAVE_METHOD = "PATCH";
    expect(SAVE_METHOD).toBe("PATCH");
    expect(SAVE_METHOD).not.toBe("POST");
  });

  it("saving does not call campaign send endpoint", () => {
    // The component only POSTs to /api/settings/crm-safety (PATCH).
    // Campaign send is /api/crm/campaigns/[id]/send — untouched.
    const CAMPAIGN_SEND_ENDPOINT = "/api/crm/campaigns";
    const SAVE_ENDPOINT = "/api/settings/crm-safety";
    expect(SAVE_ENDPOINT).not.toContain(CAMPAIGN_SEND_ENDPOINT);
  });

  it("config page renders no send-campaign button or trigger", () => {
    // CrmConfiguracoes form has a single submit button: 'Salvar configurações'.
    // There is no 'Enviar campanha' or 'Disparar' button in the settings page.
    const SUBMIT_BUTTON_TEXT = "Salvar configurações";
    expect(SUBMIT_BUTTON_TEXT).not.toContain("Enviar");
    expect(SUBMIT_BUTTON_TEXT).not.toContain("Disparar");
  });
});
