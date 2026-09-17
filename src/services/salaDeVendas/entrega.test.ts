/**
 * A ENTREGA — e a chave que continua sendo do dono.
 *
 * ── O DEFEITO QUE ESTE CÓDIGO FECHOU ────────────────────────────────────────
 *
 * Procurando quem chamava `enviarTextoDeVendas`, a resposta era **ninguém**. A
 * função existia, testada, e nenhuma linha do produto a chamava. Tudo parecia
 * funcionar: a mensagem chegava, o TA compunha, a resposta aparecia na tela — e
 * o cliente nunca recebia nada.
 *
 * ── O QUE ESTES CASOS GUARDAM ───────────────────────────────────────────────
 *
 * Metade prova que a mensagem SAI quando deve. A outra metade prova as três
 * coisas que nunca podem sair: com a entrega desligada, para quem pediu
 * silêncio, e duas vezes a mesma mensagem.
 *
 * O último é o mais fácil de subestimar: uma entrega não idempotente manda a
 * mesma frase duas vezes para o cliente na primeira reentrega da Meta.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { entregarMensagem } from "./entrega";

const enviar = vi.hoisted(() => vi.fn());
vi.mock("@/services/foocci-sdr/FoocciSalesChannel", async (original) => {
  const real = await original<typeof import("@/services/foocci-sdr/FoocciSalesChannel")>();
  return { ...real, enviarTextoDeVendas: enviar };
});

const ambiente = { ...process.env };

/**
 * Liga as três chaves — as duas da Meta e a da entrega.
 *
 * ⚠️ **NÃO liga `FOOCCI_SDR_IA_RESPONDE_SOZINHA`**, e é de propósito: todo caso
 * deste arquivo manda como `"pessoa"`, que é o caminho que o CEO autorizou em
 * 07/09/2026. A máquina falando sozinha tem arquivo próprio
 * (`entrega.quem-manda.test.ts`) justamente para a diferença entre as duas
 * portas não voltar a se perder dentro de um "ligarTudo".
 *
 * ⚠️ O número abaixo é FICTÍCIO. Era `1300518453142518` — que se descobriu ser
 * o WhatsApp de um restaurante CLIENTE, e não da Foocci. Deixar o id real de um
 * cliente como fixture convida a próxima cópia do erro.
 */
function ligarTudo() {
  process.env.FOOCCI_SALES_PHONE_NUMBER_ID = "000000000000001";
  process.env.FOOCCI_SALES_ACCESS_TOKEN = "EAAtoken-de-teste";
  process.env.FOOCCI_SDR_SEND_ENABLED = "true";
}

function banco(over: { mensagem?: Record<string, unknown> | null } = {}) {
  const mensagem =
    over.mensagem === null
      ? null
      : {
          id: "m1",
          status: "PENDENTE",
          direcao: "SAIDA",
          texto: "Oi! O Foocci monta o pedido junto com o cliente.",
          leadId: "lead-1",
          autor: null,
          autorUserId: null,
          papelDoAgente: null,
          lead: { whatsapp: "5511999990000", optOutAt: null },
          ...over.mensagem,
        };

  return {
    leadMensagem: {
      findUnique: vi.fn().mockResolvedValue(mensagem),
      update: vi.fn().mockResolvedValue({}),
    },
    // Estes testes medem a ENTREGA. A Supervisora tem sua suíte própria. Sem
    // linha no banco, o contrato real da Supervisora é OFF; este delegate faz o
    // banco mínimo reproduzir esse estado em vez de quebrar antes da asserção.
    supervisoraConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
    },
  };
}

beforeEach(() => {
  enviar.mockReset();
  enviar.mockResolvedValue({ ok: true });
  process.env = { ...ambiente };
});

afterEach(() => {
  process.env = { ...ambiente };
});

describe("⭐ nada sai enquanto o dono não ligar", () => {
  it("com a entrega desligada, não envia e não toca no banco", async () => {
    // O caso que carrega o arquivo. Este é o estado de HOJE, e ele tem que
    // continuar sendo o padrão depois desta mudança.
    ligarTudo();
    delete process.env.FOOCCI_SDR_SEND_ENABLED;

    const db = banco();
    const r = await entregarMensagem(db as never, "m1", "pessoa");

    expect(r).toMatchObject({ entregue: false, motivo: "envioDesligado" });
    expect(enviar, "tentou enviar com a chave desligada").not.toHaveBeenCalled();
    // Nem lê a mensagem: com a entrega desligada não há motivo para ir ao banco.
    expect(db.leadMensagem.findUnique).not.toHaveBeenCalled();
  });

  it("sem as chaves da Meta também não sai, e o motivo diz qual é o caso", async () => {
    process.env.FOOCCI_SDR_SEND_ENABLED = "true";
    delete process.env.FOOCCI_SALES_ACCESS_TOKEN;

    const r = await entregarMensagem(banco() as never, "m1", "pessoa");

    expect(r).toMatchObject({ entregue: false, motivo: "envioDesligado" });
    if (r.entregue) return;
    expect(r.detalhe).toContain("chaves da Meta");
  });
});

