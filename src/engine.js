import {randomBytes} from 'node:crypto';
import {callApi} from './request.js';
import {probeState} from './probes.js';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const syntheticSubject=()=>`el_${randomBytes(12).toString('hex')}`;

// Per-probe verdict from its own samples: reappearance after an absent sample always fails;
// presence fails only once the grace period (time allowed for asynchronous deletion) has passed.
function probeVerdict(baselineState,samples){
 if(baselineState!=='present')return{result:'inconclusive',reason:'baseline_not_detected'};
 let seenAbsent=false,reappeared=false,lingering=false,unknown=false;
 for(const s of samples){
  if(s.state==='unknown')unknown=true;
  if(s.state==='present'){if(seenAbsent)reappeared=true;if(!s.within_grace)lingering=true;}
  if(s.state==='absent')seenAbsent=true;
 }
 if(reappeared)return{result:'failed',reason:'data_reappeared'};
 if(lingering)return{result:'failed',reason:'data_still_present'};
 if(unknown)return{result:'inconclusive',reason:'unverified_probe'};
 if(!seenAbsent)return{result:'inconclusive',reason:'no_confirmed_absence'};
 return{result:'passed'};
}

// A passing run proves only the configured observations, within the stated time window.
export async function execute(config,{fetchImpl=fetch,execImpl,clock=()=>Date.now(),wait=sleep,subject=syntheticSubject()}={}){
 const grace=config.observation.graceMs??0;
 const report={schema_version:'1',tool:'EraseLoop',subject_fingerprint:subject.slice(0,3)+'…'+subject.slice(-6),result:'inconclusive',
  observation:{interval_ms:config.observation.intervalMs,duration_ms:config.observation.durationMs,grace_ms:grace},
  observations:[],probes:config.probes.map(p=>({name:p.name,type:p.type})),limitations:[
  'Only explicitly configured stores and the configured observation window are verified.',
  'Backups, third-party processors, logs, replicas and unconfigured stores are not covered.',
  'Never interpret this report as legal proof of erasure or complete system-wide deletion.'
 ]};
 const params={fetchImpl,execImpl};
 const sample=async(phase,extra={})=>{
  const records=[];
  for(const p of config.probes){const observation=await probeState(config,p,subject,params);records.push({name:p.name,state:observation.state, ...(observation.reason?{reason:observation.reason}:{})});}
  report.observations.push({phase,t_ms:Math.max(0,clock()-start),...extra,checks:records});return records;
 };
 const start=clock();
 try{
  await callApi(config,'create',subject,fetchImpl);
  const baseline=await sample('baseline');
  if(baseline.some(x=>x.state!=='present')) {
    // Cleanup synthetic account even when a baseline probe cannot prove it exists.
    try{await callApi(config,'delete',subject,fetchImpl);}catch{report.cleanup='delete_attempt_failed';}
    report.probes=report.probes.map((p,i)=>({...p,...probeVerdict(baseline[i].state,[])}));
    report.result='inconclusive';report.reason='baseline_not_detected';return report;
  }
  await callApi(config,'delete',subject,fetchImpl);
  const period=config.observation.durationMs,interval=config.observation.intervalMs;
  const perProbe=config.probes.map(()=>[]);
  for(let planned=0;planned<=period;planned+=interval){
    if(planned>0)await wait(interval);
    const withinGrace=planned<grace;
    const records=await sample('post_delete',withinGrace?{within_grace:true}:{});
    records.forEach((r,i)=>perProbe[i].push({state:r.state,within_grace:withinGrace}));
  }
  report.probes=report.probes.map((p,i)=>({...p,...probeVerdict(baseline[i].state,perProbe[i])}));
  const verdicts=report.probes;
  const failed=verdicts.filter(v=>v.result==='failed');
  if(failed.length){
    report.result='failed';
    report.reason=failed.some(v=>v.reason==='data_reappeared')?'data_reappeared':'data_still_present';
  }else if(verdicts.every(v=>v.result==='passed')){
    report.result='passed';
  }else{
    report.result='inconclusive';
    report.reason=verdicts.some(v=>v.reason==='unverified_probe')?'unverified_probe':'no_confirmed_absence';
  }
 }catch(err){report.result='inconclusive';report.reason='lifecycle_failed';report.error=err instanceof Error?err.message:'Unexpected failure';}
 return report;
}
