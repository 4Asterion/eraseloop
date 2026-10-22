import test from 'node:test';
import assert from 'node:assert/strict';
import {execute} from '../src/engine.js';
const mk=()=>({baseUrl:'http://127.0.0.1:7001',create:{method:'POST',path:'/create',body:{subject:'{{subject}}'}},delete:{method:'DELETE',path:'/delete/{{subject}}'},probes:[{name:'db',type:'http',path:'/state/{{subject}}',expect:'jsonZero',jsonPath:['count']}],observation:{intervalMs:100,durationMs:300}});
function fixture(sequence){let deleted=false,createCount=0,deleteCount=0,sample=-1;const fetchImpl=async(url,req)=>{
 const path=new URL(url).pathname;
 if(path==='/create'){createCount++;return{status:201};}
 if(path.startsWith('/delete/')){deleted=true;deleteCount++;return{status:200};}
 if(path.startsWith('/state/')){sample++;const val=sequence[sample]??0;return{ok:true,status:200,json:async()=>({count:val})};}
 throw Error('unexpected path');
 };return{fetchImpl,counts:()=>({createCount,deleteCount})};}
test('clean erase passes with observed baseline',async()=>{const f=fixture([1,0,0,0,0]);const r=await execute(mk(),{fetchImpl:f.fetchImpl,wait:async()=>{},subject:'el_test'});assert.equal(r.result,'passed');assert.equal(r.observations.length,5);assert.equal(f.counts().deleteCount,1);});
test('persistent data fails',async()=>{const f=fixture([1,1,1,1,1]);const r=await execute(mk(),{fetchImpl:f.fetchImpl,wait:async()=>{},subject:'el_test'});assert.equal(r.result,'failed');assert.equal(r.reason,'data_still_present');});
test('data reappearing fails even if later absent',async()=>{const f=fixture([1,0,0,1,0]);const r=await execute(mk(),{fetchImpl:f.fetchImpl,wait:async()=>{},subject:'el_test'});assert.equal(r.result,'failed');assert.equal(r.reason,'data_reappeared');});
test('unknown probe yields inconclusive',async()=>{const f=fixture([1,0,0,0,0]);let calls=0;const fetchImpl=async(...x)=>{if(new URL(x[0]).pathname.startsWith('/state/') && ++calls===3)return{status:500,ok:false};return f.fetchImpl(...x)};const r=await execute(mk(),{fetchImpl,wait:async()=>{},subject:'el_test'});assert.equal(r.result,'inconclusive');assert.equal(r.reason,'unverified_probe');});
test('baseline not observed attempts cleanup and never claims pass',async()=>{const f=fixture([0]);const r=await execute(mk(),{fetchImpl:f.fetchImpl,wait:async()=>{},subject:'el_test'});assert.equal(r.result,'inconclusive');assert.equal(r.reason,'baseline_not_detected');assert.equal(f.counts().deleteCount,1);});
const withGrace=graceMs=>{const c=mk();c.observation={intervalMs:100,durationMs:400,graceMs};return c;};
test('grace period tolerates asynchronous deletion',async()=>{const f=fixture([1,1,1,0,0,0]);const r=await execute(withGrace(200),{fetchImpl:f.fetchImpl,wait:async()=>{},subject:'el_test'});assert.equal(r.result,'passed');assert.deepEqual(r.observations.slice(1).map(o=>Boolean(o.within_grace)),[true,true,false,false,false]);assert.equal(r.observation.grace_ms,200);});
test('data still present after grace fails',async()=>{const f=fixture([1,1,1,1,0,0]);const r=await execute(withGrace(200),{fetchImpl:f.fetchImpl,wait:async()=>{},subject:'el_test'});assert.equal(r.result,'failed');assert.equal(r.reason,'data_still_present');});
test('reappearance inside the grace period still fails',async()=>{const f=fixture([1,0,1,0,0,0]);const r=await execute(withGrace(300),{fetchImpl:f.fetchImpl,wait:async()=>{},subject:'el_test'});assert.equal(r.result,'failed');assert.equal(r.reason,'data_reappeared');});
test('per-probe verdicts name the store that kept data',async()=>{
 const c=mk();c.probes.push({name:'cache',type:'http',path:'/cache/{{subject}}',expect:'status404'});
 let db=-1;const dbSeq=[1,0,0,0,0];let cache=-1;const cacheSeq=[200,404,404,200,200];
 const fetchImpl=async u=>{const p=new URL(u).pathname;if(p==='/create')return{status:201};if(p.startsWith('/delete/'))return{status:200};
  if(p.startsWith('/state/')){db++;return{ok:true,status:200,json:async()=>({count:dbSeq[db]??0})};}
  cache++;const s=cacheSeq[cache]??404;return{ok:s<300,status:s};};
 const r=await execute(c,{fetchImpl,wait:async()=>{},subject:'el_test'});
 assert.equal(r.result,'failed');assert.equal(r.reason,'data_reappeared');
 assert.deepEqual(r.probes.map(p=>[p.name,p.result,p.reason]),[['db','passed',undefined],['cache','failed','data_reappeared']]);
});
test('HTTP create failure yields inconclusive',async()=>{const f=fixture([1]);const bad=async(u,r)=>{if(new URL(u).pathname==='/create')return{status:401};return f.fetchImpl(u,r)};const r=await execute(mk(),{fetchImpl:bad,wait:async()=>{},subject:'el_test'});assert.equal(r.result,'inconclusive');assert.equal(r.reason,'lifecycle_failed');});
