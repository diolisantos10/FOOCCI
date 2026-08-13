/**
 * PORTÃO ESTRUTURAL — todo pedido que vira CONFIRMED carrega as MESMAS obrigações.
 *
 * Prompt é aviso; código é trava (guardrail 4). Esta lei já foi quebrada quatro
 * vezes DEPOIS de estar escrita: no raio-x de 13/08/2026 quatro caminhos
 * escreviam `status: "CONFIRMED"` num pedido sem enfileirar a comanda nem
 * emitir a NFC-e — e um deles (`/api/payments/stone/webhook`) era o caminho
 * NORMAL de pagamento de todo restaurante sem Mercado Pago.
 *
 * Um comentário pedindo cuidado não segura isso. O que segura é este arquivo:
 * ele varre o repositório, acha toda escrita de CONFIRMED num pedido e exige
 * que o arquivo culpado passe pelo ponto único (`runOrderConfirmedEffects`), ou
 * esteja numa lista de exceções com justificativa escrita.
 *
 * Segue o idioma de teste estrutural já usado nesta casa
 * (`src/security/routeGuards.test.ts`, `src/services/quality/noSideEffects.test.ts`):
 * varredura de sistema de arquivos + invariante, com a mensagem carregando o
 * ARQUIVO CULPADO (guardrail 6 — o alerta carrega a própria evidência).
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative, sep } from "path";

const SRC = join(process.cwd(), "src");

/** O ponto único. Quem escreve CONFIRMED num pedido tem que citá-lo. */
const PONTO_UNICO = "runOrderConfirmedEffects";

/** O arquivo dono — é ele que define o ponto único, então não o "usa". */
const ARQUIVO_DONO = join("src", "services", "order", "orderConfirmation.ts");

/**
 * Exceções, cada uma com o PORQUÊ. Esta lista só DIMINUI (guardrail 3).
 *
 * Nenhuma entrada aqui é "tudo bem": são casos em que a obrigação legitimamente
 * não se aplica, ou defeito conhecido de OUTRO domínio, deixado visível de
 * propósito em vez de escondido.
 */
const EXCECOES: Record<string, string> = {
  [join("src", "services", "crm", "OrderImportService.ts")]:
    "Importação de histórico (iFood/planilha). Grava `importedAt` e representa pedido " +
    "que JÁ aconteceu noutro sistema: imprimir uma comanda de um pedido de três meses " +
    "atrás, ou emitir NFC-e dele, seria produzir papel e documento fiscal falsos.",

  [join("src", "services", "whatsapp", "ordering", "WhatsAppOrderCreationService.ts")]:
    "DEFEITO CONHECIDO, domínio do `canais`, NÃO consertado aqui por ordem do Diretor " +
    "(13/08/2026): pedido por conversa de WhatsApp vira CONFIRMED e nunca imprime " +
    "comanda nem emite nota. O canal está em piloto restrito por lista de telefones. " +
    "Está nesta lista para ficar VISÍVEL — não para ser tolerado. Sai daqui quando o " +
    "`canais` consertar.",
};

// ── Varredura ────────────────────────────────────────────────────────────────

function listarArquivos(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const cheio = join(dir, nome);
    if (statSync(cheio).isDirectory()) {
      listarArquivos(cheio, out);
    } else if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) {
      out.push(cheio);
    }
  }
  return out;
}

/**
 * Acha escritas de `status: "CONFIRMED"` que caem num PEDIDO.
 *
 * O cuidado que este detector precisa ter: `orderDraft.update({ status:
 * "CONFIRMED" })` aparece em oito lugares e NÃO é pedido — é o rascunho de
 * carrinho sendo fechado. Confundir os dois encheria a lista de exceções de
 * ruído e desmoralizaria o portão.
 *
 * Por isso a detecção é pela CHAMADA: procuramos `<algo>.order.<verbo>(` (nunca
 * `.orderDraft.`) e olhamos a janela de texto seguinte.
 */
const CHAMADA_EM_PEDIDO = /\b(?:prisma|tx|client|db)\.order\.(?:update|updateMany|upsert|create|createMany)\s*\(/g;

/**
 * O corpo EXATO da chamada, do `(` até o `)` que o fecha.
 *
 * Uma janela de N caracteres não serve, e isso não é teoria: a primeira versão
 * deste portão usava 700 caracteres e acusou `confirm-manual-payment` — que
 * estava CERTO — porque a janela alcançava o `{ status: "CONFIRMED" }` da
 * chamada a `OrderService.updateStatus` logo abaixo. Portão que acusa inocente
 * é portão que alguém desliga.
 */
function corpoDaChamada(codigo: string, aberturaIdx: number): string {
  let profundidade = 0;
  for (let i = aberturaIdx; i < codigo.length; i++) {
    const c = codigo[i];
    if (c === "(") profundidade++;
    else if (c === ")") {
      profundidade--;
      if (profundidade === 0) return codigo.slice(aberturaIdx, i + 1);
    }
  }
  return codigo.slice(aberturaIdx); // não fechou (arquivo truncado) — analisa o resto
}

function escreveConfirmedEmPedido(codigo: string): boolean {
  CHAMADA_EM_PEDIDO.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = CHAMADA_EM_PEDIDO.exec(codigo)) !== null) {
    const abertura = codigo.indexOf("(", m.index);
    if (abertura === -1) continue;
    if (/status:\s*"CONFIRMED"/.test(corpoDaChamada(codigo, abertura))) return true;
  }
  return false;
}

