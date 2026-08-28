/**
 * A PORTA DO CADASTRO FRIO, EXERCITADA PELA PORTA.
 *
 * ── POR QUE PELA PORTA, E NÃO PELA TELA ─────────────────────────────────────
 *
 * A tela desenha um seletor de origem obrigatório e só habilita o botão quando
 * ele está preenchido. Isso não é autorização nem validação: é conveniência.
 * Quem souber o endereço manda o JSON que quiser, e é assim que estes testes
 * mandam — sem passar por tela nenhuma. É o caminho de quem quer burlar, e é
 * por ele que a rota precisa ser exercitada.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece duas vezes: barrando quem não pode E deixando passar quem
 * pode. Um arquivo só com a primeira metade ficaria verde contra uma rota que
 * recusasse todo mundo — e uma rota assim é indistinguível de uma quebrada, com
 * o agravante de parecer segura.
 *
 * ── O DEFEITO MAIS CARO QUE ESTE ARQUIVO TRANCA ─────────────────────────────
 *
 * **O autor vindo do corpo.** A interação `CAPTURA` que fica na ficha do lead é
 * quem responde "quem trouxe este contato para a base". Se o formulário pudesse
 * escolher esse nome, o registro de responsabilidade seria escrito por quem age
 * — que é o mesmo que não existir.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { lerColagem } from "@/services/salaDeVendas/frios";

const autorizarInterno = vi.fn();
const criarEvento = vi.fn();
const cadastrarFrios = vi.fn();

vi.mock("@/lib/internal-auth", async () => {
  const real = await vi.importActual<typeof import("@/lib/internal-auth")>("@/lib/internal-auth");
  return { ...real, autorizarInterno: (...a: unknown[]) => autorizarInterno(...a) };
});

vi.mock("@/lib/prisma", () => ({
  prisma: {
    internalAuditEvent: { create: (...a: unknown[]) => criarEvento(...a) },
  },
}));

// O serviço tem testes próprios (`frios.test.ts`). Aqui o assunto é o que a
// rota monta em volta dele: quem entra, o que ela recusa antes de chamar, e o
// que ela devolve para a tela. As funções puras seguem sendo as de verdade.
vi.mock("@/services/salaDeVendas/frios", async () => {
  const real = await vi.importActual<typeof import("@/services/salaDeVendas/frios")>(
    "@/services/salaDeVendas/frios",
  );
  return { ...real, cadastrarFrios: (...a: unknown[]) => cadastrarFrios(...a) };
});

const SDR = {
  userId: "u-sdr",
  nome: "Marina",
  role: "AGENTE_HUMANO" as const,
  departamentos: ["vendas"],
  gerencia: [],
};

const CEO = { ...SDR, userId: "u-ceo", nome: "Dioli", role: "MASTER_CEO" as const };
const AUDITOR = { ...SDR, userId: "u-qa", nome: "QA", role: "AUDITOR_QA" as const };

const ANA = "11 98888-7777";
const BIA = "21 97777-6666";

const COLAGEM =
  `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
  `Bia Ramos\t${BIA}\tCantina da Bia\tRio de Janeiro`;

const ROTA = "/api/admin/sala-de-vendas/frios";

function post(corpo: unknown): NextRequest {
  return new NextRequest(
    new Request(`https://foocci.com.br${ROTA}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(corpo),
    }),
  );
}

function get(): NextRequest {
  return new NextRequest(new Request(`https://foocci.com.br${ROTA}`));
}

const semSessao = () =>
  autorizarInterno.mockReturnValue({
    ok: false,
    status: 401,
    motivo: "sem sessão interna",
    sessao: null,
  });

beforeEach(() => {
  autorizarInterno.mockReset().mockReturnValue({ ok: true, sessao: SDR });
  criarEvento.mockReset().mockResolvedValue({});
  cadastrarFrios.mockReset().mockResolvedValue({ criados: 2, jaExistiam: 0, recusadas: [] });
});

// ═══════════════════════════════════════════════════════════════════════════
// QUEM ENTRA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ cadastro frio — quem entra", () => {
  it("o SDR cadastra: é o trabalho que o CEO pediu para ele", async () => {
    // A metade que PASSA. Sem ela, tudo abaixo ficaria verde contra uma rota
    // que recusasse todo mundo — e a planilha continuaria no Google Drive.
    const { POST } = await import("./frios/route");
    const res = await POST(post({ texto: COLAGEM, origem: "PROSPECCAO" }));

    expect(res.status).toBe(200);
    expect(cadastrarFrios).toHaveBeenCalledTimes(1);
    expect((await res.json()).data).toEqual({ criados: 2, jaExistiam: 0, recusadas: [] });
  });

  it("o CEO também", async () => {
    autorizarInterno.mockReturnValue({ ok: true, sessao: CEO });

    const { POST } = await import("./frios/route");
    expect((await POST(post({ texto: COLAGEM, origem: "PROSPECCAO" }))).status).toBe(200);
  });

  it("⭐ sem sessão, 401 — e o serviço NÃO é chamado", async () => {
    // Esconder a aba do menu não é autorização. Quem digitar o endereço direto
    // bate aqui, e é aqui que a porta fecha.
    semSessao();

    const { POST } = await import("./frios/route");
    const res = await POST(post({ texto: COLAGEM, origem: "PROSPECCAO" }));

    expect(res.status).toBe(401);
    expect(cadastrarFrios).not.toHaveBeenCalled();
  });

  it("o auditor lê e não escreve: 403, e nada é gravado", async () => {
    // Quem audita a base não alimenta a base que audita.
    autorizarInterno.mockReturnValue({ ok: true, sessao: AUDITOR });

    const { POST } = await import("./frios/route");
    const res = await POST(post({ texto: COLAGEM, origem: "PROSPECCAO" }));

    expect(res.status).toBe(403);
    expect(cadastrarFrios).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A ASSINATURA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o autor vem da sessão, e o corpo não consegue escolher outro", () => {
  it("o autor forjado no corpo é IGNORADO", async () => {
    const { POST } = await import("./frios/route");
    await POST(
      post({
        texto: COLAGEM,
        origem: "PROSPECCAO",
        // Tudo isto é o que um pedido forjado mandaria. Nada disso é lido.
        autorUserId: "u-outro",
        autorNome: "Fulano que não existe",
        actor: "u-outro",
        quem: "u-outro",
      }),
    );

    const pedido = cadastrarFrios.mock.calls[0]![1] as {
      autorUserId: string;
      autorNome: string;
    };
    expect(pedido.autorUserId).toBe("u-sdr");
    expect(pedido.autorNome).toBe("Marina");
  });

  it("trocar a sessão troca o autor — é ela, e só ela, que decide", async () => {
    // A metade que passa: o autor não é uma constante escrita na rota, é quem
    // está logado. Sem este caso, um `autorNome: "Marina"` cravado no código
    // passaria no teste acima.
    autorizarInterno.mockReturnValue({ ok: true, sessao: CEO });

    const { POST } = await import("./frios/route");
    await POST(post({ texto: COLAGEM, origem: "PROSPECCAO", autorNome: "Fulano" }));

    const pedido = cadastrarFrios.mock.calls[0]![1] as { autorUserId: string; autorNome: string };
    expect(pedido.autorUserId).toBe("u-ceo");
    expect(pedido.autorNome).toBe("Dioli");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A ORIGEM
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ a origem é obrigatória, e a rota é quem cobra", () => {
  it("sem origem, 400 — e nada é gravado", async () => {
    const { POST } = await import("./frios/route");
    const res = await POST(post({ texto: COLAGEM }));

    expect(res.status).toBe(400);
    expect(cadastrarFrios).not.toHaveBeenCalled();
  });

  it("origem inventada, 400", async () => {
    const { POST } = await import("./frios/route");
    const res = await POST(post({ texto: COLAGEM, origem: "AMIGO_DO_PRIMO" }));

    expect(res.status).toBe(400);
    expect(cadastrarFrios).not.toHaveBeenCalled();
  });

  it("OUTRO sem descrição, 400", async () => {
    const { POST } = await import("./frios/route");
    const res = await POST(post({ texto: COLAGEM, origem: "OUTRO" }));

    expect(res.status).toBe(400);
    expect(cadastrarFrios).not.toHaveBeenCalled();
  });

  it("OUTRO COM descrição passa, e a descrição chega ao serviço", async () => {
    // A metade que passa. "OUTRO" existe porque obrigar a mentir numa lista
    // curta é pior que aceitar uma resposta honesta e vaga.
    const { POST } = await import("./frios/route");
    const res = await POST(
      post({
        texto: COLAGEM,
        origem: "OUTRO",
        descricaoDaOrigem: "grupo de donos de bar no WhatsApp",
      }),
    );

    expect(res.status).toBe(200);
    const pedido = cadastrarFrios.mock.calls[0]![1] as { descricaoDaOrigem: string | null };
    expect(pedido.descricaoDaOrigem).toBe("grupo de donos de bar no WhatsApp");
  });

  it("a recusa da origem é frase de gente, e não o código da causa", async () => {
    // Devolver `origemOutroSemDescricao` na tela obrigaria quem cola a lista a
    // adivinhar o que fazer.
    const { POST } = await import("./frios/route");
    const j = (await (await POST(post({ texto: COLAGEM, origem: "OUTRO" }))).json()) as {
      error: string;
    };

    expect(j.error).not.toContain("origemOutroSemDescricao");
    expect(j.error.toLowerCase()).toContain("outro");
    expect(j.error.length).toBeGreaterThan(30);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O QUE A ROTA DEVOLVE
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o resultado que a tela mostra", () => {
  it("as contagens voltam separadas: quem entrou e quem já estava aqui", async () => {
    // "23 novos, 7 já estavam aqui" é a frase que dá confiança para colar de
    // novo amanhã. Somar os dois num total só apagaria a diferença entre
    // trabalho novo e recolagem.
    cadastrarFrios.mockResolvedValue({ criados: 23, jaExistiam: 7, recusadas: [] });

    const { POST } = await import("./frios/route");
    const j = (await (await POST(post({ texto: COLAGEM, origem: "LISTA" }))).json()) as {
      data: { criados: number; jaExistiam: number };
    };

    expect(j.data.criados).toBe(23);
    expect(j.data.jaExistiam).toBe(7);
  });

  it("⭐ cada recusa volta com o NÚMERO da linha e o motivo em português", async () => {
    // Sem o número, "8 linhas recusadas" manda a pessoa reler a planilha
    // inteira. Sem a frase, o motivo é um código que só o programador entende.
    cadastrarFrios.mockResolvedValue({
      criados: 1,
      jaExistiam: 0,
      recusadas: lerColagem(
        `Ana Paula\t${ANA}\tBar do Zé\tSão Paulo\n` +
        `Carlos Dias\t9999\tBar do Carlos\tSão Paulo\n` +
        `;${BIA};Cantina;Rio de Janeiro`,
      ).filter((l) => l.problema !== null),
    });

    const { POST } = await import("./frios/route");
    const j = (await (await POST(post({ texto: COLAGEM, origem: "LISTA" }))).json()) as {
      data: { recusadas: Array<{ numero: number; texto: string; motivo: string }> };
    };

    expect(j.data.recusadas).toHaveLength(2);
    expect(j.data.recusadas[0]!.numero).toBe(2);
    expect(j.data.recusadas[0]!.motivo).toContain("(11) 98765-4321");
    expect(j.data.recusadas[1]!.numero).toBe(3);
    expect(j.data.recusadas[1]!.motivo.toLowerCase()).toContain("nome");

    // Nenhum código cru escapa para a tela.
    for (const r of j.data.recusadas) {
      expect(r.motivo).not.toMatch(/semNome|semWhatsapp|whatsappInvalido|repetidaNoLote/);
      // O texto original volta junto: é por ele que a pessoa acha a linha.
      expect(r.texto.length).toBeGreaterThan(0);
    }
  });

  it("lote sem nenhuma linha boa: 400, com as recusas junto", async () => {
    // Recusar sem dizer o quê mandaria a pessoa de volta para a planilha sem
    // saber por onde começar.
    const { POST } = await import("./frios/route");
    const res = await POST(post({ texto: "Ana Paula\nCarlos Dias\t9999", origem: "LISTA" }));
    const j = (await res.json()) as {
      error: string;
      recusadas: Array<{ numero: number; motivo: string }>;
    };

    expect(res.status).toBe(400);
    expect(cadastrarFrios).not.toHaveBeenCalled();
    expect(j.recusadas).toHaveLength(2);
    expect(j.recusadas.map((r) => r.numero)).toEqual([1, 2]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AS DUAS ENTRADAS, UMA VIA SÓ DE LEITURA
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ colar a lista e digitar um contato caem no mesmo leitor", () => {
  it("a colagem tabulada vira linhas com nome, whatsapp, estabelecimento e cidade", async () => {
    const { POST } = await import("./frios/route");
    await POST(post({ texto: COLAGEM, origem: "PROSPECCAO" }));

    const pedido = cadastrarFrios.mock.calls[0]![1] as { linhas: ReturnType<typeof lerColagem> };
    expect(pedido.linhas).toHaveLength(2);
    expect(pedido.linhas[0]!.linha).toEqual({
      nome: "Ana Paula",
      whatsapp: "(11) 98888-7777",
      estabelecimento: "Bar do Zé",
      cidade: "São Paulo",
    });
  });

  it("o formulário de UM contato chega como uma linha lida do mesmo jeito", async () => {
    const { POST } = await import("./frios/route");
    const res = await POST(
      post({
        campos: {
          nome: "Ana Paula",
          whatsapp: ANA,
          estabelecimento: "Bar do Zé",
          cidade: "São Paulo",
        },
        origem: "INDICACAO",
      }),
    );

    expect(res.status).toBe(200);
    const pedido = cadastrarFrios.mock.calls[0]![1] as { linhas: ReturnType<typeof lerColagem> };
    expect(pedido.linhas).toHaveLength(1);
    expect(pedido.linhas[0]!.linha).toEqual({
      nome: "Ana Paula",
      whatsapp: "(11) 98888-7777",
      estabelecimento: "Bar do Zé",
      cidade: "São Paulo",
    });
  });

  it("⭐ o formulário SEM nome é recusado por falta de nome — e não por outra coisa", async () => {
    // O motivo de as células do formulário serem juntadas com ponto-e-vírgula:
    // com tabulação, a célula vazia do começo some na aparagem da linha e o
    // telefone passa a ser lido como nome — a pessoa receberia "whatsapp
    // inválido" para um WhatsApp que está certo, e nunca acharia o erro.
    const { POST } = await import("./frios/route");
    const res = await POST(post({ campos: { nome: "", whatsapp: ANA }, origem: "INDICACAO" }));
    const j = (await res.json()) as { recusadas: Array<{ motivo: string }> };

    expect(res.status).toBe(400);
    expect(j.recusadas[0]!.motivo.toLowerCase()).toContain("nome");
    expect(cadastrarFrios).not.toHaveBeenCalled();
  });

  it("nome com vírgula continua sendo um nome só", async () => {
    // "Marina, sócia do bar" é o caso em que um leitor que tentasse a vírgula
    // primeiro criaria um lead com telefone inventado.
    const { POST } = await import("./frios/route");
    await POST(
      post({ campos: { nome: "Marina, sócia do bar", whatsapp: ANA }, origem: "EVENTO" }),
    );

    const pedido = cadastrarFrios.mock.calls[0]![1] as { linhas: ReturnType<typeof lerColagem> };
    expect(pedido.linhas[0]!.linha!.nome).toBe("Marina, sócia do bar");
  });

  it("corpo sem texto e sem campos é 400 — e não um lote vazio 'cadastrado'", async () => {
    const { POST } = await import("./frios/route");
    const res = await POST(post({ origem: "PROSPECCAO" }));

    expect(res.status).toBe(400);
    expect(cadastrarFrios).not.toHaveBeenCalled();
  });

  it("corpo que não é JSON é 400, e não derruba a rota", async () => {
    const { POST } = await import("./frios/route");
    const res = await POST(
      new NextRequest(
        new Request(`https://foocci.com.br${ROTA}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "isto não é json",
        }),
      ),
    );

    expect(res.status).toBe(400);
    expect(cadastrarFrios).not.toHaveBeenCalled();
  });
});

describe("o teto de uma colagem", () => {
  it("uma colagem gigante é recusada inteira, com o número dito na frase", async () => {
    // Cada linha custa duas escritas dentro de UMA requisição. Cinco mil linhas
    // seriam cortadas pelo tempo limite, deixando metade gravada e ninguém
    // sabendo qual metade.
    const gigante = Array.from(
      { length: 501 },
      (_, i) => `Pessoa ${i}\t11 9${String(i).padStart(4, "0")}-0000`,
    ).join("\n");

    const { POST } = await import("./frios/route");
    const res = await POST(post({ texto: gigante, origem: "LISTA" }));
    const j = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(cadastrarFrios).not.toHaveBeenCalled();
    expect(j.error).toContain("501");
  });

  it("uma colagem grande, mas dentro do teto, passa", async () => {
    // A metade que passa: o teto existe para o absurdo, não para atrapalhar
    // quem cola uma lista de trabalho de verdade.
    const grande = Array.from(
      { length: 500 },
      (_, i) => `Pessoa ${i}\t11 9${String(i).padStart(4, "0")}-0000`,
    ).join("\n");

    const { POST } = await import("./frios/route");
    expect((await POST(post({ texto: grande, origem: "LISTA" }))).status).toBe(200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O GET DAS OPÇÕES
// ═══════════════════════════════════════════════════════════════════════════

describe("as opções viajam pela rota que as valida", () => {
  it("o GET devolve as origens com valor e rótulo", async () => {
    // A tela NÃO importa `ORIGENS_FRIAS` do serviço: `frios.ts` fala com o
    // Prisma, e importá-lo levaria o serviço de gravação para dentro do
    // navegador. Duas listas divergiriam, e a divergência apareceria como
    // "escolhi uma origem e a rota disse que não existe".
    const { GET } = await import("./frios/route");
    const res = await GET(get());
    const j = (await res.json()) as {
      data: { origens: Array<{ valor: string; rotulo: string }>; ordemDasColunas: string[] };
    };

    expect(res.status).toBe(200);
    expect(j.data.origens.length).toBeGreaterThanOrEqual(5);
    expect(j.data.origens.map((o) => o.valor)).toContain("OUTRO");
    for (const o of j.data.origens) expect(o.rotulo.trim().length).toBeGreaterThan(3);
  });

  it("⭐ toda origem anunciada pelo GET é aceita pelo POST", async () => {
    // A trava contra a divergência silenciosa: um valor no seletor que a rota
    // recusa vira "escolhi e não funciona", e o vendedor culpa o sistema — com
    // razão.
    const { GET, POST } = await import("./frios/route");
    const j = (await (await GET(get())).json()) as {
      data: { origens: Array<{ valor: string }> };
    };

    for (const o of j.data.origens) {
      cadastrarFrios.mockClear();
      const res = await POST(
        post({ texto: COLAGEM, origem: o.valor, descricaoDaOrigem: "descrito à mão" }),
      );
      expect(res.status, o.valor).toBe(200);
    }
  });

  it("⭐ a ordem de colunas anunciada é a que o leitor realmente usa", async () => {
    // A legenda da tela ("nome, whatsapp, estabelecimento, cidade") é o que
    // impede a pessoa de colar na ordem errada. Uma colagem fora de ordem NÃO
    // dá erro: ela cria leads com o nome do bar no lugar do nome da pessoa. Se
    // a legenda mentir, ela causa exatamente o defeito que existe para evitar.
    const { GET } = await import("./frios/route");
    const j = (await (await GET(get())).json()) as { data: { ordemDasColunas: string[] } };

    const marcadores: Record<string, string> = {
      nome: "MARCA-NOME",
      whatsapp: ANA,
      estabelecimento: "MARCA-ESTAB",
      cidade: "MARCA-CIDADE",
    };
    const linha = lerColagem(j.data.ordemDasColunas.map((c) => marcadores[c]!).join("\t"))[0]!;

    expect(linha.problema).toBeNull();
    expect(linha.linha).toEqual({
      nome: "MARCA-NOME",
      whatsapp: "(11) 98888-7777",
      estabelecimento: "MARCA-ESTAB",
      cidade: "MARCA-CIDADE",
    });
  });

  it("⭐ a TELA não importa o serviço — ela pergunta à rota", () => {
    /* A trava estrutural, e o defeito que ela impede é dos que não dão erro:
     *
     * `import { ORIGENS_FRIAS } from "@/services/salaDeVendas/frios"` é a coisa
     * mais natural do mundo de se escrever num componente que precisa montar um
     * seletor. Só que `frios.ts` importa o Prisma e a geração de código do lead
     * — o import arrastaria o serviço de GRAVAÇÃO inteiro para dentro do
     * pacote que vai ao navegador.
     *
     * Uma asserção de comportamento provaria que o seletor de HOJE está certo.
     * Ler o código-fonte prova que o caminho para errar amanhã não existe.
     */
    const tela = readFileSync(
      path.join(process.cwd(), "src/app/comercial/(area)/frios/FriosClient.tsx"),
      "utf8",
    );

    expect(tela).not.toContain("salaDeVendas/frios");
    // A metade que passa: ela busca as opções na rota que as valida.
    expect(tela).toContain("/api/admin/sala-de-vendas/frios");
  });

  it("sem sessão o GET também recusa", async () => {
    // Lista curta e sem segredo — mas uma porta aberta a mais é uma porta que
    // alguém encontra, e não há razão para esta ser a exceção da Sala.
    semSessao();

    const { GET } = await import("./frios/route");
    expect((await GET(get())).status).toBe(401);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O QUE ESTA ROTA NÃO FAZ
// ═══════════════════════════════════════════════════════════════════════════

describe("⛔ cadastrar é cadastrar", () => {
  it("a rota só tem GET e POST — não existe verbo que apague nem que envie", async () => {
    // A regra em código, e não em recado na tela: nada aqui manda mensagem, e
    // nada aqui apaga contato (apagar tem rota própria, com confirmação por
    // nome digitado).
    const modulo = await import("./frios/route");
    expect(Object.keys(modulo).sort()).toEqual(["GET", "POST", "dynamic", "runtime"]);
  });
});
