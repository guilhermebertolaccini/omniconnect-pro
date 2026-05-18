import os
import re

base_dir = "apps/omniconnect-backend/src"
bridges = [
    {"name": "crm-bridge", "class_prefix": "CrmBridge", "route": "webhooks/crm"},
    {"name": "ads-bridge", "class_prefix": "AdsBridge", "route": "webhooks/ads"},
    {"name": "bot-bridge", "class_prefix": "BotBridge", "route": "webhooks/botify"},
]

for bridge in bridges:
    b_dir = os.path.join(base_dir, bridge["name"])
    os.makedirs(b_dir, exist_ok=True)
    
    # Service
    with open(os.path.join(b_dir, f'{bridge["name"]}.service.ts'), "w") as f:
        f.write(f'''import {{ Injectable }} from '@nestjs/common';

@Injectable()
export class {bridge["class_prefix"]}Service {{
  verifySignature(raw: any, signature: string, integrationId: string) {{
    // TODO: implement signature verification
    return true;
  }}

  async resolveTenantFromIntegration(integrationId: string) {{
    // TODO: implement tenant resolution
    return "default-tenant";
  }}
}}
''')

    # Controller
    with open(os.path.join(b_dir, f'{bridge["name"]}.controller.ts'), "w") as f:
        f.write(f'''import {{ Controller, Post, Body, Headers, HttpCode, BadRequestException }} from '@nestjs/common';
import {{ {bridge["class_prefix"]}Service }} from './{bridge["name"]}.service';

@Controller('{bridge["route"]}')
export class {bridge["class_prefix"]}Controller {{
  constructor(private readonly service: {bridge["class_prefix"]}Service) {{}}

  @Post()
  @HttpCode(200)
  async receive(
    @Body() raw: any,
    @Headers('x-signature') signature: string,
    @Headers('x-integration-id') integrationId: string,
  ) {{
    if (!signature || !integrationId) throw new BadRequestException('Missing headers');
    
    this.service.verifySignature(raw, signature, integrationId);
    const tenantId = await this.service.resolveTenantFromIntegration(integrationId);

    // TODO: queue processing
    return {{ received: true, tenantId }};
  }}
}}
''')

    # Module
    with open(os.path.join(b_dir, f'{bridge["name"]}.module.ts'), "w") as f:
        f.write(f'''import {{ Module }} from '@nestjs/common';
import {{ {bridge["class_prefix"]}Controller }} from './{bridge["name"]}.controller';
import {{ {bridge["class_prefix"]}Service }} from './{bridge["name"]}.service';

@Module({{
  controllers: [{bridge["class_prefix"]}Controller],
  providers: [{bridge["class_prefix"]}Service],
  exports: [{bridge["class_prefix"]}Service],
}})
export class {bridge["class_prefix"]}Module {{}}
''')

# Update app.module.ts
app_module_path = os.path.join(base_dir, "app.module.ts")
with open(app_module_path, "r") as f:
    app_module_content = f.read()

# Add imports
imports_to_add = ""
for bridge in bridges:
    if f'{bridge["class_prefix"]}Module' not in app_module_content:
        imports_to_add += f"import {{ {bridge['class_prefix']}Module }} from './{bridge['name']}/{bridge['name']}.module';\n"

app_module_content = app_module_content.replace(
    "import { InsightAiModule } from './insight-ai/insight-ai.module';",
    f"import {{ InsightAiModule }} from './insight-ai/insight-ai.module';\n{imports_to_add}"
)

# Add to imports array
modules_to_add = ""
for bridge in bridges:
    if f'{bridge["class_prefix"]}Module' not in app_module_content:
        # It's in the imports statement now, but need to add to the array
        modules_to_add += f"    {bridge['class_prefix']}Module,\n"

app_module_content = app_module_content.replace(
    "InsightAiModule,",
    f"InsightAiModule,\n{modules_to_add}"
)

with open(app_module_path, "w") as f:
    f.write(app_module_content)

print("Bridges generated and added to app.module.ts")
