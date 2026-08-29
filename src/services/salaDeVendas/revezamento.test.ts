/**
 * O REVEZAMENTO — o agente sai quando a pessoa entra, e volta quando ela sai.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece duas vezes: travando E deixando passar. Um arquivo só com
 * a primeira metade ficaria verde contra um `aIaPodeFalar` que devolvesse
 * `false` sempre — e um TA mudo passa em todo teste de bloqueio que existe.
 * É o jeito mais silencioso de quebrar um agente, e é o que estes pares
 * impedem.
 *
 * ── ⚠️ A CADEIA, QUE É O QUE ESTE ARQUIVO EXISTE PARA PROVAR ────────────────
 *
 * Uma função pura devolvendo `false` não cala robô nenhum. O defeito de
 * assinatura desta casa é peça pronta sem chamador — já aconteceu quatro
 * vezes: o handoff que ninguém chamava, o qualificador que ninguém chamava, a
 * janela de 24h que a rota só informava, o closer que estava escrito e nunca
 * vestido. Nenhum deles dava erro. Todos davam silêncio.
 *
 * Por isso a última seção não testa `aIaPodeFalar`: ela chama `atenderComOTA`,
 * o turno inteiro, e confere no MOCK DO BANCO se a mensagem foi gravada. Com a
 * ligação em `atender.ts` desfeita, é ela que reprova — e é ela que diz se o
 * revezamento é código ou comentário.
 *
 * ── OS TRÊS DEFEITOS QUE DOEM MAIS ──────────────────────────────────────────
 *
 *   · **O robô falando por cima de gente.** O cliente recebe duas respostas
 *     diferentes da mesma empresa no mesmo minuto, e quem assumiu descobre pela
 *     conversa que ela andou sem ele.
 *   · **Devolver ao robô quem pediu uma pessoa.** A pessoa escreveu "quero
 *     falar com alguém", foi atendida, e o vendedor calou. Devolver ao agente
 *     aqui é abandono com cara de automação.
 *   · **Ausência virando zero.** Um lead sem carimbo de ação humana não ficou
 *     parado desde 1970: não se sabe. Lido como zero, TODO lead com dono humano
 *     seria devolvido no primeiro turno.
 */

import { describe, it, expect, vi } from "vitest";
import {
  REVEZAMENTO,
  aIaPodeFalar,
  quemFala,
  silencioDoHumano,
  devolverPorInatividade,
  type EstadoDoRevezamento,
} from "./revezamento";
import { atenderComOTA, type ResultadoDoTurno } from "./ta/atender";

/** Terça-feira, 09:00 em São Paulo. Dentro da janela do TA, dia útil. */
const AGORA = new Date("2026-08-25T12:00:00Z");

const VENDEDOR = "u-humano";

/** Quantas horas atrás, a partir de `AGORA`. */
function hAtras(horas: number): Date {
  return new Date(AGORA.getTime() - horas * 3_600_000);
}

