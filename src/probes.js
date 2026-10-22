import {spawn} from 'node:child_process';
import {getProbe,substitute} from './request.js';

const MAX_OUTPUT=10240;
export async function runProcess(binary,args,{stdin='',env={}}={}){
 return new Promise(resolve=>{
   let out='',err='',settled=false;
   const child=spawn(binary,args,{shell:false,stdio:['pipe','pipe','pipe'],env:{...process.env,...env},windowsHide:true});
   const finish=(v)=>{if(!settled){settled=true;resolve(v)}};
   const timer=setTimeout(()=>{child.kill('SIGKILL');finish({ok:false,reason:'timeout'});},10000);
   child.stdout.on('data',chunk=>{out+=chunk.toString();if(out.length>MAX_OUTPUT)child.kill('SIGKILL')});
   child.stderr.on('data',chunk=>{err+=chunk.toString();if(err.length>MAX_OUTPUT)child.kill('SIGKILL')});
   child.on('error',()=>{clearTimeout(timer);finish({ok:false,reason:'command_unavailable'})});
   child.on('close',code=>{clearTimeout(timer);finish({ok:code===0,stdout:out.slice(0,MAX_OUTPUT),stderr:err.slice(0,MAX_OUTPUT),reason:code===0?undefined:'command_failed'})});
   child.stdin.on('error',()=>{});
   child.stdin.end(stdin);
 });
}
function unknown(reason){return{state:'unknown',reason}}

// libpq does not expand a URI placed in PGDATABASE, so split it into the standard PG* variables.
// This also keeps the password out of the process command line.
export function pgEnvFromUrl(value){
 let u;try{u=new URL(value);}catch{return null;}
 if(!['postgres:','postgresql:'].includes(u.protocol))return null;
 const env={};
 if(u.hostname)env.PGHOST=decodeURIComponent(u.hostname.replace(/^\[|\]$/g,''));
 if(u.port)env.PGPORT=u.port;
 if(u.username)env.PGUSER=decodeURIComponent(u.username);
 if(u.password)env.PGPASSWORD=decodeURIComponent(u.password);
 const database=decodeURIComponent(u.pathname.replace(/^\//,''));if(database)env.PGDATABASE=database;
 const sslmode=u.searchParams.get('sslmode');if(sslmode)env.PGSSLMODE=sslmode;
 return env;
}
export async function probeState(config,p,subject,{fetchImpl=fetch,execImpl=runProcess}={}){
 if(p.type==='http')return getProbe(config,p,subject,fetchImpl);
 if(p.type==='postgres'){
   const sql=`SELECT COUNT(*) FROM "${p.schema}"."${p.table}" WHERE "${p.column}"::text = :'subject';\n`;
   let env={};
   if(p.connectionEnv){
     if(!process.env[p.connectionEnv])return unknown('missing_connection_env');
     env=pgEnvFromUrl(process.env[p.connectionEnv]);
     if(!env)return unknown('invalid_connection_url');
   }
   const r=await execImpl('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-v',`subject=${subject}`],{stdin:sql,env});
   if(!r.ok)return unknown(r.reason||'postgres_query_failed');
   const s=r.stdout.trim();if(!/^\d+$/.test(s))return unknown('invalid_postgres_response');return{state:BigInt(s)===0n?'absent':'present'};
 }
 if(p.type==='redis'){
   const opts=[];if(p.host)opts.push('-h',p.host);if(p.port)opts.push('-p',String(p.port));
   const r=await execImpl('redis-cli',[...opts,'--raw','EXISTS',substitute(p.key,subject)]);
   if(!r.ok)return unknown(r.reason||'redis_query_failed');const s=r.stdout.trim();return s==='0'?{state:'absent'}:s==='1'?{state:'present'}:unknown('invalid_redis_response');
 }
 if(p.type==='s3'){
   const flags=p.endpointUrl?['--endpoint-url',p.endpointUrl]:[];
   const r=await execImpl('aws',[...flags,'s3api','head-object','--bucket',p.bucket,'--key',substitute(p.key,subject)]);
   if(r.ok)return{state:'present'};
   // Never treat permission errors or CLI failures as absence.
   if(/\b(404|Not Found|NoSuchKey)\b/i.test(r.stderr??''))return{state:'absent'};
   return unknown(r.reason||'s3_query_failed');
 }
 return unknown('unsupported_probe');
}
