import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const configPath = (env = process.env) => env.SARASHINA_CONFIG_FILE || join(homedir(), '.config', 'sarashina-editor', 'config.json');
export async function readConfig(env = process.env) {
  let saved = {};
  try { saved = JSON.parse(await readFile(configPath(env), 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('設定ファイルを読み込めません。JSON形式を確認してください。'); }
  const model = env.SARASHINA_MODEL || saved.model || 'sarashina3-mini';
  if (!['sarashina3-mini', 'sarashina3-nano'].includes(model)) throw new Error('対応モデルは sarashina3-mini / sarashina3-nano です。');
  const apiKey = env.SARASHINA_API_KEY || saved.api_key;
  if (apiKey && (typeof apiKey !== 'string' || /[\r\n]/.test(apiKey))) throw new Error('APIキーの形式が不正です。');
  return {apiKey: apiKey?.trim(), model};
}
