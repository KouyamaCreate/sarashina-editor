import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { readFile, mkdtemp, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dimensions } from '../src/contract.mjs';

test('bundled artifact runs without node_modules: MCP negotiation, schemas, prompt and missing-key handling', async()=>{
  const dir=await mkdtemp(join(tmpdir(),'sarashina-bundle-'));
  await cp(new URL('../plugins/sarashina-editor/server.cjs',import.meta.url),join(dir,'server.cjs'));
  const transport=new StdioClientTransport({command:process.execPath,args:[join(dir,'server.cjs')],env:{SARASHINA_CONFIG_FILE:join(dir,'absent.json')},stderr:'pipe'});
  const client=new Client({name:'sarashina-test',version:'1.0.0'});let stderr='';transport.stderr?.on('data',d=>stderr+=d);
  try {
    await client.connect(transport);assert.match(client.getInstructions(),/専門編集者/);
    const {tools}=await client.listTools();assert.equal(tools.length,7);
    const status=await client.callTool({name:'sarashina_status',arguments:{}});assert.equal(JSON.parse(status.content[0].text).configured,false);
    const brief=JSON.parse(await readFile(new URL('../examples/academic.json',import.meta.url),'utf8'));
    const begin=await client.callTool({name:'sarashina_begin',arguments:{brief}});assert.notEqual(begin.isError,true);
    const {session_id}=JSON.parse(begin.content[0].text);
    const fail=await client.callTool({name:'sarashina_propose',arguments:{session_id}});assert.equal(fail.isError,true);assert.match(fail.content[0].text,/NOT_CONFIGURED/);
    const bad=await client.callTool({name:'sarashina_begin',arguments:{brief:{source:'only'}}});assert.equal(bad.isError,true);
    const prompt=await client.getPrompt({name:'sarashina-edit',arguments:{text:'この文章を推敲する。'}});assert.match(prompt.messages[0].content.text,/この文章/);
    assert.equal(stderr,'');
  } finally {await client.close();await rm(dir,{recursive:true,force:true});}
});

test('full host-to-MCP-to-mock-API roundtrip including feedback, review and finalize', async()=>{
  const transport=new StdioClientTransport({command:process.execPath,args:['--import',fileURLToPath(new URL('./mock-provider.mjs',import.meta.url)),fileURLToPath(new URL('../plugins/sarashina-editor/server.cjs',import.meta.url))],env:{SARASHINA_API_KEY:'TEST_ONLY',SARASHINA_CONFIG_FILE:join(tmpdir(),'sarashina-nonexistent-test-config.json')},stderr:'pipe'});
  const client=new Client({name:'full-roundtrip-test',version:'1.0.0'});
  const call=async(name,args)=>{const r=await client.callTool({name,arguments:args});assert.notEqual(r.isError,true,r.content[0].text);return JSON.parse(r.content[0].text);};
  try {
    await client.connect(transport);
    const brief=JSON.parse(await readFile(new URL('../examples/academic.json',import.meta.url),'utf8'));
    const {session_id}=await call('sarashina_begin',{brief});
    const first=await call('sarashina_propose',{session_id});
    const second=await call('sarashina_propose',{session_id,previous_id:first.candidates[0].id,feedback:'接続句の重複を減らす。'});
    const c=second.candidates[0];assert.notEqual(c.text,first.candidates[0].text);
    const review={checks:dimensions.map(dimension=>({dimension,pass:true,reason:'架空原稿との比較を行ったテスト用審査。'})),claim_alignment:brief.claims.map(b=>({claim_id:b.id,candidate_quote:c.text,preserved:true,reason:'テスト用の主張対応。'})),no_unsupported_additions:true,additions_reason:'このfixtureでは追加なし。',preference_reason:'接続句を短くした。'};
    await call('sarashina_review',{session_id,candidate_id:c.id,candidate_hash:c.hash,review});
    const finalized=await call('sarashina_finalize',{session_id,candidate_id:c.id});assert.equal(finalized.text,c.text);assert.equal(finalized.status,'host_reviewed');
    await call('sarashina_close',{session_id});
  } finally {await client.close();}
});
