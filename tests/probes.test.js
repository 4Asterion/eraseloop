import test from 'node:test';
import assert from 'node:assert/strict';
import {probeState,pgEnvFromUrl} from '../src/probes.js';
import {getProbe} from '../src/request.js';
import {render} from '../src/report.js';
const base={baseUrl:'http://localhost:5001'};
test('Postgres connection URL is split into PG* variables, never PGDATABASE=URI',async()=>{
 assert.deepEqual(pgEnvFromUrl('postgresql://el%40user:p%3Ass@127.0.0.1:55432/eraseloop?sslmode=disable'),{PGHOST:'127.0.0.1',PGPORT:'55432',PGUSER:'el@user',PGPASSWORD:'p:ss',PGDATABASE:'eraseloop',PGSSLMODE:'disable'});
 assert.equal(pgEnvFromUrl('postgres://[::1]/db').PGHOST,'::1');
 assert.equal(pgEnvFromUrl('host=localhost dbname=x'),null);
 process.env.ERASELOOP_TEST_PG='postgres://u:secret@db.test:5432/app';
 let run;
 const r=await probeState(base,{name:'sql',type:'postgres',schema:'public',table:'users',column:'id',connectionEnv:'ERASELOOP_TEST_PG'},'el_123',{execImpl:async(...a)=>{run=a;return{ok:true,stdout:'1\n'}}});
 assert.equal(r.state,'present');assert.equal(run[2].env.PGPASSWORD,'secret');assert.equal(run[2].env.PGDATABASE,'app');
 assert.ok(!run[1].join(' ').includes('secret'),'password must not appear in argv');
 process.env.ERASELOOP_TEST_PG='not a url';
 const bad=await probeState(base,{name:'sql',type:'postgres',schema:'public',table:'users',column:'id',connectionEnv:'ERASELOOP_TEST_PG'},'el_123',{execImpl:async()=>{throw new Error('must not run')}});
 assert.deepEqual(bad,{state:'unknown',reason:'invalid_connection_url'});
 delete process.env.ERASELOOP_TEST_PG;
});
const sampleReport=()=>({schema_version:'1',tool:'EraseLoop',subject_fingerprint:'el_…abc123',result:'failed',reason:'data_reappeared',observation:{interval_ms:100,duration_ms:300,grace_ms:100},
 observations:[{phase:'baseline',t_ms:0,checks:[{name:'db',state:'present'},{name:'c|ache',state:'present'}]},{phase:'post_delete',t_ms:5,within_grace:true,checks:[{name:'db',state:'absent'},{name:'c|ache',state:'present'}]},{phase:'post_delete',t_ms:110,checks:[{name:'db',state:'present'},{name:'c|ache',state:'unknown',reason:'http_500'}]}],
 probes:[{name:'db',type:'postgres',result:'failed',reason:'data_reappeared'},{name:'c|ache',type:'http',result:'inconclusive',reason:'unverified_probe'}],limitations:['limits']});
test('Markdown report lists per-probe verdicts and escapes names',()=>{
 const out=render(sampleReport(),'markdown');
 assert.match(out,/EraseLoop deletion test: ❌ FAILED/);assert.match(out,/\| db \| postgres \| failed \| data\\_reappeared \|/);
 assert.ok(out.includes('c\\|ache'));assert.ok(out.includes('post_delete (grace)'));
});
test('JUnit report has one test case per probe',()=>{
 const out=render(sampleReport(),'junit');
 assert.match(out,/^<\?xml version="1.0" encoding="UTF-8"\?>/);
 assert.match(out,/<testsuite name="EraseLoop" tests="2" failures="1" errors="1"/);
 assert.match(out,/<testcase classname="eraseloop" name="db \(postgres\)"><failure message="data_reappeared"/);
 const lifecycle=render({...sampleReport(),probes:[{name:'db',type:'http'}],result:'inconclusive',reason:'lifecycle_failed',error:'create returned HTTP 401 <x>'},'junit');
 assert.match(lifecycle,/name="lifecycle"><error message="lifecycle_failed"/);assert.ok(lifecycle.includes('&lt;x&gt;'));
 assert.throws(()=>render(sampleReport(),'yaml'),/Format must be one of/);
});
test('Postgres invokes parameterized read-only SELECT with quoted identifier',async()=>{
 let run;
 const execImpl=async(...args)=>{run=args;return{ok:true,stdout:'0\n'}};
 const r=await probeState(base,{name:'sql',type:'postgres',schema:'public',table:'users',column:'user_id'},'el_123',{execImpl});
 assert.equal(r.state,'absent');assert.equal(run[0],'psql');assert.match(run[2].stdin,/SELECT COUNT\(\*\)/);assert.match(run[2].stdin,/:\'subject\'/);assert.match(run[1].join(' '),/subject=el_123/);
});
test('Postgres command failure is not interpreted as absence',async()=>{const r=await probeState(base,{name:'sql',type:'postgres',schema:'public',table:'users',column:'id'},'el_123',{execImpl:async()=>({ok:false,reason:'command_failed'})});assert.equal(r.state,'unknown');});
test('Redis returns state from EXISTS',async()=>{const r=await probeState(base,{name:'cache',type:'redis',key:'users:{{subject}}'},'el_123',{execImpl:async(bin,args)=>{assert.equal(bin,'redis-cli');assert.ok(args.includes('users:el_123'));return{ok:true,stdout:'1\n'}}});assert.equal(r.state,'present');});
test('S3 distinguishes missing object from access denied',async()=>{
 const p={name:'file',type:'s3',bucket:'test-bucket',key:'users/{{subject}}'};
 const absent=await probeState(base,p,'el_123',{execImpl:async()=>({ok:false,stderr:'An error occurred (404) when calling HeadObject'})});
 const deny=await probeState(base,p,'el_123',{execImpl:async()=>({ok:false,stderr:'Access Denied'})});
 assert.equal(absent.state,'absent');assert.equal(deny.state,'unknown');
});
test('HTTP no redirect allowed and jsonZero parses defined path',async()=>{
 const p={name:'web',type:'http',path:'/user/{{subject}}',expect:'jsonZero',jsonPath:['data','count']};
 const r=await getProbe(base,p,'el_123',async(u,req)=>{assert.ok(u.href.includes('el_123'));assert.equal(req.redirect,'manual');return{ok:true,status:200,json:async()=>({data:{count:0}})}});assert.equal(r.state,'absent');
 const unknown=await getProbe(base,p,'el_123',async()=>({ok:false,status:403}));assert.equal(unknown.state,'unknown');
});
test('HTML report escapes content and never executes embedded strings',async()=>{const {render}=await import('../src/report.js');const r={result:'passed',subject_fingerprint:'el_…abc',observations:[{phase:'baseline',t_ms:0,checks:[{name:'<script>x</script>',state:'absent'}]}],limitations:['limits']};const html=render(r,'html');assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));});
