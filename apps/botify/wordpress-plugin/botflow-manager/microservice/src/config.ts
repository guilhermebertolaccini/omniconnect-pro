import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const configSchema = z.object({
  // Server
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  
  // WordPress Backend
  WORDPRESS_API_URL: z.string().url(),
  WORDPRESS_API_KEY: z.string().min(32),
  
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
});

const parseConfig = () => {
  const result = configSchema.safeParse(process.env);
  
  if (!result.success) {
    console.error('❌ Invalid configuration:', result.error.format());
    process.exit(1);
  }
  
  return result.data;
};

export const config = parseConfig();

export type Config = z.infer<typeof configSchema>;
