import re

schema_path = "apps/omniconnect-backend/prisma/schema.prisma"

with open(schema_path, "r") as f:
    content = f.read()

# Replace 'tenantId String' with 'tenantId String @default("default-tenant")'
# but ensure we don't mess up Tenant or UserTenant or if it's already there.
content = re.sub(r"tenantId\s+String\n", r'tenantId String @default("default-tenant")\n', content)

with open(schema_path, "w") as f:
    f.write(content)
