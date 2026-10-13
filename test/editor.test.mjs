import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, stat, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Editor } from '../src/editor.mjs';
import { audit, briefSchema, dimensions, messages } from '../src/contract.mjs';
import { SarashinaClient, ENDPOINT } from '../src/api.mjs';
import { readConfig } from '../src/config.mjs';
import { saveKey } from '../scripts/setup.mjs';

const brief = JSON.parse(await readFile(new URL('../examples/academic.json', import.meta.url), 'utf8'));
const revised = brief.source.replace('その結果、両者の間に', '両者には');
const response = (text = revised, finish_reason = 'stop') => ({model: 'sarashina3-mini', choices: [{text, finish_reason}], usage: {}});
const fake = () => ({complete: async () => response()});
const review = text => ({checks: dimensions.map(dimension => ({dimension, pass: true, reason: '原稿と比較し、このテストでは保持を確認した。'})), claim_alignment: brief.claims.map(c => ({claim_id: c.id, candidate_quote: text, preserved: true, reason: '主張と限定が候補内に保持されている。'})), no_unsupported_additions: true, additions_reason: '原稿と候補に情報の追加はない。', preference_reason: '接続句の重複が減った。'});
async function prepared(editor = new Editor(fake())) {
  const {session_id} = editor.begin(brief); const {candidates} = await editor.propose(session_id); return {editor, session_id, c: candidates[0]};
}

test('preserves valid revision while rejecting number, term, citation and protected negation changes', () => {
  assert.equal(audit(briefSchema.parse(brief), revised).pass, true);
  for (const broken of [revised.replace('120', '121'), revised.replace('主観的幸福感','生活満足度'), revised.replace('[1]','[2]'), revised.replace('因果関係を示すものではない','因果関係を実証した'), revised+' 追加の数値10。'])
    assert.equal(audit(brief, broken).pass, false);
});
test('number occurrence counts and exact quotation are enforced', () => {
  assert.equal(audit(brief, revised + '120').pass, false);
  assert.equal(audit({...brief, protected: [...brief.protected, '観察データ']}, revised.replace('観察データ','実験データ')).pass, false);
});
test('truncated output is not eligible even when all literals survive', () => assert.equal(audit(brief, revised, 'length').pass, false));
test('brief rejects duplicate claims and protected words absent from the source', () => {
  assert.throws(() => briefSchema.parse({...brief, claims: [brief.claims[0], brief.claims[0]]}));
  assert.throws(() => briefSchema.parse({...brief, protected: ['not present']}));
});
test('new writing requires a source and claim ledger', () => assert.throws(() => briefSchema.parse({...brief, source: '', claims: []})));
test('finalization is blocked before host review, and hash cannot be swapped', async () => {
  const {editor, session_id, c} = await prepared();
  assert.throws(() => editor.finalize(session_id, c.id));
  assert.throws(() => editor.review(session_id, c.id, '0'.repeat(64), review(c.text)));
  assert.equal(editor.review(session_id,c.id,c.hash,review(c.text)).eligible_to_finalize,true);
  assert.equal(editor.finalize(session_id,c.id).text,revised);
  await assert.rejects(editor.propose(session_id));
});
test('review rejects omissions, duplicate dimensions, invented evidence quotes and extra claims', async () => {
  const {editor, session_id, c} = await prepared();
  for (const mutate of [r=>r.checks[1]=r.checks[0],r=>r.claim_alignment.pop(),r=>r.claim_alignment[0].candidate_quote='nonexistent',r=>r.claim_alignment.push(r.claim_alignment[0])]) {
    const r=review(c.text); mutate(r); assert.throws(()=>editor.review(session_id,c.id,c.hash,r));
  }
});
test('semantic issue detected by host blocks finalize despite matching numbers and terms', async () => {
  const {editor, session_id, c}=await prepared(); const r=review(c.text);r.checks[1].pass=false;
  assert.equal(editor.review(session_id,c.id,c.hash,r).eligible_to_finalize,false);
  assert.throws(()=>editor.finalize(session_id,c.id));
});
test('host approval cannot override a failed machine audit', async () => {
  const {editor,session_id,c}=await prepared(new Editor({complete:async()=>response(revised.replace('120','999'))}));
  assert.equal(editor.review(session_id,c.id,c.hash,review(c.text)).eligible_to_finalize,false);
});
test('feedback is a real conversation and original brief stays fixed', async () => {
  let sent;const editor=new Editor({complete:async p=>{sent=p.messages;return response();}});
  const {session_id,c}=await prepared(editor);
  await editor.propose(session_id,{previous_id:c.id,feedback:'留保を残して接続句だけ短く。'});
  assert.equal(sent[2].role,'assistant');assert.equal(sent[2].content,c.text);assert.match(sent[3].content,/留保/);
  assert.equal(editor.inspect(session_id).brief.source,brief.source);
  await assert.rejects(editor.propose(session_id,{previous_id:c.id}));
});
test('3-round cap and session expiry', async () => {
  let now=0;const editor=new Editor(fake(),{now:()=>now,ttlMs:10});const {session_id}=editor.begin(brief);
  await editor.propose(session_id);await editor.propose(session_id);await editor.propose(session_id);
  await assert.rejects(editor.propose(session_id));now=11;assert.throws(()=>editor.inspect(session_id));
});
test('concurrent requests in one session are blocked',async()=>{
  let done;const editor=new Editor({complete:()=>new Promise(r=>{done=r;})});const {session_id}=editor.begin(brief);
  const p=editor.propose(session_id);await assert.rejects(editor.propose(session_id));done(response());await p;
});
test('failed attempts capped and original source retained after errors',async()=>{
  const editor=new Editor({complete:async()=>{throw new Error('offline');}});const {session_id}=editor.begin(brief);
  for(let i=0;i<6;i++)await assert.rejects(editor.propose(session_id),/offline/);
  await assert.rejects(editor.propose(session_id),/上限/);assert.equal(editor.inspect(session_id).brief.source,brief.source);
});
test('session capacity and close',()=>{
  const e=new Editor(fake(),{maxSessions:1});const {session_id}=e.begin(brief);assert.throws(()=>e.begin(brief));e.close(session_id);assert.throws(()=>e.inspect(session_id));e.begin(brief);
});

