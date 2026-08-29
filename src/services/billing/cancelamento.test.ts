/**
 * O CANCELAMENTO PELA PRÓPRIA LOJA — a promessa publicada virando botão.
 *
 * O que estes testes protegem, em uma frase: que quem cancela seja o dono, que
 * cancelar duas vezes não faça duas coisas, e que nada seja apagado no caminho.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Cada regra aparece duas vezes: recusando o que não presta E deixando passar o
 * que presta. Um arquivo só com a primeira metade ficaria verde contra um
 * `cancelarPelaPropriaLoja` que recusasse TODO pedido — e uma função assim é
 * indistinguível de uma quebrada, com o agravante de parecer segura. Aqui isso
 * seria especialmente cruel: a tela mostraria o botão e o botão nunca cancelaria.
 *
 * ── OS QUATRO DEFEITOS QUE DOEM MAIS ────────────────────────────────────────
 *
 *   · **Cancelar a assinatura de outro.** Se a busca aceitasse um id vindo do
 *     pedido, qualquer lojista logado cancelaria a assinatura de qualquer outro
 *     restaurante trocando um campo no corpo. A trava não é conferir o id — é
 *     não haver id para conferir: o `where` é o `restaurantId` do servidor.
 *   · **Cancelar duas vezes e escrever duas vezes.** Duplo clique é o caso
 *     comum. Sem a troca atômica, o segundo pedido moveria `canceledAt` para a
 *     hora do último clique e gravaria outro evento — a trilha passaria a dizer
 *     que houve dois cancelamentos, e nenhum deles na hora certa.
 *   · **Dizer "pronto!" com o cartão ainda cobrando.** Marcar CANCELADA aqui não
 *     estanca o dinheiro; quem estanca é o Mercado Pago. A falha do gateway
 *     precisa voltar NOMEADA, ou o cliente descobre no extrato.
 *   · **Prometer devolução que o contrato não promete.** O texto que a tela
 *     mostra vem do servidor e cada frase carrega a cláusula do Termo de onde
 *     saiu. Reescrever aqui seria criar política de reembolso por engano.
 */

import { describe, it, expect, vi } from "vitest";
import {
  CONSEQUENCIAS_DO_CANCELAMENTO,
  EVENTO_CANCELAMENTO,
  vereditoDoCancelamento,
  assinaturaDaLoja,
  cancelarPelaPropriaLoja,
} from "./cancelamento";

const AGORA = new Date("2026-08-29T15:00:00Z");
const CANCELADA_ANTES = new Date("2026-08-01T09:00:00Z");

const LOJA = "rest-1";
const OUTRA_LOJA = "rest-2";

/** Sempre aceita. Usado quando o teste não é sobre o gateway. */
const gatewayQueAceita = () => vi.fn().mockResolvedValue({ ok: true, detalhe: null });

const AUTOR = {
  autorUserId: "u-dono",
  autorNome: "Zé da Pizzaria",
};

interface LinhaFalsa {
  id: string;
  restaurantId: string;
  plan: string;
  cycle: string;
  priceCents: number;
  status: string;
  activatedAt: Date | null;
  canceledAt: Date | null;
  mpPreapprovalId: string | null;
  createdAt: Date;
}

function assinatura(over: Partial<LinhaFalsa> = {}): LinhaFalsa {
  return {
    id: "sub-1",
    restaurantId: LOJA,
    plan: "GROWTH",
    cycle: "MENSAL",
    priceCents: 39900,
    status: "ATIVA",
    activatedAt: new Date("2026-08-03T12:00:00Z"),
    canceledAt: null,
    mpPreapprovalId: "pre-abc",
    createdAt: new Date("2026-08-01T12:00:00Z"),
    ...over,
  };
}

