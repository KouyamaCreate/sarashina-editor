import { spawnSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdir, readFile, writeFile, cp, mkdtemp, rm, readdir, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { packExtension } from '@anthropic-ai/mcpb';

const root = process.cwd();
const out = resolve(root, '..');
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const staging = await mkdtemp(join(tmpdir(), 'sarashina-release-'));
try {
  const folder = join(staging, 'sarashina-editor');
  await cp(root, folder, {recursive: true, filter: source => !source.split(/[\\/]/).some(part => ['node_modules', '.git', 'dist', '.DS_Store'].includes(part))});
  // Remove machine-specific installer substitutions from distributable copies.
  const mcpPath = join(folder, 'plugins/sarashina-editor/.mcp.json');
  const mcp = JSON.parse(await readFile(mcpPath, 'utf8')); mcp.mcpServers['sarashina-editor'].command = 'node';
  mcp.mcpServers['sarashina-editor'].args = ['${CLAUDE_PLUGIN_ROOT}/server.cjs'];
  await writeFile(mcpPath, JSON.stringify(mcp, null, 2) + '\n');
  const plugin = join(folder, 'plugins/sarashina-editor');
  await writeFile(join(plugin, 'README.md'), `# Sarashina Editor\n\n日本語推敲の非公式拡張です。指定した原稿と編集方針をSB Intuitions公式APIへ送信し、Codex/Claudeが意味を審査します。\n\nClaude.appでは拡張の設定にAPIキーを入力し、新しいチャットで「Sarashinaでこの文章を推敲して」と頼んでください。通常チャットのローカル拡張用にNode依存を同梱しています。\n\nCodex/Claude Codeへの導入・開発用ソースは別途配布のsarashina-editor-${version}.zipを使用してください。\n\nAPIキー: https://chat.sarashina.ai/dashboard/api-keys\n利用規約: https://sarashina.ai/terms\n\n無料APIの入出力は学習利用の対象になり得ます。機密原稿の送信前に利用条件を確認してください。意味の同一性や文体の優位性を保証するものではありません。\n`);
  await cp(join(root, 'LICENSE'), join(plugin, 'LICENSE'));
  const desktop = join(out, `sarashina-editor-${version}.mcpb`);
  if (!await packExtension({extensionPath: plugin, outputPath: desktop})) throw new Error('MCPBの作成に失敗しました。');
  const zip = join(out, `sarashina-editor-${version}.zip`);
  await rm(zip, {force: true});
  const zipped = spawnSync('zip', ['-qr', zip, 'sarashina-editor'], {cwd: staging, stdio: 'inherit'});
  if (zipped.status !== 0) throw new Error('zipの作成に失敗しました。');
  const sums = [];
  const artifacts = [zip, desktop];
  const setupZip = join(out, 'sarashina-editor-macos-setup-0.1.3.zip');
  try { await access(setupZip); artifacts.push(setupZip); } catch {}
  for (const path of artifacts) sums.push(`${createHash('sha256').update(await readFile(path)).digest('hex')}  ${path.split('/').at(-1)}`);
  await writeFile(join(out, 'SHA256SUMS.txt'), sums.join('\n') + '\n');
  console.log('配布ZIP・Claude Desktop拡張・SHA256SUMSを作成しました。');
} finally {await rm(staging, {recursive: true, force: true});}
