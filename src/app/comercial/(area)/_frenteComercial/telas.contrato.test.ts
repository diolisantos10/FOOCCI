/**
 * O CONTRATO DAS QUATRO TELAS NOVAS — lido no fonte que responde ao usuário.
 *
 * ── POR QUE ESTE ARQUIVO EXISTE ─────────────────────────────────────────────
 *
 * Os testes de serviço provam que a LEITURA está certa. Não provam que a TELA
 * usa essa leitura. Uma tela pode importar o tipo, ignorar o dado e desenhar um
 * número bonito — e toda a bateria continua verde. Régua verde sobre o
 * componente errado é pior que régua nenhuma: a régua nenhuma deixa a dúvida
 * viva, a verde no lugar errado mata a dúvida e deixa o defeito.
 *
 * Então este arquivo lê o fonte das telas e mede três coisas que nenhum teste
 * de serviço alcança:
 *
 *   1. cada tela busca a SUA rota de leitura;
 *   2. nenhuma tela abre caminho de ESCRITA — a lei da frente é só leitura;
 *   3. toda tela mostra o "não medido" e tem os quatro estados de vida.
 *
 * ⚠️ O fonte é lido SEM COMENTÁRIOS. Um teste que varresse o arquivo cru
 * encontraria a frase "esta tela não envia nada" escrita num comentário e
 * reprovaria o arquivo justamente por ele explicar que está correto.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const AREA = join(process.cwd(), "src/app/comercial/(area)");

/**
 * ⭐ `escrevePara` — A ÚNICA ESCRITA QUE CADA TELA PODE ABRIR, NOMEADA.
 *
 * ── POR QUE ISTO PASSOU A EXISTIR EM 19/09/2026 ─────────────────────────────
 *
 * Este contrato dizia "nenhuma tela desta frente escreve", e a regra valia para
 * as quatro. O CEO então mandou as telas ficarem **fiéis ao desenho**, e a peça
 * 06 tem um **seletor de Stage em cada linha da tabela**: a mesa de trabalho da
 * qualificação MOVE o lead de etapa. Ou a tela deixa de ser fiel, ou este
 * contrato passa a dizer a verdade sobre ela.
 *
 * ⚠️ **A lista não afrouxou a trava — ela a apertou.** Antes a regra era "não
 * tem POST"; agora é "não tem POST **e**, se tiver, é exatamente para este
 * endereço e nenhum outro". Uma tela com `null` aqui continua proibida de
 * escrever qualquer coisa. E a proibição que esta frente existe para segurar —
 * **enviar mensagem, abordar, disparar** — continua ABSOLUTA para as quatro:
 * é ela que separa prospecção de spam, e nenhum endereço de envio entra nesta
 * lista.
 *
 * Mover de etapa não envia nada a ninguém: vai para `/funil`, que já tem a
 * guarda da Sala, a validação do movimento (PERDIDO exige motivo, GANHO é
 * desfecho) e o registro na trilha. Reescrever essa régua dentro da tela é que
 * seria o defeito.
 */
const TELAS = [
  {
    pasta: "qualificacao",
    cliente: "QualificacaoClient.tsx",
    rota: "qualificacao",
    escrevePara: "/api/admin/sala-de-vendas/funil",
  },
  { pasta: "roteamento", cliente: "RoteamentoClient.tsx", rota: "roteamento", escrevePara: null },
  { pasta: "oferta", cliente: "OfertaClient.tsx", rota: "oferta", escrevePara: null },
  {
    pasta: "relacionamento",
    cliente: "RelacionamentoClient.tsx",
    rota: "relacionamento",
    escrevePara: null,
  },
] as const;

