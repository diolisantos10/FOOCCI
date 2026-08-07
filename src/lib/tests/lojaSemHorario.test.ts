/**
 * LOJA QUE NUNCA FECHA NÃO FALA DE HORÁRIO — e restaurante de verdade fala.
 *
 * Ordem do CEO em 07/08/2026, olhando a padaria de vitrine: *"quero que tire a
 * informação do horário."*
 *
 * A metade perigosa deste portão não é a que ele pediu. É a outra: **um
 * restaurante com horário de verdade não pode perder o "Aberto agora"** por
 * causa de uma regra escrita para a vitrine. Para ele, esse é o dado que decide
 * se a pessoa monta um carrinho às 23h para descobrir no fim que ninguém vai
 * receber o pedido.
 *
 * Por isso metade dos casos aqui existe só para provar que a regra NÃO dispara.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { abre24hTodosOsDias } from "../business-hours";

const ler = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/** Sete dias iguais, no formato que o banco guarda. */
const semana = (open: string, close: string, isOpen = true) =>
  Array.from({ length: 7 }, (_, dayOfWeek) => ({
    dayOfWeek, isOpen, openTime: open, closeTime: close, periodsJson: null,
  }));

describe("abre24hTodosOsDias — quando a loja realmente nunca fecha", () => {
  it("as duas pontas iguais cobrem o dia inteiro", () => {
    expect(abre24hTodosOsDias(semana("00:00", "00:00"))).toBe(true);
    // Qualquer hora serve: o que importa é dar a volta completa.
    expect(abre24hTodosOsDias(semana("08:00", "08:00"))).toBe(true);
  });

  it("períodos que somam 1.440 minutos também contam", () => {
    const rows = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek, isOpen: true, openTime: "00:00", closeTime: "12:00",
      periodsJson: [{ open: "00:00", close: "12:00" }, { open: "12:00", close: "00:00" }],
    }));
    expect(abre24hTodosOsDias(rows)).toBe(true);
  });
});

describe("… e a metade que importa mais: quando ela NÃO dispara", () => {
  it("horário de padaria de verdade continua mostrando o estado", () => {
    // Exatamente o cadastro que a vitrine tinha até 07/08.
    const rows = [
      { dayOfWeek: 0, isOpen: true, openTime: "06:30", closeTime: "13:00", periodsJson: null },
      ...Array.from({ length: 6 }, (_, i) => ({
        dayOfWeek: i + 1, isOpen: true, openTime: "06:00", closeTime: "20:00", periodsJson: null,
      })),
    ];
    expect(abre24hTodosOsDias(rows)).toBe(false);
  });

  it("UM dia fechado na semana derruba a regra", () => {
    const rows = semana("00:00", "00:00");
    rows[1] = { ...rows[1]!, isOpen: false };
    expect(abre24hTodosOsDias(rows)).toBe(false);
  });

  it("UM dia com horário parcial derruba a regra", () => {
    const rows = semana("00:00", "00:00");
    rows[3] = { ...rows[3]!, openTime: "09:00", closeTime: "18:00" };
    expect(abre24hTodosOsDias(rows)).toBe(false);
  });

  it("🔴 restaurante SEM horário cadastrado NÃO conta como 24h", () => {
    // isOpenFromRow(null) devolve `true` por conveniência, mas "ninguem
    // cadastrou" é AUSÊNCIA DE INFORMAÇÃO — e ausência de informação não é
    // informação (guardrail 1). Tratar isso como 24h esconderia o estado de
    // todo restaurante que ainda não preencheu horário, que é a maioria dos
    // que acabam de entrar.
    expect(abre24hTodosOsDias([])).toBe(false);
    expect(abre24hTodosOsDias(semana("00:00", "00:00").slice(0, 6))).toBe(false);
  });

  it("dia com período vazio não vira 24h", () => {
    const rows = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek, isOpen: true, openTime: "00:00", closeTime: "00:00",
      periodsJson: dayOfWeek === 2 ? [] : null,
    }));
    // periodsJson vazio cai no fallback das duas pontas — segue 24h.
    expect(abre24hTodosOsDias(rows)).toBe(true);
  });
});

describe("a tela — o estado some quando é 24h, e só nesse caso", () => {
  it("o cabeçalho da loja pergunta antes de desenhar o estado", () => {
    const h = ler("src/app/pedido/[slug]/StoreHeader.tsx");
    expect(h).toContain("semHorarioParaMostrar");
    // A metade que reprova o retrocesso: voltar a desenhar "Aberto agora"
    // incondicionalmente. O ponto verde tambem tem que sumir junto — bolinha
    // sozinha sem legenda e pior que a linha inteira.
    expect(h).toMatch(/\{!semHorarioParaMostrar &&/);
  });

  it("a página CALCULA e PASSA — campo calculado que não chega na tela é nada", () => {
    const p = ler("src/app/pedido/[slug]/page.tsx");
    expect(p).toContain("abre24hTodosOsDias(allHoursRows)");
    expect(p).toContain("semHorarioParaMostrar={semHorarioParaMostrar}");

    // … e o caminho do meio, que e onde esse tipo de prop costuma morrer.
    const loja = ler("src/app/pedido/[slug]/LojaClient.tsx");
    expect(loja).toContain("semHorarioParaMostrar={semHorarioParaMostrar}");
  });
});
