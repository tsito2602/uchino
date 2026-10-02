import test from 'node:test';
import assert from 'node:assert/strict';
import {syncFailure} from '../src/sync-error.ts';
test('sync distinguishes expired sessions and unconfigured storage without exposing server details',async()=>{
 assert.match((await syncFailure(new Response(null,{status:401}))).message,/再ログイン/);
 assert.match((await syncFailure(Response.json({code:'storage_unconfigured'},{status:503}))).message,/未設定/);
 assert.match((await syncFailure(Response.json({code:'storage_unavailable'},{status:503}))).message,/接続できません/);
 assert.match((await syncFailure(new Response(null,{status:409}))).message,/他の端末/);
 const message=(await syncFailure(new Response('private error',{status:500}))).message;assert.match(message,/端末のデータは保持/);assert.doesNotMatch(message,/private error/);
});
