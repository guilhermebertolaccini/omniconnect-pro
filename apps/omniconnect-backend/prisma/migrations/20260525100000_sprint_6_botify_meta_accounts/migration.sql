-- BotifyMetaAccount: fonte única tenant-scoped para Chips + webhook routing

CREATE TABLE "BotifyMetaAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "businessManagerId" TEXT,
    "metaWabaAccountId" TEXT,
    "accessTokenEnc" TEXT,
    "webhookCallbackUrl" TEXT,
    "webhookVerifyToken" TEXT,
    "webhookEvents" JSONB,
    "phoneNumberIds" JSONB,
    "defaultBotId" TEXT,
    "defaultFlowId" TEXT,
    "evolutionInstance" TEXT,
    "evolutionApiKeyEnc" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotifyMetaAccount_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "BotifyBot" ADD COLUMN "metaAccountId" TEXT;

CREATE INDEX "BotifyMetaAccount_tenantId_idx" ON "BotifyMetaAccount"("tenantId");
CREATE INDEX "BotifyMetaAccount_tenantId_isActive_idx" ON "BotifyMetaAccount"("tenantId", "isActive");
CREATE INDEX "BotifyMetaAccount_tenantId_metaWabaAccountId_idx" ON "BotifyMetaAccount"("tenantId", "metaWabaAccountId");
CREATE INDEX "BotifyMetaAccount_tenantId_businessManagerId_idx" ON "BotifyMetaAccount"("tenantId", "businessManagerId");
CREATE INDEX "BotifyMetaAccount_tenantId_evolutionInstance_idx" ON "BotifyMetaAccount"("tenantId", "evolutionInstance");
CREATE INDEX "BotifyBot_tenantId_metaAccountId_idx" ON "BotifyBot"("tenantId", "metaAccountId");

ALTER TABLE "BotifyMetaAccount" ADD CONSTRAINT "BotifyMetaAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BotifyMetaAccount" ADD CONSTRAINT "BotifyMetaAccount_defaultBotId_fkey" FOREIGN KEY ("defaultBotId") REFERENCES "BotifyBot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BotifyBot" ADD CONSTRAINT "BotifyBot_metaAccountId_fkey" FOREIGN KEY ("metaAccountId") REFERENCES "BotifyMetaAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
