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
    ASSISTANT_MAX_HISTORY_MESSAGES: z.coerce.number().int().min(1).max(200).default(40),
    ASSISTANT_QUALITY_GATE: z.enum(['disabled', 'metered']).default('disabled'),
    ASSISTANT_QUALITY_VERIFIER_FAILURE_FALLBACK: z
      .enum(['block', 'return_draft'])
      .default('block'),
    ASSISTANT_QUALITY_VERIFIER_MAX_OUTPUT_TOKENS: z.coerce
      .number()
      .int()
      .min(64)
      .max(1024)
      .default(256),
    OPENAI_API_KEY: optionalNonEmptyString,
    OPENAI_MODEL: z.string().trim().min(1).default('gpt-6-luna'),
    OPENAI_REASONING_EFFORT: z.enum(['none', 'low', 'medium', 'high']).default('low'),
    OPENAI_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).max(8192).default(1024),
    OPENAI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
    OPENAI_MAX_RETRIES: z.coerce.number().int().min(0).max(5).default(2),
  })
  .superRefine((value, context) => {
    if (value.ASSISTANT_PROVIDER === 'openai' && !value.OPENAI_API_KEY) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when ASSISTANT_PROVIDER=openai',
      });
    }
    if (value.ASSISTANT_QUALITY_GATE === 'metered' && value.ASSISTANT_PROVIDER === 'disabled') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['ASSISTANT_QUALITY_GATE'],
        message: 'ASSISTANT_QUALITY_GATE=metered requires an enabled assistant provider',
      });
    }
  });

const parsed = environmentSchema.safeParse(process.env);

if (!parsed.success) {
  process.stderr.write(
    `Invalid server environment configuration: ${JSON.stringify(parsed.error.flatten().fieldErrors)}\n`
  );
  process.exit(1);
}

export const env = parsed.data;
