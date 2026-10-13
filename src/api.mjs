import { readConfig } from './config.mjs';

export const ENDPOINT = 'https://api.sarashina.ai/v1/chat/completions';
export class ApiError extends Error {
  constructor(code, message, retryAfterSeconds) { super(message); this.code = code; this.retryAfterSeconds = retryAfterSeconds; }
}
export class SarashinaClient {
  constructor({fetchImpl = globalThis.fetch, config = readConfig, now = Date.now, timeoutMs = 45000} = {}) {
    this.fetch = fetchImpl; this.config = config; this.now = now; this.timeoutMs = timeoutMs;
    this.calls = new Map(); this.blockedUntil = new Map();
  }
  async status() {
    const c = await this.config();
    return {configured: !!c.apiKey, model: c.model, endpoint: ENDPOINT, network_checked: false};
  }
  async complete({messages, n = 2, signal}) {
    const {apiKey, model} = await this.config();
    if (!apiKey) throw new ApiError('NOT_CONFIGURED', 'APIキーが未設定です。Claude拡張の設定画面、または同梱セットアップから設定してください。');
    const now = this.now();
    const calls = (this.calls.get(model) || []).filter(t => now - t < 60000);
    const blocked = this.blockedUntil.get(model) || 0;
    if (now < blocked) throw new ApiError('COOLDOWN', 'APIの待機時間中です。', Math.ceil((blocked - now) / 1000));
    if (calls.length >= (model === 'sarashina3-mini' ? 6 : 60))
      throw new ApiError('LOCAL_RATE_LIMIT', 'このプロセスの呼び出し上限です。指定秒数後に再試行してください。', Math.ceil((calls[0] + 60000 - now) / 1000));
    if (signal?.aborted) throw new ApiError('CANCELLED', '呼び出しが中止されました。');
    this.calls.set(model, [...calls, now]);
    const timeout = AbortSignal.timeout(this.timeoutMs);
    const requestSignal = signal ? AbortSignal.any([timeout, signal]) : timeout;
    let response, data;
    try {
      response = await this.fetch(ENDPOINT, {
        method: 'POST', redirect: 'error', signal: requestSignal,
        headers: {'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json'},
        body: JSON.stringify({model, messages, n, temperature: 0.6, max_completion_tokens: 8000, stream: false}),
      });
      if (response.status === 429) {
        this.blockedUntil.set(model, this.now() + 60000);
        throw new ApiError('RATE_LIMIT', 'APIのレート制限です。60秒待って再試行してください。自動再送は行いません。', 60);
      }
      if (!response.ok) throw new ApiError(`HTTP_${response.status}`, `Sarashina APIがHTTP ${response.status}を返しました。${response.status === 401 ? 'APIキーを確認してください。' : '公式APIの状態・設定を確認してください。'} 原稿やキーを含む可能性があるエラー本文は表示しません。`);
      data = await response.json();
    } catch (e) {
      if (e instanceof ApiError) throw e;
      throw new ApiError(requestSignal.aborted ? 'CANCELLED_OR_TIMEOUT' : 'NETWORK_OR_FORMAT', '通信、タイムアウト、または応答形式のエラーです。自動再送は行いません。');
    }
    if (!Array.isArray(data?.choices) || !data.choices.length || data.choices.length > n ||
      data.choices.some(c => typeof c?.message?.content !== 'string' || !c.message.content.trim() || c.message.content.length > 60000 || c.message.tool_calls?.length))
      throw new ApiError('INVALID_RESPONSE', '本文候補を取得できませんでした。');
    // Never return arbitrary provider fields or error bodies to the host.
    return {model, usage: Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].filter(k => Number.isFinite(data.usage?.[k])).map(k => [k, data.usage[k]])),
      choices: data.choices.map(c => ({text: c.message.content, finish_reason: c.finish_reason || 'unknown'}))};
  }
}
