// A deliberately simple local fixture; it does not persist data or represent production security.
import http from 'node:http';
const users=new Set();const port=Number(process.env.PORT||8791);
const mode=process.env.REAPPEAR==='1';
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 const match=u.pathname.match(/^\/test-users\/([a-zA-Z0-9_-]+)$/);
 const json=(status,doc)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(doc));};
 if(req.method==='POST'&&u.pathname==='/test-users'){
  let body='';for await(const chunk of req)body+=chunk;if(body.length>2048)return json(413,{error:'too_large'});
  let parsed;try{parsed=JSON.parse(body)}catch{return json(400,{error:'invalid_json'})}
  if(!/^el_[a-f0-9]{24}$/.test(parsed.subject))return json(400,{error:'invalid_subject'});
  users.add(parsed.subject);return json(201,{created:true});
 }
 if(req.method==='DELETE'&&match){users.delete(match[1]);if(mode)setTimeout(()=>users.add(match[1]),250);return json(200,{deleted:true});}
 if(req.method==='GET'&&match){return json(200,{count:users.has(match[1])?1:0});}
 json(404,{error:'not_found'});
}).listen(port,'127.0.0.1',()=>console.log(`EraseLoop demo fixture at http://127.0.0.1:${port}`));
