/**
 * PORTÃO CONTRA OS ARQUIVOS REAIS DESTE REPOSITÓRIO.
 *
 * Os testes de `montagem.test.ts` provam a REGRA com insumos fabricados. Este
 * arquivo prova que a regra sobrevive ao material de verdade — que é onde a
 * armadilha estava: o formato das entradas de oficina NÃO é uniforme, e um
 * contador ingênuo devolve zero para o `garcom`.
 *
 * Não toca prisma: importa só a metade de disco (`leituraDeArquivos`) e a
 * montagem pura.
 */

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { veio } from "../amostra";
import { lerAgentesDeDesenvolvimento } from "../leituraDeArquivos";
import {
  AGENTES_COM_CUSTO_ATRIBUIDO,
  ESSENCIAIS,
  montarSalaDosAgentes,
} from "../montagem";

const RAIZ = process.cwd();
const AGORA = new Date();

function salaDeDesenvolvimento() {
  return montarSalaDosAgentes({
    agora: AGORA,
    janelaDias: 30,
    perfisDeProduto: veio([]),
    motoresPorSlug: {},
    arquivosDeDesenvolvimento: lerAgentesDeDesenvolvimento(RAIZ),
    usoDeIA: veio([]),
    provedoresLigados: [],
  });
}

describe("os agentes deste repositório aparecem na Sala", () => {
  const sala = salaDeDesenvolvimento();

  it("todo perfil em .claude/agents virou cartão", () => {
    const arquivos = readdirSync(path.join(RAIZ, ".claude", "agents"))
      .filter((f) => f.endsWith(".md"))
      .map((f) => f.replace(/\.md$/, ""))
      .sort();
    expect(sala.agentes.map((a) => a.slug).sort()).toEqual(arquivos);
    expect(arquivos.length).toBeGreaterThanOrEqual(5);
  });

  it("os cinco Essenciais estão marcados", () => {
    for (const slug of ESSENCIAIS) {
      const cartao = sala.agentes.find((a) => a.slug === slug);
      expect(cartao, `${slug} sumiu da Sala`).toBeDefined();
      expect(cartao!.essencial, slug).toBe(true);
    }
  });

  it("nenhum cartão tem nome ou função vazios", () => {
    for (const a of sala.agentes) {
      expect(a.nome.trim().length, a.slug).toBeGreaterThan(0);
      expect(a.funcao.trim().length, a.slug).toBeGreaterThan(0);
    }
  });
});

