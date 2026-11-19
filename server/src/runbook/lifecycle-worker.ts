import { startRunBookLifecycleScheduler } from './lifecycle-scheduler.js';

try {
  const stop = await startRunBookLifecycleScheduler(process.env, () => {
    console.error('Scheduled RunBook check failed');
  }, true);
  if (!stop) throw new Error('RunBook Test scheduler activation is disabled');
  console.info('RunBook Test scheduler bound to the dedicated database login');
  const shutdown = () => void stop().catch(() => { process.exitCode = 1; });
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch {
  console.error('RunBook Test scheduler configuration or database binding failed');
  process.exitCode = 1;
}
