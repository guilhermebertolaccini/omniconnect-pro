import re

schema_path = "apps/omniconnect-backend/prisma/schema.prisma"

with open(schema_path, "r") as f:
    content = f.read()

ai_model = """
// Análises de IA sobre conversas comerciais.
// Esta tabela permite gerar métricas mesmo quando o CRM/tabulação manual está incompleto.
model ConversationAIAnalysis {
  id                                Int      @id @default(autoincrement())
  tenantId                          String
  contactPhone                      String
  contactName                       String?
  segment                           Int?
  userId                            Int?
  userName                          String?
  conversationStart                 DateTime?
  conversationEnd                   DateTime?
  messageCount                      Int      @default(0)

  summary                           String   @db.Text
  leadIntent                        String
  opportunityStatus                 String
  risk                              String
  mainObjection                     String?
  objections                        String?  @db.Text
  sellerQualityScore                Int      @default(0)
  responseQualityScore              Int      @default(0)
  qualificationScore                Int      @default(0)
  followUpScore                     Int      @default(0)
  firstResponseMinutes              Int?
  hasSellerAbandonment              Boolean  @default(false)
  hasLeadAbandonment                Boolean  @default(false)
  hasQualification                  Boolean  @default(false)
  hasSchedulingAttempt              Boolean  @default(false)
  hasProposalOrSimulationAttempt    Boolean  @default(false)
  lostOpportunity                   Boolean  @default(false)
  nextBestAction                    String   @db.Text
  evidence                          String?  @db.Text
  metrics                           String?  @db.Text
  rawResult                         String?  @db.Text
  createdAt                         DateTime @default(now())
  updatedAt                         DateTime @updatedAt

  tenant                            Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@index([tenantId])
  @@index([contactPhone])
  @@index([segment])
  @@index([userId])
  @@index([leadIntent])
  @@index([opportunityStatus])
  @@index([risk])
  @@index([lostOpportunity])
  @@index([createdAt])
}
"""

# Insert the AI model right before model Tenant
content = content.replace("model Tenant {", ai_model + "\nmodel Tenant {")

# Add the relation inside model Tenant
def tenant_replacer(match):
    return match.group(1) + "\n  conversationAIAnalyses ConversationAIAnalysis[]\n" + match.group(2)

content = re.sub(r"(model Tenant \{.*?)(\n\})", tenant_replacer, content, flags=re.DOTALL)

with open(schema_path, "w") as f:
    f.write(content)
