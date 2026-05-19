-- CreateEnum
CREATE TYPE "BotifyMessageRole" AS ENUM ('user', 'assistant', 'system');

-- CreateTable
CREATE TABLE "BotifyConversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotifyConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotifyMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "BotifyMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BotifyMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotifyConversation_tenantId_idx" ON "BotifyConversation"("tenantId");

-- CreateIndex
CREATE INDEX "BotifyConversation_tenantId_botId_idx" ON "BotifyConversation"("tenantId", "botId");

-- CreateIndex
CREATE INDEX "BotifyConversation_tenantId_updatedAt_idx" ON "BotifyConversation"("tenantId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BotifyConversation_tenantId_botId_contactPhone_key" ON "BotifyConversation"("tenantId", "botId", "contactPhone");

-- CreateIndex
CREATE INDEX "BotifyMessage_tenantId_conversationId_idx" ON "BotifyMessage"("tenantId", "conversationId");

-- CreateIndex
CREATE INDEX "BotifyMessage_conversationId_createdAt_idx" ON "BotifyMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "BotifyConversation" ADD CONSTRAINT "BotifyConversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotifyConversation" ADD CONSTRAINT "BotifyConversation_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotifyBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotifyMessage" ADD CONSTRAINT "BotifyMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotifyMessage" ADD CONSTRAINT "BotifyMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "BotifyConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
