import { Decimal } from "@prisma/client/runtime/library";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { geocodeAddress } from "@/lib/geocoding";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type {
  UpsertStoreInput,
  UpsertDeliveryInput,
  UpsertDeliveryZoneInput,
  UpsertHoursInput,
  UpsertPaymentInput,
  UpsertPoliciesInput,
  UpsertSoundSettingsInput,
} from "@/validators/settings";
import type {
  DeliveryConfig,
  DeliveryZone,
  BusinessHours,
  PaymentSettings,
  StorePolicies,
  RestaurantSoundSettings,
} from "@prisma/client";

// ── Store ─────────────────────────────────────────────────────────────────────

const STORE_PROFILE_SELECT = {
  tradeName: true, legalName: true, cuisineType: true,
  cnpj: true, stateRegistration: true, municipalRegistration: true,
  taxRegime: true, legalResponsibleName: true, legalResponsibleCpf: true,
  cep: true, street: true, streetNumber: true, complement: true,
  neighborhood: true, city: true, state: true, country: true,
  referencePoint: true, latitude: true, longitude: true,
  mainPhone: true, whatsappPhone: true, secondaryPhone: true,
  secondaryWhatsapp: true, mainEmail: true, financeEmail: true, supportEmail: true,
  ownerName: true, ownerRole: true, ownerPhone: true, ownerWhatsapp: true, ownerEmail: true,
  managerName: true, managerRole: true, managerPhone: true, managerWhatsapp: true, managerEmail: true,
  deliveryEnabled: true, pickupEnabled: true, dineInEnabled: true, averagePreparationMinutes: true,
} as const;

