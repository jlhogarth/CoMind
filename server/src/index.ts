import { buildApp } from './app.js';
import { env } from './env.js';
import { startRunBookLifecycleScheduler } from './runbook/lifecycle-scheduler.js';

const app = await buildApp();
try {
  const stopRunBook = await startRunBookLifecycleScheduler(process.env, () =>
    app.log.error('RunBook Test lifecycle check failed'));
  if (stopRunBook) app.addHook('onClose', stopRunBook);
} catch {
  app.log.error('RunBook Test scheduler configuration is unavailable');
}

app.listen({ port: env.PORT, host: '0.0.0.0' }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
