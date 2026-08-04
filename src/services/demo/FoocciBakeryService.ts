/**
 * FoocciBakeryService — a padaria de demonstração, em UM lugar só.
 *
 * Esta é a lógica que provisiona a "Foocci Bakery" (o restaurante de vitrine do
 * site de vendas) e que gera as fotos do cardápio dela. Existem DOIS chamadores e
 * eles compartilham este arquivo, de propósito:
 *
 *   • a linha de comando  → scripts/seed-foocci-bakery.ts · scripts/foocci-bakery-images.ts
 *   • o painel de admin   → /api/admin/demo-bakery/seed · /api/admin/demo-bakery/imagens
 *
 * O ambiente de desenvolvimento não tem OPENAI_API_KEY nem o banco de produção —
 * só a produção tem. Por isso o admin precisa disparar; e por isso a lógica não
 * pode viver dentro do script. Duas cópias divergem, e a que diverge em silêncio
 * é a que gasta dinheiro errado.
 *
 * ─── A lei do domínio aplicada aqui ───────────────────────────────────────────
 * Nenhum estado pode prender trabalho para sempre. Tanto o seed quanto a geração
 * de fotos rodam sob um EMPRÉSTIMO com prazo (`Lease`): quem tenta entrar
 * enquanto o prazo corre é recusado com 409; quem chega depois do prazo vencido
 * RESGATA o empréstimo abandonado e segue. Não existe "em processamento" eterno.
 *
 * ─── O que este serviço NÃO faz ───────────────────────────────────────────────
 *  • Não preenche campo fiscal (NCM/CFOP/CSOSN) nem CNPJ. Nota fiscal não admite
 *    chute, e dado fiscal errado numa vitrine é dado fiscal errado copiado.
 *  • Não gera foto junto com o seed. Foto custa dinheiro e é passo separado, com
 *    confirmação explícita.
 */

import { Decimal } from "@prisma/client/runtime/library";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import {
  generateFoodPhotoFromPrompt,
  isOpenAiImageConfigured,
} from "@/services/imageEnhancement/providers/openai";
import { storeEnhancedImage } from "@/services/imageEnhancement/storage";
import { RestaurantDefaultsService } from "@/services/restaurant/RestaurantDefaultsService";
import {
  BAKERY_HOURS,
  BAKERY_MENU,
  BAKERY_PRINT_STATIONS,
  BAKERY_STORE,
  type BakeryItem,
} from "./foocci-bakery.data";

// ─── Erro com motivo legível ──────────────────────────────────────────────────

/**
 * Códigos de recusa. Cada um vira uma frase que o CEO entende na tela — nunca um
 * "500 Internal Server Error" anônimo. Guardrail 6: o alerta carrega a evidência.
 */
export type BakeryErrorCode =
  | "SEM_BANCO"
  | "BANCO_RECUSOU"
  | "SEM_CHAVE_OPENAI"
  | "PADARIA_NAO_EXISTE"
  | "NAO_E_VITRINE"
  | "SEM_CONFIRMACAO"
  | "JA_EM_ANDAMENTO"
  | "NADA_A_FAZER";

export class BakeryOperationError extends Error {
  readonly code: BakeryErrorCode;
  /** Detalhe técnico para o log. NUNCA volta na resposta da API. */
  readonly evidence?: unknown;

  constructor(code: BakeryErrorCode, message: string, evidence?: unknown) {
    super(message);
    this.name = "BakeryOperationError";
    this.code = code;
    this.evidence = evidence;
  }
}

/** HTTP que cada recusa merece. 409 = "já tem alguém fazendo isso agora". */
export const BAKERY_ERROR_STATUS: Record<BakeryErrorCode, number> = {
  SEM_BANCO: 503,
  BANCO_RECUSOU: 503,
  SEM_CHAVE_OPENAI: 400,
  PADARIA_NAO_EXISTE: 409,
  NAO_E_VITRINE: 409,
  SEM_CONFIRMACAO: 400,
  JA_EM_ANDAMENTO: 409,
  NADA_A_FAZER: 400,
};

// ─── Empréstimo com prazo (a lei do domínio, em 20 linhas) ────────────────────

/**
 * Um trabalho por vez, com prazo. `acquire` só devolve o "recibo" se ninguém
 * estiver dentro do prazo; se o prazo do ocupante venceu, ele é RESGATADO aqui
 * mesmo — é o próprio pretendente quem limpa o abandonado, como o poll da fila
 * de impressão faz com o job vencido.
 *
 * Escopo honesto: isto vale por PROCESSO. É a proteção contra duplo clique e
 * contra dois cliques em abas diferentes do mesmo servidor. A trava que sobrevive
 * a dois processos é outra, e está na própria escrita — ver `imageUrl` abaixo.
 */
export class Lease {
  private holder: { since: number; until: number } | null = null;

  constructor(
    private readonly leaseMs: number,
    private readonly label: string,
  ) {}

  /** Segundos que faltam para o ocupante atual vencer (0 se está livre). */
  remainingMs(now = Date.now()): number {
    if (!this.holder) return 0;
    return Math.max(0, this.holder.until - now);
  }

  isHeld(now = Date.now()): boolean {
    return this.remainingMs(now) > 0;
  }

  /** Toma o empréstimo, ou recusa dizendo quanto falta. */
  acquire(now = Date.now()): void {
    if (this.isHeld(now)) {
      throw new BakeryOperationError(
        "JA_EM_ANDAMENTO",
        `${this.label} já está rodando neste momento (começou há ` +
          `${Math.round((now - this.holder!.since) / 1000)}s). Espere terminar — ` +
          `clicar de novo não acelera e poderia repetir o trabalho.`,
      );
    }
    // Aqui um empréstimo vencido, se existir, está sendo resgatado.
    this.holder = { since: now, until: now + this.leaseMs };
  }

  /** Renova o prazo. Chamado a cada passo longo, para o prazo acompanhar o trabalho vivo. */
  renew(now = Date.now()): void {
    if (this.holder) this.holder.until = now + this.leaseMs;
  }

