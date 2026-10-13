// Test-only preload. Never bundled or selected by production configuration.
import { readFile } from 'node:fs/promises';
const brief = JSON.parse(await readFile(new URL('../examples/academic.json', import.meta.url), 'utf8'));
globalThis.fetch = async (url, options) => {
  if (url !== 'https://api.sarashina.ai/v1/chat/completions') throw new Error('Unexpected destination');
  const p = JSON.parse(options.body);
  if (p.max_completion_tokens !== 8000 || p.max_tokens !== undefined) throw new Error('Invalid contract');
  const text = p.messages.length === 4 ? brief.source.replace('その結果、両者の間に', '両者には') : brief.source;
  return new Response(JSON.stringify({choices: [{message: {content: text}, finish_reason: 'stop'}], usage: {total_tokens: 123}}));
};
