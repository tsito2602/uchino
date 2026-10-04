import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {build} from 'esbuild';
const {outputFiles}=await build({entryPoints:['src/cook-timers.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {splitStepTimes}=await import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));
const timers=step=>splitStepTimes(step).filter(part=>part.seconds).map(part=>[part.text,part.seconds]);
test('compound durations become one timer',()=>{
 assert.deepEqual(timers('レンジで1分30秒加熱する'),[['1分30秒',90]]);
 assert.deepEqual(timers('１分３０秒加熱'),[['１分３０秒',90]]);
 assert.deepEqual(timers('1時間30分煮込む'),[['1時間30分',5400]]);
 assert.deepEqual(timers('1時間20分30秒寝かせる'),[['1時間20分30秒',4830]]);
 assert.deepEqual(timers('2分 30秒焼く'),[['2分 30秒',150]]);
});
test('single and separate durations keep working',()=>{
 assert.deepEqual(timers('10分煮て、さらに5分蒸らす'),[['10分',600],['5分',300]]);
 assert.deepEqual(timers('1時間半寝かせる'),[['1時間半',5400]]);
 assert.deepEqual(timers('5〜6分焼く'),[['5〜6分',300]]);
 assert.deepEqual(timers('30秒混ぜて1分置く'),[['30秒',30],['1分',60]]);
 assert.equal(splitStepTimes('1分30秒加熱する').map(part=>part.text).join(''),'1分30秒加熱する');
});