  release(): void {
    this.holder = null;
  }
}

// ─── 1. SEED ──────────────────────────────────────────────────────────────────

export interface BakerySeedOptions {
  /** Não escreve nada; só conta o que faria. */
  dryRun?: boolean;
  /** Remove do cardápio o que saiu do arquivo de dados. */
  prune?: boolean;
}

export interface BakerySeedResult {
  dryRun: boolean;
  pruned: boolean;
  slug: string;
  restaurantName: string;
  restaurantCreated: boolean;
  ownerEmail: string;
  /** Senha do dono. Só existe quando o dono foi criado AGORA; aparece uma única vez. */
  ownerPasswordOnce: string | null;
  categoriesCreated: number;
  categoriesUpdated: number;
  itemsCreated: number;
  itemsUpdated: number;
  variants: number;
  extras: number;
  optionGroups: number;
  options: number;
  itemsPruned: number;
  categoriesPruned: number;
  /** Quantos itens do cardápio ainda estão sem foto. `null` em ensaio. */
  itemsWithoutImage: number | null;
  routes: BakeryRoutes;
}

export interface BakeryRoutes {
  mesaQr: string;
  lojaSemIa: string;
  garcomIa: string;
}

export function bakeryRoutes(): BakeryRoutes {
  return {
    mesaQr: `/qr/${BAKERY_STORE.slug}`,
    lojaSemIa: `/pedido/${BAKERY_STORE.slug}?modo=loja`,
    garcomIa: `/pedido/${BAKERY_STORE.slug}`,
  };
}

/** 90 segundos por passo. O seed inteiro dura segundos; o prazo é folga, não meta. */
const SEED_LEASE_MS = 90_000;
const seedLease = new Lease(SEED_LEASE_MS, "A criação da padaria");

const dec = (n: number) => new Decimal(n.toFixed(2));

/** Preço base = variante mais barata (vira o "a partir de" na vitrine). */
function basePriceOf(item: BakeryItem): number {
  if (!item.variants?.length) return item.price;
  return Math.min(...item.variants.map((v) => v.price));
}

/**
 * Cria ou atualiza a padaria inteira. Idempotente: rodar duas vezes NÃO duplica
 * restaurante, categoria nem item — tudo é procurado antes de ser criado, e o
 * `imageUrl` nunca é tocado (senão cada re-execução apagaria as fotos pagas).
 */
export async function seedBakery(options: BakerySeedOptions = {}): Promise<BakerySeedResult> {
  const dryRun = options.dryRun === true;
  const prune = options.prune === true;

  if (!process.env.DATABASE_URL) {
    throw new BakeryOperationError(
      "SEM_BANCO",
      "O banco de dados não está configurado neste ambiente (DATABASE_URL vazia). " +
        "Nada foi tocado.",
    );
  }

  seedLease.acquire();

  const tally = {
    categoriesCreated: 0,
    categoriesUpdated: 0,
    itemsCreated: 0,
    itemsUpdated: 0,
    variants: 0,
    extras: 0,
    optionGroups: 0,
    options: 0,
    itemsPruned: 0,
    categoriesPruned: 0,
  };

  try {
    const { id: restaurantId, createdNow } = await upsertRestaurant(dryRun);
    const ownerPasswordOnce = await upsertOwner(restaurantId, dryRun);
    await configureStore(restaurantId, dryRun);
    await seedMenu(restaurantId, dryRun, prune, tally);

    const itemsWithoutImage = dryRun
      ? null
      : await prisma.menuItem.count({
          where: { category: { restaurantId }, OR: [{ imageUrl: null }, { imageUrl: "" }] },
        });

    return {
      dryRun,
      pruned: prune,
      slug: BAKERY_STORE.slug,
      restaurantName: BAKERY_STORE.name,
      restaurantCreated: createdNow,
      ownerEmail: BAKERY_STORE.ownerEmail,
      ownerPasswordOnce,
      ...tally,
      itemsWithoutImage,
      routes: bakeryRoutes(),
    };
  } catch (err) {
    if (err instanceof BakeryOperationError) throw err;
    // O banco recusou. O CEO não precisa da stack — precisa saber que o problema
    // é o banco e que nada ficou pela metade sem aviso. A evidência vai pro log.
    throw new BakeryOperationError(
      "BANCO_RECUSOU",
      "O banco de dados recusou a operação. A padaria pode ter ficado incompleta — " +
        "rode de novo (a operação é idempotente, não duplica nada).",
      err,
    );
  } finally {
    seedLease.release();
  }
}

async function upsertRestaurant(dryRun: boolean): Promise<{ id: string; createdNow: boolean }> {
  const existing = await prisma.restaurant.findUnique({
    where: { slug: BAKERY_STORE.slug },
    select: { id: true, isDemo: true },
  });

  if (existing) {
    if (!dryRun) {
      await prisma.restaurant.update({
        where: { id: existing.id },
        data: {
          name: BAKERY_STORE.name,
          description: BAKERY_STORE.description,
          phone: BAKERY_STORE.phone,
          email: BAKERY_STORE.email,
          address: BAKERY_STORE.address,
          timezone: "America/Sao_Paulo",
          isActive: true,
          // Reafirmado a cada execução: se alguém desmarcar a vitrine no banco,
          // o próximo seed devolve a marca. É o inverso de uma convenção frágil.
          isDemo: true,
          // PRO + override explícito: a degustação precisa do Garçom ligado, e o
          // override vence o plano nos dois sentidos (src/lib/plan-features.ts).
          plan: "PRO",
          aiWaiterEnabled: true,
        },
      });
    }
    return { id: existing.id, createdNow: false };
  }

  if (dryRun) return { id: "dry-run", createdNow: true };

  const created = await prisma.restaurant.create({
    data: {
      name: BAKERY_STORE.name,
      slug: BAKERY_STORE.slug,
      description: BAKERY_STORE.description,
      phone: BAKERY_STORE.phone,
      email: BAKERY_STORE.email,
      address: BAKERY_STORE.address,
      timezone: "America/Sao_Paulo",
      isActive: true,
      isDemo: true,
      plan: "PRO",
      aiWaiterEnabled: true,
    },
    select: { id: true },
  });
  return { id: created.id, createdNow: true };
}

