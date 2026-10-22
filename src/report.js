export const FORMATS=['text','json','html','markdown','junit'];
const esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const md=v=>String(v).replace(/\s+/g,' ').replace(/[\\|`*_[\]<]/g,c=>'\\'+c);
const phaseLabel=o=>o.within_grace?`${o.phase} (grace)`:o.phase;

function markdown(report){
 const icon={passed:'✅',failed:'❌',inconclusive:'⚠️'}[report.result]??'';
 const lines=[`## EraseLoop deletion test: ${icon} ${report.result.toUpperCase()}`,'',
  `Subject \`${report.subject_fingerprint}\` · ${report.observations.length} samples${report.reason?` · **${md(report.reason)}**`:''}`];
 if(report.error)lines.push('',`> ${md(report.error)}`);
 const verdicts=report.probes.filter(p=>p.result);
 if(verdicts.length){
  lines.push('','| Probe | Type | Result | Reason |','|---|---|---|---|');
  for(const p of verdicts)lines.push(`| ${md(p.name)} | ${md(p.type)} | ${p.result} | ${md(p.reason??'')} |`);
 }
 lines.push('','<details><summary>Timeline</summary>','','| Phase | Offset (ms) | '+report.probes.map(p=>md(p.name)).join(' | ')+' |','|---|---|'+report.probes.map(()=>'---|').join(''));
 for(const o of report.observations)lines.push(`| ${phaseLabel(o)} | ${o.t_ms} | `+o.checks.map(c=>c.state+(c.reason?` (${md(c.reason)})`:'')).join(' | ')+' |');
 lines.push('','</details>','',`<sub>${report.limitations.map(md).join(' ')}</sub>`);
 return lines.join('\n')+'\n';
}

// JUnit XML: one test case per probe, so CI test tabs show which store kept the data.
function junit(report){
 const xml=v=>esc(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
 const last=report.observations.at(-1);
 const seconds=((last?.t_ms??0)/1000).toFixed(3);
 const cases=report.probes.filter(p=>p.result).map(p=>{
  const name=`${p.name} (${p.type})`;
  if(p.result==='failed')return`  <testcase classname="eraseloop" name="${xml(name)}"><failure message="${xml(p.reason)}" type="${xml(p.reason)}">Data for the synthetic subject was observed after deletion (${xml(p.reason)}).</failure></testcase>`;
  if(p.result==='inconclusive')return`  <testcase classname="eraseloop" name="${xml(name)}"><error message="${xml(p.reason)}" type="inconclusive">The probe could not prove absence (${xml(p.reason)}).</error></testcase>`;
  return`  <testcase classname="eraseloop" name="${xml(name)}"/>`;
 });
 if(!cases.length)cases.push(`  <testcase classname="eraseloop" name="lifecycle"><error message="${xml(report.reason??'inconclusive')}" type="inconclusive">${xml(report.error??'The deletion lifecycle did not complete.')}</error></testcase>`);
 const failures=cases.filter(c=>c.includes('<failure')).length,errors=cases.filter(c=>c.includes('<error')).length;
 return`<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="EraseLoop" tests="${cases.length}" failures="${failures}" errors="${errors}" skipped="0" time="${seconds}">\n${cases.join('\n')}\n</testsuite>\n`;
}

export function render(report,format='text'){
 if(format==='json')return JSON.stringify(report,null,2)+'\n';
 if(format==='markdown')return markdown(report);
 if(format==='junit')return junit(report);
 if(format==='text'){
  const lines=[`EraseLoop | ${report.result.toUpperCase()} (${report.observations.length} samples)`, `Subject: ${report.subject_fingerprint}`];
  if(report.reason)lines.push(`Reason: ${report.reason}`);
  if(report.error)lines.push(`Error: ${report.error}`);
  for(const o of report.observations)lines.push(`${phaseLabel(o).padEnd(19)} ${String(o.t_ms).padStart(6)}ms  ${o.checks.map(c=>`${c.name}=${c.state}`).join('  ')}`);
  for(const p of report.probes.filter(p=>p.result))lines.push(`Probe ${p.name}: ${p.result}${p.reason?` (${p.reason})`:''}`);
  return lines.join('\n')+'\n';
 }
 if(format!=='html')throw new Error(`Format must be one of: ${FORMATS.join(', ')}`);
 const rows=report.observations.flatMap(o=>o.checks.map(c=>`<tr><td>${esc(phaseLabel(o))}</td><td>${o.t_ms}</td><td>${esc(c.name)}</td><td class="${esc(c.state)}">${esc(c.state)}</td><td>${esc(c.reason||'—')}</td></tr>`)).join('');
 const limitations=report.limitations.map(s=>`<li>${esc(s)}</li>`).join('');
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>EraseLoop | Deletion Regression Report</title><style>:root{color-scheme:dark}body{font:15px system-ui;background:#0a1320;color:#e4edf9;max-width:960px;padding:40px 20px;margin:auto}header{display:flex;justify-content:space-between;align-items:center}h1{font-size:34px}article{background:#142337;border:1px solid #2b3b53;border-radius:13px;padding:20px;margin:20px 0}.result{font-size:13px;padding:7px 13px;border-radius:8px;background:#28445b}table{width:100%;border-collapse:collapse;overflow-wrap:anywhere}th,td{padding:12px;border-bottom:1px solid #314057;text-align:left}th{color:#a9b9ce}.absent{color:#7cdbba}.present{color:#fca5a5}.unknown{color:#fcd34d}small{color:#9db3ca}</style></head><body><header><div><h1>EraseLoop</h1><small>Data deletion regression · evidence from synthetic tests</small></div><span class="result">${esc(report.result).toUpperCase()}</span></header><article><h2>Observations</h2><p>Subject fingerprint: ${esc(report.subject_fingerprint)} · ${report.observations.length} samples${report.reason?` · ${esc(report.reason)}`:''}</p><table><thead><tr><th>Phase</th><th>Offset</th><th>Probe</th><th>State</th><th>Detail</th></tr></thead><tbody>${rows}</tbody></table></article><article><h2>Limits</h2><ul>${limitations}</ul></article></body></html>`;
}
