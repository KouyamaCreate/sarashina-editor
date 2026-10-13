import { build } from 'esbuild';
import { readFile, readdir, writeFile } from 'node:fs/promises';
const result = await build({entryPoints: ['src/server.mjs'], outfile: 'plugins/sarashina-editor/server.cjs', bundle: true, platform: 'node', target: 'node20', format: 'cjs', banner: {js: '#!/usr/bin/env node'}, minify: false, metafile: true});
const packages = new Set(Object.keys(result.metafile.inputs).map(p => p.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/)?.[1]).filter(Boolean));
let notices = 'Third-party dependencies bundled in server.cjs\n\n';
for (const name of [...packages].sort()) {
  const root = `node_modules/${name}`;
  const meta = JSON.parse(await readFile(`${root}/package.json`, 'utf8'));
  notices += `## ${name} ${meta.version} (${meta.license || 'see license'})\n\n`;
  const files = (await readdir(root)).filter(n => /^(license|copying|notice)/i.test(n));
  for (const file of files) notices += `${await readFile(`${root}/${file}`, 'utf8')}\n\n`;
}
await writeFile('plugins/sarashina-editor/THIRD_PARTY_NOTICES.txt', notices);
