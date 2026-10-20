import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceParameterConstraint as bounds,constrainSourceParameterValue as constrain,hexPageNavigation,automaticBoundaryValue} from '../sherloq-browser/assets/source-parameter-constraints.js';
import {plotData,plotsParams} from '../../engine-source/src/plots.js';
import {hexView,hexParams} from '../../engine-source/src/metadata.js';
import {waveletParams} from '../../engine-source/src/wavelets.js';

test('RGB and HSV sampling share the exact native source limit, independently of proxy dimensions',()=>{
 const source={width:1537,height:1153};assert.deepEqual(bounds('colors.plots','scale',source),{min:0,max:10,step:1,nullable:true,automatic:{value:null,boundary:0}});
 for(const scale of [14,18,23])assert.deepEqual(constrain('colors.plots','scale',scale,source),{value:10,changed:true,valid:true,constraint:bounds('colors.plots','scale',source)});
 assert.equal(bounds('colors.plots','scale',{width:1,height:1}).max,0);assert.equal(bounds('colors.plots','scale',{width:2**31,height:2**31}).max,30);
});
test('unknown source dimensions do not create a fabricated source-specific bound',()=>{for(const source of [{},{width:0,height:10},{width:10.5,height:10},{width:NaN,height:10}])assert.equal(bounds('colors.plots','scale',source),null);});
test('the native plot guard rejects the reported scales before any OpenCV work',async()=>{for(const scale of[14,18,23])await assert.rejects(plotData({width:1537,height:1153},plotsParams({scale})),{code:'INVALID_INPUT',message:'Sampling scale exceeds the native image limit.'});});
test('source correction preserves nullable Automatic, valid integers, and the original settings object',()=>{const source={width:1537,height:1153},settings={scale:18},before=structuredClone(settings);assert.equal(constrain('colors.plots','scale',null,source).value,null);assert.equal(constrain('colors.plots','scale',8,source).changed,false);constrain('colors.plots','scale',settings.scale,source);assert.deepEqual(settings,before);for(const value of[1.5,'18',NaN,Infinity])assert.equal(constrain('colors.plots','scale',value,source).valid,false);});
test('hex offset is bounded by the actual original byte count and accepts EOF exactly',()=>{const source={byteLength:1025};assert.deepEqual(bounds('file.hex','offset',source),{min:0,max:1025,step:1});assert.equal(constrain('file.hex','offset',6e15,source).value,1025);assert.equal(constrain('file.hex','offset',1025,source).changed,false);assert.equal(bounds('file.hex','offset',{byteLength:0}).max,0);assert.equal(bounds('file.hex','offset',{}),null);});
test('page size keeps the native contract and reports remaining bytes without an invented limit',()=>{assert.deepEqual(bounds('file.hex','length',{byteLength:1025,offset:1024}),{min:1,max:65536,step:1,remainingBytes:1});assert.equal(constrain('file.hex','length',256,{byteLength:1}).value,256);assert.equal(constrain('file.hex','length',99999,{byteLength:1}).value,65536);});
test('hex navigation reaches the final partial page, EOF, and previous page without escaping the file',()=>{const p=hexPageNavigation({offset:1024,length:256,totalBytes:1025});assert.equal(p.end,1025);assert.equal(p.nextOffset,1025);assert.equal(p.nextDisabled,true);assert.equal(p.previousOffset,768);const eof=hexPageNavigation({offset:1025,length:256,totalBytes:1025});assert.equal(eof.eof,true);assert.equal(eof.end,1025);assert.equal(eof.previousOffset,769);assert.equal(eof.nextDisabled,true);const empty=hexPageNavigation({offset:0,length:256,totalBytes:0});assert.equal(empty.previousDisabled&&empty.nextDisabled,true);});
test('hex window arithmetic stays exact at the safe-integer boundary',()=>{const p=hexPageNavigation({offset:Number.MAX_SAFE_INTEGER-3,length:65536,totalBytes:Number.MAX_SAFE_INTEGER});assert.equal(p.end,Number.MAX_SAFE_INTEGER);assert.equal(p.remainingBytes,3);});
test('invalid hex page inputs remain visible errors rather than being hidden in navigation',()=>{for(const p of[{offset:1026,length:256,totalBytes:1025},{offset:0,length:0,totalBytes:1025},{offset:0,length:65537,totalBytes:1025},{offset:.5,length:256,totalBytes:1025}])assert.throws(()=>hexPageNavigation(p),/Invalid original-byte page/);});
test('native hex reads preserve the chosen page length, truncate bytes and accept EOF',async()=>{const bytes=Uint8Array.of(2,3,5,7,11),p=hexParams({offset:4,length:256}),r=await hexView(null,p,{}, {bytes});assert.equal(p.length,256);assert.deepEqual([...r.data.bytes],[11]);assert.equal((await hexView(null,hexParams({offset:5}),{}, {bytes})).data.bytes.length,0);await assert.rejects(hexView(null,hexParams({offset:6}),{}, {bytes}),{code:'INVALID_INPUT'});assert.deepEqual([...bytes],[2,3,5,7,11]);});
test('Automatic exists only for the wavelet decomposition level, never its threshold',()=>{assert.deepEqual(bounds('detail.wavelets','level'),{min:0,max:30,step:1,nullable:true,automatic:{value:null,boundary:0}});assert.equal(bounds('detail.wavelets','threshold'),null);assert.equal(waveletParams({threshold:10,level:null}).level,null);assert.equal(waveletParams({threshold:10,level:0}).level,0);assert.equal(waveletParams({threshold:10,level:1}).level,1);assert.throws(()=>waveletParams({threshold:-1}),{code:'INVALID_INPUT'});});
test('the keyboard detent requires a deliberate command and stops repeated numeric arrows',()=>{
 assert.deepEqual(automaticBoundaryValue(0,'ArrowDown'),{handled:true,value:0});
 assert.deepEqual(automaticBoundaryValue(0,'ArrowLeft',{altKey:true}),{handled:true,value:null});
 assert.deepEqual(automaticBoundaryValue(0,'ArrowLeft',{altKey:true,repeat:true}),{handled:true,value:0});
 assert.deepEqual(automaticBoundaryValue(null,'ArrowUp'),{handled:true,value:0});
 assert.deepEqual(automaticBoundaryValue(null,'Home'),{handled:true,value:0});
 assert.deepEqual(automaticBoundaryValue(1,'ArrowLeft',{value:0,boundary:1,altKey:true}),{handled:true,value:0});
 assert.deepEqual(automaticBoundaryValue(0,'ArrowRight',{value:0,boundary:1}),{handled:true,value:1});
 assert.equal(automaticBoundaryValue(1,'ArrowDown').handled,false);
});
