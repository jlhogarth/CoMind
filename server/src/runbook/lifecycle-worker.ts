import { createServer } from 'node:http';
import { startRunBookLifecycleScheduler } from './lifecycle-scheduler.js';

try {
  const stop = await startRunBookLifecycleScheduler(process.env, () => {
    console.error('Scheduled RunBook check failed');
  }, true);
  if (!stop) throw new Error('RunBook Test scheduler activation is disabled');
  console.info('RunBook Test scheduler bound to the dedicated database login');
  const server = process.env.DRB_RUNBOOK_GOOGLE_IDENTITY === 'cloud-run'
    ? createServer((request, response) => {
      response.writeHead(request.url === '/healthz' ? 204 : 404).end();
    }) : null;
  if (server) {
    const port = Number(process.env.PORT);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error('Cloud Run requires a valid PORT');
    }
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '0.0.0.0', resolve);
    });
  }
  const shutdown = () => {
    server?.close();
    void stop().catch(() => { process.exitCode = 1; });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
} catch {
  console.error('RunBook Test scheduler configuration or database binding failed');
  process.exitCode = 1;
}
