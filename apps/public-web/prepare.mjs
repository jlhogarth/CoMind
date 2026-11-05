import { cp, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const source = resolve(root, 'brand');
const dest = resolve(root, 'apps/public-web/public/brand');
await stat(resolve(source, 'comind-brand.css'));
await mkdir(dest, { recursive: true });
for (const file of ['comind-brand.css','tokens.css','layout.css','motion.css','experience.css','mode-native.css']) {
  await cp(resolve(source,file),resolve(dest,file));
}
console.log('Canonical BRAND-001 CSS copied verbatim into isolated public preview assets.');