/**
 * O dono da padaria. Senha vem de FOOCCI_BAKERY_OWNER_PASSWORD; sem a variável,
 * é sorteada e devolvida UMA vez. Re-execução NUNCA troca a senha de quem já
 * existe — senão cada clique no botão derrubaria o acesso ao painel da vitrine.
 */
async function upsertOwner(restaurantId: string, dryRun: boolean): Promise<string | null> {
  // O e-mail é único POR RESTAURANTE (email_restaurantId), não global.
  const existing = await prisma.user.findUnique({
    where: { email_restaurantId: { email: BAKERY_STORE.ownerEmail, restaurantId } },
    select: { id: true },
  });

  if (existing) return null; // já existe → senha NÃO é tocada

  const password = process.env.FOOCCI_BAKERY_OWNER_PASSWORD || randomBytes(9).toString("base64url");
  if (dryRun) return password;

  await prisma.user.create({
    data: {
      restaurantId,
      name: BAKERY_STORE.ownerName,
      email: BAKERY_STORE.ownerEmail,
      password: await hash(password, 12),
      role: "OWNER",
    },
  });
  return password;
}

async function configureStore(restaurantId: string, dryRun: boolean): Promise<void> {
  if (dryRun) return;

  // Cria o que falta (brand, whatsapp, delivery, payment, policies, CRM, horários,
  // automações). É idempotente por construção e nunca sobrescreve o que existe.
  await RestaurantDefaultsService.createRestaurantDefaults(restaurantId);

  // ── Horário de padaria (abre cedo, domingo meio período) ──
  for (const h of BAKERY_HOURS) {
    await prisma.businessHours.upsert({
      where: { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: h.dayOfWeek } },
      update: { isOpen: h.isOpen, openTime: h.openTime, closeTime: h.closeTime, periodsJson: undefined },
      create: {
        restaurantId,
        dayOfWeek: h.dayOfWeek,
        isOpen: h.isOpen,
        openTime: h.openTime,
        closeTime: h.closeTime,
      },
    });
  }

  // ── Entrega: modo simples, raio de bairro ──
  const delivery = {
    enabled: true,
    pickupEnabled: true,
    mode: "simple",
    fee: dec(8.9),
    estimatedMinutes: 40,
    areaDescription:
      "Entregamos na Vila Madalena, Pinheiros, Sumaré e Perdizes. Pedidos com pão de fornada " +
      "saem depois das 7h.",
    minOrderValue: dec(25),
    freeDeliveryAbove: dec(120),
  };
  await prisma.deliveryConfig.upsert({
    where: { restaurantId },
    update: delivery,
    create: { restaurantId, ...delivery },
  });

  // ── Pagamento: dinheiro no balcão de padaria ainda existe ──
  await prisma.paymentSettings.upsert({
    where: { restaurantId },
    update: { acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: false },
    create: { restaurantId, acceptPix: true, acceptCash: true, acceptCard: true, acceptLink: false },
  });

  // ── Identidade visual + voz do Garçom ──
  const brand = {
    tone: "warm",
    formality: "informal",
    emojiUsage: "moderate",
    communicationStyle: "conversational",
    upsellStyle: "gentle",
    personalityPreset: "traditional",
    upsellIntensity: "medium",
    salesFocus: "balanced",
    salesPriority: "bestsellers",
    // Marrom-pão. De propósito NÃO é o laranja da Foocci: a loja é white-label e a
    // vitrine tem que parecer marca do lojista, não painel da Foocci.
    brandPrimaryColor: "#8A4B1E",
    brandSecondaryColor: "#4A2511",
    greetingTemplate:
      "Bom dia! Aqui é a Foocci Bakery 🥐 A fornada das {hora} acabou de sair. O que vai ser hoje?",
    waiterPrompt:
      "Você atende no balcão de uma padaria de bairro. Fale como padeiro, não como vendedor: curto, " +
      "caloroso e direto. Quando alguém pedir pão, pergunte se quer quente. Quando pedir café, sugira " +
      "o doce que combina — uma sugestão só, sem insistir. Se o cliente perguntar de alérgeno, responda " +
      "pelo que está escrito na ficha do item; se não estiver escrito, diga que precisa confirmar com a " +
      "cozinha e não invente.",
  };
  await prisma.restaurantBrandConfig.upsert({
    where: { restaurantId },
    update: brand,
    create: { restaurantId, ...brand },
  });

  // ── Ficha da loja ──
  const profile = {
    tradeName: BAKERY_STORE.name,
    legalName: "Foocci Bakery — loja de demonstração",
    cuisineType: "Padaria e confeitaria artesanal",
    // CNPJ e inscrições ficam VAZIOS: documento fiscal não se inventa.
    street: "Rua da Fornada",
    streetNumber: "100",
    neighborhood: "Vila Madalena",
    city: "São Paulo",
    state: "SP",
    cep: "05435-000",
    country: "Brasil",
    mainPhone: BAKERY_STORE.phone,
    whatsappPhone: BAKERY_STORE.phone,
    mainEmail: BAKERY_STORE.email,
    ownerName: BAKERY_STORE.ownerName,
    ownerRole: "Proprietária",
    deliveryEnabled: true,
    pickupEnabled: true,
    dineInEnabled: true,
    averagePreparationMinutes: 25,
    niche: "padaria de bairro com confeitaria própria",
    targetPersona:
      "Vizinhança a pé: quem passa antes do trabalho pelo pão e pelo café, e quem volta no fim de semana " +
      "com a família para o café da manhã sentado.",
    differentiator: "Fornada de hora em hora e fermentação natural própria — o pão nunca é de ontem.",
    averageTicketRange: "R$ 18 a R$ 45",
    brandTone: "caloroso, simples, de bairro",
    leadSource: "DEMONSTRAÇÃO INTERNA",
    internalNotes:
      "RESTAURANTE FICTÍCIO. Vitrine da aba de degustação do site de vendas (Frente 3 do lançamento). " +
      "Marcado com Restaurant.isDemo = true. Não é cliente: não entra em cobrança, relatório comercial " +
      "nem métrica de base. Semeado por src/services/demo/FoocciBakeryService.ts.",
  };
  await prisma.storeProfile.upsert({
    where: { restaurantId },
    update: profile,
    create: { restaurantId, ...profile },
  });

  // ── Estações de impressão (sem impressora atribuída: a vitrine não tem papel) ──
  for (const st of BAKERY_PRINT_STATIONS) {
    await prisma.printStation.upsert({
      where: { restaurantId_key: { restaurantId, key: st.key } },
      update: { name: st.name, position: st.position, enabled: true },
      create: { restaurantId, key: st.key, name: st.name, position: st.position, enabled: true },
    });
  }

  // ── Precificação: números FICTÍCIOS, só para a página de CMV ter o que mostrar.
  // SUGGEST (padrão) nunca aplica preço sozinho — só propõe.
  await prisma.restaurantPricingConfig.upsert({
    where: { restaurantId },
    update: {},
    create: {
      restaurantId,
      monthlyRevenue: dec(180000),
      fixedExpensesMonthly: dec(54000),
      taxesFeesPct: dec(8.5),
      targetProfitPct: dec(12),
      autoRepriceMode: "SUGGEST",
      rounding: "ENDING_90",
    },
  });
}

