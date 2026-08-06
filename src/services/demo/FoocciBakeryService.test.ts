/**
 * Provas do FoocciBakeryService — as três que custam caro se estiverem erradas:
 *
 *   1. Rodar o seed DUAS vezes não duplica restaurante, categoria nem item.
 *   2. Nada gera foto sem confirmação explícita, e sem a chave da OpenAI a recusa
 *      é uma frase, não uma exceção técnica.
 *   3. Foto que já existe não é refeita por acidente — nem por duplo clique
 *      (empréstimo com prazo), nem por corrida entre dois chamadores (re-leitura
 *      do imageUrl imediatamente antes de gastar).
 *
 * O Prisma é substituído por um banco de mentira em memória. É de propósito: um
 * mock que só conta chamadas provaria que o código chamou algo; este prova o
 * ESTADO FINAL — que é o que "não duplica" quer dizer.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Banco de mentira ──────────────────────────────────────────────────────────
// Tudo dentro de `vi.hoisted` porque os mocks de módulo sobem para o topo do
// arquivo e precisam encontrar isto já construído.

type Row = Record<string, any>;

const H = vi.hoisted(() => {
  type R = Record<string, any>;
  const db: Record<string, R[]> = {};
  /** Injeta uma falha de banco num modelo, para provar a tradução do erro. */
  const falha: { model: string | null; erro: Error | null } = { model: null, erro: null };
  let seq = 0;

  /** Chave única composta (`restaurantId_dayOfWeek`) vira filtro plano. */
  function flatten(where: R | undefined): R {
    const out: R = {};
    for (const [k, v] of Object.entries(where ?? {})) {
      const composta =
        k.includes("_") && v && typeof v === "object" && !Array.isArray(v) && !("notIn" in v) && !("in" in v);
      if (composta) Object.assign(out, v);
      else out[k] = v;
    }
    return out;
  }

  function matches(row: R, where: R | undefined): boolean {
    for (const [k, v] of Object.entries(flatten(where))) {
      if (k === "OR") {
        if (!(v as R[]).some((sub) => matches(row, sub))) return false;
        continue;
      }
      // Relação usada pelo serviço: menuItem.category.restaurantId
      if (k === "category") {
        const parent = (db.menuCategory ?? []).find((c) => c.id === row.categoryId);
        if (!parent || !matches(parent, v as R)) return false;
        continue;
      }
      if (v === null) {
        if (row[k] !== null && row[k] !== undefined) return false;
        continue;
      }
      if (v && typeof v === "object" && "notIn" in v) {
        if ((v.notIn as unknown[]).includes(row[k])) return false;
        continue;
      }
      if (v && typeof v === "object" && "in" in v) {
        if (!(v.in as unknown[]).includes(row[k])) return false;
        continue;
      }
      if (row[k] !== v) return false;
    }
    return true;
  }

  function table(model: string): R[] {
    db[model] ??= [];
    return db[model]!;
  }

  function delegate(model: string) {
    const guard = () => {
      if (falha.model === model && falha.erro) throw falha.erro;
    };
    const find = (args: R) => {
      guard();
      return table(model).find((r) => matches(r, args?.where));
    };
    return {
      findUnique: async (args: R) => find(args) ?? null,
      findFirst: async (args: R) => find(args) ?? null,
      findMany: async (args: R) => {
        guard();
        return table(model).filter((r) => matches(r, args?.where));
      },
      count: async (args: R) => {
        guard();
        return table(model).filter((r) => matches(r, args?.where)).length;
      },
      create: async (args: R) => {
        guard();
        const row = { id: `${model}-${++seq}`, ...args.data };
        table(model).push(row);
        return row;
      },
      update: async (args: R) => {
        const row = find(args);
        if (!row) throw new Error(`[fake prisma] ${model}.update não achou o registro`);
        Object.assign(row, args.data);
        return row;
      },
      upsert: async (args: R) => {
        const row = find(args);
        if (row) {
          Object.assign(row, args.update);
          return row;
        }
        const novo = { id: `${model}-${++seq}`, ...flatten(args.where), ...args.create };
        table(model).push(novo);
        return novo;
      },
      deleteMany: async (args: R) => {
        guard();
        const restam = table(model).filter((r) => !matches(r, args?.where));
        const removidos = table(model).length - restam.length;
        db[model] = restam;
        return { count: removidos };
      },
    };
  }

  const fakePrisma = new Proxy({} as Record<string, ReturnType<typeof delegate>>, {
    get: (_t, model: string) => delegate(model),
  });

  return {
    db,
    falha,
    fakePrisma,
    gerarFoto: vi.fn(),
    storeEnhancedImage: vi.fn(),
    limpar() {
      for (const k of Object.keys(db)) delete db[k];
      seq = 0;
      falha.model = null;
      falha.erro = null;
    },
  };
});

