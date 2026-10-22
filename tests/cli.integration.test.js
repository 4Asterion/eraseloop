import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {createServer as createHTTPServer} from 'node:http';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
async function freePort(){return new Promise((resolvePort,reject)=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolvePort(p));});s.on('error',reject)});}
async function waitForHTTP(port){for(let i=0;i<50;i++){try{const r=await fetch(`http://127.0.0.1:${port}/ready`);if(r.status===404)return;}catch{}await new Promise(r=>setTimeout(r,30));}throw new Error('fixture server failed to start');}
function invoke(args){return new Promise(resolveResult=>{const p=spawn(process.execPath,['src/cli.js',...args],{cwd:root});let out='',err='';p.stdout.on('data',x=>out+=x);p.stderr.on('data',x=>err+=x);p.on('close',code=>resolveResult({code,out,err}));});}
test('invalid --format is rejected before any API call',{timeout:10000},async()=>{
 let calls=0;const server=createHTTPServer((req,res)=>{calls++;res.end('{}');});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const dir=await mkdtemp(join(tmpdir(),'el-fmt-'));
 try{
  const config={schemaVersion:1,baseUrl:`http://127.0.0.1:${server.address().port}`,create:{method:'POST',path:'/u',body:{subject:'{{subject}}'}},delete:{method:'DELETE',path:'/u/{{subject}}'},probes:[{name:'db',type:'http',path:'/u/{{subject}}',expect:'status404'}],observation:{intervalMs:100,durationMs:100}};
  const path=join(dir,'c.json');await writeFile(path,JSON.stringify(config));
  const bad=await invoke(['run','--config',path,'--format','yaml']);
  assert.equal(bad.code,2);assert.match(bad.err,/--format must be one of/);
  const noDir=await invoke(['run','--config',path,'--output',join(dir,'missing','r.html')]);
  assert.equal(noDir.code,2);assert.match(noDir.err,/Output directory does not exist/);
  assert.equal(calls,0,'no request may reach the target before options are validated');
 }finally{server.close();await rm(dir,{recursive:true,force:true});}
});
for(const variant of ['normal','reappear']){
 test(`real HTTP fixture (${variant})`,{timeout:20000},async()=>{
  const port=await freePort(),dir=await mkdtemp(join(tmpdir(),'el-e2e-'));
  const server=spawn(process.execPath,['examples/demo-server/server.js'],{cwd:root,env:{...process.env,PORT:String(port),REAPPEAR:variant==='reappear'?'1':'0'}});
  try{
   await waitForHTTP(port);
   const config={schemaVersion:1,baseUrl:`http://127.0.0.1:${port}`,create:{method:'POST',path:'/test-users',body:{subject:'{{subject}}'}},delete:{method:'DELETE',path:'/test-users/{{subject}}'},probes:[{name:'db',type:'http',path:'/test-users/{{subject}}',expect:'jsonZero',jsonPath:['count']}],observation:{intervalMs:200,durationMs:800}};
   const path=join(dir,'test.json');await writeFile(path,JSON.stringify(config));
   const valid=await invoke(['validate','--config',path]);assert.equal(valid.code,0,valid.err);
   const run=await invoke(['run','--config',path,'--format','json']);
   assert.equal(run.code,variant==='reappear'?1:0,run.err);
   const report=JSON.parse(run.out);
   assert.equal(report.result,variant==='reappear'?'failed':'passed');
   assert.equal(report.observations[0].checks[0].state,'present');
   assert.ok(report.observations.some(o=>o.phase==='post_delete'&&o.checks[0].state==='absent'));
   if(variant==='reappear')assert.equal(report.reason,'data_reappeared');
  }finally{server.kill();await rm(dir,{recursive:true,force:true});}
 });
}