/** Só os contadores do seed — o mesmo objeto atravessa as funções de cardápio. */
type Tally = Pick<
  BakerySeedResult,
  | "categoriesCreated"
  | "categoriesUpdated"
  | "itemsCreated"
  | "itemsUpdated"
  | "variants"
  | "extras"
  | "optionGroups"
  | "options"
  | "itemsPruned"
  | "categoriesPruned"
>;

async function seedMenu(
  restaurantId: string,
  dryRun: boolean,
  prune: boolean,
  tally: Tally,
): Promise<void> {
  const keptCategoryIds: string[] = [];

  for (let ci = 0; ci < BAKERY_MENU.length; ci++) {
    const cat = BAKERY_MENU[ci]!;

    const catData = {
      name: cat.name,
      description: cat.description,
      sortOrder: ci,
      isActive: true,
      isAvailable: true,
      showInDelivery: true,
      showInDineIn: true,
      markupOverride: cat.markupOverride != null ? new Decimal(cat.markupOverride) : null,
      printStationKeys: cat.printStationKeys ?? [],
      source: "MANUAL" as const,
    };

    let categoryId = "dry-run";
    if (!dryRun) {
      // MenuCategory não tem unique em (restaurantId, name) — findFirst é o
      // caminho idempotente possível, o mesmo já usado pelo import do Sushi Cazza.
      const found = await prisma.menuCategory.findFirst({
        where: { restaurantId, name: cat.name },
        select: { id: true },
      });
      if (found) {
        await prisma.menuCategory.update({ where: { id: found.id }, data: catData });
        categoryId = found.id;
        tally.categoriesUpdated++;
      } else {
        const c = await prisma.menuCategory.create({
          data: { restaurantId, ...catData },
          select: { id: true },
        });
        categoryId = c.id;
        tally.categoriesCreated++;
      }
      keptCategoryIds.push(categoryId);
    } else {
      tally.categoriesCreated++;
    }

    const keptItemIds: string[] = [];

    for (let ii = 0; ii < cat.items.length; ii++) {
      const item = cat.items[ii]!;
      const hasVariants = (item.variants?.length ?? 0) > 0;

      const itemData = {
        name: item.name,
        description: item.description,
        ingredients: item.ingredients ?? null,
        price: dec(basePriceOf(item)),
        cost: item.cost != null ? dec(item.cost) : null,
        portionInfo: item.portionInfo ?? null,
        servingSize: item.servingSize ?? null,
        tagFunil: item.tagFunil ?? null,
        perfilPaladar: item.perfilPaladar ?? null,
        alergenosDetalhados: item.alergenosDetalhados ?? null,
        storytellingIA: item.storytellingIA ?? null,
        harmonizacaoSugerida: item.harmonizacaoSugerida ?? null,
        sortOrder: ii,
        isActive: true,
        isAvailable: true,
        showInDelivery: item.showInDelivery ?? true,
        showInDineIn: item.showInDineIn ?? true,
        hasVariants,
        // imageUrl NÃO é tocado aqui: quem escreve foto é a geração de imagens, e
        // um seed que zera a capa apagaria as fotos pagas a cada re-execução.
      };

      if (dryRun) {
        tally.itemsCreated++;
        tally.variants += item.variants?.length ?? 0;
        tally.extras += item.extras?.length ?? 0;
        tally.optionGroups += item.optionGroups?.length ?? 0;
        tally.options += (item.optionGroups ?? []).reduce((s, g) => s + g.options.length, 0);
        continue;
      }

      const foundItem = await prisma.menuItem.findFirst({
        where: { categoryId, name: item.name },
        select: { id: true },
      });

      let itemId: string;
      if (foundItem) {
        await prisma.menuItem.update({ where: { id: foundItem.id }, data: itemData });
        itemId = foundItem.id;
        tally.itemsUpdated++;
      } else {
        const created = await prisma.menuItem.create({
          data: { categoryId, ...itemData },
          select: { id: true },
        });
        itemId = created.id;
        tally.itemsCreated++;
      }
      keptItemIds.push(itemId);

      await seedVariants(itemId, item, tally);
      await seedExtras(itemId, item, tally);
      await seedOptionGroups(itemId, item, tally);
    }

    if (prune && !dryRun) {
      const stale = await prisma.menuItem.findMany({
        where: { categoryId, id: { notIn: keptItemIds.length ? keptItemIds : ["__none__"] } },
        select: { id: true },
      });
      if (stale.length) {
        await prisma.menuItem.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
        tally.itemsPruned += stale.length;
      }
    }
  }

  if (prune && !dryRun) {
    const staleCats = await prisma.menuCategory.findMany({
      where: { restaurantId, id: { notIn: keptCategoryIds.length ? keptCategoryIds : ["__none__"] } },
      select: { id: true },
    });
    if (staleCats.length) {
      await prisma.menuCategory.deleteMany({ where: { id: { in: staleCats.map((c) => c.id) } } });
      tally.categoriesPruned += staleCats.length;
    }
  }
}