// ── Mocks de módulo ───────────────────────────────────────────────────────────

const db = H.db as Record<string, Row[]>;
const gerarFoto = H.gerarFoto;
const storeEnhancedImage = H.storeEnhancedImage;

vi.mock("@/lib/prisma", () => ({ prisma: H.fakePrisma }));
// A OpenAI é alcançada pelo provedor de imagem (Regra de Ouro do Brain): é ELE
// que o serviço chama, e é ele que o teste substitui.
vi.mock("@/services/imageEnhancement/providers/openai", () => ({
  generateFoodPhotoFromPrompt: (p: string) => H.gerarFoto(p),
  // A regra de "tem chave?" é a de verdade — é ela que o serviço reexporta.
  isOpenAiImageConfigured: () => {
    const k = process.env.OPENAI_API_KEY;
    return !!k && k !== "not-configured" && k.length > 10;
  },
}));
vi.mock("@/services/imageEnhancement/storage", () => ({
  storeEnhancedImage: (...a: unknown[]) => H.storeEnhancedImage(...a),
}));
vi.mock("@/services/restaurant/RestaurantDefaultsService", () => ({
  RestaurantDefaultsService: { createRestaurantDefaults: vi.fn().mockResolvedValue({}) },
}));
vi.mock("bcryptjs", () => ({ hash: async (s: string) => `hash:${s}` }));

import {
  BAKERY_ERROR_STATUS,
  BAKERY_EXTRA_PHOTOS_PER_ITEM,
  BakeryOperationError,
  Lease,
  __resetBakeryImageJob,
  generateBakeryImages,
  getBakeryImageJob,
  planBakeryImages,
  seedBakery,
  startBakeryImageJob,
} from "./FoocciBakeryService";

beforeEach(() => {
  H.limpar();
  vi.clearAllMocks();
  __resetBakeryImageJob();
  process.env.DATABASE_URL = "postgres://fake/db";
  process.env.OPENAI_API_KEY = "sk-chave-de-mentira-para-teste";
  gerarFoto.mockResolvedValue({
    success: true,
    buffer: Buffer.from("foto"),
    mimeType: "image/png",
    model: "gpt-image-1",
  });
  storeEnhancedImage.mockResolvedValue("/api/media/foto-1");
});

// ─── 1. O seed ────────────────────────────────────────────────────────────────

