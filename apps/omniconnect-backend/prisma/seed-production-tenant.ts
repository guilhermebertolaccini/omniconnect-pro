import { PrismaClient, Role } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as argon2 from 'argon2';
import * as dotenv from 'dotenv';

dotenv.config();

const DEFAULT_TENANT_SENTINEL = 'default-tenant';

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

async function main() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      'Production tenant bootstrap may only run with NODE_ENV=production.',
    );
  }

  const tenantId = requiredEnv('PRODUCTION_BOOTSTRAP_TENANT_ID');
  const tenantName = requiredEnv('PRODUCTION_BOOTSTRAP_TENANT_NAME');
  const adminEmail = requiredEnv(
    'PRODUCTION_BOOTSTRAP_ADMIN_EMAIL',
  ).toLowerCase();
  const newPassword = process.env.PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD?.trim();

  if (tenantId === DEFAULT_TENANT_SENTINEL) {
    throw new Error(
      'PRODUCTION_BOOTSTRAP_TENANT_ID must not be default-tenant.',
    );
  }

  if (newPassword && newPassword.length < 16) {
    throw new Error(
      'PRODUCTION_BOOTSTRAP_ADMIN_PASSWORD must be at least 16 characters.',
    );
  }

  const pool = new Pool({ connectionString: requiredEnv('DATABASE_URL') });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

  try {
    const user = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true, email: true },
    });

    if (!user) {
      throw new Error(
        `Existing bootstrap administrator not found: ${adminEmail}`,
      );
    }

    const passwordHash = newPassword ? await argon2.hash(newPassword) : null;

    await prisma.$transaction(async (tx) => {
      await tx.tenant.upsert({
        where: { id: tenantId },
        update: { name: tenantName, isActive: true },
        create: { id: tenantId, name: tenantName, isActive: true },
      });

      await tx.userTenant.upsert({
        where: { userId_tenantId: { userId: user.id, tenantId } },
        update: { role: Role.admin },
        create: { userId: user.id, tenantId, role: Role.admin },
      });

      if (passwordHash) {
        await tx.user.update({
          where: { id: user.id },
          data: { password: passwordHash },
        });
        await tx.refreshToken.updateMany({
          where: { userId: user.id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
    });

    console.log(
      `Production tenant membership ensured for ${adminEmail} in ${tenantId}.`,
    );
    console.log(
      `Administrator password rotated: ${passwordHash ? 'yes' : 'no'}.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('Production tenant bootstrap failed:', error.message);
  process.exit(1);
});