async function seedVariants(itemId: string, item: BakeryItem, tally: Tally): Promise<void> {
  const variants = item.variants ?? [];
  for (let vi = 0; vi < variants.length; vi++) {
    const v = variants[vi]!;
    const data = { name: v.name, price: dec(v.price), portion: v.portion ?? null, isAvailable: true, sortOrder: vi };
    const found = await prisma.menuItemVariant.findFirst({
      where: { menuItemId: itemId, name: v.name },
      select: { id: true },
    });
    if (found) await prisma.menuItemVariant.update({ where: { id: found.id }, data });
    else await prisma.menuItemVariant.create({ data: { menuItemId: itemId, ...data } });
    tally.variants++;
  }
  // Variante que saiu do arquivo some do banco — senão o cliente escolhe um
  // tamanho que a padaria não vende mais.
  await prisma.menuItemVariant.deleteMany({
    where: { menuItemId: itemId, name: { notIn: variants.map((v) => v.name) } },
  });
}

async function seedExtras(itemId: string, item: BakeryItem, tally: Tally): Promise<void> {
  const extras = item.extras ?? [];
  for (const e of extras) {
    const data = { name: e.name, price: dec(e.price), portion: e.portion ?? null, isAvailable: true, quantity: 1 };
    const found = await prisma.menuItemExtra.findFirst({
      where: { menuItemId: itemId, name: e.name },
      select: { id: true },
    });
    if (found) await prisma.menuItemExtra.update({ where: { id: found.id }, data });
    else await prisma.menuItemExtra.create({ data: { menuItemId: itemId, ...data } });
    tally.extras++;
  }
  await prisma.menuItemExtra.deleteMany({
    where: { menuItemId: itemId, name: { notIn: extras.map((e) => e.name) } },
  });
}

async function seedOptionGroups(itemId: string, item: BakeryItem, tally: Tally): Promise<void> {
  const groups = item.optionGroups ?? [];
  for (let gi = 0; gi < groups.length; gi++) {
    const g = groups[gi]!;
    const groupData = {
      name: g.name,
      required: g.required ?? false,
      minSelect: g.minSelect ?? 0,
      maxSelect: g.maxSelect ?? 1,
      sortOrder: gi,
    };
    const foundGroup = await prisma.optionGroup.findFirst({
      where: { menuItemId: itemId, name: g.name },
      select: { id: true },
    });
    let groupId: string;
    if (foundGroup) {
      await prisma.optionGroup.update({ where: { id: foundGroup.id }, data: groupData });
      groupId = foundGroup.id;
    } else {
      const created = await prisma.optionGroup.create({
        data: { menuItemId: itemId, ...groupData },
        select: { id: true },
      });
      groupId = created.id;
    }
    tally.optionGroups++;

    for (let oi = 0; oi < g.options.length; oi++) {
      const o = g.options[oi]!;
      const optData = { name: o.name, price: dec(o.price ?? 0), isAvailable: true, sortOrder: oi };
      const foundOpt = await prisma.optionGroupItem.findFirst({
        where: { groupId, name: o.name },
        select: { id: true },
      });
      if (foundOpt) await prisma.optionGroupItem.update({ where: { id: foundOpt.id }, data: optData });
      else await prisma.optionGroupItem.create({ data: { groupId, ...optData } });
      tally.options++;
    }

    await prisma.optionGroupItem.deleteMany({
      where: { groupId, name: { notIn: g.options.map((o) => o.name) } },
    });
  }

  await prisma.optionGroup.deleteMany({
    where: { menuItemId: itemId, name: { notIn: groups.map((g) => g.name) } },
  });
}

// ─── 2. FOTOS (dinheiro real) ─────────────────────────────────────────────────

/** Só para EXIBIR na tela. Quem escolhe o modelo de fato é o provedor de imagem. */
export const BAKERY_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
/** Estimativa grosseira, só para quem autoriza saber a ordem de grandeza ANTES. */
export const APPROX_USD_PER_IMAGE = 0.04;

/**
 * Sem chave, nada de foto. A regra é a MESMA do provedor que gasta — importada,
 * não recopiada: um "pode" aqui que vira "não pode" lá é o botão mentindo.
 */
export function hasOpenAiKey(): boolean {
  return isOpenAiImageConfigured();
}

/**
 * O molde da foto. É o mesmo enquadramento para todos os itens porque cardápio
 * bonito é cardápio CONSISTENTE — 40 fotos com luz e ângulo diferentes ficam
 * piores do que 40 fotos iguais e medianas.
 */
export function buildBakeryImagePrompt(
  name: string,
  description: string,
  ingredients: string | null,
): string {
  const linhaIngredientes = ingredients ? [`INGREDIENTES VISÍVEIS: ${ingredients}`] : [];
  return [
    `Fotografia profissional de comida para cardápio digital de uma padaria artesanal brasileira.`,
    ``,
    `PRODUTO: ${name}`,
    `DESCRIÇÃO: ${description}`,
    ...linhaIngredientes,
    ``,
    `ENQUADRAMENTO: um único produto, centralizado, ocupando cerca de 80% do quadro.`,
    `Ângulo de 45 graus. Fundo de mármore claro levemente desfocado, com uma tábua de`,
    `madeira clara ou prato de cerâmica branca. Luz natural lateral, suave e quente,`,
    `como de manhã perto de uma janela. Sombras macias.`,
    ``,
    `ESTILO: realista, apetitoso e honesto — o produto como ele realmente é servido,`,
    `sem exagero de porção. Cores naturais. Textura visível (casca, farelo, creme).`,
    ``,
    `PROIBIDO: texto, letras, números, logotipos, marca d'água, mãos, pessoas,`,
    `talheres em uso, colagem, moldura, mais de um produto no quadro.`,
  ].join("\n");
}