describe("com tudo ligado, a mensagem sai", () => {
  beforeEach(ligarTudo);

  it("⭐ envia o texto para o telefone do lead e marca como ENVIADA", async () => {
    // A metade que passa, e ela é a razão de o arquivo existir: sem ela, uma
    // função que recusasse SEMPRE passaria em todos os casos de bloqueio.
    const db = banco();
    const r = await entregarMensagem(db as never, "m1", "pessoa");

    expect(r).toEqual({ entregue: true, mensagemId: "m1" });

    const [, telefone, texto] = enviar.mock.calls[0]!;
    expect(telefone).toBe("5511999990000");
    expect(texto).toContain("Foocci");

    expect(db.leadMensagem.update.mock.calls[0]![0]!.data.status).toBe("ENVIADA");
  });

  it("a Meta recusando vira FALHOU com o motivo, nunca sucesso silencioso", async () => {
    enviar.mockResolvedValue({ ok: false, error: "(#131030) recipient not in allowed list" });

    const db = banco();
    const r = await entregarMensagem(db as never, "m1", "pessoa");

    expect(r).toMatchObject({ entregue: false, motivo: "aMetaRecusou" });

    const dados = db.leadMensagem.update.mock.calls[0]![0]!.data;
    expect(dados.status).toBe("FALHOU");
    expect(dados.erro).toContain("131030");
  });

  it("exceção no meio não derruba quem chamou", async () => {
    // É chamada logo depois de gravar, no webhook e na tela. Uma exceção aqui
    // derrubaria os dois — e a mensagem já estava salva.
    enviar.mockRejectedValue(new Error("ECONNRESET"));

    const r = await entregarMensagem(banco() as never, "m1", "pessoa");
    expect(r).toMatchObject({ entregue: false });
  });
});

