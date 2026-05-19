-- Botify domain (ADR-0002 G1) — bots + flows tenant-scoped

-- CreateTable
CREATE TABLE "BotifyBot" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "externalSourceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotifyBot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BotifyFlow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "botId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "triggerKeyword" TEXT,
    "externalSourceId" TEXT,
    "draftGraph" JSONB,
    "publishedGraph" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotifyFlow_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BotifyBot_tenantId_idx" ON "BotifyBot"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BotifyBot_tenantId_externalSourceId_key" ON "BotifyBot"("tenantId", "externalSourceId");

-- CreateIndex
CREATE INDEX "BotifyFlow_tenantId_idx" ON "BotifyFlow"("tenantId");

-- CreateIndex
CREATE INDEX "BotifyFlow_tenantId_botId_idx" ON "BotifyFlow"("tenantId", "botId");

-- CreateIndex
CREATE UNIQUE INDEX "BotifyFlow_tenantId_externalSourceId_key" ON "BotifyFlow"("tenantId", "externalSourceId");

-- AddForeignKey
ALTER TABLE "BotifyBot" ADD CONSTRAINT "BotifyBot_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotifyFlow" ADD CONSTRAINT "BotifyFlow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BotifyFlow" ADD CONSTRAINT "BotifyFlow_botId_fkey" FOREIGN KEY ("botId") REFERENCES "BotifyBot"("id") ON DELETE CASCADE ON UPDATE CASCADE;
