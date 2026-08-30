/**
 * ⭐⭐ A TRAVA DO CONTRATO COMUM — copiada junto, vermelha na divergência.
 *
 * ─── ESTE ARQUIVO É COPIADO PARA OS QUATRO PRODUTOS SEM EDIÇÃO ──────────────
 *
 * Decisão C3 do CEO (30/08/2026): *"o contrato comum não pode virar quatro
 * cópias independentes que evoluem de maneira diferente. Versão identificável,
 * testes de compatibilidade em todos os produtos, alteração incompatível
 * BLOQUEADA — vermelho, não aviso."*
 *
 * O que este teste faz, em uma frase: **refaz a impressão digital de cada
 * arquivo comum e compara com a gravada.** Editou uma linha de qualquer um
 * deles, em qualquer um dos quatro repositórios, a CI daquele produto fica
 * vermelha dizendo qual arquivo divergiu e qual é a impressão nova.
 *
 * ─── AS TRÊS COISAS QUE ELE PRENDE, E POR QUE SÃO TRÊS ──────────────────────
 *
 *   1. **O conteúdo.** Um `if` consertado localmente reprova.
 *   2. **A lista.** Um arquivo comum NOVO que ninguém registrou reprova — sem
 *      isto, bastaria criar `politicas2.ts` para escapar da trava inteira.
 *   3. **A separação.** Um arquivo comum que importe de fora da pasta reprova.
 *      É a trava que faz "copiar é ligar, não reescrever" ser verdade em vez de
 *      intenção: um `import "@/services/salaDeVendas/..."` dentro do contrato
 *      comum quebraria a cópia no primeiro produto que não tivesse a Sala.
 *
 * ─── ⚠️ E A OUTRA METADE ────────────────────────────────────────────────────
 *
 * Uma trava que só reprova não separa nada. Este arquivo prova as duas: que uma
 * cópia íntegra PASSA, e que uma cópia com um byte a mais REPROVA — com a
 * mutação feita na hora, sobre o conteúdo de verdade, em vez de descrita num
 * comentário.
 */

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import {
  ARQUIVOS_DO_CONTRATO,
  VERSAO_DO_CONTRATO,
  contratoCompativel,
  lerVersao,
} from "../versao";

/** A pasta do contrato comum. Este teste vive em `conector/tests/`. */
const PASTA = path.resolve(__dirname, "..");

/**
 * Os arquivos que NÃO fazem parte do contrato comum, e por quê:
 *   · `versao.ts` guarda as impressões — não pode conter a própria;
 *   · `foocci/` é a LIGAÇÃO LOCAL, que é diferente em cada produto;
 *   · `tests/` é este arquivo e os do produto.
 */
const FORA_DO_CONTRATO = new Set(["versao.ts"]);

function impressao(conteudo: string): string {
  return createHash("sha256").update(conteudo, "utf8").digest("hex");
}

function arquivosComunsNaPasta(): string[] {
  return readdirSync(PASTA, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".ts") && !FORA_DO_CONTRATO.has(e.name))
    .map((e) => e.name)
    .sort();
}

