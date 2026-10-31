import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities.js';

const address = process.env.TEMPORAL_ADDRESS?.trim() || '127.0.0.1:7233';
const namespace = process.env.TEMPORAL_NAMESPACE?.trim() || 'default';
const taskQueue = process.env.AED003_TASK_QUEUE?.trim() || 'comind-aed-003-test';
const workerInstanceId = process.env.AED003_WORKER_ID?.trim() || 'aed003-worker';

async function run(): Promise<void> {
  const connection = await NativeConnection.connect({ address });
  try {
    const worker = await Worker.create({
      connection,
      namespace,
      taskQueue,
      workflowsPath: fileURLToPath(new URL('./workflows.js', import.meta.url)),
      activities,
    });
    process.stdout.write(`${JSON.stringify({
      type: 'AED003_WORKER_READY',
      workerInstanceId,
      taskQueue,
      namespace,
      address,
    })}\n`);
    await worker.run();
  } finally {
    await connection.close();
  }
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
