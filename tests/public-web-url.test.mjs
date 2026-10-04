import test from 'node:test';
import assert from 'node:assert/strict';
import {publicWebUrl} from '../worker/public-web-url.ts';
test('public web URLs do not depend on a site allowlist',()=>{
 for(const url of ['https://oceans-nadia.com/user/22780/recipe/186141','http://example.com/recipe','https://asset.oceans-nadia.com/dish.jpg','https://例え.jp/レシピ'])assert.ok(publicWebUrl(url));
 assert.equal(publicWebUrl('../dish.jpg#photo',new URL('https://example.com/recipes/one')).href,'https://example.com/dish.jpg');
 assert.equal(publicWebUrl('https://example.com./recipe').hostname,'example.com');
});
test('non-web, local and disguised IP destinations fail before any fetch',()=>{
 for(const url of ['file:///etc/passwd','data:text/html,recipe','ftp://example.com/a','https://user:pass@example.com/a','http://localhost/a','http://localhost./a','http://a.localhost/a','https://metadata.google.internal/','https://printer.local/','http://127.1/','http://2130706433/','http://0x7f000001/','http://0177.0.0.1/','https://169.254.169.254/','https://10.0.0.1/','https://[::1]/','https://[::ffff:127.0.0.1]/','http://service/'])assert.throws(()=>publicWebUrl(url),undefined,url);
});
