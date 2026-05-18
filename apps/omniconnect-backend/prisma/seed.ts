import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Dev / seed tenant. In production, real tenants come from /tenants flow.
const SEED_TENANT_ID = 'default-tenant';
const SEED_TENANT_NAME = 'Default Tenant (seed)';

async function ensureSeedTenant() {
  return prisma.tenant.upsert({
    where: { id: SEED_TENANT_ID },
    update: { isActive: true },
    create: {
      id: SEED_TENANT_ID,
      name: SEED_TENANT_NAME,
      isActive: true,
    },
  });
}

async function main() {
  console.log('🌱 Iniciando seed...');

  const tenant = await ensureSeedTenant();
  console.log('✅ Tenant garantido:', tenant.id);

  const segment = await prisma.segment.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Padrão' } },
    update: {},
    create: {
      name: 'Padrão',
      tenantId: tenant.id,
    },
  });

  console.log('✅ Segmento criado:', segment.name);

  const adminPassword = await argon2.hash('<@P0d3ro50ço#a$S@@');
  const admin = await prisma.user.upsert({
    where: { email: 'admin@vend.com' },
    update: {},
    create: {
      name: 'Admin',
      email: 'admin@vend.com',
      password: adminPassword,
      role: 'admin',
      status: 'Offline',
    },
  });

  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: admin.id, tenantId: tenant.id } },
    update: { role: 'admin' },
    create: { userId: admin.id, tenantId: tenant.id, role: 'admin' },
  });

  console.log('✅ Admin criado:', admin.email);

  const supervisorPassword = await argon2.hash('..?SuP3RV15o4)(ALt');
  const supervisor = await prisma.user.upsert({
    where: { email: 'supervisor@vend.com' },
    update: {},
    create: {
      name: 'Supervisor',
      email: 'supervisor@vend.com',
      password: supervisorPassword,
      role: 'supervisor',
      segment: segment.id,
      status: 'Offline',
    },
  });

  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: supervisor.id, tenantId: tenant.id } },
    update: { role: 'supervisor' },
    create: { userId: supervisor.id, tenantId: tenant.id, role: 'supervisor' },
  });

  console.log('✅ Supervisor criado:', supervisor.email);

  const operatorPassword = await argon2.hash('ç~^OpeR4t0R=3}}ooo');
  const operator = await prisma.user.upsert({
    where: { email: 'operator@vend.com' },
    update: {},
    create: {
      name: 'Operador',
      email: 'operator@vend.com',
      password: operatorPassword,
      role: 'operator',
      segment: segment.id,
      status: 'Offline',
    },
  });

  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: operator.id, tenantId: tenant.id } },
    update: { role: 'operator' },
    create: { userId: operator.id, tenantId: tenant.id, role: 'operator' },
  });

  console.log('✅ Operator criado:', operator.email);

  const tags = await Promise.all([
    prisma.tag.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'emp1' } },
      update: {},
      create: {
        name: 'emp1',
        description: 'Tag de exemplo para carteira 1',
        segment: segment.id,
        tenantId: tenant.id,
      },
    }),
    prisma.tag.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: 'emp2' } },
      update: {},
      create: {
        name: 'emp2',
        description: 'Tag de exemplo para carteira 2',
        segment: segment.id,
        tenantId: tenant.id,
      },
    }),
  ]);

  console.log('✅ Tags criadas:', tags.length);

  console.log('✅ Seed concluído com sucesso!');
  console.log('\n📋 Dados criados:');
  console.log('👥 Usuários:');
  console.log('   Admin:      admin@vend.com | <@P0d3ro50ço#a$S@@');
  console.log('   Supervisor: supervisor@vend.com | ..?SuP3RV15o4)(ALt');
  console.log('   Operator:   operator@vend.com | ç~^OpeR4t0R=3}}ooo');
  console.log('\n🏷️  Tags:');
  console.log('   emp1, emp2');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