function relativo(caminho: string): string {
  return relative(process.cwd(), caminho).split("/").join(sep);
}

describe("portão: todo pedido CONFIRMED carrega as mesmas obrigações", () => {
  const arquivos = listarArquivos(SRC);

  it("nenhum arquivo escreve CONFIRMED num pedido sem passar pelo ponto único", () => {
    const culpados: string[] = [];

    for (const cheio of arquivos) {
      const rel = relativo(cheio);
      if (rel === ARQUIVO_DONO) continue;
      if (rel in EXCECOES) continue;

      const codigo = readFileSync(cheio, "utf8");
      if (!escreveConfirmedEmPedido(codigo)) continue;
      if (codigo.includes(PONTO_UNICO)) continue;

      culpados.push(rel);
    }

    expect(
      culpados,
      culpados.length === 0
        ? ""
        : `Estes arquivos põem um PEDIDO em CONFIRMED sem chamar ${PONTO_UNICO}() — ` +
          `ou seja, o pedido é confirmado e a comanda NÃO vai para a impressora e a ` +
          `NFC-e NÃO é emitida. Foi exatamente assim que quatro rotas quebraram até ` +
          `13/08/2026, e quem descobre é o cliente esperando a comida.\n\n` +
          culpados.map((c) => `  • ${c}`).join("\n") +
          `\n\nConserte chamando ${PONTO_UNICO}() (ou passando por ` +
          `OrderService.updateStatus). Se a obrigação de fato não se aplica, ` +
          `acrescente o arquivo a EXCECOES em ${ARQUIVO_DONO.replace(".ts", "")}` +
          `.test.ts COM a justificativa escrita.`,
    ).toEqual([]);
  });

  it("a lista de exceções não guarda arquivo que não existe mais nem que já foi consertado", () => {
    // Exceção obsoleta é pior que exceção: ela autoriza um caminho que ninguém
    // mais revisa. Se o arquivo sumiu, ou se ele parou de escrever CONFIRMED, a
    // entrada tem que sair da lista — a lista só diminui.
    const obsoletas: string[] = [];

    for (const rel of Object.keys(EXCECOES)) {
      const cheio = join(process.cwd(), rel);
      let codigo: string;
      try {
        codigo = readFileSync(cheio, "utf8");
      } catch {
        obsoletas.push(`${rel} (arquivo não existe mais)`);
        continue;
      }
      if (!escreveConfirmedEmPedido(codigo)) {
        obsoletas.push(`${rel} (não escreve mais CONFIRMED num pedido)`);
      }
    }

    expect(
      obsoletas,
      `Entradas obsoletas na lista de exceções — remova-as:\n` +
        obsoletas.map((o) => `  • ${o}`).join("\n"),
    ).toEqual([]);
  });

  it("o detector distingue pedido de rascunho de carrinho", () => {
    // Metade que DEVE pegar
    expect(escreveConfirmedEmPedido(`await tx.order.update({ where: { id }, data: { status: "CONFIRMED" } });`))
      .toBe(true);
    expect(escreveConfirmedEmPedido(`prisma.order.update({\n  where: { id: orderId },\n  data: { status: "CONFIRMED" },\n});`))
      .toBe(true);

    // Metade que NÃO pode pegar: fechar o rascunho de carrinho não é confirmar pedido
    expect(escreveConfirmedEmPedido(`await prisma.orderDraft.updateMany({ where: { id }, data: { status: "CONFIRMED", confirmedAt: new Date() } });`))
      .toBe(false);
    // Nem uma tabela de rótulos de tela
    expect(escreveConfirmedEmPedido(`const LABELS = [{ status: "CONFIRMED", label: "Confirmado" }];`))
      .toBe(false);

    // O falso positivo que a primeira versão deste portão produziu: uma escrita
    // de OUTRO campo no pedido, seguida logo abaixo pela chamada ao ponto único.
    // A janela fixa acusava; o corpo exato da chamada não acusa.
    expect(escreveConfirmedEmPedido(
      `await tx.order.update({ where: { id: orderId }, data: { notes: nota } });\n` +
      `await OrderService.updateStatus(restaurantId, orderId, { status: "CONFIRMED" });`
    )).toBe(false);
  });
});
