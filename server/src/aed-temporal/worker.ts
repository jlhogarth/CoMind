import { fileURLToPath } from 'node:url';
import { NativeConnection, Worker } from '@temporalio/worker';
import * as activities from './activities.js';

export type AedTemporalWorkerHandle = {
  worker: Worker;
  runPromise: Promise<void>;
  shutdown: () => Promise<void>;
};

export async function startAedTemporalWorker(input: {
  address: string;
  namespace?: string;
  taskQueue: string;
}): Promise<AedTemporalWorkerHandle> {
  const connection = await NativeConnection.connect({ address: input.address });
  const worker = await Worker.create({
    connection,
    namespace: input.namespace ?? 'default',
    taskQueue: input.taskQueue,
    workflowsPath: fileURLToPath(new URL('./workflows.js', import.meta.url)),
    activities,
    shutdownGraceTime: '5s',
  });

  const runPromise = worker.run();
  let shutdownStarted = false;

  return {
    worker,
    runPromise,
    async shutdown() {
      if (shutdownStarted) return runPromise;
      shutdownStarted = true;
      worker.shutdown();
      try {
        await runPromise;
      } finally {
        await connection.close();
      }
    },
  };
}
