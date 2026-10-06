import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const environmentSchema = z.object({
  DATABASE_URL: z.string().url().startsWith('postgres'),
  CORS_ORIGINS: z.string().default(''),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
});

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid server environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
