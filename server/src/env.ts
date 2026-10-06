import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const optionalNonEmptyString = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional()
);

const environmentSchema = z
  .object({
    DATABASE_URL: z.string().url().startsWith('postgres'),
    CORS_ORIGINS: z.string().default(''),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    ASSISTANT_PROVIDER: z.enum(['disabled', 'openai']).default('disabled'),
    OPENAI_API_KEY: optionalNonEmptyString,
    OPENAI_MODEL: z.string().trim().min(1).default('gpt-6-luna'),
    OPENAI_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high']).default('low'),
    OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(8192).default(1024),
  })
  .superRefine((value, context) => {
    if (value.ASSISTANT_PROVIDER === 'openai' && !value.OPENAI_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when ASSISTANT_PROVIDER=openai',
      });
    }
  });

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid server environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