export interface BakeryImagePlan {
  /** A padaria já foi criada? Sem ela não há o que fotografar. */
  padariaExiste: boolean;
  /** A padaria está marcada como vitrine (isDemo)? Trava de propaganda enganosa. */
  eVitrine: boolean;
  totalItens: number;
  comFoto: number;
  semFoto: number;
  /** Quantos seriam gerados agora (respeita "regerar"). */
  aGerar: number;
  modelo: string;
  custoPorFotoUsd: number;
  custoEstimadoUsd: number;
  temChaveOpenAi: boolean;
  /** Exemplo do texto que iria para o modelo — dá para conferir antes de gastar. */
  exemploDePrompt: string | null;
}

/**
 * Ensaio: conta, estima o custo e mostra o prompt. NÃO gasta e NÃO exige chave —
 * quem vai autorizar o gasto tem o direito de ver antes o que será pedido.
 */
export async function planBakeryImages(
  options: { regerar?: boolean } = {},
): Promise<BakeryImagePlan> {
  const regerar = options.regerar === true;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: BAKERY_STORE.slug },
    select: { id: true, isDemo: true },
  });

  if (!restaurant) {
    return {
      padariaExiste: false,
      eVitrine: false,
      totalItens: 0,
      comFoto: 0,
      semFoto: 0,
      aGerar: 0,
      modelo: BAKERY_IMAGE_MODEL,
      custoPorFotoUsd: APPROX_USD_PER_IMAGE,
      custoEstimadoUsd: 0,
      temChaveOpenAi: hasOpenAiKey(),
      exemploDePrompt: null,
    };
  }

  const totalItens = await prisma.menuItem.count({ where: { category: { restaurantId: restaurant.id } } });
  const semFoto = await prisma.menuItem.count({
    where: { category: { restaurantId: restaurant.id }, OR: [{ imageUrl: null }, { imageUrl: "" }] },
  });
  const aGerar = regerar ? totalItens : semFoto;

  const amostra = await prisma.menuItem.findFirst({
    where: {
      category: { restaurantId: restaurant.id },
      ...(regerar ? {} : { OR: [{ imageUrl: null }, { imageUrl: "" }] }),
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { name: true, description: true, ingredients: true },
  });

  return {
    padariaExiste: true,
    eVitrine: restaurant.isDemo,
    totalItens,
    comFoto: totalItens - semFoto,
    semFoto,
    aGerar,
    modelo: BAKERY_IMAGE_MODEL,
    custoPorFotoUsd: APPROX_USD_PER_IMAGE,
    custoEstimadoUsd: Number((aGerar * APPROX_USD_PER_IMAGE).toFixed(2)),
    temChaveOpenAi: hasOpenAiKey(),
    exemploDePrompt: amostra
      ? buildBakeryImagePrompt(amostra.name, amostra.description ?? "", amostra.ingredients)
      : null,
  };
}

export interface BakeryImageFailure {
  item: string;
  motivo: string;
}

export interface BakeryImageRunResult {
  geradas: number;
  /** Itens que já tinham foto quando chegou a vez deles — dinheiro NÃO gasto. */
  puladas: number;
  falhas: BakeryImageFailure[];
  custoRealEstimadoUsd: number;
}

export interface BakeryImageRunOptions {
  /** Sem isto, nada é gerado. Dinheiro real não roda por acidente. */
  confirmar: boolean;
  /** Refaz também quem JÁ tem foto. Ato consciente e separado. */
  regerar?: boolean;
  /** Teto de fotos nesta execução (para provar o fluxo com 1 antes de soltar 40). */
  limite?: number;
  onProgress?: (p: { indice: number; total: number; item: string }) => void;
}

const IMAGE_LEASE_MS = 180_000; // 3 min por foto — gpt-image-1 é lento, mas não eterno
const imageLease = new Lease(IMAGE_LEASE_MS, "A geração das fotos");

/**
 * Gera as fotos que faltam. Percorre item a item; falha de UMA foto não derruba
 * as outras — o item continua sem foto (a loja já tem estado vazio para isso) e
 * o motivo volta no resultado.
 *
 * DUAS travas contra gastar duas vezes:
 *   1. o empréstimo com prazo (`imageLease`) — duplo clique não entra;
 *   2. a re-leitura do `imageUrl` IMEDIATAMENTE antes de cada chamada paga. Esta
 *      é a que sobrevive a dois processos (admin + linha de comando ao mesmo
 *      tempo): se a foto apareceu no meio do caminho, pula sem gastar.
 */
