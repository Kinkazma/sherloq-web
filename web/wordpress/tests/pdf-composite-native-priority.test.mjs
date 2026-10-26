import test from 'node:test';
import assert from 'node:assert/strict';
import {createPdfCompositeEffects,pdfGlobalEffects} from '../sherloq-browser/assets/pdf-composite-effects.js';
const effects={adjust:{enabled:true,brightness:20},enhance:{enabled:false},sweep:{enabled:false}};
const flush=()=>new Promise(r=>setImmediate(r));
function fixture(deferred=false,sourceCache){
 let resolve,closed=0,releases=0,builds=0,input;const requests=[],draws=[];
 const raw={width:600,height:800,owner:'source',fork:()=>({close(){closed++;},samplePixels:async request=>{requests.push(request);return{width:1,height:1,format:'rgb8',data:new Uint8Array(3)};}})};
 const lease={metrics:{computedTiles:0},prepare:(...args)=>{requests.push(args);return true;},ready:async(...args)=>requests.push(args),draw:(...args)=>draws.push(args),close(){releases++;}};
 const service={acquire(value){builds++;input=value;return deferred?new Promise(r=>resolve=r):Promise.resolve(lease);}};
 const surface=createPdfCompositeEffects({source:raw,effects,service,density:4,sourceCache});
 return{surface,requests,draws,resolve:()=>resolve(lease),get input(){return input;},get closed(){return closed;},get releases(){return releases;},get builds(){return builds;}};
}
test('PDF loupe uses one fixed native grid across zooms',async()=>{
 const f=fixture();await flush();assert.equal(f.input.width,2400);assert.equal(f.input.height,3200);
 const b={left:10,top:20,right:40,bottom:60};assert.equal(f.surface.prepare(b,2),true);assert.equal(f.surface.prepare(b,8),true);
 assert.equal(f.builds,1);assert.deepEqual(f.requests[0],[{left:40,top:80,right:160,bottom:240},.5]);assert.deepEqual(f.requests[1],[{left:40,top:80,right:160,bottom:240},2]);
 f.surface.close();await flush();assert.equal(f.releases,1);assert.equal(f.closed,1);
});
test('drawing scales the integer native assembly exactly once',async()=>{
 const f=fixture();await flush();const operations=[],ctx={save:()=>operations.push('save'),scale:(...a)=>operations.push(a),restore:()=>operations.push('restore')};
 const bounds={left:1,top:2,right:3,bottom:4};f.surface.draw(ctx,bounds,2);
 assert.deepEqual(operations,['save',[.25,.25],'restore']);assert.deepEqual(f.draws[0].slice(1),[{left:4,top:8,right:12,bottom:16},.5]);f.surface.close();
});
test('closing before worker registration keeps source until acquisition settles',async()=>{
 const f=fixture(true);f.surface.close();assert.equal(f.closed,0);f.resolve();await flush();assert.equal(f.releases,1);assert.equal(f.closed,1);assert.equal(f.surface.prepare({left:0,top:0,right:1,bottom:1}),false);
});
test('export lease retains source and prepared result after display closes',async()=>{
 const f=fixture();await flush();const exportLease=f.surface.fork();f.surface.close();await flush();assert.equal(f.closed,0);assert.equal(f.releases,0);assert.equal(exportLease.prepare({left:0,top:0,right:1,bottom:1}),true);exportLease.close();exportLease.close();await flush();assert.equal(f.closed,1);assert.equal(f.releases,1);
});
test('sharpening is a finite neighbourhood, not global statistics',()=>{
 assert.equal(pdfGlobalEffects({adjust:{enabled:true,sharpen:40,equalize:0,threshold:255},enhance:{enabled:false}}),false);
 assert.equal(pdfGlobalEffects({adjust:{enabled:true,sharpen:40,equalize:1,threshold:255},enhance:{enabled:false}}),true);
 assert.equal(pdfGlobalEffects({adjust:{enabled:true,equalize:0,threshold:0},enhance:{enabled:false}}),true);
 assert.equal(pdfGlobalEffects({adjust:{enabled:false},enhance:{enabled:true}}),true);
});
test('an export keeps its raw source when a page retires its independent RGB cache',async()=>{
 let closed=false,hits=0;const sourceCache={get metrics(){return{closed};},async readPixels(){if(closed)throw Object.assign(Error('retired'),{code:'CANCELLED'});hits++;return{width:1,height:1,format:'rgb8',data:new Uint8Array([5,6,7])};}};
 const f=fixture(false,sourceCache);await flush();const exportLease=f.surface.fork(),rect={x:0,y:0,width:1,height:1};
 assert.deepEqual((await f.input.readPixels(rect)).data,new Uint8Array([5,6,7]));assert.equal(hits,1);assert.equal(f.requests.length,0);
 closed=true;f.surface.close();assert.equal(f.closed,0);assert.deepEqual((await f.input.readPixels(rect)).data,new Uint8Array(3));assert.equal(f.requests.length,1);
 exportLease.close();await flush();assert.equal(f.closed,1);
});

