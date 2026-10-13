import { readFile } from 'node:fs/promises';
import { SarashinaClient } from '../src/api.mjs';
import { Editor } from '../src/editor.mjs';
if (!process.argv.includes('--live')) {
  console.error('実APIを1回呼び出します。実行する場合は --live を指定してください。'); process.exit(1);
}
try {
  const client = new SarashinaClient();
  const status = await client.status();
  if (!status.configured) throw new Error('APIキー未設定です。先に node scripts/setup.mjs を実行してください。');
  const editor = new Editor(client);
  const brief = JSON.parse(await readFile(new URL('../examples/academic.json', import.meta.url), 'utf8'));
  const {session_id} = editor.begin(brief);
  const result = await editor.propose(session_id);
  console.log(JSON.stringify({live_api: true, host_reviewed: false, ...result}, null, 2));
  if (result.candidates.every(c => !c.audit.pass)) process.exitCode = 2;
} catch (e) { console.error(e.message); process.exitCode = 1; }
