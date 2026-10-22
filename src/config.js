import {readFile} from 'node:fs/promises';

const allowedTypes = new Set(['http','postgres','redis','s3']);
export const isSafeIdentifier = x => typeof x === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(x);

export async function loadConfig(file) {
  const raw = await readFile(file,'utf8');
  if(raw.length>1024*1024) throw new Error('Configuration exceeds 1 MiB');
  let config;
  try {config=JSON.parse(raw);} catch {throw new Error('Configuration must be valid JSON');}
  return validateConfig(config);
}
function goodUrl(value) {
  const u = new URL(value);
  if(!['http:','https:'].includes(u.protocol) || u.username || u.password || u.hash || u.search) throw new Error('baseUrl must be a plain HTTP(S) origin with no embedded credentials/query');
  if(u.pathname!=='/') throw new Error('baseUrl must contain only an origin');
  return u;
}
export function assertTargetSafety(config, remoteAcknowledged=false) {
  const u=goodUrl(config.baseUrl);
  const isLocal=['127.0.0.1','localhost','[::1]'].includes(u.hostname);
  if(!isLocal && (!remoteAcknowledged || u.protocol!=='https:')) throw new Error('Remote targets require HTTPS and --ack-remote-test-only. Never use production accounts.');
}
function relativePath(path) {return typeof path==='string' && path.startsWith('/') && !path.startsWith('//') && !path.includes('#') && !path.includes('\\') && !path.includes('\r') && !path.includes('\n');}
export function validateConfig(c) {
 if(!c || typeof c!=='object' || Array.isArray(c)) throw new Error('Configuration must be an object');
 if(c.schemaVersion!==1) throw new Error('schemaVersion must be 1');
 try {goodUrl(c.baseUrl);}catch(err){throw new Error(`Invalid baseUrl: ${err.message}`)}
 for(const key of ['create','delete']){
   if(!c[key] || !relativePath(c[key].path) || c[key].method!==(key==='create'?'POST':'DELETE')) throw new Error(`${key} needs an allowed method and an absolute relative path`);
 }
 if(!Array.isArray(c.probes)||c.probes.length===0) throw new Error('At least one probe is required');
 if(c.probes.length>30) throw new Error('Maximum 30 probes');
 const names=new Set();
 for (const p of c.probes){
   if(typeof p.name!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(p.name)||names.has(p.name)) throw new Error('Probe names must be unique, simple identifiers');
   names.add(p.name);
   if(!allowedTypes.has(p.type)) throw new Error(`Unsupported probe type for ${p.name}`);
   if(p.type==='http'){
     if(!relativePath(p.path)) throw new Error(`HTTP probe ${p.name} requires a relative path`);
     if(p.expect!== 'status404' && p.expect!=='jsonZero' && p.expect!=='jsonFalse') throw new Error(`Unsupported HTTP expectation on ${p.name}`);
     if(p.expect!=='status404' && (!Array.isArray(p.jsonPath)||p.jsonPath.length===0||p.jsonPath.length>10||!p.jsonPath.every(k=>typeof k==='string'&&isSafeIdentifier(k)))) throw new Error(`HTTP probe ${p.name} needs a safe jsonPath array`);
   }
   if(p.type==='postgres' && ![p.schema,p.table,p.column].every(isSafeIdentifier)) throw new Error(`postgres probe ${p.name} requires safe schema/table/column identifiers`);
   if(p.type==='postgres'&&p.connectionEnv!==undefined&&!/^[A-Z][A-Z0-9_]*$/.test(p.connectionEnv))throw new Error(`Invalid postgres connectionEnv for ${p.name}`);
   if(p.type==='redis' && p.host!==undefined && (typeof p.host!=='string'||p.host.startsWith('-')||!/^[a-zA-Z0-9.:-]+$/.test(p.host)))throw new Error(`Invalid Redis host for ${p.name}`);
   if(p.type==='redis' && p.port!==undefined && (!Number.isInteger(p.port)||p.port<1||p.port>65535))throw new Error(`Invalid Redis port for ${p.name}`);
   if(p.type==='redis' && (typeof p.key!=='string'||!p.key.includes('{{subject}}'))) throw new Error(`redis probe ${p.name} requires a subject-scoped key`);
   if(p.type==='s3' && p.endpointUrl!==undefined){
     let u;try{u=new URL(p.endpointUrl)}catch{throw new Error(`Invalid S3 endpointUrl for ${p.name}`)}
     if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||!['http:','https:'].includes(u.protocol))throw new Error(`Invalid S3 endpointUrl for ${p.name}`);
     if(u.protocol==='http:'&&!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw new Error(`Insecure remote S3 endpointUrl for ${p.name}`);
   }
   if(p.type==='s3' && (typeof p.bucket!=='string'||!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(p.bucket)||typeof p.key!=='string'||!p.key.includes('{{subject}}'))) throw new Error(`s3 probe ${p.name} requires bucket and subject-scoped key`);
 }
 const o=c.observation??{};
 if(!Number.isInteger(o.intervalMs)||o.intervalMs<100||o.intervalMs>600000) throw new Error('observation.intervalMs must be 100..600000');
 if(!Number.isInteger(o.durationMs)||o.durationMs<o.intervalMs||o.durationMs>86400000) throw new Error('observation.durationMs must be between intervalMs and 24 hours');
 // graceMs allows asynchronous deletion pipelines time to finish; at least one sample must follow it.
 if(o.graceMs!==undefined&&(!Number.isInteger(o.graceMs)||o.graceMs<0||o.graceMs+o.intervalMs>o.durationMs)) throw new Error('observation.graceMs must be an integer from 0 to durationMs - intervalMs');
 if(c.authTokenEnv!==undefined&&!/^[A-Z][A-Z0-9_]*$/.test(c.authTokenEnv))throw new Error('authTokenEnv must name an environment variable');
 return c;
}
