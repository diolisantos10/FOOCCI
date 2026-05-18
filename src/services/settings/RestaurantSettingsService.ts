import { Decimal } from "@prisma/client/runtime/library";
import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type {
  UpsertStoreInput,
  UpsertDeliveryInput,
  UpsertDeliveryZoneInput,
  UpsertHoursInput,
  UpsertPaymentInput,
  UpsertPoliciesInput,
} from "@/validators/settings";
import type {
  DeliveryConfig,
  DeliveryZone,
  BusinessHours,
  PaymentSettings,
  StorePolicies,
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
    // Build structured address summary for backward-compat restaurant.address field
    const parts = [input.street, input.streetNumber, input.neighborhood, input.city, input.state]
      .filter(Boolean).join(", ");
    const addressSummary = parts || null;

    // Keep restaurant.phone in sync with whatsappPhone (primary contact)
    const syncedPhone = input.whatsappPhone ?? input.mainPhone ?? null;

    await prisma.$transaction([
      prisma.restaurant.update({
        where: { id: restaurantId },
        data: {
          name:        input.name,
          description: input.description ?? null,
          address:     addressSummary,
          phone:       syncedPhone,
          timezone:    input.timezone    ?? undefined,
        },
      }),
      prisma.storeProfile.upsert({
        where:  { restaurantId },
        create: {
          restaurantId,
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
          latitude:       input.latitude       ?? null,
          longitude:      input.longitude      ?? null,
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
          deliveryEnabled: input.deliveryEnabled ?? true,
          pickupEnabled:   input.pickupEnabled   ?? true,
          dineInEnabled:   input.dineInEnabled   ?? true,
          averagePreparationMinutes: input.averagePreparationMinutes ?? null,
        },
        update: {
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
          latitude:       input.latitude       ?? null,
          longitude:      input.longitude      ?? null,
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
          ...(input.deliveryEnabled !== undefined ? { deliveryEnabled: input.deliveryEnabled } : {}),
          ...(input.pickupEnabled   !== undefined ? { pickupEnabled:   input.pickupEnabled   } : {}),
          ...(input.dineInEnabled   !== undefined ? { dineInEnabled:   input.dineInEnabled   } : {}),
          averagePreparationMinutes: input.averagePreparationMinutes ?? null,
        },
      }),
    ]);

    return RestaurantSettingsService.getStore(restaurantId);
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
      input.map((day) =>
        prisma.businessHours.upsert({
          where:  { restaurantId_dayOfWeek: { restaurantId, dayOfWeek: day.dayOfWeek } },
          create: { restaurantId, ...day },
          update: { isOpen: day.isOpen, openTime: day.openTime, closeTime: day.closeTime },
        })
      )
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
}
