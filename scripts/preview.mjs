import {createServer} from 'node:http';
import app from '../dist/worker.mjs';
const server=createServer(async(request,response)=>{try{const origin='http://127.0.0.1:8787';const init={method:request.method,headers:request.headers};if(!['GET','HEAD'].includes(request.method)){init.body=request;init.duplex='half';}const result=await app.fetch(new Request(new URL(request.url,origin),init),{APP_ENV:'staging'});response.writeHead(result.status,Object.fromEntries(result.headers));response.end(Buffer.from(await result.arrayBuffer()));}catch{response.writeHead(500);response.end('Preview error');}});
server.listen(8787,'0.0.0.0',()=>console.log('uchino preview: http://127.0.0.1:8787'));