const config=async()=>({apiKey:'TEST_ONLY_NEVER_REAL',model:'sarashina3-mini'});
test('API request follows official contract and never sends tools or unsupported max_tokens',async()=>{
  let actual;const api=new SarashinaClient({config,fetchImpl:async(url,req)=>{actual={url,req};return new Response(JSON.stringify({choices:[{message:{content:revised},finish_reason:'stop'}],usage:{total_tokens:100,secret:'no'}}));}});
  const result=await api.complete({messages:messages(brief,{direction:'自然に'})});const body=JSON.parse(actual.req.body);
  assert.equal(actual.url,ENDPOINT);assert.equal(body.model,'sarashina3-mini');assert.equal(body.n,2);assert.equal(body.max_completion_tokens,8000);
  assert.equal(body.max_tokens,undefined);assert.equal(body.tools,undefined);assert.equal(actual.req.redirect,'error');assert.deepEqual(result.usage,{total_tokens:100});
});
test('missing key blocks before any request',async()=>{
  let called=false;const api=new SarashinaClient({config:async()=>({model:'sarashina3-mini'}),fetchImpl:async()=>{called=true;}});
  await assert.rejects(api.complete({messages:[]}),e=>e.code==='NOT_CONFIGURED');assert.equal(called,false);
});
test('429 is surfaced with cooldown, no implicit retry and no raw body',async()=>{
  let calls=0,now=0;const api=new SarashinaClient({config,now:()=>now,fetchImpl:async()=>{calls++;return new Response('PRIVATE_OR_SECRET',{status:429});}});
  await assert.rejects(api.complete({messages:[]}),e=>e.retryAfterSeconds===60&&!e.message.includes('PRIVATE'));
  await assert.rejects(api.complete({messages:[]}),e=>e.code==='COOLDOWN');assert.equal(calls,1);
  now=60001;await assert.rejects(api.complete({messages:[]}));assert.equal(calls,2);
});
test('local rolling request budget; time reset',async()=>{
  let now=0;const api=new SarashinaClient({config,now:()=>now,fetchImpl:async()=>new Response(JSON.stringify({choices:[{message:{content:revised},finish_reason:'stop'}]}))});
  for(let i=0;i<6;i++)await api.complete({messages:[]});await assert.rejects(api.complete({messages:[]}),e=>e.code==='LOCAL_RATE_LIMIT');
  now=60001;await api.complete({messages:[]});
});
test('HTTP error bodies and transport exceptions do not leak to caller',async()=>{
  for(const fetchImpl of [async()=>new Response('SECRET',{status:401}),async()=>{throw new Error('SECRET');}]) {
    const api=new SarashinaClient({config,fetchImpl});await assert.rejects(api.complete({messages:[]}),e=>!e.message.includes('SECRET'));
  }
});
test('empty, null, malformed and tool-call responses are rejected',async()=>{
  for(const data of [null, {choices:[]},{choices:[{message:{content:null}}]},{choices:[{message:{content:'x',tool_calls:[{}]}}]}]) {
    const api=new SarashinaClient({config,fetchImpl:async()=>new Response(JSON.stringify(data))});await assert.rejects(api.complete({messages:[]}),e=>e.code==='INVALID_RESPONSE');
  }
});
test('timeout propagates safely',async()=>{
  const api=new SarashinaClient({config,timeoutMs:10,fetchImpl:async(_u,{signal})=>new Promise((_,reject)=>{
    const timer=setTimeout(()=>reject(new Error('unexpected')),100);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new Error('secret'));});
  })});await assert.rejects(api.complete({messages:[]}),e=>e.code==='CANCELLED_OR_TIMEOUT');
});
test('secret setup preserves unrelated config, permissions, and env precedence',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sarashina-config-'));const path=join(dir,'config.json');
  try {
    await writeFile(path,JSON.stringify({model:'sarashina3-nano',custom:true}));await saveKey('TEST_ONLY',path);
    assert.equal((await stat(path)).mode&0o777,0o600);assert.equal(JSON.parse(await readFile(path)).custom,true);
    const c=await readConfig({SARASHINA_CONFIG_FILE:path,SARASHINA_API_KEY:'ENV_TEST_ONLY'});assert.equal(c.apiKey,'ENV_TEST_ONLY');assert.equal(c.model,'sarashina3-nano');
    await writeFile(path,'bad json');await assert.rejects(saveKey('REPLACEMENT',path));assert.equal(await readFile(path,'utf8'),'bad json');
  }finally{await rm(dir,{recursive:true,force:true});}
});
