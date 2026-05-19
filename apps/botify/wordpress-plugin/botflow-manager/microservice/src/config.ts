import { z } from 'zod';
import dotenv from 'dotenv';
import { isValidBotifySyncTenantId } from '@omniconnect/shared-types';

dotenv.config();

const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // WordPress Backend (obrigatório só em BOTIFY_FLOW_SOURCE=wordpress sem Omni)
  WORDPRESS_API_URL: z.string().url().optional(),
  WORDPRESS_API_KEY: z.string().min(32).optional(),

  /** Fonte do grafo: wordpress | omniconnect | dual (ADR-0002 G4). */
  BOTIFY_FLOW_SOURCE: z.enum(['wordpress', 'omniconnect', 'dual']).default('wordpress'),
  /** Base URL do omniconnect-backend (sem path extra). */
  OMNICONNECT_BACKEND_URL: z.string().url().optional(),
  /** Mesmo valor que BOTIFY_INTERNAL_SYNC_SECRET no backend. */
  BOTIFY_INTERNAL_SYNC_SECRET: z.string().min(16).optional(),
  /** Tenant Omni (`Tenant.id`): UUID ou slug (ex.: seed `default-tenant`). */
  OMNICONNECT_BOTIFY_TENANT_ID: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .refine(isValidBotifySyncTenantId, 'Invalid OMNICONNECT_BOTIFY_TENANT_ID')
    .optional(),

  // AI Providers
  LOVABLE_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  
  // Redis (required in production for BullMQ)
  REDIS_URL: z.string().url().optional().refine(
    (val) => process.env.NODE_ENV !== 'production' || (val && val.length > 0),
    { message: 'REDIS_URL is required in production' }
  ),
  
  // Security
  JWT_SECRET: z.string().min(32),
  ALLOWED_ORIGINS: z.string().transform(s => s.split(',').map(o => o.trim())),
  
  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),

  /** Meta Cloud API — webhook verify + assinatura (G7, sem WordPress). */
  META_APP_SECRET: z.string().min(8).optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().min(1).optional(),

  /** Fallback quando routing Omni não encontra bot (piloto). */
  BOTIFY_DEFAULT_BOT_ID: z.string().min(1).max(64).optional(),
  BOTIFY_DEFAULT_FLOW_ID: z.string().min(1).max(64).optional(),
});

const parseConfig = () => {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid configuration:', result.error.format());
    process.exit(1);
  }

  const data = result.data;
  if (data.BOTIFY_FLOW_SOURCE !== 'wordpress') {
    if (
      !data.OMNICONNECT_BACKEND_URL?.trim() ||
      !data.BOTIFY_INTERNAL_SYNC_SECRET?.trim() ||
      !data.OMNICONNECT_BOTIFY_TENANT_ID?.trim()
    ) {
      console.error(
        '❌ BOTIFY_FLOW_SOURCE omniconnect/dual requires OMNICONNECT_BACKEND_URL, BOTIFY_INTERNAL_SYNC_SECRET, OMNICONNECT_BOTIFY_TENANT_ID',
      );
      process.exit(1);
    }
  }

  if (data.BOTIFY_FLOW_SOURCE === 'wordpress' || data.BOTIFY_FLOW_SOURCE === 'dual') {
    if (!data.WORDPRESS_API_URL?.trim() || !data.WORDPRESS_API_KEY?.trim()) {
      console.error(
        '❌ BOTIFY_FLOW_SOURCE wordpress/dual requires WORDPRESS_API_URL and WORDPRESS_API_KEY',
      );
      process.exit(1);
    }
  }

  return data;
};

export const config = parseConfig();

export type Config = z.infer<typeof configSchema>;
