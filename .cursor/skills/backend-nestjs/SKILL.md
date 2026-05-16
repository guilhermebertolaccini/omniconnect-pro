---
name: backend-nestjs
description: >-
  Implement a new NestJS feature in apps/omniconnect-backend following the
  modular architecture, tenant isolation, DTO validation, auth/roles guards,
  Prisma best practices, and event emission patterns. Use when the user asks
  to create a new module, controller, service, endpoint, or feature in the
  backend.
---

# Backend Feature Implementation

## Pre-flight checklist

Before writing code, answer:

- [ ] Which **module** does this belong to? (existing or new under `apps/omniconnect-backend/src/`)
- [ ] What's the **tenant scope**? Which entities need `tenantId`?
- [ ] What **permissions** apply? (`Role.admin`, `Role.supervisor`, `Role.operator`, `Role.ativador`, `Role.digital`)
- [ ] What **DTOs** are needed?
- [ ] What **database changes**?
- [ ] What **events** should be emitted?
- [ ] What **tests** are mandatory?

## File structure (one module)

```
apps/omniconnect-backend/src/<module>/
├── <module>.module.ts
├── <module>.controller.ts
├── <module>.service.ts
├── dto/
│   ├── create-<entity>.dto.ts
│   ├── update-<entity>.dto.ts
│   └── list-<entity>.dto.ts
├── entities/                   # optional: mappers Prisma → response
├── <module>.service.spec.ts
└── <module>.controller.spec.ts
```

## Controller — thin, guarded

```typescript
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Leads')
@ApiBearerAuth()
@Controller('leads')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LeadsController {
  constructor(private readonly leadsService: LeadsService) {}

  @Get()
  @Roles(Role.admin, Role.supervisor, Role.operator, Role.digital)
  @ApiOperation({ summary: 'List leads scoped to current tenant' })
  list(@CurrentUser() user, @Query() dto: ListLeadsDto) {
    return this.leadsService.list(user.tenantId, user, dto);
  }

  @Post()
  @Roles(Role.admin, Role.supervisor, Role.digital)
  @ApiOperation({ summary: 'Create lead in current tenant' })
  create(@CurrentUser() user, @Body() dto: CreateLeadDto) {
    return this.leadsService.create(user.tenantId, dto, user.id);
  }
}
```

> Papéis reais (enum `Role` em `@prisma/client`): `admin`, `operator`, `supervisor`, `ativador`, `digital`. **Não use** `'manager'`, `'seller'`, `'viewer'` — não existem.

> Usar **`@CurrentUser()`** (em `common/decorators/`) é o padrão idiomático do projeto. Evite `@Req() req` direto.

## Service — business logic + tenant filter

```typescript
@Injectable()
export class LeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
  ) {}

  async list(tenantId: string, dto: ListLeadsDto) {
    return this.prisma.lead.findMany({
      where: { tenantId, ...dto.toWhere() },             // 🔒
      take: dto.pageSize,
      skip: dto.page * dto.pageSize,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateLeadDto, actorId: string) {
    const lead = await this.prisma.lead.create({ data: { tenantId, ...dto } });
    await this.events.emit({
      eventType: 'lead.created',
      tenantId,
      entityType: 'Lead',
      entityId: lead.id,
      actorId,
      occurredAt: new Date().toISOString(),
      metadata: { source: lead.source },
    });
    return lead;
  }
}
```

## DTO with validation

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeadDto {
  @ApiProperty({ description: 'Contact name', maxLength: 120 })
  @IsString() @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ enum: ['whatsapp', 'meta_ads', 'google_ads', 'organic'] })
  @IsOptional() @IsEnum(['whatsapp', 'meta_ads', 'google_ads', 'organic'])
  source?: string;
}
```

> `ValidationPipe` é **global** em `main.ts` com `whitelist + forbidNonWhitelisted + transform`. Não precisa `@UsePipes()` no controller.

## Module wiring

```typescript
@Module({
  controllers: [LeadsController],
  providers: [LeadsService, PrismaService, EventsService],
  exports: [LeadsService],
})
export class LeadsModule {}
```

Then add `LeadsModule` to `app.module.ts` imports.

## Heavy/async operations

For LLM calls, broadcast send, imports, attribution: **use BullMQ**, never inline (projeto já tem `bullmq` + `bull` instalados; prefira BullMQ em código novo):

```typescript
await this.queue.add('analyze-conversation', { tenantId, conversationId }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
});
```

Para chamadas a serviços externos instáveis (OpenAI, WhatsApp Cloud), usar **circuit breaker** via módulo `circuit-breaker/` (opossum) já existente.

## What NOT to do

- ❌ Logic in controller
- ❌ `prisma.<model>.findMany()` without `where: { tenantId }`
- ❌ `(this.prisma as any)` casts
- ❌ Returning raw Prisma entity with sensitive fields
- ❌ `console.log` — use `Logger` from `@nestjs/common` (ou `winston` via `nest-winston` que o projeto usa)
- ❌ Sync LLM call in HTTP request
- ❌ Adicionar `@nestjs/throttler` — usar módulo `rate-limiting/` interno
- ❌ Adicionar pacotes novos quando já existe equivalente (`humanization`, `spintax`, `phone-validation`, `circuit-breaker`, etc.)

## Tests required

- Unit: service methods (mock prisma)
- Integration: controller with real Postgres test DB
- **Tenant isolation test** (always)

## See also

- `.cursor/rules/10-nestjs-backend.mdc`
- `.cursor/rules/12-api-standards.mdc`
- `.cursor/rules/13-events.mdc`