describe("a armadilha da contagem, medida contra os arquivos de verdade", () => {
  const sala = salaDeDesenvolvimento();

  it("`garcom` NÃO conta zero — a oficina dele não usa `## `", () => {
    /*
      Esta é a asserção que dá razão de existir ao módulo de contagem.
      `docs/agents/garcom/oficina.md` registra os blocos como
      `2026-08-03 — **título**` depois de uma régua horizontal, sem cabeçalho
      nenhum. Um `grep -c '^## '` devolve 0 — e zero, aqui, seria a mentira que
      esta tela existe para não contar.
    */
    const garcom = sala.agentes.find((a) => a.slug === "garcom")!;
    const oficina = garcom.metricas.find((m) => m.rotulo === "Entradas na oficina")!.medida;
    expect(oficina.estado).toBe("medido");
    if (oficina.estado === "medido") expect(oficina.valor).toBeGreaterThanOrEqual(7);
  });

  it("nenhum agente com sala existente sai medido em zero", () => {
    // "medido: 0" é o estado que esta tela nunca pode produzir a partir de um
    // arquivo que tem conteúdo. Ou o número é real, ou é `naoMedido` com motivo.
    for (const a of sala.agentes) {
      for (const m of a.metricas) {
        if (m.medida.estado === "medido") {
          expect(m.medida.valor, `${a.slug} / ${m.rotulo}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("toda oficina lida foi reconhecida, ou a Sala declarou a lacuna", () => {
    const naoReconhecidos = sala.agentes.filter((a) => {
      const m = a.metricas.find((x) => x.rotulo === "Entradas na oficina")!.medida;
      return m.estado === "naoMedido" && m.motivo.includes("não reconhecido");
    });
    if (naoReconhecidos.length > 0) {
      expect(sala.lacunas.join(" ")).toContain("formato não reconhecido");
    }
    // Em 07/08/2026 os 11 arquivos de oficina existentes casam com um dos dois
    // formatos. Se um novo formato entrar, este teste continua verde — mas a
    // lacuna aparece na tela, que é o comportamento desejado.
    expect(naoReconhecidos.map((a) => a.slug)).toEqual([]);
  });

  it("agente sem sala vira `naoMedido` declarado, não zero", () => {
    const semSala = sala.agentes.filter((a) => {
      const m = a.metricas.find((x) => x.rotulo === "Entradas na oficina")!.medida;
      return m.estado === "naoMedido" && m.motivo.includes("não existe");
    });
    if (semSala.length > 0) {
      expect(sala.lacunas.join(" ")).toContain("Sem sala em docs/agents");
      for (const a of semSala) expect(a.estado).toBe("atencao");
    }
  });
});

// ── Travas estruturais: o que faz o motivo escrito na tela deixar de ser verdade ──

/**
 * Tira comentários antes de varrer.
 *
 * Sem isto o portão reprova a própria documentação — o cabeçalho de
 * `montagem.ts` cita `?? 0` justamente para explicar por que ele não existe lá.
 * Detector que barra o texto que explica a regra é o carimbo que faz o time
 * parar de escrever comentário.
 */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function arquivosDeCodigo(dir: string): string[] {
  const saida: string[] = [];
  for (const nome of readdirSync(dir)) {
    if (nome === "node_modules" || nome === ".next") continue;
    const completo = path.join(dir, nome);
    if (statSync(completo).isDirectory()) {
      saida.push(...arquivosDeCodigo(completo));
      continue;
    }
    if (/\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome)) saida.push(completo);
  }
  return saida;
}

describe("as afirmações que a Sala escreve na tela continuam verdadeiras", () => {
  it("`AIInteractionLog` ainda tem UM único escritor", () => {
    /*
      A Sala diz ao dono, em `lacunas`, que o custo cobre só o caminho do Garçom
      em `AIOrderService.ts:1271`. No dia em que um segundo `AIInteractionLogger.log`
      entrar, essa frase vira mentira — e mentira em texto explicativo é pior que
      número errado, porque desarma a desconfiança.

      A metade que reprova: acrescentar um segundo ponto de log sem atualizar
      `COBERTURA_DO_LOG` e `AGENTES_COM_CUSTO_ATRIBUIDO`.
    */
    const chamadas = arquivosDeCodigo(path.join(RAIZ, "src")).filter((f) =>
      /AIInteractionLogger\.log\(/.test(readFileSync(f, "utf8")),
    );
    expect(chamadas.map((f) => path.relative(RAIZ, f))).toEqual([
      "src/services/ai/AIOrderService.ts",
    ]);
    expect(AGENTES_COM_CUSTO_ATRIBUIDO).toEqual(["waiter"]);
  });

  it("nenhum módulo da Sala usa `?? 0`, `|| 0` ou `Number(x) || 0` em cima de métrica", () => {
    /*
      O tipo `Medida` existe justamente para tornar esse atalho desnecessário. A
      varredura é literal de propósito: foi um `?? 0` esquecido num consumidor que
      transformou o conserto do produtor de custo em número errado com aparência
      de auditado (vitrine do `cerebro`, 07/08).
    */
    const modulos = arquivosDeCodigo(path.join(RAIZ, "src/services/agents/sala"));
    expect(modulos.length).toBeGreaterThanOrEqual(5);
    for (const arquivo of modulos) {
      const fonte = semComentarios(readFileSync(arquivo, "utf8"));
      const rel = path.relative(RAIZ, arquivo);
      expect(fonte, `${rel} usa ?? 0`).not.toMatch(/\?\?\s*0\b/);
      expect(fonte, `${rel} usa || 0`).not.toMatch(/\|\|\s*0\b/);
    }
  });

  it("a montagem é pura: não importa prisma nem fs", () => {
    // Se a decisão voltar a morar junto do encanamento, o teste precisa mockar o
    // módulo inteiro — e a regra some de vista. Já aconteceu aqui.
    for (const nome of ["montagem.ts", "contagemDeEntradas.ts", "amostra.ts"]) {
      const fonte = semComentarios(
        readFileSync(path.join(RAIZ, "src/services/agents/sala", nome), "utf8"),
      );
      expect(fonte, `${nome} importa prisma`).not.toMatch(/from\s+["'].*prisma/);
      expect(fonte, `${nome} importa fs`).not.toMatch(/from\s+["']node:fs["']/);
      expect(fonte, `${nome} lê process.env`).not.toMatch(/process\.env/);
    }
  });
});
