/**
 * /pedido/[slug] — Public AI ordering experience
 *
 * No auth required. Resolved by restaurant slug.
 * Full customer interface: menu, AI agent, checkout flow.
 */

import { notFound } from "next/navigation";
import Script from "next/script";
import { prisma } from "@/lib/prisma";
import { PedidoClient } from "./PedidoClient";
import { LojaClient } from "./LojaClient";
import { isCardEnabled } from "@/services/payment/PaymentRouter";
import { phoneCandidates, customerFirstName, CUSTOMER_LOOKUP_ORDER } from "@/lib/phone";
import { verifyWaToken } from "@/lib/wa-token";
import { calcDeliveryFeeFromConfig } from "@/lib/delivery";
import { isOpenFromRow, getPeriodsForRow, getNextOpenAt, buildClosedMessage, abre24hTodosOsDias } from "@/lib/business-hours";
import { getActiveMenuPromotions, buildPromotionMap } from "@/services/promotions/productPromotionResolver";
import { getRepeatableOrder } from "@/services/order/RepeatOrderService";
import { channelPrice } from "@/services/menu/MenuPricingService";
import { PEDIDO_ITEM_SELECT, mapPedidoItem } from "@/services/menu/pedidoMenuItem";
import { getMenuBestSellerRows, rankBestSellers, MENU_BESTSELLER_LIMIT } from "@/services/menu/menuBestSellers";
import { getPublicSiteUrl } from "@/lib/public-url";
import { aiWaiterIncluded } from "@/lib/plan-features";
import { identificacaoPodeSerPulada } from "@/lib/identificacao-loja";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: { name: true },
  });
  const title = restaurant ? `Cardápio — ${restaurant.name}` : "Cardápio";
  // Customer-facing copy — overrides the root layout's internal Foocci tagline so
  // the WhatsApp/social preview speaks to the diner, not to restaurant owners.
  const description = restaurant
    ? `Peça agora pelo cardápio digital do ${restaurant.name}. 🍽️`
    : "Peça agora pelo cardápio digital. 🍽️";
  // metadataBase lets Next resolve the opengraph-image (wide preview banner) to an
  // absolute URL so WhatsApp uses our compact card instead of scraping the big logo.
  return {
    metadataBase: new URL(getPublicSiteUrl()),
    title,
    description,
    openGraph: { title, description, type: "website" },
    twitter:   { card: "summary_large_image", title, description },
  };
}

