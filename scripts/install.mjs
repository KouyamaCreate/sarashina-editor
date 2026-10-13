import { spawnSync } from 'node:child_process';
import { readFile, writeFile, copyFile, chmod } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = process.argv[2];
if (!['codex', 'claude-code'].includes(target)) {
  console.error('使い方: node scripts/install.mjs codex | claude-code'); process.exit(1);
}
const configFile = target === 'codex'
  ? join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'config.toml')
  : join(process.env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude'), 'settings.json');
try {
  // Validate availability before any configuration write.
  const bin = target === 'codex' ? 'codex' : 'claude';
  const check = spawnSync(bin, ['plugin', '--help'], {encoding: 'utf8'});
  if (check.status !== 0) throw new Error(`${bin} CLIが見つからないか、pluginコマンド非対応です。READMEの手動導入を使ってください。`);
  try {
    await readFile(configFile);
    const backup = `${configFile}.sarashina-backup-${Date.now()}`;
    await copyFile(configFile, backup); await chmod(backup, 0o600); console.log('既存設定をバックアップしました。');
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  // Pin the actual Node executable so desktop launches do not depend on shell PATH.
  const localMcp = join(root, 'plugins', 'sarashina-editor', '.mcp.json');
  const mcp = JSON.parse(await readFile(localMcp, 'utf8'));
  mcp.mcpServers['sarashina-editor'].command = process.execPath;
  mcp.mcpServers['sarashina-editor'].args = target === 'codex'
    ? [join(root, 'plugins', 'sarashina-editor', 'server.cjs')]
    : ['${CLAUDE_PLUGIN_ROOT}/server.cjs'];
  await writeFile(localMcp, JSON.stringify(mcp, null, 2) + '\n');
  const commands = target === 'codex'
    ? [['plugin','marketplace','add',root], ['plugin','add','sarashina-editor@sarashina-editor-local']]
    : [['plugin','marketplace','add',root], ['plugin','install','sarashina-editor@sarashina-editor-local']];
  for (const args of commands) {
    const r = spawnSync(bin, args, {stdio: 'inherit'});
    if (r.status !== 0) throw new Error('CLI導入が完了しませんでした。READMEの手動導入手順を参照してください。既存のバックアップは保持しています。');
  }
  console.log('プラグイン登録を実行しました。アプリを再起動し、新しいチャットでSarashina Editorを選択してください。');
  console.log('APIキー未設定なら node scripts/setup.mjs を実行してください。');
} catch (e) { console.error(e.message); process.exitCode = 1; }
