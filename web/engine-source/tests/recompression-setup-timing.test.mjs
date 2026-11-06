import test from 'node:test';import assert from 'node:assert/strict';
import {recompressionSetupTiming} from '../src/recompression-codec-client.js';
test('cold worker startup outside the body and native initialization inside it are added once',()=>{
 assert.deepEqual(recompressionSetupTiming(82,{milliseconds:42,setupMilliseconds:42,bodySetupMilliseconds:12,cold:true},true),{cold:true,bodySetupMilliseconds:12,setupMilliseconds:52});
 assert.equal(recompressionSetupTiming(82,{milliseconds:42,setupMilliseconds:60,bodySetupMilliseconds:12,cold:true},true).setupMilliseconds,60,'An independently measured larger setup remains authoritative.');
});
test('a warm provider does not subtract recurring transport or useful encoder work',()=>{
 assert.deepEqual(recompressionSetupTiming(22,{milliseconds:20,setupMilliseconds:0,bodySetupMilliseconds:0,cold:false},false),{cold:false,bodySetupMilliseconds:0,setupMilliseconds:0});
 assert.deepEqual(recompressionSetupTiming(22,{milliseconds:20,setupMilliseconds:7,bodySetupMilliseconds:7,cold:true},false),{cold:true,bodySetupMilliseconds:7,setupMilliseconds:9});
});
test('timing metadata stays finite when no native setup was reported',()=>{
 assert.equal(recompressionSetupTiming(14,{milliseconds:4},true).setupMilliseconds,10);
 assert.deepEqual(recompressionSetupTiming(14,{milliseconds:NaN,setupMilliseconds:NaN,bodySetupMilliseconds:-1},false),{cold:false,bodySetupMilliseconds:0,setupMilliseconds:0});
});
