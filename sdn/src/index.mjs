import { buildApp } from './app.mjs';

const app = buildApp();
const port = Number(process.env.PORT ?? 3100);
await app.listen({ host: '0.0.0.0', port });