export default async function PedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const rawPhone  = typeof sp.phone   === "string" ? sp.phone.trim()   : null;
  // Decode signed WhatsApp identity token (appended by WhatsAppReceptionistService)
  const rawWaToken = typeof sp.waToken === "string" ? sp.waToken.trim() : null;
  const waPayload  = rawWaToken ? verifyWaToken(rawWaToken) : null;
  // SECURITY (CR C1): PII (customerId, saved address, e-mail) is loaded ONLY from a
  // PROVEN phone — the signed waToken. A bare `?phone=` param is NOT proof of
  // possession (anyone could put a victim's number in the URL), so it must never
  // server-render a stranger's home address. It is kept solely to prefill the phone
  // input below. `pedidoToken` (the validated waToken) is handed to the client so it
  // can call the now-gated profile/address/coupon endpoints.
  const provenPhone = waPayload?.phone ?? null;
  const pedidoToken = waPayload ? rawWaToken : null;
  // Recovery link sets src=recovery — used below to restore the customer's draft cart
  const isRecovery = sp.src === "recovery";
  // ?modo=loja força a Loja (catálogo + checkout, sem conversa) mesmo em plano com
  // Garçom IA. Direção segura: o parâmetro só REMOVE a IA, nunca a liga — a trava
  // por plano (STARTER → 403 nas rotas de chat) fica intocada.
  const forceLoja = sp.modo === "loja";

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true, name: true, logoUrl: true, phone: true, timezone: true,
      plan: true, aiWaiterEnabled: true,
      // `isDemo` decide UMA coisa nesta página: se a identificação da entrada tem
      // saída. Precisa vir do SELECT — campo ausente chega `undefined` e a trava
      // falha fechada (ver `identificacaoPodeSerPulada`).
      isDemo: true,
      isOrderingPaused: true, orderingPausedUntil: true, orderingPausedReason: true,
      storeProfile: { select: { whatsappPhone: true, averagePreparationMinutes: true } },
    },
  });



  if (!restaurant) notFound();

  /* A identificação da entrada tem saída? Só na VITRINE de demonstração — a
   * decisão é do servidor e vem da coluna `isDemo`, nunca do slug e nunca de um
   * literal no cliente. O motivo inteiro está em `src/lib/identificacao-loja.ts`:
   * `/site/experimente` promete "sem cadastro" e mandava o visitante para um
   * painel de telefone sem saída, enquanto a obrigatoriedade continua necessária
   * em toda loja de cliente de verdade (pedido precisa de contato). */
  const identificacaoOpcional = identificacaoPodeSerPulada(restaurant);

  // ── Delivery config (fee + mode shown in checkout) ───────────────────────────
  const deliveryConfig = await prisma.deliveryConfig.findUnique({
    where: { restaurantId: restaurant.id },
    select: {
      mode: true, fee: true, enabled: true, pickupEnabled: true, estimatedMinutes: true,
      freeDeliveryAbove: true, minOrderValue: true,
      // Distance-mode fields — needed to compute the floor fee for the checkout display
      distanceBaseFee: true, distanceMinFee: true, distanceMinFeeKm: true,
      distancePricePerKm: true, distanceMaxFee: true,
    },
  });

  // For distance mode the simple `fee` field is null.
  // Use baseFee only as the page-load placeholder — distanceMinFee is the
  // checkout-time fallback (used by the resolver when geocoding fails) and
  // must not inflate the initial display before an address is entered.
  const checkoutDeliveryFee = (() => {
    if (!deliveryConfig?.enabled) return null;
    if (deliveryConfig.mode === "simple" && deliveryConfig.fee != null) {
      return Number(deliveryConfig.fee);
    }
    if (deliveryConfig.mode === "distance") {
      const floor = calcDeliveryFeeFromConfig(
        {
          baseFee:    deliveryConfig.distanceBaseFee   != null ? Number(deliveryConfig.distanceBaseFee)   : 0,
          minimumFee: null, // do NOT use distanceMinFee as a display floor; it is a checkout-only fallback
          includedKm: deliveryConfig.distanceMinFeeKm  != null ? Number(deliveryConfig.distanceMinFeeKm)  : 0,
          pricePerKm: deliveryConfig.distancePricePerKm != null ? Number(deliveryConfig.distancePricePerKm) : 0,
          maxFee:     deliveryConfig.distanceMaxFee    != null ? Number(deliveryConfig.distanceMaxFee)    : null,
        },
        null, // distance unknown at page load → returns baseFee
      );
      return floor;
    }
    return null; // manual/advanced mode — "A combinar" or null handled by client
  })();

  // ── Brand config (social links for ordering header) ──────────────────────────
  const brandConfig = await prisma.restaurantBrandConfig.findUnique({
    where: { restaurantId: restaurant.id },
    select: {
      instagramUrl: true, tiktokUrl: true, googleReviewUrl: true,
      brandPrimaryColor: true, brandSecondaryColor: true,
      ga4MeasurementId: true, gtmId: true,
      brandPersona: true,
    },
  });

  // ── WhatsApp / known-user identification ─────────────────────────────────────
  let knownCustomerPhone: string | null = null;
  let knownCustomerName: string | null = null;
  let knownCustomerId: string | null = null;
  let knownDefaultAddress: { street: string; number: string; neighborhood: string; complement: string; cep?: string; city?: string; state?: string } | null = null;

  if (provenPhone) {
    const candidates = phoneCandidates(provenPhone);
    if (candidates.length > 0) {
      const customer = await prisma.customer.findFirst({
        where: { restaurantId: restaurant.id, phone: { in: candidates } },
        orderBy: CUSTOMER_LOOKUP_ORDER, // duplicata sem histórico nunca vence o cadastro rico
        select: {
          id: true,
          name: true,
          phone: true,
          addresses: {
            where: { isDefault: true },
            select: { street: true, number: true, neighborhood: true, complement: true, zipCode: true, city: true, state: true },
            take: 1,
          },
        },
      });
      if (customer) {
        knownCustomerPhone = customer.phone;
        knownCustomerName = customerFirstName(customer.name);
        knownCustomerId = customer.id;
        const addr = customer.addresses[0];
        if (addr) {
          knownDefaultAddress = {
            street:       addr.street,
            number:       addr.number,
            neighborhood: addr.neighborhood,
            complement:   addr.complement ?? "",
            cep:          addr.zipCode,
            city:         addr.city,
            state:        addr.state,
          };
        } else {
          // No registered address — fall back to the same source WhatsApp uses:
          // the customer's most recent delivery order address (read-only).
          const { getSavedAddressForCustomer } = await import("@/services/whatsapp/ordering/checkoutBridge");
          const lastAddr = await getSavedAddressForCustomer(customer.id).catch(() => null);
          if (lastAddr) {
            knownDefaultAddress = {
              street:       lastAddr.street,
              number:       lastAddr.number,
              neighborhood: lastAddr.neighborhood ?? "",
              complement:   "",
            };
          }
        }
      } else {
        // Phone known (WhatsApp link) but no customer record yet — upsert now.
        // Ensures knownCustomerId is always set when a waToken is used, eliminating
        // the race between async auto-identify and the first cart / chat action.
        knownCustomerPhone = provenPhone;
        const tokenName = waPayload?.name?.trim() ?? null;
        if (tokenName) knownCustomerName = tokenName.split(/\s+/)[0] ?? null;
        try {
          const upserted = await prisma.customer.upsert({
            where:  { phone_restaurantId: { phone: provenPhone, restaurantId: restaurant.id } },
            create: { restaurantId: restaurant.id, phone: provenPhone, name: tokenName ?? provenPhone },
            update: {},
            select: { id: true, name: true },
          });
          knownCustomerId = upserted.id;
          if (!knownCustomerName) knownCustomerName = customerFirstName(upserted.name);
        } catch (err) {
          console.error("[pedido/page] customer upsert failed (non-fatal)", err);
          // Auto-identify will retry client-side
        }
      }
    }
  } else if (rawPhone) {
    // Not proven — prefill the phone input only. No customer lookup, no PII: a bare
    // `?phone=` must never surface a stranger's identity or saved address.
    knownCustomerPhone = rawPhone;
  }

  // ── Recovery: restore previous draft cart ───────────────────────────────────
  // Only when the link came from a recovery message AND the customer is identified.
  // Items are validated against the live menu — unavailable items are silently dropped.
  type RecoveryCartItem = { id: string; name: string; price: number; qty: number };
  let recoveryCart: RecoveryCartItem[] = [];

  if (isRecovery && knownCustomerId) {
    try {
      const draft = await prisma.orderDraft.findFirst({
        where:   { restaurantId: restaurant.id, customerId: knownCustomerId, status: "OPEN" },
        orderBy: { updatedAt: "desc" },
        select: {
          items: {
            select: {
              menuItemId: true,
              quantity:   true,
              menuItem:   { select: { id: true, name: true, price: true, priceDelivery: true, priceDineIn: true, priceIfood: true, isActive: true, isAvailable: true } },
            },
          },
        },
      });
      if (draft) {
        recoveryCart = draft.items
          .filter((i) => i.menuItem?.isActive && i.menuItem.isAvailable && i.menuItemId)
          .map((i) => ({
            id:    i.menuItemId!,
            name:  i.menuItem!.name,
            price: channelPrice(i.menuItem!, "DELIVERY"),
            qty:   i.quantity,
          }));
      }
    } catch (err) {
      console.error("[pedido/page] recovery draft fetch failed (non-fatal)", err);
    }
  }

  // ── Repeat order (W3): offer "Pedir novamente" to identified returning customers ──
  // Suppressed during the recovery flow — a restored recovery cart takes precedence
  // so we never offer to repeat over a cart the customer is already resuming.
  let repeatOrder: NonNullable<Awaited<ReturnType<typeof getRepeatableOrder>>> | undefined;
  if (knownCustomerId && !isRecovery) {
    try {
      const payload = await getRepeatableOrder(restaurant.id, knownCustomerId);
      if (payload && payload.items.length > 0) repeatOrder = payload;
    } catch (err) {
      console.error("[pedido/page] repeat-order fetch failed (non-fatal)", err);
    }
  }

  // ── Business hours — is the restaurant currently open? ──────────────────────
  const now      = new Date();
  const tz       = restaurant.timezone ?? "America/Sao_Paulo";
  const localNow = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const todayDow = localNow.getDay(); // 0=Sun … 6=Sat (in restaurant's local time)
  const localMin = localNow.getHours() * 60 + localNow.getMinutes();

  // Fetch all 7 days so we can compute next-opening-at for the closed banner
  const allHoursRows = await prisma.businessHours.findMany({
    where:   { restaurantId: restaurant.id },
    orderBy: { dayOfWeek: "asc" },
    select:  { dayOfWeek: true, isOpen: true, openTime: true, closeTime: true, periodsJson: true },
  });
  const todayHoursRow    = allHoursRows.find((r) => r.dayOfWeek === todayDow) ?? null;
  const restaurantIsOpen = isOpenFromRow(todayHoursRow, tz, now);
  const todayPeriods     = todayHoursRow ? getPeriodsForRow(todayHoursRow) : [];
  const nextOpenAt       = restaurantIsOpen ? null : getNextOpenAt(allHoursRows, todayDow, localMin);
  const closedMessage    = restaurantIsOpen ? null : buildClosedMessage(todayPeriods, nextOpenAt);
  /* Loja que nunca fecha nao tem o que dizer sobre horario — ver abre24hTodosOsDias. */
  const semHorarioParaMostrar = abre24hTodosOsDias(allHoursRows);

  // ── Emergency pause ──────────────────────────────────────────────────────────
  const pausedUntil = restaurant.orderingPausedUntil;
  const isOrderingPaused =
    restaurant.isOrderingPaused &&
    (pausedUntil === null || pausedUntil > now);
  const pauseReason = isOrderingPaused ? (restaurant.orderingPausedReason ?? null) : null;

  // ── Active banners for today ─────────────────────────────────────────────────
  const rawBanners = await prisma.promotion.findMany({
    where: {
      restaurantId: restaurant.id,
      status: "ACTIVE",
      bannerImageUrl: { not: null },
      OR: [
        { startsAt: null },
        { startsAt: { lte: now } },
      ],
      AND: [
        { OR: [{ endsAt: null }, { endsAt: { gte: now } }] },
      ],
    },
    select: { id: true, name: true, bannerImageUrl: true, daysOfWeek: true },
    orderBy: { createdAt: "desc" },
  });
  // Filter by day-of-week (empty array = every day)
  const activeBanners = rawBanners
    .filter((b) => b.daysOfWeek.length === 0 || b.daysOfWeek.includes(todayDow))
    .map((b) => ({ id: b.id, name: b.name, imageUrl: b.bannerImageUrl! }));

  const rawCategories = await prisma.menuCategory.findMany({
    where: { restaurantId: restaurant.id, isActive: true, isAvailable: true, showInDelivery: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { isActive: true, isAvailable: true, showInDelivery: true },
        orderBy: { sortOrder: "asc" },
        select: PEDIDO_ITEM_SELECT,
      },
      placements: {
        where: { item: { isActive: true, isAvailable: true, showInDelivery: true } },
        orderBy: { sortOrder: "asc" },
        include: {
          item: {
            select: {
              id: true, name: true, price: true,
              priceDelivery: true, priceDineIn: true, priceIfood: true,
              description: true, imageUrl: true,
              categoryId: true,
              hasVariants: true, ingredients: true, servingSize: true, portionInfo: true,
              variants: {
                where: { isAvailable: true },
                orderBy: { sortOrder: "asc" },
                select: { id: true, name: true, price: true, priceDelivery: true, priceDineIn: true, portion: true },
              },
              extras: {
                where: { isAvailable: true },
                orderBy: { name: "asc" },
                select: { id: true, name: true, price: true, portion: true, quantity: true },
              },
              optionGroups: {
                orderBy: { sortOrder: "asc" },
                include: {
                  options: {
                    where: { isAvailable: true },
                    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
                    select: { id: true, name: true, price: true, portion: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });

  // Fetch active promotions + dynamic best sellers in parallel. "Mais vendidos"
  // uses the Analytics-consistent aggregation (30-day Foocci real sales, valid
  // operational orders), ranked by units sold — see services/menu/menuBestSellers.
  const [activePromotions, bestSellerRows, cardOnlineEnabled, bestSeller7Rows] = await Promise.all([
    getActiveMenuPromotions(restaurant.id, "DELIVERY"),
    getMenuBestSellerRows(restaurant.id),
    isCardEnabled(restaurant.id), // show the online card option only when a card operator (MP/SumUp) is active
    getMenuBestSellerRows(restaurant.id, 7), // last-7-day rank for ordering products WITHIN each category
  ]);

  // Rank map: menuItemId → position among the last 7 days' best-sellers (lower =
  // more sold). Non-sellers fall to the end, keeping their admin sortOrder (the
  // sort below is stable and c.items already comes ordered by sortOrder).
  const bestSellerRank = new Map<string, number>();
  bestSeller7Rows.forEach((r, idx) => bestSellerRank.set(r.menuItemId, idx));
  const rankOf = (id: string) => bestSellerRank.get(id) ?? Number.MAX_SAFE_INTEGER;

  // Collect all raw items with their home categoryId for building the promotion map
  const allRawItems = rawCategories.flatMap((c) => [
    ...c.items.map((i) => ({ id: i.id, categoryId: c.id, price: channelPrice(i, "DELIVERY") })),
    ...c.placements.map((p) => ({ id: p.item.id, categoryId: p.item.categoryId, price: channelPrice(p.item, "DELIVERY") })),
  ]);
  const promoMap = buildPromotionMap(allRawItems, activePromotions);
  const toPedidoItem = (i: typeof rawCategories[0]["items"][0]) => mapPedidoItem(i, promoMap.get(i.id) ?? null);

  const categories = rawCategories
    .map((c) => {
      // Category shows ONLY its own products — cross-category placements no longer
      // bleed to the end. Ordered by last-7-day best-sellers first, then the admin
      // sortOrder (c.items already comes sorted; Array.sort is stable).
      const ordered = [...c.items].sort((a, b) => rankOf(a.id) - rankOf(b.id));
      return {
        id: c.id, name: c.name, description: c.description ?? null, imageUrl: c.imageUrl ?? null,
        items: ordered.map(toPedidoItem),
      };
    })
    .filter((c) => c.items.length > 0);

  // Build a flat item lookup for best-sellers + promotions virtual categories
  const allItemsFlat = new Map(categories.flatMap((c) => c.items.map((i) => [i.id, i])));

  // Dynamic "Mais vendidos": keep only products still orderable in this menu
  // (drops unavailable/deleted), ranked by units sold then revenue, top 10.
  const bestSellers = rankBestSellers(bestSellerRows, new Set(allItemsFlat.keys()), MENU_BESTSELLER_LIMIT)
    .map((r) => allItemsFlat.get(r.menuItemId))
    .filter((i): i is Exclude<typeof i, undefined> => i !== undefined);

  // Promoted items virtual category — deduplicate across categories (placements can repeat an item)
  const seenPromo = new Set<string>();
  const promotedItems = categories.flatMap((c) => c.items).filter((i) => {
    if (i.promotion === null || seenPromo.has(i.id)) return false;
    seenPromo.add(i.id);
    return true;
  });

  const virtualCategories: typeof categories = [];
  if (promotedItems.length > 0) {
    virtualCategories.push({ id: "__promotions__", name: "🔥 Promoções", description: null, imageUrl: null, items: promotedItems });
  }
  if (bestSellers.length > 0) {
    virtualCategories.push({ id: "__best__", name: "⭐ Mais vendidos", description: null, imageUrl: null, items: bestSellers });
  }

  const allCategories = [...virtualCategories, ...categories];

  // Loja (sem IA): o hero replica o do QR — o promoBanner é o primeiro item em
  // promoção com foto (mesma regra de src/app/qr/[slug]/page.tsx).
  const lojaPromoBanner = promotedItems.find((i) => i.imageUrl) ?? promotedItems[0] ?? null;

  // ── "Comprar novamente" pool (W3) ────────────────────────────────────────────
  // Full menu-item objects for the identified customer's repeatable items, resolved
  // INDEPENDENTLY of category visibility (getRepeatableOrder validates the ITEM's
  // flags, not its home category's). This lets the client render the "Comprar
  // novamente" section even for items whose home category is hidden from the
  // delivery menu — the case that broke once cross-category placements stopped
  // bleeding into categories. The client augments this pool via the repeat-order API.
  let repeatMenuItems: ReturnType<typeof toPedidoItem>[] = [];
  if (repeatOrder && repeatOrder.items.length > 0) {
    const repeatIds = [...new Set(repeatOrder.items.map((i) => i.menuItemId).filter((id): id is string => !!id))];
    if (repeatIds.length > 0) {
      try {
        const rows = await prisma.menuItem.findMany({
          where: {
            id: { in: repeatIds },
            isActive: true, isAvailable: true, showInDelivery: true,
            category: { restaurantId: restaurant.id },
          },
          select: PEDIDO_ITEM_SELECT,
        });
        repeatMenuItems = rows.map(toPedidoItem);
      } catch (err) {
        console.error("[pedido/page] repeat-pool fetch failed (non-fatal)", err);
      }
    }
  }

  const ga4Id = brandConfig?.ga4MeasurementId ?? null;
  const gtmId = brandConfig?.gtmId ?? null;

  return (
    <>
      {/* Google Tag Manager */}
      {gtmId && (
        <>
          <Script id="gtm-head" strategy="afterInteractive">{`
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});
var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';
j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtmId}');
          `}</Script>
          <noscript>
            <iframe
              src={`https://www.googletagmanager.com/ns.html?id=${gtmId}`}
              height="0" width="0" style={{ display: "none", visibility: "hidden" }}
            />
          </noscript>
        </>
      )}

      {/* Google Analytics 4 */}
      {ga4Id && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${ga4Id}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">{`
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${ga4Id}');
          `}</Script>
        </>
      )}

      {aiWaiterIncluded(restaurant) && !forceLoja ? (
      <PedidoClient
        slug={slug}
        aiIncluded={true}
        restaurantName={restaurant.name}
        logoUrl={
          (brandConfig?.brandPersona != null && typeof brandConfig.brandPersona === "object"
            ? (brandConfig.brandPersona as Record<string, unknown>).logoUrl as string | undefined
            : undefined) ??
          restaurant.logoUrl ??
          null
        }
        phone={restaurant.storeProfile?.whatsappPhone ?? restaurant.phone ?? null}
        categories={allCategories}
        knownCustomerPhone={knownCustomerPhone}
        knownCustomerName={knownCustomerName}
        knownCustomerId={knownCustomerId}
        knownDefaultAddress={knownDefaultAddress}
        pedidoToken={pedidoToken}
        instagramUrl={brandConfig?.instagramUrl ?? null}
        tiktokUrl={brandConfig?.tiktokUrl ?? null}
        brandPrimaryColor={brandConfig?.brandPrimaryColor ?? null}
        brandSecondaryColor={brandConfig?.brandSecondaryColor ?? null}
        banners={activeBanners}
        deliveryMode={deliveryConfig?.mode ?? "simple"}
        deliveryFee={checkoutDeliveryFee}
        freeDeliveryAbove={deliveryConfig?.freeDeliveryAbove != null ? Number(deliveryConfig.freeDeliveryAbove) : null}
        deliveryEstimatedMinutes={deliveryConfig?.estimatedMinutes ?? null}
        averagePreparationMinutes={restaurant.storeProfile?.averagePreparationMinutes ?? null}
        ga4Id={ga4Id}
        cardOnlineEnabled={cardOnlineEnabled}
        restaurantIsOpen={restaurantIsOpen}
        semHorarioParaMostrar={semHorarioParaMostrar}
        closedMessage={closedMessage}
        isOrderingPaused={isOrderingPaused}
        pauseReason={pauseReason}
        pausedUntil={isOrderingPaused && pausedUntil ? pausedUntil.toISOString() : null}
        recoveryCart={recoveryCart.length > 0 ? recoveryCart : undefined}
        repeatOrder={repeatOrder}
        repeatMenuItems={repeatMenuItems}
        identificacaoOpcional={identificacaoOpcional}
      />
      ) : (
      /* Loja: o MESMO cardápio do QR da mesa, que compra (retrabalho aprovado
         pelo CEO em 04/08). Renderiza no plano de entrada OU quando ?modo=loja
         força a versão sem IA. Visual compartilhado em src/components/menu/*;
         a máquina embaixo são as MESMAS rotas /api/pedido/* provadas sem IA
         (pedido #O2VKA1). Preço segue no canal DELIVERY. */
      <LojaClient
        slug={slug}
        restaurantName={restaurant.name}
        logoUrl={
          (brandConfig?.brandPersona != null && typeof brandConfig.brandPersona === "object"
            ? (brandConfig.brandPersona as Record<string, unknown>).logoUrl as string | undefined
            : undefined) ??
          restaurant.logoUrl ??
          null
        }
        brandPrimaryColor={brandConfig?.brandPrimaryColor ?? null}
        categories={categories}
        featured={bestSellers}
        promotedItems={promotedItems}
        promoBanner={lojaPromoBanner}
        promotionBanners={activeBanners}
        instagramUrl={brandConfig?.instagramUrl ?? null}
        tiktokUrl={brandConfig?.tiktokUrl ?? null}
        restaurantPhone={restaurant.storeProfile?.whatsappPhone ?? restaurant.phone ?? null}
        googleReviewUrl={brandConfig?.googleReviewUrl ?? null}
        deliveryEnabled={deliveryConfig?.enabled ?? false}
        pickupEnabled={deliveryConfig?.pickupEnabled ?? true}
        deliveryFee={checkoutDeliveryFee}
        knownCustomerPhone={knownCustomerPhone}
        knownCustomerName={knownCustomerName}
        knownCustomerId={knownCustomerId}
        knownDefaultAddress={knownDefaultAddress}
        pedidoToken={pedidoToken}
        restaurantIsOpen={restaurantIsOpen}
        semHorarioParaMostrar={semHorarioParaMostrar}
        closedMessage={closedMessage}
        identificacaoOpcional={identificacaoOpcional}
      />
      )}
    </>
  );
}