function estado(a: Partial<EstadoDoRevezamento> = {}): EstadoDoRevezamento {
  return {
    atendidoPor: "HUMANO",
    atendenteUserId: VENDEDOR,
    // ⚠️ `null` por padrão, e cada caso põe o que precisa. O silêncio é medido
    // pelo marco MAIS RECENTE dos dois; um padrão preenchido aqui mascararia
    // todo caso que só mexe em `ultimaAcaoHumana` — o teste passaria por causa
    // do outro carimbo e não por causa da regra.
    atendenteDesde: null,
    ultimaAcaoHumana: hAtras(1),
    leadPediuGente: false,
    agora: AGORA,
    ...a,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// A VEZ — de quem é a conversa agora
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ a vez é de quem está na conversa", () => {
  it("humano na conversa → a vez é dele, e a IA NÃO pode falar", () => {
    // A trava inteira do arquivo em duas linhas. Sem ela, o cliente recebe duas
    // respostas diferentes da mesma empresa no mesmo minuto.
    const e = estado();
    expect(quemFala(e).de).toBe("HUMANO");
    expect(aIaPodeFalar(e), "a IA falaria por cima de quem assumiu").toBe(false);
  });

  it("lead da IA → a vez é dela, e ela PODE falar", () => {
    // A metade que passa. Um `aIaPodeFalar` que devolvesse `false` sempre
    // passaria em todos os testes de bloqueio deste arquivo, e o TA nunca
    // responderia a ninguém.
    const e = estado({ atendidoPor: "IA", atendenteUserId: null });
    expect(quemFala(e).de).toBe("IA");
    expect(aIaPodeFalar(e)).toBe(true);
  });

  it("⭐ lead sem dono → a vez não é de humano nenhum, e a IA pode entrar", () => {
    // `NINGUEM` é o estado em que quase todo lead nasce. Recusá-lo aqui
    // deixaria o TA mudo para sempre — e não daria erro em lugar nenhum.
    //
    // Não contradiz `iaPodeEnviar`, que recusa `NINGUEM`: aquilo governa
    // ENVIAR, e quando a mensagem é gravada a IA já tomou o lead.
    const e = estado({ atendidoPor: "NINGUEM", atendenteUserId: null });
    expect(quemFala(e).de).toBe("NINGUEM");
    expect(aIaPodeFalar(e)).toBe(true);
  });

  it("lead esperando gente → a IA cala, e NÃO se autoperdoa pelo prazo", () => {
    // Foi a própria IA que largou e pediu gente. Retomar por silêncio da fila
    // desfaz o pedido dela na frente do cliente — e quem pegar a conversa
    // encontra uma que andou sozinha. Quem cobra essa fila é o SLA de espera.
    const e = estado({
      atendidoPor: "AGUARDANDO_HUMANO",
      atendenteUserId: null,
      atendenteDesde: hAtras(300),
      ultimaAcaoHumana: null,
    });

    expect(aIaPodeFalar(e)).toBe(false);
    expect(quemFala(e).devolvidoPorInatividade, "a IA desfez o próprio pedido").toBe(false);
  });

  it("todo caminho devolve o porquê escrito", () => {
    // O motivo viaja para o `detalhe` de quem calou. Um portão que barra sem
    // dizer por quê transforma "o TA simplesmente não respondeu" em mistério.
    for (const p of ["IA", "HUMANO", "NINGUEM", "AGUARDANDO_HUMANO"] as const) {
      expect(quemFala(estado({ atendidoPor: p })).porque.length, p).toBeGreaterThan(10);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O SILÊNCIO — e o que ele NÃO pode virar
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ ausência de carimbo não vira zero", () => {
  it("sem carimbo nenhum, o silêncio é NÃO MEDIDO", () => {
    // Lido como zero, o silêncio de um lead sem carimbo seria infinito e TODO
    // lead com dono humano cairia para a IA no primeiro turno.
    const s = silencioDoHumano(
      estado({ ultimaAcaoHumana: null, atendenteDesde: null }),
    );
    expect(s.medido).toBe(false);
  });

  it("e não medido NÃO devolve — a dúvida fica com quem está atendendo", () => {
    const e = estado({ ultimaAcaoHumana: null, atendenteDesde: null });
    expect(quemFala(e).de).toBe("HUMANO");
    expect(quemFala(e).devolvidoPorInatividade).toBe(false);
  });

  it("⭐ assumir É uma ação: quem acabou de pegar a conversa não é devolvido", () => {
    // O caso mais fácil de errar, e ele não é hipotético: a última fala de
    // gente nesta conversa pode ser de OUTRO vendedor, de anteontem, porque o
    // lead passou pela IA no meio. Quem está com ele agora acabou de assumir.
    //
    // Sem o piso de `atendenteDesde`, o silêncio medido seria o do vendedor
    // ANTERIOR — trinta horas — e o robô entraria por cima de quem pegou a
    // conversa há seis minutos.
    const e = estado({ ultimaAcaoHumana: hAtras(30), atendenteDesde: hAtras(0.1) });
    expect(quemFala(e).devolvidoPorInatividade).toBe(false);
    expect(aIaPodeFalar(e)).toBe(false);
  });

  it("recém-assumido sem ação nenhuma também fica com quem assumiu", () => {
    // A pessoa clicou em "assumir" e ainda não escreveu. Aqui as duas regras
    // levam ao mesmo lugar — o piso e o "não medido não devolve" —, e é de
    // propósito: as duas portas do mesmo caso precisam estar fechadas.
    const e = estado({ ultimaAcaoHumana: null, atendenteDesde: hAtras(0.1) });
    expect(quemFala(e).devolvidoPorInatividade).toBe(false);
  });

  it("a ação mais recente é a que vale, venha de onde vier", () => {
    // Assumiu ontem e respondeu há uma hora: está trabalhando. Usar só
    // `atendenteDesde` devolveria a conversa de quem acabou de falar com o lead.
    const e = estado({ atendenteDesde: hAtras(30), ultimaAcaoHumana: hAtras(1) });
    const s = silencioDoHumano(e);
    expect(s.medido && s.horas).toBeCloseTo(1, 5);
    expect(quemFala(e).devolvidoPorInatividade).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A DEVOLUÇÃO POR INATIVIDADE
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o humano some, a conversa volta", () => {
  it("passado o prazo, a vez é da IA — e ela vem marcada para gravar a volta", () => {
    const e = estado({ ultimaAcaoHumana: hAtras(8), atendenteDesde: hAtras(9) });
    const v = quemFala(e);

    expect(v.de).toBe("IA");
    expect(aIaPodeFalar(e)).toBe(true);
    // A marca existe porque a decisão sozinha não muda o banco: enquanto ele
    // disser `HUMANO`, a mensagem sairia assinada com quem sumiu.
    expect(v.devolvidoPorInatividade).toBe(true);
  });

  it("dentro do prazo, a conversa é dele — almoço e reunião não são abandono", () => {
    // A metade que trava. Um prazo curto demais devolveria ao robô conversas
    // de gente que está trabalhando, que é o defeito ao contrário.
    const e = estado({ ultimaAcaoHumana: hAtras(5), atendenteDesde: hAtras(9) });
    expect(quemFala(e).de).toBe("HUMANO");
    expect(aIaPodeFalar(e)).toBe(false);
  });

  it("no prazo cravado, devolve — a borda é fechada e está escolhida", () => {
    const e = estado({ ultimaAcaoHumana: hAtras(REVEZAMENTO.silencioQueDevolveHoras) });
    expect(quemFala(e).devolvidoPorInatividade).toBe(true);
  });

  it("o prazo é o PRAZO, e não um número solto dentro de um if", () => {
    // Sem isto, a constante podia estar desligada da conta e ninguém notaria:
    // mudar o número não mudaria comportamento nenhum.
    const e = estado({ ultimaAcaoHumana: hAtras(5) });
    expect(quemFala(e, 4).devolvidoPorInatividade, "prazo de 4h não devolveu com 5h").toBe(true);
    expect(quemFala(e, 12).devolvidoPorInatividade, "prazo de 12h devolveu com 5h").toBe(false);
  });

  it("o prazo padrão cabe entre a jornada e a janela de 24h", () => {
    // Por baixo: a jornada é 9h–20h (11h). Um prazo menor que meio expediente
    // confundiria "ocupado" com "sumido".
    // Por cima: `registrarSaida` recusa texto livre 24h depois da última
    // mensagem do lead — devolver perto disso é devolver para quem só pode calar.
    expect(REVEZAMENTO.silencioQueDevolveHoras).toBeGreaterThan(11 / 2);
    expect(REVEZAMENTO.silencioQueDevolveHoras).toBeLessThan(12);
  });
});

describe("⭐ quem pediu gente não volta para o robô", () => {
  it("pediu uma pessoa: nem depois de dias de silêncio do vendedor", () => {
    // A pessoa escreveu "quero falar com alguém" e foi atendida. Responder de
    // novo com um robô é abandono com cara de automação — a empresa devolvendo
    // exatamente o que ela disse que não queria. Quem cobra o vendedor é o
    // painel, não o TA.
    const e = estado({ leadPediuGente: true, ultimaAcaoHumana: hAtras(72) });

    expect(quemFala(e).de).toBe("HUMANO");
    expect(aIaPodeFalar(e)).toBe(false);
    expect(quemFala(e).devolvidoPorInatividade).toBe(false);
  });

  it("não pediu: o mesmo silêncio devolve", () => {
    // A metade que passa. Sem ela, um `leadPediuGente` lido ao contrário — ou
    // sempre verdadeiro — desligaria a devolução inteira em silêncio.
    const e = estado({ leadPediuGente: false, ultimaAcaoHumana: hAtras(72) });
    expect(quemFala(e).devolvidoPorInatividade).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A ESCRITA DA VOLTA
// ═══════════════════════════════════════════════════════════════════════════

function bancoDaVolta(count = 1) {
  return {
    siteLead: {
      updateMany: vi.fn().mockResolvedValue({ count }),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    siteLeadInteraction: { create: vi.fn().mockResolvedValue({}) },
    leadHandoff: { create: vi.fn().mockResolvedValue({ id: "h1" }) },
    internalUser: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

describe("⭐ a volta é gravada, e a trilha não mente sobre quem devolveu", () => {
  it("troca o dono com a condição DENTRO da escrita", async () => {
    // Entre a leitura e a escrita, o lead pode ter trocado de mão. Conferir
    // antes e escrever depois devolveria por cima de um vendedor que acabou de
    // assumir — o roubo mais fácil de escrever por acidente.
    const db = bancoDaVolta();
    await devolverPorInatividade(db as never, {
      leadId: "l1",
      estado: estado({ ultimaAcaoHumana: hAtras(8) }),
    });

    const chamada = db.siteLead.updateMany.mock.calls[0]![0]!;
    expect(chamada.where).toMatchObject({
      atendidoPor: "HUMANO",
      atendenteUserId: VENDEDOR,
    });
    expect(chamada.data).toMatchObject({ atendidoPor: "IA" });
  });

  it("⭐ a trilha diz que quem devolveu foi a REGRA, não a pessoa que sumiu", async () => {
    // Gravar `actor: <userId do vendedor>` faria a auditoria ler "Fulano
    // devolveu o lead com objetivo escrito" no caso exato em que Fulano não fez
    // nada — um abandono virando passagem de bastão bem-feita.
    const db = bancoDaVolta();
    await devolverPorInatividade(db as never, {
      leadId: "l1",
      estado: estado({ ultimaAcaoHumana: hAtras(8) }),
    });

    const trilha = db.siteLeadInteraction.create.mock.calls[0]![0]!.data;
    expect(trilha.actor).toBe(REVEZAMENTO.ator);
    expect(trilha.actor, "creditou a devolução a quem sumiu").not.toBe(VENDEDOR);
  });

  it("a volta vira linha em lead_handoffs — senão a razão perde o denominador", async () => {
    const db = bancoDaVolta();
    await devolverPorInatividade(db as never, {
      leadId: "l1",
      estado: estado({ ultimaAcaoHumana: hAtras(8) }),
    });

    expect(db.leadHandoff.create).toHaveBeenCalledTimes(1);
    expect(db.leadHandoff.create.mock.calls[0]![0]!.data).toMatchObject({
      de: "HUMANO",
      para: "IA",
      motivo: "DEVOLUCAO_PARA_IA",
    });
  });

  it("perdeu a corrida: não devolve, e não grava trilha nenhuma", async () => {
    // Outra mão pegou o lead entre a leitura e a escrita. Registrar a volta
    // aqui diria que a conversa é da IA quando ela é de uma pessoa.
    const db = bancoDaVolta(0);
    const r = await devolverPorInatividade(db as never, {
      leadId: "l1",
      estado: estado({ ultimaAcaoHumana: hAtras(8) }),
    });

    expect(r).toMatchObject({ devolveu: false, causa: "outraMaoPegou" });
    expect(db.siteLeadInteraction.create).not.toHaveBeenCalled();
    expect(db.leadHandoff.create).not.toHaveBeenCalled();
  });

  it("não escreve nada quando a regra não manda devolver", async () => {
    // A decisão é a de `quemFala`, e vem dela. Uma segunda conta aqui divergiria
    // da primeira no dia em que o prazo mudasse.
    const db = bancoDaVolta();
    const r = await devolverPorInatividade(db as never, {
      leadId: "l1",
      estado: estado({ ultimaAcaoHumana: hAtras(1) }),
    });

    expect(r).toMatchObject({ devolveu: false, causa: "naoSeAplica" });
    expect(db.siteLead.updateMany).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// ⭐ A CADEIA — o turno inteiro, com o banco fingido
// ═══════════════════════════════════════════════════════════════════════════

interface Cenario {
  lead?: Record<string, unknown>;
  /** Última mensagem de saída assinada por gente nesta conversa. */
  ultimaFalaHumana?: Date | null;
  /** Última interação registrada pela pessoa que assumiu (ligação, nota). */
  ultimaNotaHumana?: Date | null;
  /** Existe handoff com motivo `PEDIU_HUMANO` neste lead? */
  leadPediuGente?: boolean;
}

/** `{ in: [...] }` ou valor cru — o `where` do Prisma aceita os dois. */
function bate(condicao: unknown, valor: unknown): boolean {
  if (condicao && typeof condicao === "object" && "in" in condicao) {
    return (condicao as { in: unknown[] }).in.includes(valor);
  }
  return condicao === valor;
}

/**
 * Um banco de mentira que GUARDA ESTADO.
 *
 * A diferença para um mock que devolve sempre a mesma coisa é o ponto do
 * arquivo: `siteLead.updateMany` confere o `where` contra o lead atual e só
 * então muda. Assim a devolução tem de acontecer de verdade para o resto do
 * turno andar — e uma escrita condicional quebrada aparece aqui em vez de
 * passar porque o mock disse `count: 1` para qualquer coisa.
 */
function banco(c: Cenario = {}) {
  const lead: Record<string, unknown> = {
    id: "l1",
    nome: "Marina Duarte",
    atendidoPor: "IA",
    optOutAt: null,
    atendenteUserId: null,
    atendenteDesde: null,
    temperatura: null,
    score: 40,
    stage: "EM_QUALIFICACAO",
    tipo: null,
    desafio: null,
    ...c.lead,
  };

  return {
    lead,
    sdrIaConfig: {
      findUnique: vi.fn().mockResolvedValue({
        ligado: true,
        maxSemResposta: 3,
        versaoAtivaId: "v1",
        horaInicio: 9,
        horaFim: 20,
      }),
    },
    siteLead: {
      findUnique: vi.fn(async () => ({ ...lead })),
      update: vi.fn().mockResolvedValue({}),
      groupBy: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn(
        async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          const casa =
            (where.atendidoPor === undefined || bate(where.atendidoPor, lead.atendidoPor)) &&
            (where.atendenteUserId === undefined ||
              bate(where.atendenteUserId, lead.atendenteUserId));

          if (!casa) return { count: 0 };
          Object.assign(lead, data);
          return { count: 1 };
        },
      ),
    },
    leadMensagem: {
      count: vi.fn().mockResolvedValue(0),
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        // A conversa tem duas perguntas de "última mensagem", e elas pedem
        // coisas diferentes: o revezamento quer a última fala de GENTE; a
        // janela de 24h e o contador de insistência querem a última ENTRADA.
        where.autor === "HUMANO"
          ? (c.ultimaFalaHumana ? { ocorreuEm: c.ultimaFalaHumana } : null)
          : { ocorreuEm: AGORA },
      ),
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: "m1" }),
    },
    siteLeadInteraction: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn(async () =>
        c.ultimaNotaHumana ? { createdAt: c.ultimaNotaHumana } : null,
      ),
    },
    leadHandoff: {
      create: vi.fn().mockResolvedValue({ id: "h1" }),
      findFirst: vi.fn(async () => (c.leadPediuGente ? { id: "h0" } : null)),
    },
    internalUser: { findMany: vi.fn().mockResolvedValue([]) },
  };
}

/** Uma pergunta comum, que a base responde e que não chama gente. */
const PERGUNTA = "quanto custa o plano crescimento?";

/** "Ele falou" — e, quando não falou, DIZ POR QUÊ. */
function falou(r: ResultadoDoTurno): boolean {
  if (r.falou) return true;
  const porque = r.chamouGente
    ? `ele chamou gente (${r.motivo})`
    : `ele calou: ${r.motivo} — ${r.detalhe}`;
  throw new Error(`esperava que o TA respondesse, mas ${porque}`);
}

describe("⭐ CADEIA: o humano entra e o TA para de falar DE VERDADE", () => {
  it("humano ativo na conversa: nenhuma mensagem é gravada", async () => {
    // ⚠️ ESTE É O TESTE QUE PROVA QUE A LIGAÇÃO EXISTE.
    //
    // Não basta `aIaPodeFalar` devolver `false` — uma peça pronta sem chamador
    // é o defeito de assinatura desta casa, já em quatro ocorrências, e nenhuma
    // delas dava erro. A asserção que importa é a última: o mock do banco não
    // recebeu `create`. Desfaça a chamada em `atender.ts` e é aqui que reprova.
    const db = banco({
      lead: { atendidoPor: "HUMANO", atendenteUserId: VENDEDOR, atendenteDesde: hAtras(2) },
      ultimaFalaHumana: hAtras(1),
    });

    const r = await atenderComOTA(db as never, {
      leadId: "l1",
      mensagem: PERGUNTA,
      agora: AGORA,
    });

    expect(r).toMatchObject({ falou: false, chamouGente: false, motivo: "leadNaoEDaIA" });
    expect(db.leadMensagem.create, "o TA falou por cima de quem assumiu").not.toHaveBeenCalled();
    expect(db.siteLead.updateMany, "mexeu no dono de um lead que tem gente").not.toHaveBeenCalled();
  });

  it("uma LIGAÇÃO registrada conta como sinal de vida do vendedor", async () => {
    // Contar só mensagem trataria como sumido o vendedor que passou a manhã ao
    // telefone com o lead e registrou a ligação — e o robô entraria por cima.
    const db = banco({
      lead: { atendidoPor: "HUMANO", atendenteUserId: VENDEDOR, atendenteDesde: hAtras(20) },
      ultimaFalaHumana: hAtras(20),
      ultimaNotaHumana: hAtras(1),
    });

    const r = await atenderComOTA(db as never, {
      leadId: "l1",
      mensagem: PERGUNTA,
      agora: AGORA,
    });

    expect(r).toMatchObject({ falou: false, motivo: "leadNaoEDaIA" });
    expect(db.leadMensagem.create).not.toHaveBeenCalled();
  });

  it("o mesmo lead com a IA: o TA responde e grava", async () => {
    // A metade que passa, e sem ela todo o resto ficaria verde contra um TA
    // permanentemente mudo.
    const db = banco();
    const r = await atenderComOTA(db as never, {
      leadId: "l1",
      mensagem: PERGUNTA,
      agora: AGORA,
    });

    expect(falou(r)).toBe(true);
    expect(db.leadMensagem.create).toHaveBeenCalledTimes(1);
  });
});

describe("⭐ CADEIA: o humano some pelo prazo e o agente volta", () => {
  it("⭐ o lead volta para a IA no banco, e só então o TA fala", async () => {
    const db = banco({
      lead: { atendidoPor: "HUMANO", atendenteUserId: VENDEDOR, atendenteDesde: hAtras(9) },
      ultimaFalaHumana: hAtras(8),
    });

    const r = await atenderComOTA(db as never, {
      leadId: "l1",
      mensagem: PERGUNTA,
      agora: AGORA,
    });

    expect(falou(r)).toBe(true);
    // A volta é ESCRITA, e não só decidida. Sem a escrita o lead seguiria na
    // carteira de quem sumiu, fora de toda fila, enquanto o robô conversa.
    expect(db.lead.atendidoPor, "o TA falou sem devolver o lead").toBe("IA");
    expect(db.leadMensagem.create).toHaveBeenCalledTimes(1);
  });

  it("⭐ e a mensagem NÃO sai assinada por quem abandonou a conversa", async () => {
    // Sem isto, fala de robô entraria na produtividade do vendedor que sumiu —
    // e o número que mede atendimento premiaria justamente o abandono.
    const db = banco({
      lead: { atendidoPor: "HUMANO", atendenteUserId: VENDEDOR, atendenteDesde: hAtras(9) },
      ultimaFalaHumana: hAtras(8),
    });

    await atenderComOTA(db as never, { leadId: "l1", mensagem: PERGUNTA, agora: AGORA });

    const gravada = db.leadMensagem.create.mock.calls[0]![0]!.data;
    expect(gravada.autor).toBe("IA");
    expect(gravada.autorUserId, "assinou com o nome de quem sumiu").not.toBe(VENDEDOR);
  });

  it("dentro do prazo, o TA continua calado", async () => {
    // A metade que trava. Uma devolução que dispara sempre seria pior que
    // nenhuma: o robô por cima de todo vendedor que foi almoçar.
    const db = banco({
      lead: { atendidoPor: "HUMANO", atendenteUserId: VENDEDOR, atendenteDesde: hAtras(9) },
      ultimaFalaHumana: hAtras(5),
    });

    const r = await atenderComOTA(db as never, {
      leadId: "l1",
      mensagem: PERGUNTA,
      agora: AGORA,
    });

    expect(r).toMatchObject({ falou: false, motivo: "leadNaoEDaIA" });
    expect(db.lead.atendidoPor).toBe("HUMANO");
    expect(db.leadMensagem.create).not.toHaveBeenCalled();
  });

  it("⭐ quem pediu gente segue com gente, mesmo com o vendedor sumido há dias", async () => {
    const db = banco({
      lead: { atendidoPor: "HUMANO", atendenteUserId: VENDEDOR, atendenteDesde: hAtras(80) },
      ultimaFalaHumana: hAtras(72),
      leadPediuGente: true,
    });

    const r = await atenderComOTA(db as never, {
      leadId: "l1",
      mensagem: PERGUNTA,
      agora: AGORA,
    });

    expect(r).toMatchObject({ falou: false, motivo: "leadNaoEDaIA" });
    expect(db.lead.atendidoPor, "devolveu ao robô quem pediu uma pessoa").toBe("HUMANO");
    expect(db.leadMensagem.create).not.toHaveBeenCalled();
  });

  it("a devolução que perde a corrida cala o TA — não se fala sem ser o dono", async () => {
    // Outra mão pegou o lead entre a leitura e a escrita. Seguir falando aqui
    // contornaria a trava por já ter passado por ela uma vez.
    const db = banco({
      lead: { atendidoPor: "HUMANO", atendenteUserId: VENDEDOR, atendenteDesde: hAtras(9) },
      ultimaFalaHumana: hAtras(8),
    });
    db.siteLead.updateMany.mockResolvedValueOnce({ count: 0 });

    const r = await atenderComOTA(db as never, {
      leadId: "l1",
      mensagem: PERGUNTA,
      agora: AGORA,
    });

    expect(r).toMatchObject({ falou: false, chamouGente: false, motivo: "leadNaoEDaIA" });
    expect(db.leadMensagem.create).not.toHaveBeenCalled();
  });
});
