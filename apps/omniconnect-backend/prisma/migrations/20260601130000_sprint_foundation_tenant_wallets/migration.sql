-- Sprint Foundation — F2: TenantWallet
-- Orçamento por tenant + sub-budgets por canal + histórico de transações.
-- Pré-requisito de execução da Régua de Acionamento (ADR-0005).
-- Todos os valores em `cents` (Int) — sem ponto flutuante, sem FX baked.

CREATE TYPE "WalletResetCycle" AS ENUM ('monthly', 'weekly');
CREATE TYPE "WalletGuardMode" AS ENUM ('hard_block', 'soft_block');
CREATE TYPE "WalletTransactionType" AS ENUM ('debit', 'credit', 'refund');

CREATE TABLE "TenantWallet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "totalBudgetCents" INTEGER NOT NULL DEFAULT 0,
    "usedBudgetCents" INTEGER NOT NULL DEFAULT 0,
    "resetCycle" "WalletResetCycle" NOT NULL DEFAULT 'monthly',
    "resetAt" TIMESTAMP(3),
    "guardMode" "WalletGuardMode" NOT NULL DEFAULT 'soft_block',
    "realtimeDebit" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TenantWallet_tenantId_key" ON "TenantWallet"("tenantId");
CREATE INDEX "TenantWallet_tenantId_idx" ON "TenantWallet"("tenantId");

ALTER TABLE "TenantWallet" ADD CONSTRAINT "TenantWallet_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WalletChannelCost" (
    "id" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "costCents" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WalletChannelCost_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WalletChannelCost_walletId_channel_key" ON "WalletChannelCost"("walletId", "channel");

ALTER TABLE "WalletChannelCost" ADD CONSTRAINT "WalletChannelCost_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "TenantWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "WalletTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "type" "WalletTransactionType" NOT NULL,
    "channel" TEXT,
    "amountCents" INTEGER NOT NULL,
    "refType" TEXT,
    "refId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WalletTransaction_tenantId_idx" ON "WalletTransaction"("tenantId");
CREATE INDEX "WalletTransaction_tenantId_createdAt_idx" ON "WalletTransaction"("tenantId", "createdAt");
CREATE INDEX "WalletTransaction_walletId_type_idx" ON "WalletTransaction"("walletId", "type");

ALTER TABLE "WalletTransaction" ADD CONSTRAINT "WalletTransaction_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "TenantWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
