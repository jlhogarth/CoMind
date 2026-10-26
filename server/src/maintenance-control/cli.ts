import { resolve } from 'node:path';
import { loadMaintenanceControlConfig } from './config.js';
import { runMaintenanceAudit } from './auditor.js';
import { withReadOnlyMaintenanceClient } from './db.js';

function requireMaintenanceDatabaseUrl(): string {
  const value = process.env.MAINTENANCE_CONTROL_DATABASE_URL?.trim();
  if (!value) {
    throw new Error(
      'MAINTENANCE_CONTROL_DATABASE_URL is required; DATABASE_URL is intentionally never used as a fallback'
    );
  }
  return value;
}

async function main(): Promise<void> {
  const configPath = resolve(
    process.env.MCTRL_CONFIG_PATH?.trim() || '../config/maintenance-control.v1.json'
  );
  const config = await loadMaintenanceControlConfig(configPath);
  const report = await withReadOnlyMaintenanceClient(requireMaintenanceDatabaseUrl(), (query) =>
    runMaintenanceAudit(query, config)
  );

  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.overall === 'FAIL') process.exitCode = 2;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Unknown maintenance control failure';
  process.stderr.write(`Maintenance control audit failed closed: ${message}\n`);
  process.exitCode = 2;
});
