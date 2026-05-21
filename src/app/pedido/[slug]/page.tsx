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
import { phoneCandidates } from "@/lib/phone";
import { calcDeliveryFeeFromConfig } from "@/lib/delivery";
import { isOpenFromRow, getPeriodsForRow, getNextOpenAt, buildClosedMessage } from "@/lib/business-hours";

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
  return {
    title: restaurant ? `Cardápio — ${restaurant.name}` : "Cardápio",
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
  const rawPhone = typeof sp.phone === "string" ? sp.phone.trim() : null;

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      id: true, name: true, logoUrl: true, phone: true, timezone: true,
      isOrderingPaused: true, orderingPausedUntil: true, orderingPausedReason: true,
      storeProfile: { select: { whatsappPhone: true, averagePreparationMinutes: true } },
    },
  });



  if (!restaurant) notFound();

  // ── Delivery config (fee + mode shown in checkout) ───────────────────────────
  const deliveryConfig = await prisma.deliveryConfig.findUnique({
    where: { restaurantId: restaurant.id },
    select: {
      mode: true, fee: true, enabled: true, estimatedMinutes: true,
      // Distance-mode fields — needed to compute the floor fee for the checkout display
      distanceBaseFee: true, distanceMinFee: true, distanceMinFeeKm: true,
      distancePricePerKm: true, distanceMaxFee: true,
    },
  });

  // For distance mode the simple `fee` field is null.
  // Compute the floor fee (minimum charge when distance is unknown) so the
  // checkout never shows "Grátis" when baseFee > 0.
  const checkoutDeliveryFee = (() => {
    if (!deliveryConfig?.enabled) return null;
    if (deliveryConfig.mode === "simple" && deliveryConfig.fee != null) {
      return Number(deliveryConfig.fee);
    }
    if (deliveryConfig.mode === "distance") {
      const floor = calcDeliveryFeeFromConfig(
        {
          baseFee:    deliveryConfig.distanceBaseFee   != null ? Number(deliveryConfig.distanceBaseFee)   : 0,
          minimumFee: deliveryConfig.distanceMinFee    != null ? Number(deliveryConfig.distanceMinFee)    : null,
          includedKm: deliveryConfig.distanceMinFeeKm  != null ? Number(deliveryConfig.distanceMinFeeKm)  : 0,
          pricePerKm: deliveryConfig.distancePricePerKm != null ? Number(deliveryConfig.distancePricePerKm) : 0,
          maxFee:     deliveryConfig.distanceMaxFee    != null ? Number(deliveryConfig.distanceMaxFee)    : null,
        },
        null, // distance unknown at page load — baseFee/minimumFee is the safe fallback
      );
      if (process.env.NODE_ENV !== "production" && floor === 0 && Number(deliveryConfig.distanceBaseFee ?? 0) > 0) {
        console.warn("[pedido/page] delivery distance missing; using base fee fallback");
      }
      return floor;
    }
    return null; // manual/advanced mode — "A combinar" or null handled by client
  })();

  // ── Brand config (social links for ordering header) ──────────────────────────
  const brandConfig = await prisma.restaurantBrandConfig.findUnique({
    where: { restaurantId: restaurant.id },
    select: {
      instagramUrl: true, tiktokUrl: true,
      brandPrimaryColor: true, brandSecondaryColor: true,
      ga4MeasurementId: true, gtmId: true,
      brandPersona: true,
    },
  });

  // ── WhatsApp / known-user identification ─────────────────────────────────────
  let knownCustomerPhone: string | null = null;
  let knownCustomerName: string | null = null;
  let knownCustomerId: string | null = null;
  let knownDefaultAddress: { street: string; number: string; neighborhood: string; complement: string } | null = null;

  if (rawPhone) {
    const candidates = phoneCandidates(rawPhone);
    if (candidates.length > 0) {
      const customer = await prisma.customer.findFirst({
        where: { restaurantId: restaurant.id, phone: { in: candidates } },
        select: {
          id: true,
          name: true,
          phone: true,
          addresses: {
            where: { isDefault: true },
            select: { street: true, number: true, neighborhood: true, complement: true },
            take: 1,
          },
        },
      });
      if (customer) {
        knownCustomerPhone = customer.phone;
        knownCustomerName = customer.name.trim().split(/\s+/)[0] ?? null;
        knownCustomerId = customer.id;
        const addr = customer.addresses[0];
        if (addr) {
          knownDefaultAddress = {
            street: addr.street,
            number: addr.number,
            neighborhood: addr.neighborhood,
            complement: addr.complement ?? "",
          };
        }
      } else {
        // Phone is known (came from WhatsApp link) but customer record doesn't exist yet
        knownCustomerPhone = rawPhone;
      }
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
    where: { restaurantId: restaurant.id, isActive: true, isAvailable: true },
    orderBy: { sortOrder: "asc" },
    include: {
      items: {
        where: { isActive: true, isAvailable: true, showInDelivery: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true, name: true, price: true, description: true, imageUrl: true,
          hasVariants: true, ingredients: true, servingSize: true, portionInfo: true,
          variants: {
            where: { isAvailable: true },
            orderBy: { sortOrder: "asc" },
            select: { id: true, name: true, price: true, portion: true },
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
      placements: {
        where: { item: { isActive: true, isAvailable: true, showInDelivery: true } },
        orderBy: { sortOrder: "asc" },
        include: {
          item: {
            select: {
              id: true, name: true, price: true, description: true, imageUrl: true,
              hasVariants: true, ingredients: true, servingSize: true, portionInfo: true,
              variants: {
                where: { isAvailable: true },
                orderBy: { sortOrder: "asc" },
                select: { id: true, name: true, price: true, portion: true },
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

  function mapPedidoItem(i: typeof rawCategories[0]["items"][0]) {
    return {
      id: i.id,
      name: i.name,
      price: Number(i.price),
      description: i.description ?? null,
      imageUrl: i.imageUrl ?? null,
      hasVariants: i.hasVariants,
      ingredients: i.ingredients ?? null,
      servingSize: i.servingSize ?? null,
      portionInfo: i.portionInfo ?? null,
      variants: i.variants.map((v) => ({ id: v.id, name: v.name, price: Number(v.price), portion: v.portion ?? null })),
      extras: i.extras.map((e) => ({ id: e.id, name: e.name, price: Number(e.price), portion: e.portion ?? null, quantity: e.quantity })),
      optionGroups: i.optionGroups.map((g) => ({
        id: g.id, name: g.name, required: g.required, minSelect: g.minSelect, maxSelect: g.maxSelect,
        options: g.options.map((o) => ({ id: o.id, name: o.name, price: Number(o.price), portion: o.portion ?? null })),
      })),
    };
  }

  const categories = rawCategories
    .map((c) => {
      const ownIds = new Set(c.items.map((i) => i.id));
      const placedItems = c.placements.map((p) => p.item).filter((i) => !ownIds.has(i.id));
      return {
        id: c.id, name: c.name, description: c.description ?? null, imageUrl: c.imageUrl ?? null,
        items: [...c.items, ...placedItems].map(mapPedidoItem),
      };
    })
    .filter((c) => c.items.length > 0);

  // Inject "⭐ Mais pedidos" synthetic category as first section (top 10 items)
  const bestSellers = categories.flatMap((c) => c.items).slice(0, 10);
  const allCategories = bestSellers.length > 0
    ? [{ id: "__best__", name: "⭐ Mais pedidos", description: null, imageUrl: null, items: bestSellers }, ...categories]
    : categories;

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

      <PedidoClient
        slug={slug}
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
        instagramUrl={brandConfig?.instagramUrl ?? null}
        tiktokUrl={brandConfig?.tiktokUrl ?? null}
        brandPrimaryColor={brandConfig?.brandPrimaryColor ?? null}
        brandSecondaryColor={brandConfig?.brandSecondaryColor ?? null}
        banners={activeBanners}
        deliveryMode={deliveryConfig?.mode ?? "simple"}
        deliveryFee={checkoutDeliveryFee}
        deliveryEstimatedMinutes={deliveryConfig?.estimatedMinutes ?? null}
        averagePreparationMinutes={restaurant.storeProfile?.averagePreparationMinutes ?? null}
        ga4Id={ga4Id}
        restaurantIsOpen={restaurantIsOpen}
        closedMessage={closedMessage}
        isOrderingPaused={isOrderingPaused}
        pauseReason={pauseReason}
      />
    </>
  );
}
