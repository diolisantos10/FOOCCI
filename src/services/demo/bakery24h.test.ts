/**
 * A PADARIA DE VITRINE NUNCA PODE APARECER FECHADA.
 *
 * Ordem do CEO em 07/08/2026, navegando de madrugada pelo celular: *"tira o aviso
 * de horário da nossa padaria de teste porque atrapalha a navegação de quem está
 * testando… deixa aberto vinte e quatro horas."*
 *
 * Este portão existe porque o defeito tem DOIS lugares para voltar, e o segundo é
 * mudo:
 *
 *   1. Alguém "conserta" o horário de volta para algo crível (06:00–20:00), por
 *      achar que placeholder 24h é desleixo. É o caminho óbvio e o teste barra.
 *
 *   2. Alguém troca o `periodsJson: Prisma.DbNull` do upsert por `undefined`,
 *      numa faxina de tipos. Aí o campo deixa de ser apagado, períodos salvos
 *      pelo painel voltam a ter precedência sobre `openTime`/`closeTime`, e a
 *      tarja de fechada reaparece — **com este arquivo de horário intacto e
 *      parecendo certo**. É esse que ninguém acharia sem o teste.
 *
 * O teste percorre os 7 dias × 24 horas com a MESMA função que a loja usa
 * (`isOpenFromRow`), não com uma cópia da regra. Regra copiada em teste prova que
 * a cópia funciona, não que o produto funciona.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isOpenFromRow } from "@/lib/business-hours";
import { BAKERY_HOURS } from "./foocci-bakery.data";

const TZ = "America/Sao_Paulo";
const ler = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

describe("padaria de vitrine — aberta em qualquer minuto de qualquer dia", () => {
  it("os 7 dias estão cadastrados, nenhum faltando", () => {
    // Dia ausente cai em `isOpenFromRow(null) === true` e PARECE que funciona.
    // Parece — mas aí quem manda é o fallback, não o cadastro, e a próxima
    // mudança na regra do fallback derruba a vitrine sem tocar neste arquivo.
    expect(BAKERY_HOURS).toHaveLength(7);
    expect(BAKERY_HOURS.map((h) => h.dayOfWeek).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("varre 7 dias × 24 horas × 4 quartos de hora e nunca fecha", () => {
    const fechados: string[] = [];

    for (const h of BAKERY_HOURS) {
      const row = { isOpen: h.isOpen, openTime: h.openTime, closeTime: h.closeTime, periodsJson: null };

      for (let hora = 0; hora < 24; hora++) {
        for (const minuto of [0, 15, 30, 45, 59]) {
          // Uma data real no fuso do Brasil. 2026-08-09 é um domingo, então
          // somar `dayOfWeek` dias cai exatamente no dia da semana desejado.
          const dia = 9 + h.dayOfWeek;
          const agora = new Date(`2026-08-${String(dia).padStart(2, "0")}T${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00-03:00`);
          if (!isOpenFromRow(row, TZ, agora)) {
            fechados.push(`dia ${h.dayOfWeek} às ${hora}:${String(minuto).padStart(2, "0")}`);
          }
        }
      }
    }

    // A mensagem carrega o caso concreto (guardrail 6): quem reprovar aqui vê
    // EM QUE minuto a vitrine fecharia, não só que "algo está errado".
    expect(fechados, `a vitrine fecharia em: ${fechados.slice(0, 5).join(" · ")}`).toEqual([]);
  });

  it("`23:59` seria quase certo — e é justamente por isso que não vale", () => {
    // A metade que reprova: a alternativa plausível deixa a loja fechada por 60
    // segundos por dia. Raro o bastante para ninguém reproduzir, frequente o
    // bastante para acontecer numa demonstração ao vivo.
    const quaseCerto = { isOpen: true, openTime: "00:00", closeTime: "23:59", periodsJson: null };
    const meiaNoiteEmPonto = new Date("2026-08-10T23:59:30-03:00");
    expect(isOpenFromRow(quaseCerto, TZ, meiaNoiteEmPonto)).toBe(false);

    // ... e a que passa: as duas pontas iguais atravessam a meia-noite e cobrem
    // o dia inteiro, por construção (`isInPeriod`: close <= open).
    const certo = { isOpen: true, openTime: "00:00", closeTime: "00:00", periodsJson: null };
    expect(isOpenFromRow(certo, TZ, meiaNoiteEmPonto)).toBe(true);
  });

  it("o upsert APAGA o periodsJson — `undefined` deixaria períodos velhos mandando", () => {
    const svc = ler("src/services/demo/FoocciBakeryService.ts");
    // `Prisma.DbNull` apaga o campo. `undefined` significa "não mexa" — e
    // `getPeriodsForRow` dá precedência ao periodsJson sobre as duas pontas.
    expect(svc).toContain("periodsJson: Prisma.DbNull");
    expect(svc).not.toMatch(/periodsJson:\s*undefined/);
  });

  it("período partido salvo no painel venceria o horário 24h — o motivo do DbNull", () => {
    // A prova de que o parágrafo acima não é superstição: com períodos de padaria
    // salvos, às 23h a loja fecha mesmo com openTime/closeTime dizendo 24 horas.
    const comPeriodosVelhos = {
      isOpen: true,
      openTime: "00:00",
      closeTime: "00:00",
      periodsJson: [{ open: "06:00", close: "12:00" }, { open: "14:00", close: "20:00" }],
    };
    expect(isOpenFromRow(comPeriodosVelhos, TZ, new Date("2026-08-10T23:00:00-03:00"))).toBe(false);
  });
});
