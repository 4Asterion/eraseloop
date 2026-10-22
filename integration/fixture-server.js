// Opt-in multi-store localhost fixture, using the same installed CLIs as probes.
// All data is synthetic, namespaced and produced for this test run.
import http from 'node:http';
import {runProcess,pgEnvFromUrl} from '../src/probes.js';
const port=Number(process.env.PORT||8792);
const bucket='eraseloop-fixtures';
const cli=(cmd,args,opts)=>runProcess(cmd,args,opts);
const pg=(sql,subject)=>cli('psql',['-X','-qAt','-v','ON_ERROR_STOP=1','-v',`subject=${subject}`],{stdin:sql,env:pgEnvFromUrl(process.env.ERASELOOP_PG_URL)});
const aws=(args)=>cli('aws',['--endpoint-url','http://127.0.0.1:59000',...args]);
const redis=(args)=>cli('redis-cli',['-h','127.0.0.1','-p','56379',...args]);
const validId=/^el_[0-9a-f]{24}$/;
function send(res,code,payload){res.writeHead(code,{'Content-Type':'application/json'});res.end(JSON.stringify(payload));}
async function main(){
 if(!pgEnvFromUrl(process.env.ERASELOOP_PG_URL??''))throw new Error('ERASELOOP_PG_URL must be a postgresql:// URL for the test database');
 const server=http.createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  try{
   let subject='';
   if(req.method==='POST'&&path==='/test-users'){
     let json='';for await(const chunk of req)json+=chunk;if(json.length>1024)return send(res,413,{error:'oversize'});
     try{subject=JSON.parse(json).subject}catch{return send(res,400,{error:'invalid_json'})}
     if(!validId.test(subject))return send(res,400,{error:'invalid_subject'});
     const ops=[
       pg('INSERT INTO public.synthetic_users(subject) VALUES(:\'subject\') ON CONFLICT DO NOTHING;\n',subject),
       redis(['SET',`eraseloop:${subject}`,'test']),
       aws(['s3api','put-object','--bucket',bucket,'--key',`users/${subject}/profile.json`,'--body',process.env.ERASELOOP_EMPTY_FIXTURE_FILE])
     ];
     const results=await Promise.all(ops);
     if(results.some(x=>!x.ok))return send(res,500,{error:'fixture_create_failed'});
     return send(res,201,{created:true});
   }
   const match=path.match(/^\/test-users\/(el_[0-9a-f]{24})$/);
   if(req.method==='DELETE'&&match){
      subject=match[1];
      const results=await Promise.all([
        pg('DELETE FROM public.synthetic_users WHERE subject = :\'subject\';\n',subject),
        redis(['DEL',`eraseloop:${subject}`]),
        aws(['s3api','delete-object','--bucket',bucket,'--key',`users/${subject}/profile.json`])
      ]);
      if(results.some(x=>!x.ok))return send(res,500,{error:'fixture_delete_failed'});
      if(process.env.REAPPEAR==='1')setTimeout(()=>void pg('INSERT INTO public.synthetic_users(subject) VALUES(:\'subject\') ON CONFLICT DO NOTHING;\n',subject),800);
      return send(res,200,{deleted:true});
   }
   return send(res,404,{error:'not_found'});
  }catch{return send(res,500,{error:'fixture_internal_error'})}
 });
 server.listen(port,'127.0.0.1',()=>console.log(`Multi-store fixture http://127.0.0.1:${port}`));
}
await main();
