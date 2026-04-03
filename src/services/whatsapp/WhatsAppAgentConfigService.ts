import { prisma } from "@/lib/prisma";
import { serviceOk, serviceFail, ServiceResult } from "@/types";
import type { UpsertAgentConfigInput } from "@/validators/whatsapp-agent";
import type { WhatsAppAgentConfig } from "@prisma/client";

export class WhatsAppAgentConfigService {
  static async getByRestaurantId(
    restaurantId: string
  ): Promise<ServiceResult<WhatsAppAgentConfig>> {
    const config = await prisma.whatsAppAgentConfig.findUnique({
      where: { restaurantId },
    });
    if (!config) return serviceFail("Not configured yet", 404);
    return serviceOk(config);
  }

  static async upsert(
    restaurantId: string,
    input: UpsertAgentConfigInput
  ): Promise<ServiceResult<WhatsAppAgentConfig>> {
    const config = await prisma.whatsAppAgentConfig.upsert({
      where: { restaurantId },
      create: { restaurantId, ...input },
      update: { ...input },
    });
    return serviceOk(config);
  }
}
