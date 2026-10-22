const TIMEOUT_MS=10000;
export function substitute(template,subject){return template.replaceAll('{{subject}}',encodeURIComponent(subject));}

export async function callApi(config,action,subject,fetchImpl=fetch){
 const endpoint=config[action];
 const u=new URL(substitute(endpoint.path,subject), config.baseUrl);
 if(u.origin!==new URL(config.baseUrl).origin) throw new Error('Cross-origin endpoint is forbidden');
 const headers={'accept':'application/json'};
 if(config.authTokenEnv){const token=process.env[config.authTokenEnv];if(!token)throw new Error(`Missing token environment variable: ${config.authTokenEnv}`);headers.authorization=`Bearer ${token}`;}
 let body;
 if(endpoint.body!==undefined){body=JSON.stringify(JSON.parse(JSON.stringify(endpoint.body).replaceAll('{{subject}}',subject)));headers['content-type']='application/json';}
 let res;
 try {res=await fetchImpl(u,{method:endpoint.method,headers,body,redirect:'manual',signal:AbortSignal.timeout(TIMEOUT_MS)});}catch{throw new Error(`${action} request failed (connection or timeout)`);}
 if(res.status<200||res.status>=300) throw new Error(`${action} returned HTTP ${res.status}`);
 return res.status;
}
export async function getProbe(config,probe,subject,fetchImpl=fetch){
 const u=new URL(substitute(probe.path,subject),config.baseUrl);
 if(u.origin!==new URL(config.baseUrl).origin)throw new Error('Cross-origin probe URL is forbidden');
 const headers={accept:'application/json'};
 if(config.authTokenEnv){const t=process.env[config.authTokenEnv];if(!t)throw new Error('Missing authentication token');headers.authorization=`Bearer ${t}`;}
 let r;
 try{r=await fetchImpl(u,{headers,redirect:'manual',signal:AbortSignal.timeout(TIMEOUT_MS)});}catch{return {state:'unknown',reason:'request_failed'}}
 if(r.status>=300&&r.status<400)return{state:'unknown',reason:'redirect_rejected'};
 if(probe.expect==='status404')return r.status===404?{state:'absent'}:r.status>=200&&r.status<300?{state:'present'}:{state:'unknown',reason:`http_${r.status}`};
 if(!r.ok)return {state:'unknown',reason:`http_${r.status}`};
 let parsed;try{parsed=await r.json();}catch{return {state:'unknown',reason:'invalid_json'}}
 let item=parsed;for(const key of probe.jsonPath){if(!item||typeof item!=='object'||!Object.hasOwn(item,key))return {state:'unknown',reason:'missing_json_field'};item=item[key];}
 if(probe.expect==='jsonZero' && typeof item==='number'&&Number.isFinite(item))return {state:item===0?'absent':'present'};
 if(probe.expect==='jsonFalse'&&typeof item==='boolean')return {state:item===false?'absent':'present'};
 return {state:'unknown',reason:'invalid_json_value'};
}
