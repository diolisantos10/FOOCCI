/**
 * seed-foocci-bakery — provisiona a padaria de DEMONSTRAÇÃO "Foocci Bakery".
 *
 * A padaria é um restaurante NORMAL e completo dentro do sistema (cardápio,
 * horário, entrega, pagamento, comanda) para que o visitante do site de vendas
 * degustre as três superfícies antes de comprar:
 *
 *   mesa (QR)  →  /qr/foocci-bakery
 *   loja sem IA →  /pedido/foocci-bakery?modo=loja
 *   Garçom IA  →  /pedido/foocci-bakery
 *
 * Ela nasce com `Restaurant.isDemo = true`. Essa coluna é a trava que impede a
 * vitrine de virar cliente em cobrança e em relatório (src/lib/demo-restaurant.ts).
 *
 * ─── Uso ──────────────────────────────────────────────────────────────────────
 *   npm run bakery:seed                  # cria/atualiza (idempotente)
 *   npm run bakery:seed -- --dry-run     # não escreve nada; só conta
 *   npm run bakery:seed -- --prune       # remove do cardápio o que saiu do arquivo
 *
 * Senha do dono: lida de FOOCCI_BAKERY_OWNER_PASSWORD. Sem a variável, o script
 * sorteia uma senha e a imprime UMA vez. Nunca há senha conhecida embutida no
 * repositório — a padaria é vitrine, mas o painel dela é um painel de verdade.
 * Re-execução NUNCA troca a senha de um dono que já existe.
 *
 * ─── O que este script NÃO faz ────────────────────────────────────────────────
 *  • Não preenche campo fiscal (NCM/CFOP/CSOSN) nem CNPJ. Nota fiscal não admite
 *    chute, e dado fiscal errado numa vitrine é dado fiscal errado copiado.
 *  • Não gera imagens. As fotos entram por `scripts/foocci-bakery-images.ts`,
 *    que é um passo separado e explícito porque custa dinheiro por chamada.
 *  • Não roda contra produção sozinho: usa o DATABASE_URL do ambiente. Confira
 *    para onde ele aponta ANTES de rodar.
 */

import { PrismaClient } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { hash } from "bcryptjs";
import { randomBytes } from "crypto";
import { RestaurantDefaultsService } from "../src/services/restaurant/RestaurantDefaultsService";
import {
  BAKERY_HOURS,
  BAKERY_MENU,
  BAKERY_PRINT_STATIONS,
  BAKERY_STORE,
  type BakeryItem,
} from "./foocci-bakery.data";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const prune = args.includes("--prune");

const dec = (n: number) => new Decimal(n.toFixed(2));

interface Tally {
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
}

const tally: Tally = {
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

// ─── 1. O restaurante ──────────────────────────────────────────────────────────

async function upsertRestaurant(): Promise<{ id: string; createdNow: boolean }> {
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

// ─── 2. O dono ─────────────────────────────────────────────────────────────────

async function upsertOwner(restaurantId: string): Promise<string | null> {
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

// ─── 3. Configuração da loja ───────────────────────────────────────────────────

async function configureStore(restaurantId: string): Promise<void> {
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
      "nem métrica de base. Semeado por scripts/seed-foocci-bakery.ts.",
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

// ─── 4. O cardápio ─────────────────────────────────────────────────────────────

/** Preço base = variante mais barata (vira o "a partir de" na vitrine). */
function basePriceOf(item: BakeryItem): number {
  if (!item.variants?.length) return item.price;
  return Math.min(...item.variants.map((v) => v.price));
}

async function seedMenu(restaurantId: string): Promise<void> {
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
        // imageUrl NÃO é tocado aqui: quem escreve foto é o script de imagens, e
        // um seed que zera a capa apagaria as fotos a cada re-execução.
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

      await seedVariants(itemId, item);
      await seedExtras(itemId, item);
      await seedOptionGroups(itemId, item);
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

async function seedVariants(itemId: string, item: BakeryItem): Promise<void> {
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

async function seedExtras(itemId: string, item: BakeryItem): Promise<void> {
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

async function seedOptionGroups(itemId: string, item: BakeryItem): Promise<void> {
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

// ─── Execução ──────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const dbHost = (process.env.DATABASE_URL ?? "").replace(/\/\/[^@]*@/, "//***@");
  console.log("\n🥐  Foocci Bakery — seed da padaria de demonstração");
  console.log(`    banco   : ${dbHost || "(DATABASE_URL não definida)"}`);
  console.log(`    dry-run : ${dryRun}`);
  console.log(`    prune   : ${prune}\n`);

  if (!process.env.DATABASE_URL) {
    console.error("✗ DATABASE_URL não definida. Abortando antes de tocar em qualquer banco.");
    process.exit(1);
  }

  const { id: restaurantId, createdNow } = await upsertRestaurant();
  console.log(`  ${createdNow ? "criado" : "atualizado"}: ${BAKERY_STORE.name} (${BAKERY_STORE.slug})`);

  const newPassword = await upsertOwner(restaurantId);
  if (newPassword) {
    console.log(`  dono criado: ${BAKERY_STORE.ownerEmail}`);
    console.log(`  SENHA (aparece uma única vez): ${newPassword}`);
  } else {
    console.log(`  dono já existia: ${BAKERY_STORE.ownerEmail} (senha intocada)`);
  }

  await configureStore(restaurantId);
  console.log("  loja configurada: horário, entrega, pagamento, marca, ficha, estações, precificação");

  await seedMenu(restaurantId);

  const itemsWithoutImage = dryRun
    ? null
    : await prisma.menuItem.count({
        where: { category: { restaurantId }, OR: [{ imageUrl: null }, { imageUrl: "" }] },
      });

  console.log("\n━━━ Resumo ━━━");
  console.log(`  categorias : ${tally.categoriesCreated} criadas · ${tally.categoriesUpdated} atualizadas`);
  console.log(`  itens      : ${tally.itemsCreated} criados · ${tally.itemsUpdated} atualizados`);
  console.log(`  variantes  : ${tally.variants}`);
  console.log(`  adicionais : ${tally.extras}`);
  console.log(`  grupos de opção : ${tally.optionGroups} (${tally.options} opções)`);
  if (prune) {
    console.log(`  removidos  : ${tally.itemsPruned} itens · ${tally.categoriesPruned} categorias`);
  }
  if (itemsWithoutImage !== null) {
    console.log(`  SEM FOTO   : ${itemsWithoutImage} itens — rode scripts/foocci-bakery-images.ts`);
  }

  console.log("\n  Degustação:");
  console.log(`    mesa (QR)   /qr/${BAKERY_STORE.slug}`);
  console.log(`    loja sem IA /pedido/${BAKERY_STORE.slug}?modo=loja`);
  console.log(`    Garçom IA   /pedido/${BAKERY_STORE.slug}`);

  if (dryRun) console.log("\n[DRY RUN] Nada foi escrito.");
}

main()
  .catch((err) => {
    console.error("\n✗ seed falhou:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
