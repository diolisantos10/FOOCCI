/**
 * A PORTA DO CANCELAMENTO PELO CLIENTE — quem entra, e com que chave.
 *
 * A lógica do cancelamento é exercitada em `services/billing/cancelamento.test.ts`.
 * Este arquivo prova a única coisa que só a rota pode provar: **a chave da
 * autorização é o cabeçalho do servidor, e não existe outra**.
 *
 * ── O defeito que estes testes impedem ──────────────────────────────────────
 *
 * O jeito natural de escrever esta rota é receber um `subscriptionId` no corpo e
 * conferir se ele pertence a quem pediu. Parece seguro e quase sempre é — até o
 * dia em que a conferência é esquecida numa refatoração, ou vale para o `GET` e
 * não para o `DELETE`. Aqui o cliente não tem onde digitar a chave: o `where` da
 * busca é o `x-restaurant-id` que o middleware injeta do JWT.
 *
 * ── AS DUAS METADES, SEMPRE ─────────────────────────────────────────────────
 *
 * Recusa sem sessão E deixa passar com sessão. Só a primeira metade ficaria
 * verde contra uma rota que respondesse 401 a todo mundo — e o botão publicado
 * nunca funcionaria, que é o defeito que esta tarefa veio consertar.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";

const db = vi.hoisted(() => ({
  planSubscription: { findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  domainEvent: { create: vi.fn() },
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const mp = vi.hoisted(() => ({ cancelPreapproval: vi.fn() }));
vi.mock("@/services/billing/MercadoPagoPlatformBilling", () => ({
  MercadoPagoPlatformBilling: mp,
}));

import { GET, DELETE } from "./route";

const URL_ROTA = "https://foocci.com.br/api/billing/subscription";

/** Requisição COM sessão — os cabeçalhos que o middleware injeta do JWT. */
const comSessao = (metodo: "GET" | "DELETE") =>
  new NextRequest(URL_ROTA, {
    method: metodo,
    headers: {
      "x-restaurant-id": "rest-1",
      "x-user-id": "u-dono",
      "x-user-role": "OWNER",
    },
  });

/** Requisição SEM sessão — nenhum cabeçalho de tenant. */
const semSessao = (metodo: "GET" | "DELETE") => new NextRequest(URL_ROTA, { method: metodo });

const ASSINATURA = {
  id: "sub-1",
  restaurantId: "rest-1",
  plan: "GROWTH",
  cycle: "MENSAL",
  priceCents: 39900,
  status: "ATIVA",
  activatedAt: new Date("2026-08-03T12:00:00Z"),
  canceledAt: null,
  mpPreapprovalId: "pre-abc",
};

beforeEach(() => {
  vi.clearAllMocks();
  db.planSubscription.findFirst.mockResolvedValue(ASSINATURA);
  db.planSubscription.updateMany.mockResolvedValue({ count: 1 });
  db.domainEvent.create.mockResolvedValue({});
  db.user.findUnique.mockResolvedValue({ name: "Zé da Pizzaria", email: "ze@bar.com" });
  mp.cancelPreapproval.mockResolvedValue({ ok: true, status: "cancelled" });
});