export class RestaurantSettingsService {
  static async getStore(restaurantId: string) {
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: {
        id: true, name: true, slug: true, phone: true, description: true,
        logoUrl: true, timezone: true,
        storeProfile: { select: STORE_PROFILE_SELECT },
      },
    });
    if (!r) return serviceFail("Restaurant not found", 404);
    return serviceOk({ ...r, storeProfile: r.storeProfile ?? null });
  }

  static async updateStore(restaurantId: string, input: UpsertStoreInput) {
    // Load current profile to detect address changes and existing coords
    const currentProfile = await prisma.storeProfile.findUnique({
      where: { restaurantId },
      select: { cep: true, street: true, streetNumber: true, neighborhood: true, city: true, state: true, latitude: true, longitude: true },
    });

    const oldFp = [currentProfile?.cep, currentProfile?.street, currentProfile?.streetNumber, currentProfile?.neighborhood, currentProfile?.city, currentProfile?.state].join("|");
    const newFp = [input.cep, input.street, input.streetNumber, input.neighborhood, input.city, input.state].join("|");
    const addressChanged   = oldFp !== newFp;
    const hasExistingCoords = currentProfile?.latitude != null && currentProfile?.longitude != null;
    const needsGeocode     = addressChanged || !hasExistingCoords;

    const parts = [input.street, input.streetNumber, input.neighborhood, input.city, input.state]
      .filter(Boolean).join(", ");
    const addressSummary = parts || null;
    const syncedPhone = input.whatsappPhone ?? input.mainPhone ?? null;

    // Shared non-coordinate profile fields
    const profileFields = {
      tradeName:    input.tradeName    ?? null,
      legalName:    input.legalName    ?? null,
      cuisineType:  input.cuisineType  ?? null,
      cnpj:                  input.cnpj                  ?? null,
      stateRegistration:     input.stateRegistration     ?? null,
      municipalRegistration: input.municipalRegistration ?? null,
      taxRegime:             input.taxRegime             ?? null,
      legalResponsibleName:  input.legalResponsibleName  ?? null,
      legalResponsibleCpf:   input.legalResponsibleCpf   ?? null,
      cep:            input.cep            ?? null,
      street:         input.street         ?? null,
      streetNumber:   input.streetNumber   ?? null,
      complement:     input.complement     ?? null,
      neighborhood:   input.neighborhood   ?? null,
      city:           input.city           ?? null,
      state:          input.state          ?? null,
      country:        input.country        ?? null,
      referencePoint: input.referencePoint ?? null,
      mainPhone:         input.mainPhone         ?? null,
      whatsappPhone:     input.whatsappPhone     ?? null,
      secondaryPhone:    input.secondaryPhone    ?? null,
      secondaryWhatsapp: input.secondaryWhatsapp ?? null,
      mainEmail:         input.mainEmail         ?? null,
      financeEmail:      input.financeEmail       ?? null,
      supportEmail:      input.supportEmail       ?? null,
      ownerName:       input.ownerName       ?? null,
      ownerRole:       input.ownerRole       ?? null,
      ownerPhone:      input.ownerPhone      ?? null,
      ownerWhatsapp:   input.ownerWhatsapp   ?? null,
      ownerEmail:      input.ownerEmail      ?? null,
      managerName:     input.managerName     ?? null,
      managerRole:     input.managerRole     ?? null,
      managerPhone:    input.managerPhone    ?? null,
      managerWhatsapp: input.managerWhatsapp ?? null,
      managerEmail:    input.managerEmail    ?? null,
      averagePreparationMinutes: input.averagePreparationMinutes ?? null,
    };

    // When address changes, clear stale coords so delivery is blocked (not silently wrong)
    const coordsOnCreate = { latitude: null as number | null, longitude: null as number | null };
    const coordsOnUpdate = addressChanged ? { latitude: null, longitude: null } : {};

    await prisma.$transaction([
      prisma.restaurant.update({
        where: { id: restaurantId },
        data: { name: input.name, description: input.description ?? null, address: addressSummary, phone: syncedPhone, timezone: input.timezone ?? undefined },
      }),
      prisma.storeProfile.upsert({
        where:  { restaurantId },
        create: { restaurantId, ...profileFields, ...coordsOnCreate, deliveryEnabled: input.deliveryEnabled ?? true, pickupEnabled: input.pickupEnabled ?? true, dineInEnabled: input.dineInEnabled ?? true },
        update: {
          ...profileFields,
          ...coordsOnUpdate,
          ...(input.deliveryEnabled !== undefined ? { deliveryEnabled: input.deliveryEnabled } : {}),
          ...(input.pickupEnabled   !== undefined ? { pickupEnabled:   input.pickupEnabled   } : {}),
          ...(input.dineInEnabled   !== undefined ? { dineInEnabled:   input.dineInEnabled   } : {}),
        },
      }),
    ]);

    // Auto-geocode restaurant address backstage — owners never enter lat/lng manually
    let geocodeStatus: "ok" | "failed" | "skipped" = "skipped";
    if (needsGeocode) {
      const hasAddress = !!(input.city && (input.cep || input.street));
      if (hasAddress) {
        console.info("[store-geocode] attempting", { restaurantId });
        const coords = await geocodeAddress({
          cep:          input.cep          ?? undefined,
          street:       input.street       ?? undefined,
          number:       input.streetNumber ?? undefined,
          neighborhood: input.neighborhood ?? undefined,
          city:         input.city         ?? undefined,
          state:        input.state        ?? undefined,
        });
        if (coords) {
          await prisma.storeProfile.update({
            where: { restaurantId },
            data:  { latitude: coords.lat, longitude: coords.lng },
          });
          console.info("[store-geocode] success", { restaurantId });
          geocodeStatus = "ok";
        } else {
          console.warn("[store-geocode] failed", { restaurantId });
          geocodeStatus = "failed";
        }
      }
    }

    const result = await RestaurantSettingsService.getStore(restaurantId);
    if (!result.ok) return result;
    return serviceOk({ ...result.data, geocodeStatus });
  }

  // Geocode the restaurant's stored address and persist the result.
  // Used by the manual "Recalcular localização" action and the repair endpoint.
  static async geocodeStoreAddress(restaurantId: string): Promise<{ ok: boolean; lat?: number; lng?: number }> {
    const profile = await prisma.storeProfile.findUnique({
      where: { restaurantId },
      select: { cep: true, street: true, streetNumber: true, neighborhood: true, city: true, state: true },
    });
    if (!profile) return { ok: false };

    const hasAddress = !!(profile.city && (profile.cep || profile.street));
    if (!hasAddress) return { ok: false };

    console.info("[store-geocode] attempting", { restaurantId });
    const coords = await geocodeAddress({
      cep:          profile.cep          ?? undefined,
      street:       profile.street       ?? undefined,
      number:       profile.streetNumber ?? undefined,
      neighborhood: profile.neighborhood ?? undefined,
      city:         profile.city         ?? undefined,
      state:        profile.state        ?? undefined,
    });

    if (!coords) {
      console.warn("[store-geocode] failed", { restaurantId });
      return { ok: false };
    }

    await prisma.storeProfile.update({
      where: { restaurantId },
      data:  { latitude: coords.lat, longitude: coords.lng },
    });
    console.info("[store-geocode] success", { restaurantId });
    return { ok: true, lat: coords.lat, lng: coords.lng };
  }

  // ── Delivery ─────────────────────────────────────────────────────────────────

  static async getDelivery(restaurantId: string): Promise<ServiceResult<DeliveryConfig & { zones: DeliveryZone[] }>> {
    const cfg = await prisma.deliveryConfig.findUnique({ where: { restaurantId } });
    if (!cfg) return serviceFail("Not configured", 404);
    const zones = await prisma.deliveryZone.findMany({
      where: { restaurantId },
      orderBy: { sortOrder: "asc" },
    });
    return serviceOk({ ...cfg, zones });
  }

  static async upsertDelivery(
    restaurantId: string,
    input: UpsertDeliveryInput
  ): Promise<ServiceResult<DeliveryConfig>> {
    const shared = {
      enabled:           input.enabled,
      pickupEnabled:     input.pickupEnabled,
      mode:              input.mode,
      fee:               input.fee != null ? new Decimal(input.fee) : null,
      estimatedMinutes:  input.estimatedMinutes ?? null,
      areaDescription:   input.areaDescription  ?? null,
      minOrderValue:     input.minOrderValue     != null ? new Decimal(input.minOrderValue)    : null,
      freeDeliveryAbove: input.freeDeliveryAbove != null ? new Decimal(input.freeDeliveryAbove) : null,
      distanceBaseFee:      input.distanceBaseFee      != null ? new Decimal(input.distanceBaseFee)      : null,
      distancePricePerKm:   input.distancePricePerKm   != null ? new Decimal(input.distancePricePerKm)   : null,
      distanceMaxKm:        input.distanceMaxKm         ?? null,
      distanceMinFee:       input.distanceMinFee        != null ? new Decimal(input.distanceMinFee)       : null,
      distanceMinFeeKm:     input.distanceMinFeeKm      ?? null,
      distanceMaxFee:       input.distanceMaxFee        != null ? new Decimal(input.distanceMaxFee)       : null,
      distanceEstimatedBase: input.distanceEstimatedBase ?? null,
      peakHoursEnabled:  input.peakHoursEnabled,
      peakHoursConfig:   input.peakHoursConfig   ?? null,
      geoCenter:         input.geoCenter          ?? null,
      geoRadiusKm:       input.geoRadiusKm        ?? null,
    };
    const cfg = await prisma.deliveryConfig.upsert({
      where:  { restaurantId },
      create: { restaurantId, ...shared },
      update: { ...shared },
    });
    return serviceOk(cfg);
  }

  // ── Delivery Zones ────────────────────────────────────────────────────────────

  static async listDeliveryZones(restaurantId: string): Promise<ServiceResult<DeliveryZone[]>> {
    const zones = await prisma.deliveryZone.findMany({
      where:   { restaurantId },
      orderBy: { sortOrder: "asc" },
    });
    return serviceOk(zones);
  }

  static async createDeliveryZone(
    restaurantId: string,
    input: UpsertDeliveryZoneInput
  ): Promise<ServiceResult<DeliveryZone>> {
    const zone = await prisma.deliveryZone.create({
      data: {
        restaurantId,
        name:             input.name,
        sortOrder:        input.sortOrder ?? 0,
        maxDistanceKm:    input.maxDistanceKm,
        fee:              new Decimal(input.fee),
        estimatedMinutes: input.estimatedMinutes,
        minOrderValue:    input.minOrderValue != null ? new Decimal(input.minOrderValue) : null,
        isActive:         input.isActive,
        peakFee:          input.peakFee   != null ? new Decimal(input.peakFee)  : null,
        geoPolygon:       input.geoPolygon  ?? null,
      },
    });
    return serviceOk(zone);
  }

  static async updateDeliveryZone(
    id: string,
    restaurantId: string,
    input: UpsertDeliveryZoneInput
  ): Promise<ServiceResult<DeliveryZone>> {
    const zone = await prisma.deliveryZone.findFirst({ where: { id, restaurantId } });
    if (!zone) return serviceFail("Zone not found", 404);

    const updated = await prisma.deliveryZone.update({
      where: { id },
      data: {
        name:             input.name,
        sortOrder:        input.sortOrder ?? zone.sortOrder,
        maxDistanceKm:    input.maxDistanceKm,
        fee:              new Decimal(input.fee),
        estimatedMinutes: input.estimatedMinutes,
        minOrderValue:    input.minOrderValue != null ? new Decimal(input.minOrderValue) : null,
        isActive:         input.isActive,
        peakFee:          input.peakFee  != null ? new Decimal(input.peakFee)  : null,
        geoPolygon:       input.geoPolygon  ?? null,
      },
    });
    return serviceOk(updated);
  }

  static async deleteDeliveryZone(
    id: string,
    restaurantId: string
  ): Promise<ServiceResult<null>> {
    const zone = await prisma.deliveryZone.findFirst({ where: { id, restaurantId } });
    if (!zone) return serviceFail("Zone not found", 404);
    await prisma.deliveryZone.delete({ where: { id } });
    return serviceOk(null);
  }

  // ── Business hours ────────────────────────────────────────────────────────────

  static async getHours(restaurantId: string): Promise<ServiceResult<BusinessHours[]>> {
    const hours = await prisma.businessHours.findMany({
      where: { restaurantId },
      orderBy: { dayOfWeek: "asc" },
    });
    return serviceOk(hours);
  }

  static async upsertHours(
    restaurantId: string,
    input: UpsertHoursInput
  ): Promise<ServiceResult<BusinessHours[]>> {
    await prisma.$transaction(
      input.map((day) => {
        const periodsJson = day.periods && day.periods.length > 0
          ? day.periods
          : Prisma.DbNull;
        return prisma.businessHours.upsert({
          where:  { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: day.dayOfWeek } },
          create: { restaurantId, dayOfWeek: day.dayOfWeek, isOpen: day.isOpen, openTime: day.openTime, closeTime: day.closeTime, periodsJson },
          update: { isOpen: day.isOpen, openTime: day.openTime, closeTime: day.closeTime, periodsJson },
        });
      })
    );
    const hours = await prisma.businessHours.findMany({
      where: { restaurantId },
      orderBy: { dayOfWeek: "asc" },
    });
    return serviceOk(hours);
  }

  // ── Payment settings ──────────────────────────────────────────────────────────

  static async getPayment(restaurantId: string): Promise<ServiceResult<PaymentSettings>> {
    const cfg = await prisma.paymentSettings.findUnique({ where: { restaurantId } });
    if (!cfg) return serviceFail("Not configured", 404);
    return serviceOk(cfg);
  }

  static async upsertPayment(
    restaurantId: string,
    input: UpsertPaymentInput
  ): Promise<ServiceResult<PaymentSettings>> {
    const cfg = await prisma.paymentSettings.upsert({
      where:  { restaurantId },
      create: { restaurantId, ...input },
      update: { ...input },
    });
    return serviceOk(cfg);
  }

  // ── Store policies ────────────────────────────────────────────────────────────

  static async getPolicies(restaurantId: string): Promise<ServiceResult<StorePolicies>> {
    const cfg = await prisma.storePolicies.findUnique({ where: { restaurantId } });
    if (!cfg) return serviceFail("Not configured", 404);
    return serviceOk(cfg);
  }

  static async upsertPolicies(
    restaurantId: string,
    input: UpsertPoliciesInput
  ): Promise<ServiceResult<StorePolicies>> {
    const cfg = await prisma.storePolicies.upsert({
      where:  { restaurantId },
      create: { restaurantId, ...input },
      update: { ...input },
    });
    return serviceOk(cfg);
  }

  // ── Sound settings ────────────────────────────────────────────────────────────

  static async getSoundSettings(restaurantId: string): Promise<ServiceResult<RestaurantSoundSettings>> {
    const cfg = await prisma.restaurantSoundSettings.findUnique({ where: { restaurantId } });
    if (!cfg) {
      // Return defaults if row not yet created — avoids 404 on first load
      return serviceOk({
        id: "",
        restaurantId,
        soundEnabled:                    true,
        newOrderSoundEnabled:            true,
        humanAttentionSoundEnabled:      true,
        soundVolume:                     120,
        repeatNewOrderSoundUntilAccepted: true,
        repeatHumanAttentionUntilSeen:   true,
        soundTheme:                      "DEFAULT",
        createdAt:                       new Date(0),
        updatedAt:                       new Date(0),
      } as RestaurantSoundSettings);
    }
    return serviceOk(cfg);
  }

  static async upsertSoundSettings(
    restaurantId: string,
    input: UpsertSoundSettingsInput
  ): Promise<ServiceResult<RestaurantSoundSettings>> {
    const cfg = await prisma.restaurantSoundSettings.upsert({
      where:  { restaurantId },
      create: { restaurantId, ...input },
      update: { ...input },
    });
    return serviceOk(cfg);
  }
}
