import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createRitaAnalyzer} from '../src/rita-analyzer.js';
function image(id,{sha256='a'.repeat(64),width=32,height=32,format='rgb8',segmented=true,revision=1}={}){
 return {sha256,segmented,surface:{descriptor:{id,revision,width,height,format},async readWindow(r){return {pixels:{width:r.width,height:r.height,data:new Uint8Array(r.width*r.height*3)},release(){}};}}};
}
function fixture(){
 const budget=new Budget(64*1024**2);let calls=0;
 const analyzer=createRitaAnalyzer({segments:{stages:[{},{},{},{}],assets:{},checkpointSha256:'c'.repeat(64)},budget,createPool:()=>({clear(){},dispose(){}}),network:async rgb=>{
  calls++;const n=rgb.width*rgb.height,values=new Float32Array(4*n);values.fill(4,2*n,3*n);let disposed=false;
  return {logits:{channels:4,width:rgb.width,height:rgb.height,length:4*n,byteLength:16*n,async readRows(top,rows){assert.equal(disposed,false);const count=rows*rgb.width,data=new Float32Array(count*4);for(let c=0;c<4;c++)data.set(values.subarray(c*n+top*rgb.width,c*n+(top+rows)*rgb.width),c*count);return {data,release(){}};},async readInto(target,offset){assert.equal(disposed,false);target.set(values.subarray(offset,offset+target.length));},async readBytes(target,offset){assert.equal(disposed,false);target.set(new Uint8Array(values.buffer,offset,target.byteLength));}},executions:[],async release(){assert.equal(disposed,false);disposed=true;}};
 }});
 return {analyzer,budget,get calls(){return calls;}};
}
async function run(f,input,options={}){const result=await f.analyzer.analyze(input,{},options);const hit=result.metrics.cache.result,provenance=result.provenance;await result.release();return {hit,provenance};}
async function close(f){await f.analyzer.dispose();assert.equal(f.budget.active,0);assert.equal(f.budget.retained,0);}
test('verified immutable source SHA reuses native output across new decoded surface identities and reports the current provenance',async()=>{
 const f=fixture();try{assert.equal((await run(f,image('decoded-first'),{immutableSource:true})).hit,false);const second=await run(f,image('decoded-second',{revision:8}),{immutableSource:true});assert.equal(second.hit,true);assert.equal(f.calls,1);assert.equal(second.provenance.sourceSurfaceIdentity,'decoded-second/8');assert.equal(second.provenance.originalSourceSha256,'a'.repeat(64));}finally{await close(f);}
});
test('arbitrary surfaces preserve their UUID/revision key unless the verified-blob contract is explicitly enabled',async()=>{
 const f=fixture();try{await run(f,image('first'));assert.equal((await run(f,image('second'))).hit,false);assert.equal(f.calls,2);assert.equal((await run(f,image('second'))).hit,true);assert.equal((await run(f,image('second',{revision:2}))).hit,false);assert.equal(f.calls,3);}finally{await close(f);}
});
test('unsegmented or malformed-SHA sources cannot enter the immutable blob cache even with the flag',async()=>{
 for(const options of [{segmented:false},{sha256:'not-a-verified-sha'},{sha256:'A'.repeat(64)}]){const f=fixture();try{await run(f,image('first',options),{immutableSource:true});assert.equal((await run(f,image('second',options),{immutableSource:true})).hit,false);assert.equal(f.calls,2);}finally{await close(f);}}
});
test('a changed original SHA, dimensions, pixel format or backend invalidates the native immutable cache',async()=>{
 for(const variant of [{image:{sha256:'b'.repeat(64)}},{image:{width:64}},{image:{height:64}},{image:{format:'rgb-flags8'}},{options:{backend:'cpu'}}]){const f=fixture();try{await run(f,image('first'),{immutableSource:true});const changed=await run(f,image('second',variant.image),{immutableSource:true,...variant.options});assert.equal(changed.hit,false);assert.equal(f.calls,2);}finally{await close(f);}}
});
test('same direct surface identity remains cached and changes of the view threshold do not enter the scientific key',async()=>{
 const f=fixture();try{const input=image('direct',{segmented:false});await run(f,input);const result=await f.analyzer.analyze(input,{threshold:.9});assert.equal(result.metrics.cache.result,true);assert.equal(f.calls,1);await result.release();}finally{await close(f);}
});