function conteudo(nome: string): string {
  return readFileSync(path.join(PASTA, nome), "utf8");
}

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐⭐ o contrato comum tem versão, e a divergência fica VERMELHA", () => {
  it("a versão é um semver legível", () => {
    expect(lerVersao(VERSAO_DO_CONTRATO)).not.toBeNull();
  });

  /**
   * ⭐ TRAVA 2 — a lista cobre exatamente os arquivos comuns da pasta.
   *
   * MUTAÇÃO: criar `conector/atalho.ts` e não registrá-lo em `versao.ts`
   * → este fica vermelho. Sem ele, a trava do conteúdo seria contornável só
   * escrevendo o código divergente num arquivo novo.
   */
  it("⭐ a lista de arquivos do contrato bate com a pasta, sem sobra nem falta", () => {
    expect(Object.keys(ARQUIVOS_DO_CONTRATO).sort()).toEqual(arquivosComunsNaPasta());
  });

  /**
   * ⭐⭐ TRAVA 1 — o conteúdo de cada arquivo comum.
   *
   * MUTAÇÃO: mudar um caractere de `barreira.ts`
   * → este fica vermelho e diz qual arquivo, com a impressão nova para colar.
   */
  it("⭐⭐ nenhum arquivo do contrato comum foi editado neste produto", () => {
    const divergentes: string[] = [];
    for (const [nome, gravada] of Object.entries(ARQUIVOS_DO_CONTRATO)) {
      const agora = impressao(conteudo(nome));
      if (agora !== gravada) divergentes.push(`  "${nome}": "${agora}",`);
    }

    expect(
      divergentes,
      divergentes.length === 0
        ? ""
        : [
            "",
            "⛔ O CONTRATO COMUM DO CONECTOR FOI EDITADO NESTE PRODUTO.",
            "",
            "Isto não é um arquivo local: os quatro produtos usam a MESMA cópia, e uma edição aqui",
            "cria o segundo contrato. Se a mudança é legítima, ela se faz UMA vez, no dono do padrão,",
            "sobe `VERSAO_DO_CONTRATO` e é copiada para os outros três — nunca ao contrário.",
            "",
            "Se a mudança É a mudança do padrão, cole isto em `conector/versao.ts`:",
            "",
            ...divergentes,
            "",
          ].join("\n"),
    ).toEqual([]);
  });

  /**
   * ⭐ TRAVA 3 — o contrato comum não conhece o produto.
   *
   * MUTAÇÃO: acrescentar `import { prisma } from "@/lib/prisma"` a
   * `pendencias.ts` → este fica vermelho. É o que impede o padrão de virar
   * "padrão que só monta no Foocci".
   */
  it("⭐ nenhum arquivo comum importa de fora da pasta do conector", () => {
    const proibidos: string[] = [];
    for (const nome of arquivosComunsNaPasta()) {
      const texto = conteudo(nome);
      for (const m of texto.matchAll(/^\s*import\s[^;]*?from\s+"([^"]+)"/gm)) {
        const alvo = m[1]!;
        // Permitido: irmãos da própria pasta (`./x`), a guarda do segredo
        // (`../porta`, que é a porta corporativa do produto e existe nos
        // quatro), e módulos do runtime (`crypto`, `node:*`).
        const ok =
          alvo.startsWith("./") ||
          alvo === "../porta" ||
          alvo === "crypto" ||
          alvo.startsWith("node:");
        if (!ok) proibidos.push(`${nome} importa ${alvo}`);
      }
    }
    expect(proibidos).toEqual([]);
  });

  /**
   * ⭐ A OUTRA METADE, e ela é a que dá sentido às três de cima.
   *
   * Uma trava que só reprova não separa nada: se ela reprovasse sempre, também
   * ficaria vermelha aqui, e ninguém saberia se ela mede alguma coisa. Aqui a
   * cópia íntegra PASSA e a cópia com um byte a mais REPROVA — com a mutação
   * feita na hora, sobre o conteúdo de verdade.
   */
  it("⭐ A OUTRA METADE — cópia íntegra passa; um byte a mais reprova", () => {
    const alvo = "barreira.ts";
    const original = conteudo(alvo);

    // Íntegra: passa.
    expect(impressao(original)).toBe(ARQUIVOS_DO_CONTRATO[alvo]);

    // Um byte a mais — a edição inocente que alguém faria num sábado.
    const editada = original.replace("export const CAMPO_EXTERNO", "export const  CAMPO_EXTERNO");
    expect(editada, "a mutação precisa mudar o arquivo de verdade").not.toBe(original);
    expect(impressao(editada)).not.toBe(ARQUIVOS_DO_CONTRATO[alvo]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("⭐ incompatível é BLOQUEADO, e compatível passa", () => {
  it("MAIOR diferente é recusa — nos dois sentidos", () => {
    expect(contratoCompativel("1.0.0", "2.0.0").compativel).toBe(false);
    expect(contratoCompativel("2.0.0", "1.9.9").compativel).toBe(false);
  });

  it("⭐ A OUTRA METADE — MENOR e REMENDO diferentes passam, nos dois sentidos", () => {
    // Campo novo opcional do outro lado: eu não leio o que não conheço.
    expect(contratoCompativel("1.0.0", "1.7.3").compativel).toBe(true);
    // Campo novo opcional do meu lado: ele ignora o que não conhece.
    expect(contratoCompativel("1.7.3", "1.0.0").compativel).toBe(true);
    expect(contratoCompativel("1.0.0", "1.0.0").compativel).toBe(true);
  });

  it("⚠️ versão ausente passa — ausência de informação não é informação", () => {
    // Não declarar versão não é declarar incompatibilidade, e derrubar por isso
    // jogaria fora a decisão de um gerente que já foi tomada.
    expect(contratoCompativel("1.0.0", null).compativel).toBe(true);
    expect(contratoCompativel("1.0.0", undefined).compativel).toBe(true);
    expect(contratoCompativel("1.0.0", "  ").compativel).toBe(true);
  });

  it("versão que não é semver é recusa, e não é tratada como ausente", () => {
    expect(contratoCompativel("1.0.0", "ultima").compativel).toBe(false);
    expect(contratoCompativel("1.0.0", "v1").compativel).toBe(false);
  });

  it("o motivo da recusa diz o que fazer, e não só que deu errado", () => {
    const r = contratoCompativel("1.0.0", "2.0.0");
    expect(r.compativel).toBe(false);
    if (!r.compativel) expect(r.motivo).toMatch(/copia a pasta|copiar/i);
  });
});