describe("GET — a loja lê o próprio plano", () => {
  it("com sessão, devolve a assinatura e as consequências do cancelamento", async () => {
    // A metade que PASSA. Sem ela, um 401 para todo mundo ficaria verde no resto
    // do arquivo — e a tela mostraria "carregando" para sempre.
    const res = await GET(comSessao("GET"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.assinatura.id).toBe("sub-1");
    expect(body.assinatura.veredito).toBe("podeCancelar");
    // O texto do que acontece depois vem do SERVIDOR: se a tela o escrevesse,
    // a primeira "melhoria de texto" poderia prometer devolução de dinheiro.
    //
    // Eram três frases até 28/08. São CINCO desde 29/08, quando o CEO decidiu a
    // regra da devolução: entraram o que volta do ciclo (cláusula 5.5) e os 7
    // dias de arrependimento (5.6). E o acesso passou a terminar no fim do MÊS
    // em curso, não do ciclo pago — porque o resto do ciclo agora é devolvido.
    expect(body.consequencias).toHaveLength(5);
    expect(body.consequencias.join(" ")).toContain("até o fim do mês em curso");
  });

  it("sem sessão, 401 — e o banco não é sequer consultado", async () => {
    const res = await GET(semSessao("GET"));
    expect(res.status).toBe(401);
    expect(db.planSubscription.findFirst).not.toHaveBeenCalled();
  });

  it("⭐ a busca é feita PELO restaurante da sessão", async () => {
    // A trava, no lugar onde ela mora. Um `where` que aceitasse qualquer outra
    // coisa seria uma chave escolhida por quem pergunta.
    await GET(comSessao("GET"));
    expect(db.planSubscription.findFirst.mock.calls[0]![0].where).toEqual({
      restaurantId: "rest-1",
    });
  });
});

describe("DELETE — a loja cancela o próprio plano", () => {
  it("com sessão, cancela e devolve sucesso", async () => {
    // A metade que PASSA — a razão de a tela existir.
    const res = await DELETE(comSessao("DELETE"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.jaEstavaCancelada).toBe(false);
    expect(body.gatewayOk).toBe(true);
    expect(db.planSubscription.updateMany).toHaveBeenCalledTimes(1);
    expect(mp.cancelPreapproval).toHaveBeenCalledWith("pre-abc");
  });

  it("⭐ sem sessão, 401 — e NADA é cancelado", async () => {
    // A metade que recusa. Sem cabeçalho de tenant não há dono, e sem dono não
    // há cancelamento: nem no nosso banco, nem no Mercado Pago.
    const res = await DELETE(semSessao("DELETE"));

    expect(res.status).toBe(401);
    expect(db.planSubscription.updateMany).not.toHaveBeenCalled();
    expect(mp.cancelPreapproval).not.toHaveBeenCalled();
    expect(db.domainEvent.create).not.toHaveBeenCalled();
  });

  it("⭐ um subscriptionId no corpo do pedido NÃO muda o que é cancelado", () => {
    /* A trava provada por AUSÊNCIA, que é como ela realmente funciona: não há
     * `req.json()` nesta rota. Um teste que mandasse `{"subscriptionId": "..."}`
     * e conferisse o resultado provaria pouco — provaria que hoje o campo é
     * ignorado. O que precisa continuar verdade é que o corpo nunca chegue a ser
     * lido; se alguém acrescentar a leitura, é aqui que aparece. */
    const bruto = readFileSync(
      join(process.cwd(), "src/app/api/billing/subscription/route.ts"),
      "utf8",
    );
    // Sem comentários: o cabeçalho do arquivo CITA `subscriptionId` para
    // explicar por que ele não existe. O que importa é o que roda.
    const codigo = bruto
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*)/.test(l))
      .join("\n");

    expect(codigo).not.toContain("req.json()");
    expect(codigo).not.toContain("subscriptionId");
    expect(codigo).toContain("getTenantContext");
  });

  it("⭐ cancelar de novo devolve 200 e a hora ORIGINAL — não 409, não erro", async () => {
    // Idempotência com cara de idempotência. Quem clicou duas vezes fez a coisa
    // certa duas vezes; um 409 na cara da pessoa diria que ela errou.
    const canceladaEm = new Date("2026-08-01T09:00:00Z");
    db.planSubscription.findFirst.mockResolvedValue({
      ...ASSINATURA, status: "CANCELADA", canceledAt: canceladaEm,
    });

    const res = await DELETE(comSessao("DELETE"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.jaEstavaCancelada).toBe(true);
    expect(new Date(body.canceladaEm)).toEqual(canceladaEm);
    expect(db.planSubscription.updateMany).not.toHaveBeenCalled();
    expect(db.domainEvent.create).not.toHaveBeenCalled();
  });

  it("loja sem assinatura recebe 404 com explicação — não um 500", async () => {
    db.planSubscription.findFirst.mockResolvedValue(null);

    const res = await DELETE(comSessao("DELETE"));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toContain("assinatura");
  });

  it("⭐ Mercado Pago que recusa NÃO vira 'pronto!' — a resposta avisa", async () => {
    // O cancelamento vale do nosso lado (a trava anti-reativação está armada),
    // mas o cartão pode ser cobrado mais uma vez. Esconder isso faria a pessoa
    // descobrir no extrato do mês seguinte.
    mp.cancelPreapproval.mockResolvedValue({ ok: false, reason: "mp_recusou", detail: "401" });

    const res = await DELETE(comSessao("DELETE"));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.gatewayOk).toBe(false);
    expect(body.gatewayErro).toContain("Mercado Pago");
    // E o cancelamento aconteceu assim mesmo.
    expect(db.planSubscription.updateMany).toHaveBeenCalledTimes(1);
    expect(db.domainEvent.create).toHaveBeenCalledTimes(1);
  });

  it("gateway sem token configurado é avisado pelo nome", async () => {
    mp.cancelPreapproval.mockResolvedValue({ ok: false, reason: "gateway_nao_configurado" });

    const body = await (await DELETE(comSessao("DELETE"))).json();
    expect(body.gatewayOk).toBe(false);
    expect(body.gatewayErro).toContain("MP_PLATFORM_ACCESS_TOKEN");
  });

  it("⭐ a trilha guarda o NOME de quem cancelou", async () => {
    // Se a pessoa for desativada depois, o id não diz nada a quem lê o histórico.
    await DELETE(comSessao("DELETE"));

    const ev = db.domainEvent.create.mock.calls[0]![0].data;
    expect(ev.atorRotulo).toBe("Zé da Pizzaria");
    expect(ev.dados.autorUserId).toBe("u-dono");
    expect(ev.dados.restaurantId).toBe("rest-1");
  });

  it("nome que não pôde ser lido não trava o cancelamento", async () => {
    // Trilha com nome faltando é ruim; cancelamento preso por causa de um SELECT
    // de nome seria pior — é a promessa publicada deixando de funcionar por um
    // detalhe de exibição.
    db.user.findUnique.mockRejectedValue(new Error("banco lento"));

    const res = await DELETE(comSessao("DELETE"));
    expect(res.status).toBe(200);
    expect(db.domainEvent.create.mock.calls[0]![0].data.atorRotulo).toBe("u-dono");
  });
});
