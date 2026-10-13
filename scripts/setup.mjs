import { readFile, mkdir, writeFile, rename, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { emitKeypressEvents } from 'node:readline';
import { pathToFileURL } from 'node:url';
import { configPath } from '../src/config.mjs';

export async function saveKey(apiKey, path = configPath()) {
  if (typeof apiKey !== 'string' || !apiKey.trim() || /[\r\n]/.test(apiKey)) throw new Error('有効なキーを入力してください。');
  let existing = {};
  try { existing = JSON.parse(await readFile(path, 'utf8')); }
  catch (e) { if (e.code !== 'ENOENT') throw new Error('既存設定が不正です。上書きせず終了します。'); }
  if (!existing || typeof existing !== 'object' || Array.isArray(existing)) throw new Error('既存設定が不正です。');
  await mkdir(dirname(path), {recursive: true, mode: 0o700});
  const temp = `${path}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temp, JSON.stringify({...existing, api_key: apiKey.trim()}, null, 2) + '\n', {flag: 'wx', mode: 0o600});
  await rename(temp, path); await chmod(path, 0o600);
  return path;
}

async function main() {
  if (!process.stdin.isTTY) throw new Error('端末で実行してください。APIキーをコマンド引数やチャットに貼らないでください。');
  console.log('Sarashina Editor — APIキー設定');
  console.log('発行先: https://chat.sarashina.ai/dashboard/api-keys');
  console.log('キーはこの端末の設定ファイル（所有者のみ読み書き可）に保存します。');
  console.log('Claude.appの.mcpb版では、代わりに拡張の設定画面で入力できます。');
  process.stdout.write('APIキー（非表示。空のままEnterで変更せず終了）: ');
  emitKeypressEvents(process.stdin); process.stdin.setRawMode(true); process.stdin.resume();
  const key = await new Promise(resolve => {
    let secret = '';
    const listener = (str, event = {}) => {
      if ((event.ctrl && event.name === 'c') || event.name === 'return' || event.name === 'enter') {
        process.stdin.removeListener('keypress', listener); process.stdin.setRawMode(false); process.stdin.pause();
        process.stdout.write('\n'); resolve(event.ctrl ? '' : secret);
      } else if (event.name === 'backspace') secret = secret.slice(0, -1);
      else if (str && !event.ctrl && !event.meta && !/[\x00-\x1f\x7f]/.test(str)) secret += str;
    };
    process.stdin.on('keypress', listener);
  });
  if (!key.trim()) { console.log('設定を変更せず終了しました。'); return; }
  await saveKey(key); console.log('保存しました。既存の他の設定項目は保持しました。');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(e => { console.error(e.message); process.exitCode = 1; });
