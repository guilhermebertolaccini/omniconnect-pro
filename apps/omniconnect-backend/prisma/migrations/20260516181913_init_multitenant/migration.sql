-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'operator', 'supervisor', 'ativador', 'digital');

-- CreateEnum
CREATE TYPE "Status" AS ENUM ('Online', 'Offline');

-- CreateEnum
CREATE TYPE "LineStatus" AS ENUM ('active', 'ban');

-- CreateEnum
CREATE TYPE "Sender" AS ENUM ('operator', 'contact');

-- CreateEnum
CREATE TYPE "Speed" AS ENUM ('fast', 'medium', 'slow');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "segment" INTEGER,
    "line" INTEGER,
    "status" "Status" NOT NULL DEFAULT 'Offline',
    "oneToOneActive" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Segment" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Segment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tabulation" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "isCPC" BOOLEAN NOT NULL DEFAULT false,
    "isEnvio" BOOLEAN NOT NULL DEFAULT true,
    "isEntregue" BOOLEAN NOT NULL DEFAULT true,
    "isLido" BOOLEAN NOT NULL DEFAULT true,
    "isRetorno" BOOLEAN NOT NULL DEFAULT true,
    "isCPCProd" BOOLEAN NOT NULL DEFAULT false,
    "isBoleto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Tabulation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "segment" INTEGER,
    "cpf" TEXT,
    "contract" TEXT,
    "isCPC" BOOLEAN NOT NULL DEFAULT false,
    "lastCPCAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Campaign" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactSegment" INTEGER,
    "dateTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lineReceptor" INTEGER,
    "response" BOOLEAN NOT NULL DEFAULT false,
    "speed" "Speed" NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "useTemplate" BOOLEAN NOT NULL DEFAULT false,
    "templateId" INTEGER,
    "templateVariables" TEXT,
    "endTime" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BlockList" (
    "id" SERIAL NOT NULL,
    "name" TEXT,
    "phone" TEXT,
    "cpf" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "BlockList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "App" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "accessToken" TEXT NOT NULL,
    "appSecret" TEXT,
    "webhookVerifyToken" TEXT,
    "wabaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "App_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinesStock" (
    "id" SERIAL NOT NULL,
    "phone" TEXT NOT NULL,
    "lineStatus" "LineStatus" NOT NULL DEFAULT 'active',
    "segment" INTEGER,
    "linkedTo" INTEGER,
    "oficial" BOOLEAN NOT NULL DEFAULT true,
    "appId" INTEGER NOT NULL,
    "numberId" TEXT NOT NULL,
    "receiveMedia" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "LinesStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LineOperator" (
    "id" SERIAL NOT NULL,
    "lineId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "LineOperator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" SERIAL NOT NULL,
    "contactName" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "segment" INTEGER,
    "userName" TEXT,
    "userLine" INTEGER,
    "userId" INTEGER,
    "message" TEXT NOT NULL,
    "sender" "Sender" NOT NULL,
    "datetime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tabulation" INTEGER,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "mediaUrl" TEXT,
    "messageId" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tag" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "segment" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiLog" (
    "id" SERIAL NOT NULL,
    "endpoint" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "requestPayload" TEXT NOT NULL,
    "responsePayload" TEXT NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'pt_BR',
    "category" TEXT NOT NULL DEFAULT 'MARKETING',
    "segmentId" INTEGER,
    "lineId" INTEGER,
    "namespace" TEXT,
    "status" TEXT NOT NULL DEFAULT 'APPROVED',
    "headerType" TEXT,
    "headerContent" TEXT,
    "bodyText" TEXT NOT NULL,
    "footerText" TEXT,
    "buttons" TEXT,
    "variables" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateMessage" (
    "id" SERIAL NOT NULL,
    "templateId" INTEGER NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT,
    "lineId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SENT',
    "messageId" TEXT,
    "variables" TEXT,
    "errorMessage" TEXT,
    "campaignId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "TemplateMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ControlPanel" (
    "id" SERIAL NOT NULL,
    "segmentId" INTEGER,
    "blockPhrasesEnabled" BOOLEAN NOT NULL DEFAULT true,
    "blockPhrases" TEXT,
    "blockTabulationId" INTEGER,
    "cpcCooldownEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cpcCooldownHours" INTEGER NOT NULL DEFAULT 24,
    "resendCooldownEnabled" BOOLEAN NOT NULL DEFAULT true,
    "resendCooldownHours" INTEGER NOT NULL DEFAULT 24,
    "repescagemEnabled" BOOLEAN NOT NULL DEFAULT false,
    "repescagemMaxMessages" INTEGER NOT NULL DEFAULT 2,
    "repescagemCooldownHours" INTEGER NOT NULL DEFAULT 24,
    "repescagemMaxAttempts" INTEGER NOT NULL DEFAULT 2,
    "activeLines" TEXT,
    "autoMessageEnabled" BOOLEAN NOT NULL DEFAULT false,
    "autoMessageHours" INTEGER NOT NULL DEFAULT 24,
    "autoMessageText" TEXT,
    "autoMessageMaxAttempts" INTEGER NOT NULL DEFAULT 1,
    "conversationFilterDays" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ControlPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContactRepescagem" (
    "id" SERIAL NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "messagesCount" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "permanentBlock" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "ContactRepescagem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SendHistory" (
    "id" SERIAL NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "campaignId" INTEGER,
    "lineId" INTEGER,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "SendHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageQueue" (
    "id" SERIAL NOT NULL,
    "contactPhone" TEXT NOT NULL,
    "contactName" TEXT,
    "message" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "mediaUrl" TEXT,
    "segment" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3),
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "MessageQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemEvent" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "data" TEXT,
    "userId" INTEGER,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "tenantId" TEXT NOT NULL,

    CONSTRAINT "SystemEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "document" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserTenant" (
    "id" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "tenantId" TEXT NOT NULL,
    "role" "Role" NOT NULL,

    CONSTRAINT "UserTenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_segment_idx" ON "User"("segment");

-- CreateIndex
CREATE INDEX "User_line_idx" ON "User"("line");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Segment_name_key" ON "Segment"("name");

-- CreateIndex
CREATE INDEX "Segment_name_idx" ON "Segment"("name");

-- CreateIndex
CREATE INDEX "Segment_tenantId_idx" ON "Segment"("tenantId");

-- CreateIndex
CREATE INDEX "Tabulation_name_idx" ON "Tabulation"("name");

-- CreateIndex
CREATE INDEX "Tabulation_tenantId_idx" ON "Tabulation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_phone_key" ON "Contact"("phone");

-- CreateIndex
CREATE INDEX "Contact_phone_idx" ON "Contact"("phone");

-- CreateIndex
CREATE INDEX "Contact_cpf_idx" ON "Contact"("cpf");

-- CreateIndex
CREATE INDEX "Contact_segment_idx" ON "Contact"("segment");

-- CreateIndex
CREATE INDEX "Contact_isCPC_idx" ON "Contact"("isCPC");

-- CreateIndex
CREATE INDEX "Contact_tenantId_idx" ON "Contact"("tenantId");

-- CreateIndex
CREATE INDEX "Campaign_contactPhone_idx" ON "Campaign"("contactPhone");

-- CreateIndex
CREATE INDEX "Campaign_contactSegment_idx" ON "Campaign"("contactSegment");

-- CreateIndex
CREATE INDEX "Campaign_lineReceptor_idx" ON "Campaign"("lineReceptor");

-- CreateIndex
CREATE INDEX "Campaign_response_idx" ON "Campaign"("response");

-- CreateIndex
CREATE INDEX "Campaign_dateTime_idx" ON "Campaign"("dateTime");

-- CreateIndex
CREATE INDEX "Campaign_templateId_idx" ON "Campaign"("templateId");

-- CreateIndex
CREATE INDEX "Campaign_name_idx" ON "Campaign"("name");

-- CreateIndex
CREATE INDEX "Campaign_tenantId_idx" ON "Campaign"("tenantId");

-- CreateIndex
CREATE INDEX "BlockList_phone_idx" ON "BlockList"("phone");

-- CreateIndex
CREATE INDEX "BlockList_cpf_idx" ON "BlockList"("cpf");

-- CreateIndex
CREATE INDEX "BlockList_tenantId_idx" ON "BlockList"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "App_name_key" ON "App"("name");

-- CreateIndex
CREATE INDEX "App_name_idx" ON "App"("name");

-- CreateIndex
CREATE INDEX "App_tenantId_idx" ON "App"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LinesStock_phone_key" ON "LinesStock"("phone");

-- CreateIndex
CREATE INDEX "LinesStock_phone_idx" ON "LinesStock"("phone");

-- CreateIndex
CREATE INDEX "LinesStock_lineStatus_idx" ON "LinesStock"("lineStatus");

-- CreateIndex
CREATE INDEX "LinesStock_segment_idx" ON "LinesStock"("segment");

-- CreateIndex
CREATE INDEX "LinesStock_linkedTo_idx" ON "LinesStock"("linkedTo");

-- CreateIndex
CREATE INDEX "LinesStock_numberId_idx" ON "LinesStock"("numberId");

-- CreateIndex
CREATE INDEX "LinesStock_createdBy_idx" ON "LinesStock"("createdBy");

-- CreateIndex
CREATE INDEX "LinesStock_appId_idx" ON "LinesStock"("appId");

-- CreateIndex
CREATE INDEX "LinesStock_tenantId_idx" ON "LinesStock"("tenantId");

-- CreateIndex
CREATE INDEX "LineOperator_lineId_idx" ON "LineOperator"("lineId");

-- CreateIndex
CREATE INDEX "LineOperator_userId_idx" ON "LineOperator"("userId");

-- CreateIndex
CREATE INDEX "LineOperator_tenantId_idx" ON "LineOperator"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "LineOperator_lineId_userId_key" ON "LineOperator"("lineId", "userId");

-- CreateIndex
CREATE INDEX "Conversation_contactPhone_idx" ON "Conversation"("contactPhone");

-- CreateIndex
CREATE INDEX "Conversation_segment_idx" ON "Conversation"("segment");

-- CreateIndex
CREATE INDEX "Conversation_userLine_idx" ON "Conversation"("userLine");

-- CreateIndex
CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");

-- CreateIndex
CREATE INDEX "Conversation_tabulation_idx" ON "Conversation"("tabulation");

-- CreateIndex
CREATE INDEX "Conversation_datetime_idx" ON "Conversation"("datetime");

-- CreateIndex
CREATE INDEX "Conversation_archived_datetime_idx" ON "Conversation"("archived", "datetime");

-- CreateIndex
CREATE INDEX "Conversation_archivedAt_idx" ON "Conversation"("archivedAt");

-- CreateIndex
CREATE INDEX "Conversation_messageId_idx" ON "Conversation"("messageId");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_idx" ON "Conversation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "Tag_name_idx" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "Tag_segment_idx" ON "Tag"("segment");

-- CreateIndex
CREATE INDEX "Tag_tenantId_idx" ON "Tag"("tenantId");

-- CreateIndex
CREATE INDEX "ApiLog_endpoint_idx" ON "ApiLog"("endpoint");

-- CreateIndex
CREATE INDEX "ApiLog_method_idx" ON "ApiLog"("method");

-- CreateIndex
CREATE INDEX "ApiLog_statusCode_idx" ON "ApiLog"("statusCode");

-- CreateIndex
CREATE INDEX "ApiLog_createdAt_idx" ON "ApiLog"("createdAt");

-- CreateIndex
CREATE INDEX "ApiLog_tenantId_idx" ON "ApiLog"("tenantId");

-- CreateIndex
CREATE INDEX "Template_name_idx" ON "Template"("name");

-- CreateIndex
CREATE INDEX "Template_segmentId_idx" ON "Template"("segmentId");

-- CreateIndex
CREATE INDEX "Template_status_idx" ON "Template"("status");

-- CreateIndex
CREATE INDEX "Template_category_idx" ON "Template"("category");

-- CreateIndex
CREATE INDEX "Template_tenantId_idx" ON "Template"("tenantId");

-- CreateIndex
CREATE INDEX "TemplateMessage_templateId_idx" ON "TemplateMessage"("templateId");

-- CreateIndex
CREATE INDEX "TemplateMessage_contactPhone_idx" ON "TemplateMessage"("contactPhone");

-- CreateIndex
CREATE INDEX "TemplateMessage_lineId_idx" ON "TemplateMessage"("lineId");

-- CreateIndex
CREATE INDEX "TemplateMessage_status_idx" ON "TemplateMessage"("status");

-- CreateIndex
CREATE INDEX "TemplateMessage_campaignId_idx" ON "TemplateMessage"("campaignId");

-- CreateIndex
CREATE INDEX "TemplateMessage_createdAt_idx" ON "TemplateMessage"("createdAt");

-- CreateIndex
CREATE INDEX "TemplateMessage_tenantId_idx" ON "TemplateMessage"("tenantId");

-- CreateIndex
CREATE INDEX "ControlPanel_segmentId_idx" ON "ControlPanel"("segmentId");

-- CreateIndex
CREATE INDEX "ControlPanel_tenantId_idx" ON "ControlPanel"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ControlPanel_segmentId_key" ON "ControlPanel"("segmentId");

-- CreateIndex
CREATE INDEX "ContactRepescagem_contactPhone_idx" ON "ContactRepescagem"("contactPhone");

-- CreateIndex
CREATE INDEX "ContactRepescagem_operatorId_idx" ON "ContactRepescagem"("operatorId");

-- CreateIndex
CREATE INDEX "ContactRepescagem_blockedUntil_idx" ON "ContactRepescagem"("blockedUntil");

-- CreateIndex
CREATE INDEX "ContactRepescagem_tenantId_idx" ON "ContactRepescagem"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "ContactRepescagem_contactPhone_operatorId_key" ON "ContactRepescagem"("contactPhone", "operatorId");

-- CreateIndex
CREATE INDEX "SendHistory_contactPhone_idx" ON "SendHistory"("contactPhone");

-- CreateIndex
CREATE INDEX "SendHistory_sentAt_idx" ON "SendHistory"("sentAt");

-- CreateIndex
CREATE INDEX "SendHistory_tenantId_idx" ON "SendHistory"("tenantId");

-- CreateIndex
CREATE INDEX "MessageQueue_status_idx" ON "MessageQueue"("status");

-- CreateIndex
CREATE INDEX "MessageQueue_contactPhone_idx" ON "MessageQueue"("contactPhone");

-- CreateIndex
CREATE INDEX "MessageQueue_segment_idx" ON "MessageQueue"("segment");

-- CreateIndex
CREATE INDEX "MessageQueue_createdAt_idx" ON "MessageQueue"("createdAt");

-- CreateIndex
CREATE INDEX "MessageQueue_tenantId_idx" ON "MessageQueue"("tenantId");

-- CreateIndex
CREATE INDEX "SystemEvent_type_idx" ON "SystemEvent"("type");

-- CreateIndex
CREATE INDEX "SystemEvent_module_idx" ON "SystemEvent"("module");

-- CreateIndex
CREATE INDEX "SystemEvent_userId_idx" ON "SystemEvent"("userId");

-- CreateIndex
CREATE INDEX "SystemEvent_severity_idx" ON "SystemEvent"("severity");

-- CreateIndex
CREATE INDEX "SystemEvent_createdAt_idx" ON "SystemEvent"("createdAt");

-- CreateIndex
CREATE INDEX "SystemEvent_tenantId_idx" ON "SystemEvent"("tenantId");

-- CreateIndex
CREATE INDEX "UserTenant_userId_idx" ON "UserTenant"("userId");

-- CreateIndex
CREATE INDEX "UserTenant_tenantId_idx" ON "UserTenant"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "UserTenant_userId_tenantId_key" ON "UserTenant"("userId", "tenantId");

-- AddForeignKey
ALTER TABLE "Segment" ADD CONSTRAINT "Segment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tabulation" ADD CONSTRAINT "Tabulation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BlockList" ADD CONSTRAINT "BlockList_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "App" ADD CONSTRAINT "App_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinesStock" ADD CONSTRAINT "LinesStock_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinesStock" ADD CONSTRAINT "LinesStock_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineOperator" ADD CONSTRAINT "LineOperator_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "LinesStock"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineOperator" ADD CONSTRAINT "LineOperator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LineOperator" ADD CONSTRAINT "LineOperator_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApiLog" ADD CONSTRAINT "ApiLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "LinesStock"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateMessage" ADD CONSTRAINT "TemplateMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ControlPanel" ADD CONSTRAINT "ControlPanel_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContactRepescagem" ADD CONSTRAINT "ContactRepescagem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SendHistory" ADD CONSTRAINT "SendHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageQueue" ADD CONSTRAINT "MessageQueue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemEvent" ADD CONSTRAINT "SystemEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenant" ADD CONSTRAINT "UserTenant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserTenant" ADD CONSTRAINT "UserTenant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
