-- CreateTable
CREATE TABLE "ConversationAIAnalysis" (
    "id" SERIAL NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT,
    "segment" INTEGER,
    "userId" INTEGER,
    "userName" TEXT,
    "conversationStart" TIMESTAMP(3),
    "conversationEnd" TIMESTAMP(3),
    "messageCount" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL,
    "leadIntent" TEXT NOT NULL,
    "opportunityStatus" TEXT NOT NULL,
    "risk" TEXT NOT NULL,
    "mainObjection" TEXT,
    "objections" TEXT,
    "sellerQualityScore" INTEGER NOT NULL DEFAULT 0,
    "responseQualityScore" INTEGER NOT NULL DEFAULT 0,
    "qualificationScore" INTEGER NOT NULL DEFAULT 0,
    "followUpScore" INTEGER NOT NULL DEFAULT 0,
    "firstResponseMinutes" INTEGER,
    "hasSellerAbandonment" BOOLEAN NOT NULL DEFAULT false,
    "hasLeadAbandonment" BOOLEAN NOT NULL DEFAULT false,
    "hasQualification" BOOLEAN NOT NULL DEFAULT false,
    "hasSchedulingAttempt" BOOLEAN NOT NULL DEFAULT false,
    "hasProposalOrSimulationAttempt" BOOLEAN NOT NULL DEFAULT false,
    "lostOpportunity" BOOLEAN NOT NULL DEFAULT false,
    "nextBestAction" TEXT NOT NULL,
    "evidence" TEXT,
    "metrics" TEXT,
    "rawResult" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversationAIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversationAIAnalysis_tenantId_idx" ON "ConversationAIAnalysis"("tenantId");

-- CreateIndex
CREATE INDEX "ConversationAIAnalysis_contactPhone_idx" ON "ConversationAIAnalysis"("contactPhone");

-- CreateIndex
CREATE INDEX "ConversationAIAnalysis_segment_idx" ON "ConversationAIAnalysis"("segment");

-- CreateIndex
CREATE INDEX "ConversationAIAnalysis_userId_idx" ON "ConversationAIAnalysis"("userId");

-- CreateIndex
CREATE INDEX "ConversationAIAnalysis_leadIntent_idx" ON "ConversationAIAnalysis"("leadIntent");

-- CreateIndex
CREATE INDEX "ConversationAIAnalysis_opportunityStatus_idx" ON "ConversationAIAnalysis"("opportunityStatus");

-- CreateIndex
CREATE INDEX "ConversationAIAnalysis_risk_idx" ON "ConversationAIAnalysis"("risk");

-- CreateIndex
CREATE INDEX "ConversationAIAnalysis_lostOpportunity_idx" ON "ConversationAIAnalysis"("lostOpportunity");

-- CreateIndex
CREATE INDEX "ConversationAIAnalysis_createdAt_idx" ON "ConversationAIAnalysis"("createdAt");

-- AddForeignKey
ALTER TABLE "ConversationAIAnalysis" ADD CONSTRAINT "ConversationAIAnalysis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
