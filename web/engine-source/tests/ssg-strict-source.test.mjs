import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {prepareSsgImage} from '../src/ssg-full-input.js';
import {createSsgStrictSource} from '../src/ssg-strict-source.js';

async function fixture({width=24,height=20,acquisitions=[],exclusions=[],poison=0,onRead,onRelease,budgetBytes=128*1024**2}={}){
 const budget=new Budget(budgetBytes),state=await createOriginalSourceRegionsState({sourceSha256:'a'.repeat(64),width,height});
 for(const b of acquisitions)await state.add('acquisition',{x0:b[0],y0:b[1],x1:b[2],y1:b[3]});for(const b of exclusions)await state.add('exclusion',{x0:b[0],y0:b[1],x1:b[2],y1:b[3]});
 const domain=await compileOriginalSourceRegions(state.snapshot()),rgb=new Uint8Array(width*height*3),reads=[],windows=new Set();for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)rgb[(y*width+x)*3+c]=domain.contains(x-domain.origin[0],y-domain.origin[1])?(x*17+y*3+c*61)%256:poison;
 const source={sha256:'a'.repeat(64),descriptor:{id:'ssg-input',revision:1,width,height,format:'rgb8'},async readWindow(rect){await onRead?.(rect,reads.length);const lease=budget.reserve(rect.width*rect.height*3),data=new Uint8Array(rect.width*rect.height*3);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){assert(domain.contains(rect.x+x-domain.origin[0],rect.y+y-domain.origin[1]),'An excluded RGB observation entered SSG.');data.set(rgb.subarray(((rect.y+y)*width+rect.x+x)*3,((rect.y+y)*width+rect.x+x)*3+3),(y*rect.width+x)*3);}reads.push({...rect});const part={pixels:{width:rect.width,height:rect.height,format:'rgb8',data},async release(){if(!windows.has(part))return;await onRelease?.();windows.delete(part);lease();}};windows.add(part);return part;}};
 const view=await createSourceRegionView(source,domain.descriptor,{budget,maxReadPixels:37});return{budget,domain,view,rgb,reads,windows,async close(){await view.dispose();assert.equal(windows.size,0);assert.equal(budget.total(),0);}};
}

test('full rectangle uses native cubic RGB/grayscale arithmetic exactly at scale1 and resized geometry',async()=>{
 for(const normalizationLongEdge of [0,47]){const f=await fixture();let owner,actual,expected;try{owner=await createSsgStrictSource(f.view,{normalizationLongEdge},{budget:f.budget});assert.equal(owner.contexts.length,1);actual=await owner.read(owner.contexts[0]);expected=await prepareSsgImage({format:'rgb8',width:24,height:20,data:f.rgb},{normalizationLongEdge},{budget:f.budget});assert.deepEqual(actual.rgb,expected.rgb);assert.deepEqual(actual.gray,expected.gray);assert.equal(actual.metadata.incompleteCubicSupportPixels,0);}finally{actual?.release();expected?.release();await owner?.dispose();await f.close();}}
});

test('holes and disjoint acquisitions are excluded before resampling; all admitted target centers are present once',async()=>{
 const cases=[{acquisitions:[[1,2,9,18],[14,3,23,16]],exclusions:[[4,6,6,9]]},{exclusions:[[9,3,15,17]]}];
 for(const geometry of cases){const f=await fixture(geometry);let owner;try{owner=await createSsgStrictSource(f.view,{normalizationLongEdge:49},{budget:f.budget});const seen=new Set();for(const c of owner.contexts){const part=await owner.read(c);try{for(let y=c.y;y<c.y+c.height;y++)for(let x=c.x;x<c.x+c.width;x++){const rawX=Math.floor((x+.5)/owner.scaleX),rawY=Math.floor((y+.5)/owner.scaleY);assert(f.domain.contains(rawX,rawY));assert(!seen.has(x+':'+y));seen.add(x+':'+y);}assert(part.rgb.every(Number.isFinite)&&part.gray.every(Number.isFinite));}finally{part.release();}}let expected=0;for(let y=0;y<owner.height;y++)for(let x=0;x<owner.width;x++)if(f.domain.contains(Math.floor((x+.5)/owner.scaleX),Math.floor((y+.5)/owner.scaleY)))expected++;assert.equal(seen.size,expected);}finally{await owner?.dispose();await f.close();}}
});

test('poisoned excluded RGB cannot affect common-grid inputs or their support metadata',async()=>{
 const geometry={acquisitions:[[1,2,9,18],[14,3,23,16]],exclusions:[[4,6,6,9]]},a=await fixture({...geometry,poison:0}),b=await fixture({...geometry,poison:255});let x,y;try{x=await createSsgStrictSource(a.view,{normalizationLongEdge:41},{budget:a.budget});y=await createSsgStrictSource(b.view,{normalizationLongEdge:41},{budget:b.budget});assert.deepEqual(x.contexts,y.contexts);for(let i=0;i<x.contexts.length;i++){const aa=await x.read(x.contexts[i]),bb=await y.read(y.contexts[i]);try{assert.deepEqual(aa.rgb,bb.rgb);assert.deepEqual(aa.gray,bb.gray);assert.equal(aa.metadata.incompleteCubicSupportPixels,bb.metadata.incompleteCubicSupportPixels);}finally{aa.release();bb.release();}}}finally{await x?.dispose();await y?.dispose();await a.close();await b.close();}
});

test('a completed initialization AbortSignal is not the lifetime of future source reads',async()=>{
 const f=await fixture(),old=new AbortController();let owner,part;try{owner=await createSsgStrictSource(f.view,{}, {budget:f.budget,signal:old.signal});old.abort();part=await owner.read(owner.contexts[0],{signal:new AbortController().signal});assert(part.rgb.length>0);}finally{part?.release();await owner?.dispose();await f.close();}
});

test('native normalization parameters are captured and immutable',async()=>{
 const f=await fixture(),p={normalizationLongEdge:0};let owner,part;try{owner=await createSsgStrictSource(f.view,p,{budget:f.budget});p.normalizationLongEdge=3000;assert.equal(owner.width,24);assert.throws(()=>owner.parameters.normalizationLongEdge=1);part=await owner.read(owner.contexts[0]);assert.equal(part.metadata.normalizationLongEdge,0);await assert.rejects(owner.read({...owner.contexts[0]}),/another owner/);}finally{part?.release();await owner?.dispose();await f.close();}
});

test('close waits a pending native window and concurrent dispose calls share completion',async()=>{
 let entered,continueRead;const started=new Promise(r=>entered=r),gate=new Promise(r=>continueRead=r),f=await fixture({onRead:async()=>{entered();await gate;}});let owner;try{owner=await createSsgStrictSource(f.view,{normalizationLongEdge:0},{budget:f.budget});const pending=owner.read(owner.contexts[0]);await started;const first=owner.dispose(),second=owner.dispose();assert.equal(first,second);let closed=false;first.then(()=>closed=true);await Promise.resolve();assert.equal(closed,false);continueRead();await assert.rejects(pending,/retired during/);await first;assert.equal(f.windows.size,0);}finally{continueRead?.();await owner?.dispose();await f.close();}
});