export async function generateBakeryImages(
  options: BakeryImageRunOptions,
): Promise<BakeryImageRunResult> {
  if (!options.confirmar) {
    throw new BakeryOperationError(
      "SEM_CONFIRMACAO",
      "A geração de fotos custa dinheiro de verdade e exige confirmação explícita. " +
        "Nada foi gerado.",
    );
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: BAKERY_STORE.slug },
    select: { id: true, name: true, isDemo: true },
  });

  if (!restaurant) {
    throw new BakeryOperationError(
      "PADARIA_NAO_EXISTE",
      'A padaria ainda não existe no banco. Clique antes em "Criar/atualizar a padaria".',
    );
  }

  // Trava: foto de IA só em vitrine. Num cardápio de cliente real seria propaganda
  // enganosa — ele venderia a foto de um prato que nunca fez.
  if (!restaurant.isDemo) {
    throw new BakeryOperationError(
      "NAO_E_VITRINE",
      `"${restaurant.name}" não está marcado como restaurante de demonstração. ` +
        "Foto gerada por IA só entra em vitrine, nunca no cardápio de um cliente de verdade.",
    );
  }

  if (!hasOpenAiKey()) {
    throw new BakeryOperationError(
      "SEM_CHAVE_OPENAI",
      "Faltou a chave da OpenAI (OPENAI_API_KEY) neste ambiente. Nenhuma foto foi " +
        "gerada e nenhum campo foi alterado. Configure a variável no Railway e tente de novo.",
    );
  }

  const regerar = options.regerar === true;

  const candidatos = await prisma.menuItem.findMany({
    where: {
      category: { restaurantId: restaurant.id },
      ...(regerar ? {} : { OR: [{ imageUrl: null }, { imageUrl: "" }] }),
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, name: true, description: true, ingredients: true },
  });

  const limite = options.limite && options.limite > 0 ? options.limite : candidatos.length;
  const alvo = candidatos.slice(0, limite);

  if (alvo.length === 0) {
    throw new BakeryOperationError(
      "NADA_A_FAZER",
      regerar
        ? "Não há item nenhum no cardápio da padaria para fotografar."
        : "Todos os itens do cardápio já têm foto. Nada a gerar — e nada a gastar. " +
            'Se quiser fotos novas, use "Regerar todas as fotos".',
    );
  }

  imageLease.acquire();

  const result: BakeryImageRunResult = { geradas: 0, puladas: 0, falhas: [], custoRealEstimadoUsd: 0 };

  try {
    for (let i = 0; i < alvo.length; i++) {
      const item = alvo[i]!;
      imageLease.renew();
      options.onProgress?.({ indice: i + 1, total: alvo.length, item: item.name });

      try {
        // Re-leitura imediatamente antes de gastar. Ver comentário do cabeçalho.
        if (!regerar) {
          const atual = await prisma.menuItem.findUnique({
            where: { id: item.id },
            select: { imageUrl: true },
          });
          if (atual?.imageUrl) {
            result.puladas++;
            continue;
          }
        }

        // A conversa com a OpenAI acontece no provedor de imagem — o único lugar
        // do `src/` autorizado a isso (Regra de Ouro do Brain).
        const foto = await generateFoodPhotoFromPrompt(
          buildBakeryImagePrompt(item.name, item.description ?? "", item.ingredients),
        );
        if (!foto.success) throw new Error(foto.error);

        const url = await storeEnhancedImage(foto.buffer, foto.mimeType, restaurant.id, item.id);
        await prisma.menuItem.update({ where: { id: item.id }, data: { imageUrl: url } });

        result.geradas++;
        result.custoRealEstimadoUsd = Number((result.geradas * APPROX_USD_PER_IMAGE).toFixed(2));
      } catch (err) {
        const motivo = err instanceof Error ? err.message : String(err);
        // Guardrail 6: a falha carrega o caso concreto, não só "deu erro".
        console.error("[FoocciBakery] foto falhou", { item: item.name, motivo });
        result.falhas.push({ item: item.name, motivo });
      }
    }

    return result;
  } finally {
    imageLease.release();
  }
}

// ─── 3. O trabalho em curso, visto de fora (o painel precisa disso) ───────────

export type BakeryJobStatus = "RODANDO" | "CONCLUIDO" | "FALHOU" | "ABANDONADO";

export interface BakeryImageJob {
  id: string;
  status: BakeryJobStatus;
  regerar: boolean;
  iniciadoEm: number;
  /** Prazo do empréstimo. Passou disto sem terminar → abandonado (processo caiu). */
  venceEm: number;
  terminadoEm: number | null;
  total: number;
  /** Itens já percorridos (gerados + pulados + falhos). É a barra de progresso. */
  processadas: number;
  geradas: number;
  puladas: number;
  itemAtual: string | null;
  falhas: BakeryImageFailure[];
  /** Motivo da parada geral (chave faltando, banco fora). `null` quando correu bem. */
  erroFatal: string | null;
  custoEstimadoUsd: number;
}

/**
 * O trabalho vive no processo, não no banco — é uma vitrine, não um pedido de
 * cliente. O que NÃO se admite é ele ficar preso: por isso tem prazo, e quem lê
 * o estado depois do prazo é quem declara o abandono (`reapIfExpired`).
 */
let currentImageJob: BakeryImageJob | null = null;

function reapIfExpired(now = Date.now()): void {
  if (!currentImageJob || currentImageJob.status !== "RODANDO") return;
  if (now <= currentImageJob.venceEm) return;
  currentImageJob = {
    ...currentImageJob,
    status: "ABANDONADO",
    terminadoEm: now,
    itemAtual: null,
    erroFatal:
      "A geração parou no meio sem terminar (o servidor pode ter reiniciado). " +
      "As fotos que já ficaram prontas foram salvas — rodar de novo só cuida do que faltou.",
  };
}

/** Estado atual do trabalho de fotos, já com o vencido resgatado. */
export function getBakeryImageJob(): BakeryImageJob | null {
  reapIfExpired();
  return currentImageJob;
}

/** Só para teste: devolve o serviço ao estado de repouso. */
export function __resetBakeryImageJob(): void {
  currentImageJob = null;
  imageLease.release();
  seedLease.release();
}

/**
 * Dispara a geração EM SEGUNDO PLANO e devolve o trabalho recém-criado para a
 * tela poder acompanhar. As validações caras de recusar (sem confirmação, sem
 * chave, padaria inexistente, nada a fazer) acontecem ANTES de responder — o
 * botão não pode dizer "comecei" e falhar calado depois.
 */
