import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SignJWT} from 'jose';
import app from '../dist/worker.mjs';

export async function r2Backend({createBooks=true}={}){
 const database=new DatabaseSync(':memory:');database.exec(await readFile('migrations/0001_init.sql','utf8'));
 const DB={prepare(sql){let values=[];const stmt={bind(...args){values=args;return stmt;},async first(){return database.prepare(sql).get(...values)??null;},async all(){return {results:database.prepare(sql).all(...values)};},execute(){const result=database.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};},async run(){return stmt.execute();}};return stmt;},async batch(statements){database.exec('BEGIN');try{const results=statements.map(stmt=>stmt.execute());database.exec('COMMIT');return results;}catch(error){database.exec('ROLLBACK');throw error;}}};
 const objects=new Map(),calls={put:0,get:0,head:0};let failWrites=false;
 const info=(key)=>{const bytes=objects.get(key);return bytes?{size:bytes.length,httpEtag:`"${createHash('sha256').update(bytes).digest('hex')}"`}:null;};
 const bucket={
  async head(key){calls.head++;return info(key);},
  async put(key,bytes,options){calls.put++;if(failWrites)throw Error('private R2 failure');objects.set(key,Buffer.from(bytes));return info(key);},
  async get(key){calls.get++;const data=info(key);return data?{...data,body:new Response(objects.get(key)).body}:null;},
 };
 const env={APP_ENV:'staging',GOOGLE_CLIENT_ID:'test',GOOGLE_CLIENT_SECRET:'test',SESSION_SECRET:'r2-test-only-key-more-than-thirty-two-characters',ALLOWED_EMAILS:'user-a@example.test,user-b@example.test,user-c@example.test',DB,RECIPE_PHOTOS:bucket};
 const cookie=async user=>`__Host-uchino_session=${await new SignJWT({sub:user,email:`${user}@example.test`,name:'Test',purpose:'session'}).setProtectedHeader({alg:'HS256'}).setIssuer('uchino').setAudience('https://example.test').setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(env.SESSION_SECRET))}`;
 const request=async(path,options={},user='user-a')=>app.fetch(new Request(`https://example.test${path}`,{...options,headers:{Origin:'https://example.test','Content-Type':'application/json',...(user?{Cookie:await cookie(user)}:{}),...options.headers}}),env);
 // Most existing tests exercise users who already chose to create a recipe book.
 if(createBooks)for(const user of ['user-a','user-b','user-c']){const response=await request('/api/spaces',{method:'POST',body:JSON.stringify({name:'うちのレシピ',initial:true})},user);if(response.status!==201)throw new Error(await response.text());}
 const put=(data,revision=0,editId=crypto.randomUUID(),user='user-a',deleted=false)=>request(`/api/data/recipe/${data.id}`,{method:'PUT',body:JSON.stringify({data,revision,editId,deleted})},user);
 const record=id=>{const row=database.prepare('SELECT * FROM user_data WHERE user_id=? AND kind=? AND id=?').get('user-a','recipe',id);return row?{...row,data:JSON.parse(row.data)}:null;};
 const seed=(data,revision=1)=>database.prepare('INSERT INTO user_data(user_id,kind,id,data,revision,deleted,edit_id) VALUES (?,?,?,?,?,0,?)').run('user-a','recipe',data.id,JSON.stringify(data),revision,'legacy');
 return {env,database,bucket,objects,calls,request,put,record,seed,setFailWrites(value){failWrites=value;}};
}