describe("seedBakery — criar/atualizar a padaria", () => {
  it("cria a padaria marcada como vitrine, com cardápio e as três rotas", async () => {
    const r = await seedBakery();

    expect(r.restaurantCreated).toBe(true);
    expect(db.restaurant).toHaveLength(1);
    expect(db.restaurant![0]!.isDemo).toBe(true); // a trava de "não é cliente"
    expect(r.categoriesCreated).toBeGreaterThan(0);
    expect(r.itemsCreated).toBeGreaterThan(0);
    expect(r.routes).toEqual({
      mesaQr: "/qr/foocci-bakery",
      lojaSemIa: "/pedido/foocci-bakery?modo=loja",
      garcomIa: "/pedido/foocci-bakery",
    });
  });

  it("rodar DUAS vezes não duplica restaurante, categoria nem item", async () => {
    const primeira = await seedBakery();
    const categoriasDepoisDa1a = db.menuCategory!.length;
    const itensDepoisDa1a = db.menuItem!.length;

    const segunda = await seedBakery();

    expect(db.restaurant).toHaveLength(1);
    expect(db.menuCategory!.length).toBe(categoriasDepoisDa1a);
    expect(db.menuItem!.length).toBe(itensDepoisDa1a);

    // A segunda passada ATUALIZA o que a primeira criou — nada nasce de novo.
    expect(segunda.restaurantCreated).toBe(false);
    expect(segunda.categoriesCreated).toBe(0);
    expect(segunda.itemsCreated).toBe(0);
    expect(segunda.categoriesUpdated).toBe(primeira.categoriesCreated);
    expect(segunda.itemsUpdated).toBe(primeira.itemsCreated);
  });

  it("não troca a senha do dono que já existe (o painel da vitrine não cai a cada clique)", async () => {
    const primeira = await seedBakery();
    expect(primeira.ownerPasswordOnce).toBeTruthy();
    const hashOriginal = db.user![0]!.password;

    const segunda = await seedBakery();
    expect(segunda.ownerPasswordOnce).toBeNull();
    expect(db.user).toHaveLength(1);
    expect(db.user![0]!.password).toBe(hashOriginal);
  });

  it("NÃO apaga a foto já paga ao re-executar", async () => {
    await seedBakery();
    db.menuItem![0]!.imageUrl = "/api/media/ja-paga";

    await seedBakery();

    expect(db.menuItem![0]!.imageUrl).toBe("/api/media/ja-paga");
  });

  it("ensaio (dryRun) não escreve nada", async () => {
    const r = await seedBakery({ dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(db.restaurant ?? []).toHaveLength(0);
    expect(db.menuItem ?? []).toHaveLength(0);
    expect(r.itemsWithoutImage).toBeNull();
  });

  it("sem DATABASE_URL recusa em português e não toca em nada", async () => {
    delete process.env.DATABASE_URL;
    await expect(seedBakery()).rejects.toMatchObject({ code: "SEM_BANCO" });
    expect(db.restaurant ?? []).toHaveLength(0);
  });

  it("o banco recusando vira BANCO_RECUSOU com evidência no erro, não 500 anônimo", async () => {
    const boom = new Error("connection refused");
    H.falha.model = "restaurant";
    H.falha.erro = boom;

    const err = await seedBakery().catch((e) => e);
    expect(err).toBeInstanceOf(BakeryOperationError);
    expect(err.code).toBe("BANCO_RECUSOU");
    expect(err.message).toContain("banco de dados");
    expect(err.evidence).toBe(boom); // a evidência existe — para o log, não para a tela
  });
});

// ─── 2. O empréstimo com prazo ────────────────────────────────────────────────

describe("Lease — nenhum estado prende trabalho para sempre", () => {
  it("recusa o segundo pretendente enquanto o prazo corre", () => {
    const lease = new Lease(1000, "O trabalho");
    lease.acquire(0);
    expect(() => lease.acquire(500)).toThrow(BakeryOperationError);
    expect(() => lease.acquire(500)).toThrow(/já está rodando/);
  });

  it("o prazo vencido é RESGATADO por quem chega depois — não fica preso", () => {
    const lease = new Lease(1000, "O trabalho");
    lease.acquire(0);
    expect(() => lease.acquire(1001)).not.toThrow(); // resgatou o abandonado
    expect(lease.isHeld(1001)).toBe(true);
  });

  it("renovar estende o prazo enquanto o trabalho está vivo", () => {
    const lease = new Lease(1000, "O trabalho");
    lease.acquire(0);
    lease.renew(900);
    expect(lease.isHeld(1500)).toBe(true);
    expect(lease.isHeld(1901)).toBe(false);
  });
});

// ─── 3. As fotos (dinheiro) ───────────────────────────────────────────────────

describe("generateBakeryImages — dinheiro real", () => {
  beforeEach(async () => {
    await seedBakery();
  });

  it("SEM confirmação não gera nada e não chama a OpenAI", async () => {
    await expect(generateBakeryImages({ confirmar: false })).rejects.toMatchObject({
      code: "SEM_CONFIRMACAO",
    });
    expect(gerarFoto).not.toHaveBeenCalled();
  });

  it("sem a chave da OpenAI recusa com frase de gente e não escreve campo nenhum", async () => {
    delete process.env.OPENAI_API_KEY;
    const err = await generateBakeryImages({ confirmar: true }).catch((e) => e);
    expect(err.code).toBe("SEM_CHAVE_OPENAI");
    expect(err.message).toContain("chave da OpenAI");
    expect(gerarFoto).not.toHaveBeenCalled();
    expect(db.menuItem!.every((i) => !i.imageUrl)).toBe(true);
  });

  it('a chave placeholder "not-configured" conta como ausência de chave', async () => {
    process.env.OPENAI_API_KEY = "not-configured";
    await expect(generateBakeryImages({ confirmar: true })).rejects.toMatchObject({
      code: "SEM_CHAVE_OPENAI",
    });
  });

  it("chave curta demais também é recusada AQUI — a mesma regra de quem gasta", async () => {
    // Se a tela achasse que dá e o provedor recusasse, seriam 40 falhas em vez
    // de uma frase. A regra é importada do provedor, não recopiada.
    process.env.OPENAI_API_KEY = "sk-xx";
    await expect(generateBakeryImages({ confirmar: true })).rejects.toMatchObject({
      code: "SEM_CHAVE_OPENAI",
    });
    expect(gerarFoto).not.toHaveBeenCalled();
  });

  it("num restaurante que NÃO é vitrine, recusa (foto de IA não entra em cardápio de cliente)", async () => {
    db.restaurant![0]!.isDemo = false;
    await expect(generateBakeryImages({ confirmar: true })).rejects.toMatchObject({
      code: "NAO_E_VITRINE",
    });
    expect(gerarFoto).not.toHaveBeenCalled();
  });

  it("gera só o que falta e grava a URL no item — CADA item leva capa + as 2 extras", async () => {
    // `limite` é em ITENS: 3 itens × (1 capa + 2 extras) = 9 chamadas pagas.
    const r = await generateBakeryImages({ confirmar: true, limite: 3 });
    const porItem = 1 + BAKERY_EXTRA_PHOTOS_PER_ITEM;

    expect(r.geradas).toBe(3 * porItem);
    expect(gerarFoto).toHaveBeenCalledTimes(3 * porItem);
    expect(db.menuItem!.filter((i) => i.imageUrl).length).toBe(3);
    expect(r.custoRealEstimadoUsd).toBeCloseTo(3 * porItem * 0.04, 2);
  });

  it("as extras entram em images[] com o carrossel LIGADO — e a capa não é duplicada lá dentro", async () => {
    // A meia-correção que este portão pega: gerar as fotos, guardar em `images`
    // e deixar `carouselEnabled = false`. O dinheiro sai e a ficha não muda.
    let n = 0;
    storeEnhancedImage.mockImplementation(async () => `/api/media/foto-${++n}`);

    await generateBakeryImages({ confirmar: true, limite: 1 });
    const item = db.menuItem![0]!;

    expect(item.imageUrl).toBeTruthy();
    expect(item.images).toHaveLength(BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(item.carouselEnabled).toBe(true);
    // A capa é o primeiro slide por construção (components/menu/photos.ts).
    // Repeti-la dentro de `images` faria a ficha abrir com a mesma foto duas vezes.
    expect(item.images).not.toContain(item.imageUrl);
    expect(new Set(item.images as string[]).size).toBe(BAKERY_EXTRA_PHOTOS_PER_ITEM);
  });

  it("os ângulos das extras são DIFERENTES entre si e diferentes do da capa", async () => {
    await generateBakeryImages({ confirmar: true, limite: 1 });
    const prompts = gerarFoto.mock.calls.map((c) => String(c[0]));

    expect(prompts).toHaveLength(1 + BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(prompts[0]).toContain("Ângulo de 45 graus");
    expect(prompts[1]).toContain("DE CIMA");
    expect(prompts[2]).toContain("PRIMEIRÍSSIMO PLANO");
    // O cenário é o mesmo nos três: carrossel tem de parecer um ensaio só.
    for (const p of prompts) expect(p).toContain("mármore claro");
  });

  it("rodar de novo NÃO regera nada — nem capa nem extra — e recusa quando não sobrou nada", async () => {
    const total = db.menuItem!.length;
    const porItem = 1 + BAKERY_EXTRA_PHOTOS_PER_ITEM;
    await generateBakeryImages({ confirmar: true });
    expect(gerarFoto).toHaveBeenCalledTimes(total * porItem);

    gerarFoto.mockClear();
    await expect(generateBakeryImages({ confirmar: true })).rejects.toMatchObject({
      code: "NADA_A_FAZER",
    });
    expect(gerarFoto).not.toHaveBeenCalled();
  });

  it("item a quem falta SÓ uma extra paga uma foto, não três", async () => {
    // A metade que reprova: se a conta fosse por item em vez de por foto que
    // falta, este caso cobraria a capa de novo — dinheiro por foto que já existe.
    for (const i of db.menuItem!) { i.imageUrl = "/api/media/capa"; i.images = ["/api/media/e1", "/api/media/e2"]; }
    const alvo = db.menuItem![0]!;
    alvo.images = ["/api/media/e1"];

    const r = await generateBakeryImages({ confirmar: true });

    expect(r.geradas).toBe(1);
    expect(gerarFoto).toHaveBeenCalledTimes(1);
    expect(alvo.imageUrl).toBe("/api/media/capa"); // a capa NÃO foi refeita
    expect(alvo.images).toHaveLength(BAKERY_EXTRA_PHOTOS_PER_ITEM);
  });

  it("a foto que apareceu no meio do caminho é PULADA sem gastar (corrida entre dois chamadores)", async () => {
    const alvos = db.menuItem!.slice(0, 2);
    // Simula o outro chamador terminando a segunda foto enquanto a primeira roda.
    gerarFoto.mockImplementationOnce(async () => {
      alvos[1]!.imageUrl = "/api/media/veio-do-outro";
      return { success: true, buffer: Buffer.from("x"), mimeType: "image/png", model: "m" };
    });

    const r = await generateBakeryImages({ confirmar: true, limite: 2 });

    // A capa do segundo item apareceu no meio: ela é PULADA (nada gasto). As
    // extras dos dois itens continuam sendo geradas normalmente.
    expect(r.puladas).toBe(1);
    expect(alvos[1]!.imageUrl).toBe("/api/media/veio-do-outro");
    expect(r.geradas).toBe(1 + 2 * BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(gerarFoto).toHaveBeenCalledTimes(1 + 2 * BAKERY_EXTRA_PHOTOS_PER_ITEM);
  });

  it("extra que já existe também é pulada na corrida — a trava vale para as duas pontas", async () => {
    // Todos com capa, nenhum com extra: o que falta são só fotos de carrossel.
    for (const i of db.menuItem!) { i.imageUrl = "/api/media/capa"; i.images = []; }
    const alvos = db.menuItem!.slice(0, 2);

    // O outro processo fecha o carrossel do SEGUNDO item enquanto o primeiro roda.
    gerarFoto.mockImplementationOnce(async () => {
      alvos[1]!.images = ["/api/media/outro-1", "/api/media/outro-2"];
      return { success: true, buffer: Buffer.from("x"), mimeType: "image/png", model: "m" };
    });

    const r = await generateBakeryImages({ confirmar: true, limite: 2 });

    // Pagou só pelas duas extras do primeiro item; as duas do segundo já existiam.
    expect(r.geradas).toBe(BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(r.puladas).toBe(BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(gerarFoto).toHaveBeenCalledTimes(BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(alvos[1]!.images).toEqual(["/api/media/outro-1", "/api/media/outro-2"]);
  });

  it('"regerar" refaz também quem já tem foto — mas é caminho separado e explícito', async () => {
    db.menuItem![0]!.imageUrl = "/api/media/antiga";
    db.menuItem![0]!.images = ["/api/media/velha1", "/api/media/velha2"];
    storeEnhancedImage.mockResolvedValue("/api/media/nova");

    const r = await generateBakeryImages({ confirmar: true, regerar: true, limite: 1 });

    expect(r.geradas).toBe(1 + BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(r.puladas).toBe(0);
    expect(db.menuItem![0]!.imageUrl).toBe("/api/media/nova");
    // Regerar SUBSTITUI as extras. Se acumulasse, o carrossel viraria 4 fotos —
    // duas novas e duas velhas — sem ninguém pedir.
    expect(db.menuItem![0]!.images).toHaveLength(BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(db.menuItem![0]!.images).not.toContain("/api/media/velha1");
  });

  it("uma foto falhando não derruba as outras — o item fica sem foto e o motivo volta", async () => {
    const okFoto = { success: true, buffer: Buffer.from("x"), mimeType: "image/png", model: "m" };
    gerarFoto
      .mockResolvedValueOnce(okFoto)
      // O provedor devolve a falha; o serviço registra e segue.
      .mockResolvedValueOnce({ success: false, error: "rate limit da OpenAI" })
      .mockResolvedValueOnce(okFoto);

    // 3 itens × 3 fotos = 9 chamadas; a segunda falha, as outras 8 saem.
    const r = await generateBakeryImages({ confirmar: true, limite: 3 });

    expect(r.geradas).toBe(3 * (1 + BAKERY_EXTRA_PHOTOS_PER_ITEM) - 1);
    expect(r.falhas).toHaveLength(1);
    expect(r.falhas[0]!.motivo).toContain("rate limit"); // a evidência vem junto
    // A falha diz QUAL foto do item quebrou — "o item X falhou" não basta quando
    // são três fotos por item.
    expect(r.falhas[0]!.motivo).toMatch(/capa|foto extra/);
    expect(r.falhas[0]!.item).toBeTruthy();
  });

  it("resposta da OpenAI sem imagem é falha registrada, não URL quebrada no cardápio", async () => {
    gerarFoto.mockResolvedValue({ success: false, error: "a OpenAI respondeu sem imagem" });
    const r = await generateBakeryImages({ confirmar: true, limite: 1 });
    expect(r.geradas).toBe(0);
    expect(r.falhas).toHaveLength(1 + BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(db.menuItem!.filter((i) => i.imageUrl).length).toBe(0);
    // Carrossel NÃO liga quando nenhuma extra entrou: ficha vazia é melhor que
    // ficha com carrossel de zero foto.
    expect(db.menuItem!.filter((i) => i.carouselEnabled).length).toBe(0);
  });
});

// ─── 4. O trabalho disparado pelo botão ───────────────────────────────────────

describe("startBakeryImageJob — o botão do admin", () => {
  beforeEach(async () => {
    await seedBakery();
  });

  /** Espera o trabalho de fundo terminar — nenhum teste deixa foto rodando solta. */
  async function aguardarFim(): Promise<void> {
    for (let i = 0; i < 200 && getBakeryImageJob()?.status === "RODANDO"; i++) {
      await new Promise((r) => setTimeout(r, 5));
    }
  }

  it("sem confirmação, não começa nada", async () => {
    await expect(startBakeryImageJob({ confirmar: false })).rejects.toMatchObject({
      code: "SEM_CONFIRMACAO",
    });
    expect(getBakeryImageJob()).toBeNull();
    expect(gerarFoto).not.toHaveBeenCalled();
  });

  it("duplo clique: o segundo disparo é recusado enquanto o primeiro roda", async () => {
    // A primeira foto fica pendurada para o trabalho continuar "RODANDO".
    let liberar: (v: unknown) => void = () => {};
    gerarFoto.mockImplementationOnce(
      () => new Promise((resolve) => { liberar = resolve; }),
    );

    const trabalho = await startBakeryImageJob({ confirmar: true, limite: 2 });
    expect(trabalho.status).toBe("RODANDO");

    await expect(startBakeryImageJob({ confirmar: true, limite: 2 })).rejects.toMatchObject({
      code: "JA_EM_ANDAMENTO",
    });
    expect(BAKERY_ERROR_STATUS.JA_EM_ANDAMENTO).toBe(409);

    liberar({ success: true, buffer: Buffer.from("x"), mimeType: "image/png", model: "m" });
    await aguardarFim();
  });

  it("informa o custo do trabalho antes de qualquer foto sair — e o total é em FOTOS", async () => {
    // `limite` é em itens; o trabalho anuncia FOTOS. Enquanto o botão anunciava
    // "5" e o gerador cobrava 15, o número da tela era uma mentira de 3×.
    const porItem = 1 + BAKERY_EXTRA_PHOTOS_PER_ITEM;
    const trabalho = await startBakeryImageJob({ confirmar: true, limite: 5 });
    expect(trabalho.total).toBe(5 * porItem);
    expect(trabalho.custoEstimadoUsd).toBeCloseTo(5 * porItem * 0.04, 2);
    await aguardarFim();
  });

  it("o total anunciado é EXATAMENTE o número de chamadas pagas", async () => {
    // A metade que reprova: duas contas separadas (uma no botão, outra no
    // gerador) que podem divergir. Aqui elas são comparadas de frente.
    const trabalho = await startBakeryImageJob({ confirmar: true, limite: 4 });
    const anunciado = trabalho.total;
    await aguardarFim();
    expect(gerarFoto).toHaveBeenCalledTimes(anunciado);
    expect(getBakeryImageJob()!.geradas).toBe(anunciado);
  });

  it("terminado, o trabalho relata o que saiu e o que falhou — e sai do estado RODANDO", async () => {
    gerarFoto
      .mockResolvedValueOnce({ success: true, buffer: Buffer.from("x"), mimeType: "image/png", model: "m" })
      .mockRejectedValueOnce(new Error("a OpenAI recusou a chave"));

    await startBakeryImageJob({ confirmar: true, limite: 2 });
    await aguardarFim();

    const fim = getBakeryImageJob()!;
    expect(fim.status).toBe("CONCLUIDO");
    expect(fim.geradas).toBe(2 * (1 + BAKERY_EXTRA_PHOTOS_PER_ITEM) - 1);
    expect(fim.falhas).toHaveLength(1);
    expect(fim.falhas[0]!.motivo).toContain("recusou a chave");
    expect(fim.processadas).toBe(fim.total); // a barra não fica presa em 90%
  });

  it("avisa o chamador quando termina, com o total gerado — quem dispara no deploy não olha tela", async () => {
    const avisos: Array<{ status: string; geradas: number; puladas: number }> = [];

    await startBakeryImageJob({
      confirmar: true,
      limite: 2,
      onSettled: (j) => avisos.push({ status: j.status, geradas: j.geradas, puladas: j.puladas }),
    });
    await aguardarFim();
    // O aviso sai no `.then` do trabalho de fundo, um tique depois do estado mudar.
    await new Promise((r) => setTimeout(r, 5));

    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({
      status: "CONCLUIDO",
      geradas: 2 * (1 + BAKERY_EXTRA_PHOTOS_PER_ITEM),
    });
  });

  it("aviso do chamador que explode não derruba a geração", async () => {
    await startBakeryImageJob({
      confirmar: true,
      limite: 1,
      onSettled: () => {
        throw new Error("quem escuta quebrou");
      },
    });
    await aguardarFim();
    await new Promise((r) => setTimeout(r, 5));

    expect(getBakeryImageJob()!.status).toBe("CONCLUIDO");
    expect(getBakeryImageJob()!.geradas).toBe(1 + BAKERY_EXTRA_PHOTOS_PER_ITEM);
  });

  it("depois de terminar, um novo disparo é aceito — o trabalho não trava o botão para sempre", async () => {
    await startBakeryImageJob({ confirmar: true, limite: 1 });
    await aguardarFim();
    await expect(startBakeryImageJob({ confirmar: true, limite: 1 })).resolves.toMatchObject({
      status: "RODANDO",
    });
    await aguardarFim();
  });

  it("sem chave, o botão não inicia trabalho nenhum (nada fica 'rodando' à toa)", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(startBakeryImageJob({ confirmar: true })).rejects.toMatchObject({
      code: "SEM_CHAVE_OPENAI",
    });
    expect(getBakeryImageJob()).toBeNull();
  });
});

describe("planBakeryImages — o custo aparece ANTES, e de graça", () => {
  it("sem a padaria criada, o plano diz isso em vez de estourar", async () => {
    const p = await planBakeryImages();
    expect(p.padariaExiste).toBe(false);
    expect(p.aGerar).toBe(0);
    expect(p.custoEstimadoUsd).toBe(0);
  });

  it("estima o custo sem precisar da chave e sem chamar a OpenAI", async () => {
    await seedBakery();
    delete process.env.OPENAI_API_KEY;

    const p = await planBakeryImages();

    const porItem = 1 + BAKERY_EXTRA_PHOTOS_PER_ITEM;
    expect(p.temChaveOpenAi).toBe(false);
    expect(p.fotosExtrasPorItem).toBe(BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(p.aGerar).toBe(p.totalItens * porItem);
    expect(p.capasAGerar).toBe(p.totalItens);
    expect(p.extrasAGerar).toBe(p.totalItens * BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(p.custoEstimadoUsd).toBeCloseTo(p.totalItens * porItem * p.custoPorFotoUsd, 2);
    expect(p.exemploDePrompt).toContain("PRODUTO:");
    expect(p.exemploDePromptExtra).toContain("DE CIMA");
    expect(gerarFoto).not.toHaveBeenCalled();
  });

  it("o `limite` do ensaio é em ITENS — o custo mostrado é o do produto inteiro", async () => {
    await seedBakery();
    const p = await planBakeryImages({ limite: 1 });

    expect(p.itensNestaRodada).toBe(1);
    expect(p.aGerar).toBe(1 + BAKERY_EXTRA_PHOTOS_PER_ITEM);
    expect(p.custoEstimadoUsd).toBeCloseTo((1 + BAKERY_EXTRA_PHOTOS_PER_ITEM) * 0.04, 2);
  });

  it("com a capa pronta mas sem as extras, o ensaio cobra SÓ as extras", async () => {
    await seedBakery();
    for (const item of db.menuItem!) item.imageUrl = "/api/media/x";

    const p = await planBakeryImages();
    expect(p.semFoto).toBe(0);
    expect(p.capasAGerar).toBe(0);
    expect(p.semCarrossel).toBe(p.totalItens);
    expect(p.aGerar).toBe(p.totalItens * BAKERY_EXTRA_PHOTOS_PER_ITEM);
  });

  it("depois de fotografar tudo — capa E extras — o custo do próximo clique é zero", async () => {
    await seedBakery();
    for (const item of db.menuItem!) {
      item.imageUrl = "/api/media/x";
      item.images = ["/api/media/y", "/api/media/z"];
      item.carouselEnabled = true;
    }

    const p = await planBakeryImages();
    expect(p.semFoto).toBe(0);
    expect(p.semCarrossel).toBe(0);
    expect(p.aGerar).toBe(0);
    expect(p.custoEstimadoUsd).toBe(0);
  });
});