export async function startBakeryImageJob(
  options: {
    confirmar: boolean;
    regerar?: boolean;
    limite?: number;
    /**
     * Avisado UMA vez quando o trabalho para de rodar — terminando bem ou mal.
     * Existe para quem dispara sem ninguém olhando a tela (o seed automático de
     * deploy): sem isto, o número de fotos geradas só viveria no painel do admin.
     * O que estiver aqui dentro nunca derruba a geração.
     */
    onSettled?: (job: BakeryImageJob) => void;
  },
): Promise<BakeryImageJob> {
  reapIfExpired();
  if (currentImageJob?.status === "RODANDO") {
    throw new BakeryOperationError(
      "JA_EM_ANDAMENTO",
      `As fotos já estão sendo geradas agora (${currentImageJob.geradas} de ` +
        `${currentImageJob.total} prontas). Espere terminar — clicar de novo não ` +
        "acelera e poderia gastar duas vezes.",
    );
  }

  if (!options.confirmar) {
    throw new BakeryOperationError(
      "SEM_CONFIRMACAO",
      "A geração de fotos custa dinheiro de verdade e exige confirmação explícita. " +
        "Nada foi gerado.",
    );
  }

  const plano = await planBakeryImages({ regerar: options.regerar });

  if (!plano.padariaExiste) {
    throw new BakeryOperationError(
      "PADARIA_NAO_EXISTE",
      'A padaria ainda não existe no banco. Clique antes em "Criar/atualizar a padaria".',
    );
  }
  if (!plano.eVitrine) {
    throw new BakeryOperationError(
      "NAO_E_VITRINE",
      "A padaria não está marcada como restaurante de demonstração. Foto gerada por IA " +
        "só entra em vitrine — rode a criação da padaria de novo para reafirmar a marca.",
    );
  }
  if (!plano.temChaveOpenAi) {
    throw new BakeryOperationError(
      "SEM_CHAVE_OPENAI",
      "Faltou a chave da OpenAI (OPENAI_API_KEY) neste ambiente. Nenhuma foto foi " +
        "gerada e nenhum campo foi alterado. Configure a variável no Railway e tente de novo.",
    );
  }

  const total = Math.min(plano.aGerar, options.limite && options.limite > 0 ? options.limite : plano.aGerar);
  if (total === 0) {
    throw new BakeryOperationError(
      "NADA_A_FAZER",
      "Todos os itens do cardápio já têm foto. Nada a gerar — e nada a gastar. " +
        'Se quiser fotos novas, use "Regerar todas as fotos".',
    );
  }

  const agora = Date.now();
  currentImageJob = {
    id: randomBytes(8).toString("hex"),
    status: "RODANDO",
    regerar: options.regerar === true,
    iniciadoEm: agora,
    venceEm: agora + IMAGE_LEASE_MS,
    terminadoEm: null,
    total,
    processadas: 0,
    geradas: 0,
    puladas: 0,
    itemAtual: null,
    falhas: [],
    erroFatal: null,
    custoEstimadoUsd: Number((total * APPROX_USD_PER_IMAGE).toFixed(2)),
  };
  const jobId = currentImageJob.id;

  const patch = (fn: (j: BakeryImageJob) => BakeryImageJob) => {
    // Só o trabalho VIGENTE se atualiza: um trabalho já abandonado e substituído
    // não pode voltar a escrever no estado de quem veio depois.
    if (currentImageJob && currentImageJob.id === jobId) currentImageJob = fn(currentImageJob);
  };

  /** O aviso de encerramento é do CHAMADOR: se ele explodir, o problema é dele. */
  const settled = (j: BakeryImageJob) => {
    try {
      options.onSettled?.(j);
    } catch (e) {
      console.error("[FoocciBakery] onSettled do chamador falhou", e);
    }
  };

  void generateBakeryImages({
    confirmar: true,
    regerar: options.regerar,
    limite: options.limite,
    // O progresso RENOVA o prazo: enquanto há foto saindo, o trabalho está vivo.
    // Parou de renovar por mais de IMAGE_LEASE_MS → é abandono, e `reapIfExpired`
    // o declara em vez de deixar a tela girando para sempre.
    onProgress: ({ indice, total: totalReal, item }) =>
      patch((j) => ({
        ...j,
        itemAtual: item,
        processadas: indice - 1,
        total: totalReal,
        venceEm: Date.now() + IMAGE_LEASE_MS,
      })),
  })
    .then((r) => {
      patch((j) => ({
        ...j,
        status: "CONCLUIDO",
        terminadoEm: Date.now(),
        itemAtual: null,
        processadas: j.total,
        geradas: r.geradas,
        puladas: r.puladas,
        falhas: r.falhas,
        custoEstimadoUsd: r.custoRealEstimadoUsd,
      }));
      if (currentImageJob?.id === jobId) settled(currentImageJob);
    })
    .catch((err: unknown) => {
      const motivo =
        err instanceof BakeryOperationError
          ? err.message
          : "A geração parou por um erro inesperado do servidor. Nada além das fotos já " +
            "salvas foi alterado.";
      console.error("[FoocciBakery] geração de fotos falhou", err);
      patch((j) => ({ ...j, status: "FALHOU", terminadoEm: Date.now(), itemAtual: null, erroFatal: motivo }));
      if (currentImageJob?.id === jobId) settled(currentImageJob);
    });

  return currentImageJob;
}

/** Retrato do estado da padaria para a tela do admin abrir já sabendo o que dizer. */
export interface BakeryOverview {
  padariaExiste: boolean;
  eVitrine: boolean;
  restaurantName: string;
  totalItens: number;
  totalCategorias: number;
  comFoto: number;
  semFoto: number;
  routes: BakeryRoutes;
  temChaveOpenAi: boolean;
}

export async function getBakeryOverview(): Promise<BakeryOverview> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: BAKERY_STORE.slug },
    select: { id: true, name: true, isDemo: true },
  });

  if (!restaurant) {
    return {
      padariaExiste: false,
      eVitrine: false,
      restaurantName: BAKERY_STORE.name,
      totalItens: 0,
      totalCategorias: 0,
      comFoto: 0,
      semFoto: 0,
      routes: bakeryRoutes(),
      temChaveOpenAi: hasOpenAiKey(),
    };
  }

  const [totalItens, semFoto, totalCategorias] = await Promise.all([
    prisma.menuItem.count({ where: { category: { restaurantId: restaurant.id } } }),
    prisma.menuItem.count({
      where: { category: { restaurantId: restaurant.id }, OR: [{ imageUrl: null }, { imageUrl: "" }] },
    }),
    prisma.menuCategory.count({ where: { restaurantId: restaurant.id } }),
  ]);

  return {
    padariaExiste: true,
    eVitrine: restaurant.isDemo,
    restaurantName: restaurant.name,
    totalItens,
    totalCategorias,
    comFoto: totalItens - semFoto,
    semFoto,
    routes: bakeryRoutes(),
    temChaveOpenAi: hasOpenAiKey(),
  };
}
