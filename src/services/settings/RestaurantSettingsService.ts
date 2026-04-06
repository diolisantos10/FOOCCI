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

// ── Store (Restaurant fields) ──────────────────────────────────────────────────

type StoreSummary = {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  description: string | null;
  logoUrl: string | null;
};

export class RestaurantSettingsService {
  static async getStore(restaurantId: string): Promise<ServiceResult<StoreSummary>> {
    const r = await prisma.restaurant.findUnique({
      where: { id: restaurantId },
      select: { id: true, name: true, phone: true, address: true, description: true, logoUrl: true },
    });
    if (!r) return serviceFail("Restaurant not found", 404);
    return serviceOk(r);
  }

  static async updateStore(
    restaurantId: string,
    input: UpsertStoreInput
  ): Promise<ServiceResult<StoreSummary>> {
    const r = await prisma.restaurant.update({
      where: { id: restaurantId },
      data: {
        name:        input.name,
        phone:       input.phone       ?? null,
        address:     input.address     ?? null,
        description: input.description ?? null,
        logoUrl:     input.logoUrl     ?? null,
      },
      select: { id: true, name: true, phone: true, address: true, description: true, logoUrl: true },
    });
    return serviceOk(r);
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
