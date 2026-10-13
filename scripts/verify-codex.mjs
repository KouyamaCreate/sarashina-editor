// Developer integration check. No model turn, API generation, or persistent chat.
// Uses the installed plugin through the official Codex app-server, without
// replacing any MCP arguments. A direct SDK launch alone cannot catch host bugs.
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import assert from 'node:assert/strict';

const executable = process.argv[2] || 'codex';
const child = spawn(executable, ['app-server'], {stdio: ['pipe', 'pipe', 'pipe']});
const pending = new Map();
let seq = 0;
// Do not forward arbitrary backend logs, which may refer to unrelated plugins.
child.stderr.resume();
const lines = createInterface({input: child.stdout});
lines.on('line', line => {
  let message;
  try { message = JSON.parse(line); } catch { return; }
  const request = pending.get(message.id);
  if (!request) return;
  pending.delete(message.id);
  message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
});
function failAll(error) {
  for (const {reject} of pending.values()) reject(error);
  pending.clear();
}
child.on('error', failAll);
child.on('exit', code => failAll(new Error(`Codex app-server exited (${code}). Check access to its state directory.`)));
function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    pending.set(id, {resolve, reject});
    child.stdin.write(JSON.stringify({jsonrpc: '2.0', id, method, params}) + '\n');
  });
}
const timeout = setTimeout(() => {
  failAll(new Error('Codex tool discovery timed out after 45 seconds.'));
  child.kill();
}, 45000);
try {
  await send('initialize', {clientInfo: {name: 'sarashina-integration-check', version: '0.1.3'}, capabilities: {experimentalApi: true}});
  child.stdin.write(JSON.stringify({jsonrpc: '2.0', method: 'initialized'}) + '\n');
  const result = await send('mcpServerStatus/list', {serverName: 'sarashina-editor', limit: 100});
  const server = result.data.find(s => s.name === 'sarashina-editor');
  assert.ok(server, 'Sarashina MCP server is not registered in Codex.');
  assert.equal(server.toolsError, null, server.toolsError);
  const expected = ['status', 'begin', 'propose', 'review', 'finalize', 'inspect', 'close'].map(n => `sarashina_${n}`).sort();
  assert.deepEqual(Object.keys(server.tools).sort(), expected);
  assert.ok(server.pluginId?.startsWith('sarashina-editor@'));
  console.log(JSON.stringify({verified: true, pluginId: server.pluginId, tools: expected, toolsError: null, liveGeneration: false}, null, 2));
} catch (error) {
  console.error(error.message); process.exitCode = 1;
} finally {
  clearTimeout(timeout); lines.close(); child.stdin.end(); child.kill();
}
