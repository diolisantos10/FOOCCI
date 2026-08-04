/**
 * O agrupamento do horário da vitrine é o que o visitante lê antes de clicar em
 * "abrir a loja" — se ele agrupar errado, a página promete um horário que a loja
 * não cumpre. Testado sem banco: `summarizeWeek` é pura de propósito.
 */

import { describe, it, expect } from "vitest";
import { summarizeWeek, type HoursRow } from "./demoTasting";

function row(dayOfWeek: number, openTime: string, closeTime: string, isOpen = true): HoursRow {
  return { dayOfWeek, isOpen, openTime, closeTime, periodsJson: null };
}

/** O horário real da Foocci Bakery: abre cedo todo dia, domingo meio período. */
const BAKERY: HoursRow[] = [
  row(0, "06:30", "13:00"),
  row(1, "06:00", "20:00"),
  row(2, "06:00", "20:00"),
  row(3, "06:00", "20:00"),
  row(4, "06:00", "20:00"),
  row(5, "06:00", "21:00"),
  row(6, "06:00", "21:00"),
];

describe("summarizeWeek", () => {
  it("agrupa dias consecutivos com o mesmo horário, começando na segunda", () => {
    expect(summarizeWeek(BAKERY, 1)).toEqual([
      { days: "Segunda a quinta", hours: "06:00–20:00", isToday: true },
      { days: "Sexta e sábado", hours: "06:00–21:00", isToday: false },
      { days: "Domingo", hours: "06:30–13:00", isToday: false },
    ]);
  });

  it("marca a linha do dia de hoje, e só ela", () => {
    const lines = summarizeWeek(BAKERY, 0); // domingo
    expect(lines.map((l) => l.isToday)).toEqual([false, false, true]);
  });

  it("dois dias iguais viram 'X e Y', três ou mais viram 'X a Z'", () => {
    const twoDays = summarizeWeek(
      [row(1, "08:00", "18:00"), row(2, "08:00", "18:00")],
      1,
    );
    expect(twoDays[0]?.days).toBe("Segunda e terça");
    expect(summarizeWeek(BAKERY, 1)[0]?.days).toBe("Segunda a quinta");
  });

  it("dia fechado vira horário vazio — nunca um horário inventado", () => {
    const withClosedMonday = summarizeWeek([row(1, "06:00", "20:00", false)], 3);
    expect(withClosedMonday).toEqual([
      { days: "Segunda a domingo", hours: "", isToday: true },
    ]);
  });

  it("sem nenhuma linha no banco, devolve a semana inteira sem horário (não some da tela)", () => {
    const lines = summarizeWeek([], 2);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.hours).toBe("");
  });

  it("respeita periodsJson quando existe — turno partido não vira turno corrido", () => {
    const split: HoursRow[] = [
      {
        dayOfWeek: 3,
        isOpen: true,
        openTime: "06:00",
        closeTime: "20:00",
        periodsJson: [
          { open: "06:00", close: "10:00" },
          { open: "15:00", close: "20:00" },
        ],
      },
    ];
    const line = summarizeWeek(split, 3).find((l) => l.hours !== "");
    expect(line?.hours).toBe("06:00–10:00 e 15:00–20:00");
  });
});
