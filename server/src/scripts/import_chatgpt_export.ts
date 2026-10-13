/**
 * Retired legacy ChatGPT projection importer.
 *
 * This historical entry point intentionally performs no database work. It predates
 * the governed archive evidence model and must not be used for PIT-A or later
 * archive ingestion.
 *
 * Use the governed archive CLI instead:
 *   node dist/archive/chatgpt-export-cli.js --preflight
 *   node dist/archive/chatgpt-export-cli.js /path/to/chatgpt-export.zip
 */

process.stderr.write(
  'Legacy ChatGPT projection importer is retired. Use dist/archive/chatgpt-export-cli.js with CHATGPT_ARCHIVE_DATABASE_URL.\n'
);
process.exitCode = 2;