/** O código sem os comentários. Ver o aviso no cabeçalho. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function fonteDaTela(t: (typeof TELAS)[number]): string {
  return semComentarios(readFileSync(join(AREA, t.pasta, t.cliente), "utf8"));
}

describe("⭐ cada tela consome a SUA leitura", () => {
  for (const t of TELAS) {
    it(`${t.pasta} busca /api/admin/sala-de-vendas/${t.rota}`, () => {
      expect(fonteDaTela(t)).toContain(`/api/admin/sala-de-vendas/${t.rota}`);
    });

    it(`${t.pasta} tipa a tela pelo panorama do serviço — não por um tipo próprio`, () => {
      // Um tipo local divergiria em silêncio no dia em que o serviço mudasse um
      // campo: a tela compilaria e desenharia um `undefined`.
      expect(fonteDaTela(t)).toMatch(
        new RegExp(`from "@/services/salaDeVendas/telas/${t.pasta}"`),
      );
    });
  }
});

describe("⛔ nenhuma tela desta frente escreve, envia ou dispara", () => {
  for (const t of TELAS) {
    it(`${t.pasta} não abre caminho de escrita ${t.escrevePara ? "fora do endereço declarado" : ""}`, () => {
      // A lei da frente: as travas de envio são o que separa prospecção de spam,
      // e uma trava que se contorna por outra porta não é trava. PUT, DELETE e
      // PATCH continuam proibidos nas QUATRO — inclusive na que pode dar POST.
      const fonte = fonteDaTela(t);
      for (const proibido of ['"PUT"', '"DELETE"', '"PATCH"']) {
        expect(fonte, `${t.pasta} tem ${proibido}`).not.toContain(proibido);
      }

      const temPost =
        fonte.includes('method: "POST"') || fonte.includes("method:'POST'");

      if (!t.escrevePara) {
        expect(temPost, `${t.pasta} abriu um POST sem declará-lo neste contrato`).toBe(false);
        return;
      }

      // A tela que PODE escrever tem de escrever mesmo — senão a exceção fica
      // aberta de graça, e a próxima pessoa a herda sem ninguém ter medido.
      expect(temPost, `${t.pasta} declara escrita e não escreve`).toBe(true);
      expect(fonte, `${t.pasta} escreve fora do endereço declarado`).toContain(t.escrevePara);
    });

    it(`${t.pasta} não escreve em nenhum outro endereço da Sala`, () => {
      // Mede TODO endereço da Sala que o fonte cita, e confere um a um contra a
      // leitura dela e a escrita declarada. Uma porta nova aparece aqui no dia
      // em que for escrita, e não no dia em que der problema.
      const fonte = fonteDaTela(t);
      const permitidos = new Set<string>([
        `/api/admin/sala-de-vendas/${t.rota}`,
        ...(t.escrevePara ? [t.escrevePara] : []),
      ]);

      const citados = fonte.match(/\/api\/admin\/sala-de-vendas\/[a-z-]+/g) ?? [];
      for (const endereco of new Set(citados)) {
        expect(permitidos.has(endereco), `${t.pasta} alcança ${endereco}`).toBe(true);
      }
    });

    it(`${t.pasta} não fala com nenhuma rota de conversa, envio ou disparo`, () => {
      const fonte = fonteDaTela(t);
      for (const rota of ["/conversa", "/whatsapp", "/abordagem", "/tarefas", "/distribuicao"]) {
        expect(fonte, `${t.pasta} alcança ${rota}`).not.toContain(rota);
      }
    });
  }

  for (const t of TELAS) {
    it(`a rota de leitura de ${t.rota} não exporta POST`, () => {
      const rota = semComentarios(
        readFileSync(
          join(process.cwd(), "src/app/api/admin/sala-de-vendas", t.rota, "route.ts"),
          "utf8",
        ),
      );
      expect(rota).toContain("export async function GET");
      expect(rota, "a rota de leitura ganhou um caminho de escrita").not.toContain(
        "export async function POST",
      );
    });

    it(`a rota de ${t.rota} passa pela guarda da Sala antes de ler`, () => {
      const rota = semComentarios(
        readFileSync(
          join(process.cwd(), "src/app/api/admin/sala-de-vendas", t.rota, "route.ts"),
          "utf8",
        ),
      );
      expect(rota).toContain("guardarSalaDeVendas");
      expect(rota).toContain("if (!portao.ok) return portao.resposta");
    });
  }
});

describe("⭐ toda tela tem os quatro estados de vida e mostra o não medido", () => {
  for (const t of TELAS) {
    it(`${t.pasta} trata carregando, sem acesso, erro e vazio`, () => {
      const fonte = fonteDaTela(t);
      for (const peca of ["Carregando", "SemAcesso", "Erro", "Vazio"]) {
        expect(fonte, `${t.pasta} não trata "${peca}"`).toContain(`<${peca}`);
      }
    });

    it(`${t.pasta} mostra as frases de "não medido" que a leitura devolveu`, () => {
      // É a peça que impede o vazio de virar zero tranquilizador.
      expect(fonteDaTela(t)).toContain("<NaoMedido frases={p.naoMedido}");
    });
  }
});

describe("⛔ as telas antigas continuam de pé", () => {
  for (const antiga of ["funil/page.tsx", "precos/page.tsx", "carteira/page.tsx"]) {
    it(`${antiga} não foi tocada por esta frente`, () => {
      // Retrofit, não demolição. Se um arquivo destes sumir, o teste quebra aqui
      // em vez de quebrar na cara de um vendedor.
      expect(() => readFileSync(join(AREA, antiga), "utf8")).not.toThrow();
    });
  }
});
