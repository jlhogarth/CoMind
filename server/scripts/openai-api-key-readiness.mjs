import { verifyOpenAIApiKeyReadiness } from '../lib/openai-api-key-readiness.js';

try {
  const result = await verifyOpenAIApiKeyReadiness({
    apiKey: process.env.OPENAI_API_KEY,
    requiredModel: process.env.OPENAI_REQUIRED_MODEL || 'gpt-6-luna',
  });
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(JSON.stringify({
    status: 'failed',
    reason: typeof error?.code === 'string' ? error.code : 'openai_readiness_failed',
  }));
  process.exitCode = 1;
}