/**
 * Um banco de mentira que respeita as DUAS coisas que importam aqui.
 *
 *  1. **O `where` filtra de verdade.** `findFirst` só devolve linha da loja
 *     pedida, e `updateMany` só troca o estado quando a condição bate.
 *
 *  2. **⭐ A LEITURA DEVOLVE UMA CÓPIA, e não a linha viva.** É o que o Prisma
 *     faz, e não é detalhe: com a linha viva, dois pedidos simultâneos
 *     compartilham o mesmo objeto, o segundo enxerga a mudança do primeiro antes
 *     da hora, e a corrida se resolve sozinha no mock — escondendo justamente a
 *     trava que se quer provar. Com a cópia, quem decide é o `updateMany`
 *     condicionado, que é quem decide em produção.
 */
function bancoFalso(linhas: LinhaFalsa[]) {
  const eventos: Record<string, unknown>[] = [];
  const copia = (l: LinhaFalsa | undefined) => (l ? { ...l } : null);
  return {
    eventos,
    db: {
      planSubscription: {
        findFirst: vi.fn(async ({ where }: { where: { restaurantId?: string } }) => {
          const achadas = linhas.filter((l) => l.restaurantId === where.restaurantId);
          if (achadas.length === 0) return null;
          return copia([...achadas].sort((a, b) => +b.createdAt - +a.createdAt)[0]!);
        }),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
          copia(linhas.find((l) => l.id === where.id)),
        ),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id: string; status?: { not: string } };
            data: { status: string; canceledAt: Date };
          }) => {
            const alvo = linhas.find((l) => l.id === where.id);
            if (!alvo) return { count: 0 };
            if (where.status?.not && alvo.status === where.status.not) return { count: 0 };
            alvo.status = data.status;
            alvo.canceledAt = data.canceledAt;
            return { count: 1 };
          },
        ),
      },
      domainEvent: {
        create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
          eventos.push(data);
          return data;
        }),
      },
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// A REGRA, PURA
// ═══════════════════════════════════════════════════════════════════════════

