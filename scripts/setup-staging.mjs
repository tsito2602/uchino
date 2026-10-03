import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const config=JSON.parse(await readFile('wrangler.staging.jsonc','utf8'));
if(config.name!=='uchino-staging')throw new Error('Unexpected Worker name');
const run=(args)=>{const result=spawnSync('npx',['--no-install','wrangler',...args],{encoding:'utf8',env:{...process.env,CI:'true'}});if(result.status!==0)throw new Error(result.stderr||result.stdout||'Cloudflare command failed');return result.stdout;};
const output=run(['d1','list','--json']);
const start=output.indexOf('['),end=output.lastIndexOf(']');
const list=JSON.parse(output.slice(start,end+1));
let database=list.find(item=>item.name==='uchino-staging');
if(!database){run(['d1','create','uchino-staging']);const refreshed=run(['d1','list','--json']);database=JSON.parse(refreshed.slice(refreshed.indexOf('['),refreshed.lastIndexOf(']')+1)).find(item=>item.name==='uchino-staging');}
if(!database?.uuid)throw new Error('D1 database could not be resolved');
config.d1_databases=[{binding:'DB',database_name:'uchino-staging',database_id:database.uuid,migrations_dir:'migrations'}];
await writeFile('wrangler.staging.jsonc',JSON.stringify(config,null,2)+'\n');
console.log('uchino-staging D1 binding configured.');
