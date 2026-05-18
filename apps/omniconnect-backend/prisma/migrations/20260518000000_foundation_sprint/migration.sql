-- DropIndex
DROP INDEX "Segment_name_key";

-- DropIndex
DROP INDEX "Contact_phone_key";

-- DropIndex
DROP INDEX "App_name_key";

-- DropIndex
DROP INDEX "LinesStock_phone_key";

-- DropIndex
DROP INDEX "Tag_name_key";

-- DropIndex
DROP INDEX "ControlPanel_segmentId_key";

-- AlterTable
ALTER TABLE "ConversationAIAnalysis" ADD COLUMN     "modelName" TEXT,
ADD COLUMN     "modelProvider" TEXT,
ADD COLUMN     "promptVersion" TEXT;

-- CreateTable
CREATE TABLE "AIUsageLog" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL DEFAULT 'default-tenant',
    "conversationId" INTEGER,
    "modelProvider" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "promptTokens" INTEGER NOT NULL,
    "completionTokens" INTEGER NOT NULL,
    "estimatedCost" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIUsageLog_tenantId_idx" ON "AIUsageLog"("tenantId");

-- CreateIndex
CREATE INDEX "AIUsageLog_createdAt_idx" ON "AIUsageLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Segment_tenantId_name_key" ON "Segment"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_tenantId_phone_key" ON "Contact"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "App_tenantId_name_key" ON "App"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LinesStock_tenantId_phone_key" ON "LinesStock"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_tenantId_name_key" ON "Tag"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ControlPanel_tenantId_segmentId_key" ON "ControlPanel"("tenantId", "segmentId");

-- AddForeignKey
ALTER TABLE "AIUsageLog" ADD CONSTRAINT "AIUsageLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

