#!/usr/bin/env node
import {writeFile,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {loadConfig,assertTargetSafety} from './config.js';
import {execute} from './engine.js';
import {render,FORMATS} from './report.js';

const VERSION='0.2.0';
const usage=`EraseLoop ${VERSION} — synthetic deletion regression tests
Usage:
  eraseloop run --config path.json [--format ${FORMATS.join('|')}] [--output report.html]
  eraseloop validate --config path.json
  eraseloop version
Options:
  --ack-remote-test-only   Allow HTTPS remote non-production test environments
Exit codes: 0 pass, 1 regression, 2 invalid usage/config, 3 inconclusive\n`;
async function main(args){
 if(!args.length||args.includes('--help')||args.includes('-h')||args[0]==='help'){console.log(usage);return 0;}
 const op=args[0];if(op==='version'||op==='--version'){console.log(`eraseloop ${VERSION}`);return 0;}
 if(!['validate','run'].includes(op)){console.error(usage);return 2;}
 const options={};for(let i=1;i<args.length;i++){const key=args[i];if(key==='--ack-remote-test-only'){options.ack=true;continue;}if(!['--config','--format','--output'].includes(key)||i===args.length-1){console.error(`Unexpected argument: ${key}`);return 2;}options[key.slice(2)]=args[++i];}
 if(!options.config){console.error('--config is required');return 2;}
 const format=options.format??'text';
 // Reject bad report options before the run: create/delete really call the target API.
 if(!FORMATS.includes(format)){console.error(`--format must be one of: ${FORMATS.join(', ')}`);return 2;}
 try{
  const c=await loadConfig(options.config);assertTargetSafety(c,options.ack);
  if(op==='validate'){console.log(`Valid test configuration: ${c.probes.length} probes`);return 0;}
  if(options.output){
   const dir=await stat(dirname(resolve(options.output))).catch(()=>null);
   if(!dir?.isDirectory()){console.error(`Output directory does not exist: ${dirname(resolve(options.output))}`);return 2;}
  }
  const report=await execute(c);const result=render(report,format);
  if(options.output)await writeFile(options.output,result,{mode:0o600});else process.stdout.write(result);
  return report.result==='passed'?0:report.result==='failed'?1:3;
 }catch(err){console.error('Error:',err instanceof Error?err.message:'Unexpected error');return 2;}
}
process.exitCode=await main(process.argv.slice(2));
