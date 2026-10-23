import 'dotenv/config';
import { z } from 'zod';

export function readConfig() {
  const schema = z.object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    DATABASE_URL: z.string().min(1),
    JWT_SECRET: z.string().min(32),
    JWT_EXPIRES_IN: z.string().regex(/^\d+[smhd]$/).default('12h'),
    BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
  });
  return schema.parse(process.env);
}