describe("⭐ o que nunca sai, mesmo com tudo ligado", () => {
  beforeEach(ligarTudo);

  it("quem pediu silêncio DEPOIS de a mensagem ser escrita não recebe", async () => {
    // A razão de o portão ser reavaliado na entrega, e não só na composição.
    // Entre escrever e entregar pode ter passado tempo — e quem pediu para parar
    // não recebe o que já estava na fila.
    const db = banco({ mensagem: { lead: { whatsapp: "5511999990000", optOutAt: new Date() } } });
    const r = await entregarMensagem(db as never, "m1", "pessoa");

    expect(r).toMatchObject({ entregue: false, motivo: "leadPediuSilencio" });
    expect(enviar).not.toHaveBeenCalled();
    // E fica registrado na própria mensagem, para a tela poder explicar.
    expect(db.leadMensagem.update.mock.calls[0]![0]!.data.status).toBe("FALHOU");
  });

  it("⭐ mensagem que já foi enviada NÃO é enviada de novo", async () => {
    // Uma entrega não idempotente manda a mesma frase duas vezes ao cliente na
    // primeira reentrega da Meta — e o cliente conclui que é robô.
    const db = banco({ mensagem: { status: "ENVIADA" } });
    const r = await entregarMensagem(db as never, "m1", "pessoa");

    expect(r).toMatchObject({ entregue: false, motivo: "naoEraParaEnviar" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("mensagem de ENTRADA nunca é enviada", async () => {
    // O que o cliente escreveu não pode voltar para ele.
    const db = banco({ mensagem: { direcao: "ENTRADA", status: "PENDENTE" } });
    const r = await entregarMensagem(db as never, "m1", "pessoa");

    expect(r).toMatchObject({ entregue: false, motivo: "naoEraParaEnviar" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("lead sem telefone vira FALHOU nomeado, e não uma tentativa cega", async () => {
    const db = banco({ mensagem: { lead: { whatsapp: null, optOutAt: null } } });
    const r = await entregarMensagem(db as never, "m1", "pessoa");

    expect(r).toMatchObject({ entregue: false, motivo: "semTelefone" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("mensagem que não existe é recusa nomeada, não exceção", async () => {
    const r = await entregarMensagem(banco({ mensagem: null }) as never, "sumiu", "pessoa");
    expect(r).toMatchObject({ entregue: false, motivo: "mensagemNaoExiste" });
  });
});

/**
 * ⛔ A TRAVA DE REPETIÇÃO NO CAMINHO DE SAÍDA — 17/09/2026.
 *
 * ── A PERGUNTA OBRIGATÓRIA: o teste alcança o código que responde ao cliente? ──
 *
 * Alcança. Estes casos chamam `entregarMensagem` — a MESMA função do webhook e
 * da tela de atendimento — e medem se `enviarTextoDeVendas` (a linha que bate
 * na Meta) foi ou não chamada. Nada aqui é a trava testada contra si mesma: a
 * trava tem arquivo próprio, e o que se mede aqui é se ela está no caminho.
 *
 * ⚠️ E a outra metade é tão importante quanto: conversa viva **não** pode ser
 * bloqueada. O caso do TA repetindo a mesma frase prova que não é.
 */
function bancoComTrava(over: { mensagem?: Record<string, unknown> } = {}) {
  const base = banco(over);
  const ritmo = new Set<string>();
  const enviadasPelaTrava = new Set<string>();
  const recusas: Array<Record<string, unknown>> = [];

  return {
    recusas,
    db: {
      ...base,
      travaDeAbordagemRitmo: {
        updateMany: async () => ({ count: 0 }),
        create: async (args: { data: { telefoneDigits: string } }) => {
          if (ritmo.has(args.data.telefoneDigits)) throw new Error("Unique constraint failed");
          ritmo.add(args.data.telefoneDigits);
          return args.data;
        },
      },
      travaDeAbordagemEnviada: {
        create: async (args: { data: { telefoneDigits: string; impressao: string } }) => {
          const chave = `${args.data.telefoneDigits}::${args.data.impressao}`;
          if (enviadasPelaTrava.has(chave)) throw new Error("Unique constraint failed");
          enviadasPelaTrava.add(chave);
          return args.data;
        },
      },
      travaDeAbordagemRecusa: {
        create: async (args: { data: Record<string, unknown> }) => {
          recusas.push(args.data);
          return args.data;
        },
      },
    } as never,
  };
}

describe("⛔ a trava de repetição, no caminho de saída", () => {
  it("SISTEMA: a MESMA mensagem para o mesmo lead sai UMA vez — a segunda é recusada", async () => {
    ligarTudo();
    const b = bancoComTrava({ mensagem: { autor: "SISTEMA" } });

    const primeira = await entregarMensagem(b.db, "m1", "pessoa");
    expect(primeira.entregue).toBe(true);
    expect(enviar).toHaveBeenCalledTimes(1);

    const segunda = await entregarMensagem(b.db, "m1", "pessoa");

    expect(segunda).toMatchObject({ entregue: false, motivo: "travaDeRepeticao" });
    // ⭐ A prova que importa: a Meta NÃO foi chamada de novo.
    expect(enviar).toHaveBeenCalledTimes(1);
    // E a recusa ficou escrita, não virou silêncio.
    expect(b.recusas).toHaveLength(1);
  });

  it("⭐ CORRIDA: duas entregas SIMULTÂNEAS do mesmo conteúdo → a Meta é chamada UMA vez", async () => {
    ligarTudo();
    const b = bancoComTrava({ mensagem: { autor: "SISTEMA" } });

    const [a, c] = await Promise.all([
      entregarMensagem(b.db, "m1", "pessoa"),
      entregarMensagem(b.db, "m1", "pessoa"),
    ]);

    expect([a.entregue, c.entregue].filter(Boolean)).toHaveLength(1);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("TEMPLATE é abordagem mesmo assinado por gente — e não repete", async () => {
    ligarTudo();
    const b = bancoComTrava({ mensagem: { autor: "HUMANO", tipo: "TEMPLATE" } });

    expect((await entregarMensagem(b.db, "m1", "pessoa")).entregue).toBe(true);
    expect(await entregarMensagem(b.db, "m1", "pessoa")).toMatchObject({
      motivo: "travaDeRepeticao",
    });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("⚠️ CONVERSA VIVA NÃO É BLOQUEADA: o TA pode repetir a mesma frase", async () => {
    ligarTudo();
    const b = bancoComTrava({ mensagem: { autor: "IA" } });

    for (let i = 0; i < 4; i++) {
      expect((await entregarMensagem(b.db, "m1", "pessoa")).entregue).toBe(true);
    }

    expect(enviar).toHaveBeenCalledTimes(4);
    expect(b.recusas).toHaveLength(0);
  });

  it("⚠️ HUMANO que assumiu não é bloqueado", async () => {
    ligarTudo();
    const b = bancoComTrava({ mensagem: { autor: "HUMANO" } });

    for (let i = 0; i < 3; i++) {
      expect((await entregarMensagem(b.db, "m1", "pessoa")).entregue).toBe(true);
    }
    expect(enviar).toHaveBeenCalledTimes(3);
  });
});