describe("quem pode cancelar", () => {
  it("assinatura viva pode ser cancelada — em qualquer estado não terminal", () => {
    // A metade que PASSA, e a mais importante do arquivo: sem ela, tudo abaixo
    // ficaria verde contra um veredito que recusasse todo mundo, e o botão
    // publicado nunca funcionaria.
    for (const status of [
      "DRAFT",
      "AGUARDANDO_ACEITE",
      "ACEITO",
      "AGUARDANDO_PAGAMENTO",
      "ATIVA",
    ]) {
      expect(vereditoDoCancelamento({ status } as never), status).toBe("podeCancelar");
    }
  });

  it("⭐ quem está em atraso TAMBÉM pode cancelar", () => {
    // A armadilha óbvia que a cláusula "sem fidelidade" existe para não ter:
    // travar a saída de quem deve. Quem está inadimplente é justamente quem mais
    // precisa conseguir sair — e prender a saída transformaria o atraso numa
    // dívida que só cresce.
    expect(vereditoDoCancelamento({ status: "INADIMPLENTE" } as never)).toBe("podeCancelar");
  });

  it("já cancelada não é recusa — é o caminho idempotente", () => {
    expect(vereditoDoCancelamento({ status: "CANCELADA" } as never)).toBe("jaCancelada");
  });

  it("loja sem assinatura é 'não existe', e não um erro", () => {
    // Conta criada à mão pelo admin, ou a vitrine. A tela mostra "não há o que
    // cancelar" em vez de um botão que estoura.
    expect(vereditoDoCancelamento(null)).toBe("naoExiste");
    expect(vereditoDoCancelamento(undefined)).toBe("naoExiste");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// A BUSCA — A TRAVA DE AUTORIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ a assinatura que a loja enxerga é a dela", () => {
  it("a loja encontra a própria assinatura", () => {
    // A metade que passa. Sem ela, uma busca que devolvesse `null` sempre
    // passaria em todo o resto — e nenhuma loja veria o próprio plano.
    const { db } = bancoFalso([assinatura()]);
    return assinaturaDaLoja(db as never, LOJA).then((r) => {
      expect(r).not.toBeNull();
      expect(r!.id).toBe("sub-1");
      expect(r!.veredito).toBe("podeCancelar");
    });
  });

  it("⭐ a loja NÃO encontra a assinatura de outra", async () => {
    // O defeito que a ausência de `subscriptionId` impede. Repare que não existe
    // parâmetro neste teste onde escrever "sub-1": a única chave é a loja.
    const { db } = bancoFalso([assinatura()]);
    expect(await assinaturaDaLoja(db as never, OUTRA_LOJA)).toBeNull();
  });

  it("o `where` da busca é o restaurantId — e só ele", async () => {
    // A trava em código, e não em recado. Se um dia alguém acrescentar um id
    // vindo de fora ao `where`, este teste continua verde, mas o de baixo
    // (cancelar a de outra loja) reprova — os dois juntos fecham o caso.
    const { db } = bancoFalso([assinatura()]);
    await assinaturaDaLoja(db as never, LOJA);
    expect(db.planSubscription.findFirst.mock.calls[0]![0].where).toEqual({
      restaurantId: LOJA,
    });
  });

  it("loja sem assinatura devolve nulo, e id vazio nem consulta o banco", async () => {
    const { db } = bancoFalso([]);
    expect(await assinaturaDaLoja(db as never, LOJA)).toBeNull();

    const vazio = bancoFalso([assinatura()]);
    expect(await assinaturaDaLoja(vazio.db as never, "")).toBeNull();
    expect(vazio.db.planSubscription.findFirst).not.toHaveBeenCalled();
  });

  it("com histórico, a assinatura que vale é a mais recente", async () => {
    // Reassinatura nesta casa é registro NOVO, nunca a ressurreição da
    // cancelada. Sem a ordenação, a loja que voltou veria a assinatura MORTA e o
    // botão de cancelar diria "já estava cancelada" para um plano ativo.
    const { db } = bancoFalso([
      assinatura({ id: "sub-velha", status: "CANCELADA", createdAt: new Date("2026-01-01") }),
      assinatura({ id: "sub-nova", status: "ATIVA", createdAt: new Date("2026-08-01") }),
    ]);
    const r = await assinaturaDaLoja(db as never, LOJA);
    expect(r!.id).toBe("sub-nova");
    expect(r!.veredito).toBe("podeCancelar");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O CANCELAMENTO
// ═══════════════════════════════════════════════════════════════════════════

describe("o cancelamento pela própria loja", () => {
  it("cancela, carimba a hora e devolve sucesso", async () => {
    // A metade que PASSA. Sem ela, tudo abaixo ficaria verde contra um
    // cancelamento que não cancelasse nada.
    const linha = assinatura();
    const { db } = bancoFalso([linha]);

    const r = await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA,
      ...AUTOR,
      cancelarNoGateway: gatewayQueAceita(),
      agora: AGORA,
    });

    expect(r).toEqual({ resultado: "cancelada", canceladaEm: AGORA, gateway: { ok: true } });
    expect(linha.status).toBe("CANCELADA");
    expect(linha.canceledAt).toBe(AGORA);
  });

  it("⭐ a loja NÃO cancela a assinatura de outra", async () => {
    // O mesmo defeito da busca, provado no lado que escreve. Uma loja sem
    // assinatura própria pedindo cancelamento recebe "não existe" — nunca a
    // assinatura de quem estava por perto.
    const daOutra = assinatura({ restaurantId: OUTRA_LOJA });
    const { db } = bancoFalso([daOutra]);

    const r = await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA,
      ...AUTOR,
      cancelarNoGateway: gatewayQueAceita(),
      agora: AGORA,
    });

    expect(r).toEqual({ resultado: "naoExiste" });
    expect(daOutra.status).toBe("ATIVA");
    expect(db.planSubscription.updateMany).not.toHaveBeenCalled();
  });

  it("⭐ a trilha é gravada: quem, quando, de qual plano e saindo de qual estado", async () => {
    // Sem o evento, o cancelamento é um campo que mudou: ninguém sabe quem
    // apertou nem o que existia antes. A tabela é append-only por gatilho no
    // banco — este teste garante que ela chega a ser escrita.
    const { db, eventos } = bancoFalso([assinatura()]);

    await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA,
      ...AUTOR,
      cancelarNoGateway: gatewayQueAceita(),
      agora: AGORA,
    });

    expect(eventos).toHaveLength(1);
    const ev = eventos[0]! as { tipo: string; entidade: string; entidadeId: string; atorTipo: string; atorRotulo: string; dados: Record<string, unknown> };
    expect(ev.tipo).toBe(EVENTO_CANCELAMENTO);
    expect(ev.entidade).toBe("PlanSubscription");
    expect(ev.entidadeId).toBe("sub-1");
    expect(ev.atorTipo).toBe("lojista");
    // O NOME, e não só o id: se a pessoa for desativada depois, a trilha
    // continua dizendo quem foi.
    expect(ev.atorRotulo).toBe("Zé da Pizzaria");
    expect(ev.dados).toMatchObject({
      restaurantId: LOJA,
      autorUserId: "u-dono",
      plano: "GROWTH",
      ciclo: "MENSAL",
      precoCents: 39900,
      statusAnterior: "ATIVA",
    });
  });

  it("⭐ cancelar DUAS vezes não duplica a trilha nem mexe na hora do ato", async () => {
    // O duplo clique, que é o caso comum de quem está nervoso cancelando. Sem a
    // troca atômica, o segundo pedido moveria `canceledAt` para a hora do último
    // clique e escreveria outro evento — a trilha passaria a contar dois
    // cancelamentos, nenhum deles na hora certa.
    const linha = assinatura();
    const { db, eventos } = bancoFalso([linha]);

    const primeiro = await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA, ...AUTOR, cancelarNoGateway: gatewayQueAceita(), agora: AGORA,
    });
    const depois = new Date("2026-08-29T15:05:00Z");
    const segundo = await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA, ...AUTOR, cancelarNoGateway: gatewayQueAceita(), agora: depois,
    });

    expect(primeiro.resultado).toBe("cancelada");
    expect(segundo).toEqual({ resultado: "jaEstavaCancelada", canceladaEm: AGORA });
    expect(eventos).toHaveLength(1);
    expect(linha.canceledAt).toBe(AGORA);
  });

  it("⭐ na CORRIDA (dois pedidos ao mesmo tempo) só um vence e só um grava", async () => {
    /* Diferente do duplo clique sequencial: aqui os DOIS leram a assinatura
     * ATIVA — cada um com a sua cópia, como o Prisma devolve — e nenhum viu o do
     * outro. A conferência de estado que roda antes deixa os dois passarem, e é
     * por isso que ela não basta: quem decide é o `updateMany` condicionado a
     * `status: { not: "CANCELADA" }`, atômico no banco.
     *
     * Se a troca de estado fosse um `update` solto, os dois venceriam: duas
     * trilhas de cancelamento e `canceledAt` na hora do segundo, não do ato. */
    const linha = assinatura();
    const { db, eventos } = bancoFalso([linha]);

    const pedido = (agora: Date) =>
      cancelarPelaPropriaLoja(db as never, {
        restaurantId: LOJA, ...AUTOR, cancelarNoGateway: gatewayQueAceita(), agora,
      });

    const [a, b] = await Promise.all([pedido(AGORA), pedido(new Date("2026-08-29T15:00:01Z"))]);

    const resultados = [a.resultado, b.resultado].sort();
    expect(resultados).toEqual(["cancelada", "jaEstavaCancelada"]);
    expect(eventos).toHaveLength(1);
  });

  it("já cancelada devolve a hora ORIGINAL, e não a de agora", async () => {
    // A outra metade da idempotência: a resposta precisa dizer quando foi de
    // verdade, senão a tela mostra "cancelada hoje" para algo de três semanas.
    const { db, eventos } = bancoFalso([
      assinatura({ status: "CANCELADA", canceledAt: CANCELADA_ANTES }),
    ]);

    const r = await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA, ...AUTOR, cancelarNoGateway: gatewayQueAceita(), agora: AGORA,
    });

    expect(r).toEqual({ resultado: "jaEstavaCancelada", canceladaEm: CANCELADA_ANTES });
    expect(eventos).toHaveLength(0);
    expect(db.planSubscription.updateMany).not.toHaveBeenCalled();
  });

  it("⛔ cancelar não apaga nada da assinatura", async () => {
    // A regra em código, e não em recado: só `status` e `canceledAt` mudam.
    // `activatedAt` some com um `data` distraído, e com ele some a prova de
    // desde quando a Foocci prestou o serviço que cobrou.
    const linha = assinatura();
    const antes = { ...linha };
    const { db } = bancoFalso([linha]);

    await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA, ...AUTOR, cancelarNoGateway: gatewayQueAceita(), agora: AGORA,
    });

    expect(db.planSubscription.updateMany.mock.calls[0]![0].data).toEqual({
      status: "CANCELADA",
      canceledAt: AGORA,
    });
    expect(linha.activatedAt).toEqual(antes.activatedAt);
    expect(linha.plan).toBe(antes.plan);
    expect(linha.priceCents).toBe(antes.priceCents);
    expect(linha.mpPreapprovalId).toBe(antes.mpPreapprovalId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O DINHEIRO — CANCELAR AQUI NÃO É CANCELAR NO CARTÃO
// ═══════════════════════════════════════════════════════════════════════════

describe("o cancelamento no Mercado Pago", () => {
  it("o preapproval da assinatura é o que se manda cancelar", async () => {
    // A metade que passa. Marcar CANCELADA no nosso banco não tira dinheiro
    // nenhum do cartão: quem estanca é o gateway.
    const gateway = gatewayQueAceita();
    const { db } = bancoFalso([assinatura({ mpPreapprovalId: "pre-xyz" })]);

    await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA, ...AUTOR, cancelarNoGateway: gateway, agora: AGORA,
    });

    expect(gateway).toHaveBeenCalledWith("pre-xyz");
  });

  it("assinatura sem preapproval não chama o gateway — e cancela igual", async () => {
    // Venda combinada fora do gateway, ou assinatura que nunca chegou ao
    // pagamento. Chamar o MP com id vazio só produziria um erro que não é erro.
    const gateway = gatewayQueAceita();
    const linha = assinatura({ mpPreapprovalId: null });
    const { db } = bancoFalso([linha]);

    const r = await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA, ...AUTOR, cancelarNoGateway: gateway, agora: AGORA,
    });

    expect(gateway).not.toHaveBeenCalled();
    expect(r.resultado).toBe("cancelada");
    expect(linha.status).toBe("CANCELADA");
  });

  it("⭐ gateway que recusa NÃO vira sucesso silencioso — e a trava local fica armada", async () => {
    // O pior desenho possível seria desfazer o cancelamento quando o MP falha:
    // o cliente pediu para sair e continuaria ATIVO, cobrando. O certo é o
    // contrário — cancelado aqui (a trava anti-reativação armada), e a falha
    // NOMEADA para a tela avisar que pode cair mais uma cobrança.
    const linha = assinatura();
    const { db, eventos } = bancoFalso([linha]);
    const gateway = vi.fn().mockResolvedValue({ ok: false, detalhe: "MP recusou (401)" });

    const r = await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA, ...AUTOR, cancelarNoGateway: gateway, agora: AGORA,
    });

    expect(r.resultado).toBe("cancelada");
    expect(r).toMatchObject({ gateway: { ok: false } });
    expect((r as { gateway: { detalhe: string } }).gateway.detalhe).toContain("pre-abc");
    // A trava local NÃO foi desfeita, e a trilha foi gravada assim mesmo.
    expect(linha.status).toBe("CANCELADA");
    expect(eventos).toHaveLength(1);
  });

  it("gateway que ESTOURA se comporta como gateway que recusa", async () => {
    // Rede caindo no meio da chamada é o mesmo caso do 401, e não pode escapar
    // como exceção não tratada: escaparia como erro 500 na tela, e a pessoa não
    // saberia que o cancelamento já valeu do nosso lado.
    const linha = assinatura();
    const { db } = bancoFalso([linha]);
    const gateway = vi.fn().mockRejectedValue(new Error("ECONNRESET"));

    const r = await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA, ...AUTOR, cancelarNoGateway: gateway, agora: AGORA,
    });

    expect(r.resultado).toBe("cancelada");
    expect(r).toMatchObject({ gateway: { ok: false } });
    expect(linha.status).toBe("CANCELADA");
  });

  it("⛔ a assinatura é marcada ANTES de o gateway ser chamado", async () => {
    // A ordem é a proteção. Se o gateway viesse primeiro, uma queda entre as
    // duas deixaria o cartão sem cobrança e a assinatura ATIVA aqui — cliente
    // usando de graça, e nada no sistema dizendo por quê. Nesta ordem, a pior
    // falha possível é a inversa: visível, nomeada e consertável num painel.
    const linha = assinatura();
    const { db } = bancoFalso([linha]);
    let statusQuandoOGatewayFoiChamado: string | null = null;
    const gateway = vi.fn(async () => {
      statusQuandoOGatewayFoiChamado = linha.status;
      return { ok: true, detalhe: null };
    });

    await cancelarPelaPropriaLoja(db as never, {
      restaurantId: LOJA, ...AUTOR, cancelarNoGateway: gateway, agora: AGORA,
    });

    expect(statusQuandoOGatewayFoiChamado).toBe("CANCELADA");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// O QUE A TELA DIZ — E DE ONDE ISSO SAIU
// ═══════════════════════════════════════════════════════════════════════════

describe("⭐ o que a pessoa lê antes de confirmar", () => {
  it("as três consequências estão lá, e cada uma cita a cláusula de onde saiu", () => {
    // Sem a cláusula amarrada à frase, a tela vira um lugar onde alguém melhora
    // o texto — e "melhorar" um texto de cancelamento é como se inventa política
    // de reembolso sem querer.
    expect(CONSEQUENCIAS_DO_CANCELAMENTO).toHaveLength(3);
    for (const c of CONSEQUENCIAS_DO_CANCELAMENTO) {
      expect(c.clausula, c.texto).toMatch(/^\d+\.\d+$/);
      expect(c.texto.length, c.clausula).toBeGreaterThan(40);
    }
  });

  it("diz até quando o acesso continua — a cláusula 5.2 em português", () => {
    const juntas = CONSEQUENCIAS_DO_CANCELAMENTO.map((c) => c.texto).join(" ");
    expect(juntas).toContain("até o fim do ciclo que você já pagou");
    expect(juntas).toContain("não renova");
  });

  it("⭐ diz o que acontece com o que JÁ foi pago — sem prometer devolução", () => {
    // A cláusula 5.2 do Termo assinado diz que valores de ciclos já pagos não
    // são reembolsados na saída voluntária. A tela repete isso; ela NÃO cria
    // política de reembolso, e não pode passar a criar.
    const juntas = CONSEQUENCIAS_DO_CANCELAMENTO.map((c) => c.texto).join(" ");
    expect(juntas).toContain("não é devolvido");
    expect(juntas).toContain("multa");
    expect(juntas.toLowerCase()).not.toContain("reembolsamos");
    expect(juntas.toLowerCase()).not.toContain("devolvemos o valor");
  });

  it("diz o que acontece com os dados, com os dois prazos da cláusula 5.4", () => {
    // 30 dias para exportar, 60 para o apagamento. Os números vêm do Termo — não
    // são escolha desta tela, e é por isso que estão fixados aqui.
    const dados = CONSEQUENCIAS_DO_CANCELAMENTO.find((c) => c.clausula === "5.4");
    expect(dados).toBeDefined();
    expect(dados!.texto).toContain("30 dias");
    expect(dados!.texto).toContain("60 dias");
  });

  it("⛔ nenhuma frase promete uma DATA que o sistema não guarda", () => {
    // `PlanSubscription` não tem coluna de fim de ciclo. Derivar de
    // `activatedAt` daria um dia plausível e às vezes errado — e data errada
    // numa tela de cancelamento é promessa quebrada. A tela diz a REGRA.
    for (const c of CONSEQUENCIAS_DO_CANCELAMENTO) {
      expect(c.texto, c.clausula).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    }
  });
});
