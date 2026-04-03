-- CreateTable: whatsapp_agent_configs
CREATE TABLE "whatsapp_agent_configs" (
    "id"              TEXT NOT NULL,
    "restaurantId"    TEXT NOT NULL,
    "agentName"       TEXT NOT NULL DEFAULT 'Agente',
    "tone"            TEXT NOT NULL DEFAULT 'informal',
    "style"           TEXT NOT NULL DEFAULT 'sales_driven',
    "welcomeMessage"  TEXT NOT NULL DEFAULT 'Olá! Bem-vindo! 😊 O que você deseja?',
    "btn1Label"       TEXT NOT NULL DEFAULT 'Fazer pedido',
    "btn2Label"       TEXT NOT NULL DEFAULT 'Falar com atendente',
    "btn3Label"       TEXT NOT NULL DEFAULT 'Ver promoções',
    "orderPreMessage" TEXT NOT NULL DEFAULT 'Ótimo! Aqui está nosso cardápio 👇',
    "menuUrl"         TEXT,
    "handoffPhone"    TEXT,
    "handoffMessage"  TEXT NOT NULL DEFAULT 'Vou te conectar com um atendente. Um momento! 👋',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "whatsapp_agent_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_agent_configs_restaurantId_key" ON "whatsapp_agent_configs"("restaurantId");

-- AddForeignKey
ALTER TABLE "whatsapp_agent_configs"
    ADD CONSTRAINT "whatsapp_agent_configs_restaurantId_fkey"
    FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
