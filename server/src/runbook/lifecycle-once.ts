import { startRunBookLifecycleScheduler } from './lifecycle-scheduler.js';

try {
  const stop = await startRunBookLifecycleScheduler(process.env, () => {
    console.error('Scheduled RunBook check failed');
    process.exitCode = 1;
  });
  if (!stop) throw new Error('RunBook Test scheduler is disabled');
  await stop();
  if (process.exitCode) throw new Error('RunBook scheduled check failed');
  console.info('RunBook due-slot check completed');
} catch {
  console.error('RunBook scheduled check or credential binding failed');
  process.exitCode = 1;
}
