import re

schema_path = "apps/omniconnect-backend/prisma/schema.prisma"

with open(schema_path, "r") as f:
    content = f.read()

# Add Tenant and UserTenant models at the end
tenant_models = """

model Tenant {
  id          String   @id @default(uuid())
  name        String
  document    String?
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  users             UserTenant[]
  segments          Segment[]
  tabulations       Tabulation[]
  contacts          Contact[]
  campaigns         Campaign[]
  blockLists        BlockList[]
  apps              App[]
  linesStocks       LinesStock[]
  lineOperators     LineOperator[]
  conversations     Conversation[]
  tags              Tag[]
  apiLogs           ApiLog[]
  templates         Template[]
  templateMessages  TemplateMessage[]
  controlPanels     ControlPanel[]
  contactRepescagems ContactRepescagem[]
  sendHistories     SendHistory[]
  messageQueues     MessageQueue[]
  systemEvents      SystemEvent[]
}

model UserTenant {
  id        String   @id @default(uuid())
  userId    Int
  tenantId  String
  role      Role

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  @@unique([userId, tenantId])
  @@index([userId])
  @@index([tenantId])
}
"""

models_to_update = [
    "Segment", "Tabulation", "Contact", "Campaign", "BlockList", "App", 
    "LinesStock", "LineOperator", "Conversation", "Tag", "ApiLog", 
    "Template", "TemplateMessage", "ControlPanel", "ContactRepescagem", 
    "SendHistory", "MessageQueue", "SystemEvent"
]

for model in models_to_update:
    # Find the end of the model to add the relation
    # A model starts with "model ModelName {" and ends with "}"
    pattern = r"(model " + model + r" \{.*?)(\n\})"
    
    def replacer(match):
        body = match.group(1)
        # Add tenantId and relation
        injection = "\n  tenantId String\n  tenant   Tenant @relation(fields: [tenantId], references: [id])\n"
        
        # Add @@index([tenantId]) if there's an @@index or at the end
        if "@@index" in body or "@@unique" in body:
            # We append it before the closing brace
            injection += "\n  @@index([tenantId])"
        else:
            injection += "\n\n  @@index([tenantId])"
            
        return body + injection + match.group(2)
        
    content = re.sub(pattern, replacer, content, flags=re.DOTALL)

# Handle User separately to add UserTenant relation instead of Tenant relation
user_pattern = r"(model User \{.*?)(\n\})"
def user_replacer(match):
    return match.group(1) + "\n  tenants UserTenant[]\n" + match.group(2)
content = re.sub(user_pattern, user_replacer, content, flags=re.DOTALL)

content += tenant_models

with open(schema_path, "w") as f:
    f.write(content)
