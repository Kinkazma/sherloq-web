import test from 'node:test';
import assert from 'node:assert/strict';
import {originalXfeatFrame,xfeatContextCoordinate,writeXfeatNormalizedZeroPadding} from '../src/xfeat-strict-input-frame.js';
import {prepareXfeatStrictPopulation} from '../src/xfeat-strict-preparation.js';
import {Budget} from '../src/cache.js';
import {createXfeatRetirementOwner} from '../src/xfeat-retirement-owner.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import createPost from '../vendor/xfeat-paged/post.js';
import {allocateWasmMemory} from '../src/allocation.js';
import {prepareXfeatRows} from '../src/xfeat-paged-prepare.js';
import {researchRows} from '../src/m3-research-rows.js';
import {extractXfeatStrictNative} from '../src/xfeat-strict-native-features.js';
import {createXfeatStrictPost} from '../src/xfeat-strict-post.js';
import createNativeMasks from '../vendor/sparse-extract/sparse-extract.js';

const f=Math.fround;
test('Original phase32 includes source-domain origin and preserves literal sampling coordinates',()=>{
 for(const x of [0,1,17,30,31,32,225,544])for(const y of [0,1,18,31,32,245]){
  const r={x,y,width:224,height:192},origin=[17,9],frame=originalXfeatFrame(r,origin),context={rect:r,nativeFrame:frame,scaleX:1,scaleY:1};
  assert.equal((frame.origin[0]+origin[0])%32,0);assert.equal((frame.origin[1]+origin[1])%32,0);
  assert.deepEqual(xfeatContextCoordinate(context,frame.left,frame.top),[x,y]);
  assert.deepEqual(xfeatContextCoordinate(context,frame.left+223,frame.top+191),[x+223,y+191]);
  assert.equal(frame.width%32,0);assert.equal(frame.height%32,0);assert(frame.left<32&&frame.top<32&&frame.right<32&&frame.bottom<32);
 }
});
test('The unchanged full floor32 path and a non-evaluable context gain no invented native pixels',()=>{
 const frame=originalXfeatFrame({x:0,y:0,width:1261,height:1009},[0,0],{preservedRectangle:true});
 assert.equal(frame.width,1248);assert.equal(frame.height,992);assert.equal(frame.syntheticPixels,0);assert.deepEqual(frame.origin,[0,0]);
 const absent=originalXfeatFrame({x:3,y:2,width:5,height:5},[0,0],{evaluable:false});assert.equal(absent.width,0);assert.equal(absent.height,0);assert.equal(absent.syntheticPixels,0);
});
test('Padding writes only synthetic positions, normalizes to exact zero, and preserves a falsy source primary',async()=>{
 const budget=new Budget(1024**2),owner=createXfeatRetirementOwner(),nativeFrame=originalXfeatFrame({x:225,y:245,width:32,height:32},[0,0]),data=new Float32Array(nativeFrame.width*nativeFrame.height).fill(99),writes=[];
 const record={nativeFrame,evaluable:true,width:nativeFrame.width,height:nativeFrame.height,gray:{write(bytes,at){writes.push([at,bytes.length]);data.set(new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4),at/4);}}};
 try{await writeXfeatNormalizedZeroPadding(record,f(49.77877),{budget,owner});for(let y=0;y<record.height;y++)for(let x=0;x<record.width;x++){const real=x>=nativeFrame.left&&x<nativeFrame.left+32&&y>=nativeFrame.top&&y<nativeFrame.top+32;if(real)assert.equal(data[y*record.width+x],99);else assert.equal(f(f(data[y*record.width+x]-f(49.77877))*f(.023)),0);}}
 finally{owner.finish();await owner.dispose();}assert.equal(budget.total(),0);assert(writes.length>0);
 const failedOwner=createXfeatRetirementOwner();try{await assert.rejects(writeXfeatNormalizedZeroPadding({...record,gray:{write(){throw 0;}}},1,{budget,owner:failedOwner}),error=>error===0);}finally{failedOwner.finish();await failedOwner.dispose();}assert.equal(budget.total(),0);
});
async function fixture(poison,{selected=true}={}){
 const width=178,height=98,budget=new Budget(128*1024**2),state=await createOriginalSourceRegionsState({sourceSha256:'a'.repeat(64),width,height});
 if(selected){await state.add('acquisition',{x0:3,y0:2,x1:70,y1:95});await state.add('acquisition',{x0:97,y0:3,x1:174,y1:96});await state.add('exclusion',{x0:30,y0:40,x1:35,y1:46});}
 const domain=await compileOriginalSourceRegions(state.snapshot()),rgb=new Uint8Array(width*height*3),reads=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)for(let c=0;c<3;c++)rgb[(y*width+x)*3+c]=domain.containsOriginal(x,y)?(x*13+y*31+c*7)%256:poison;
 const view=await createSourceRegionView({sha256:'a'.repeat(64),descriptor:{width,height,format:'rgb8'},async readWindow(rect){
  const free=budget.reserve(rect.width*rect.height*3),data=new Uint8Array(rect.width*rect.height*3);
  for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++){const xx=x+rect.x,yy=y+rect.y;assert(domain.containsOriginal(xx,yy),'Excluded RGB was requested');data.set(rgb.subarray((yy*width+xx)*3,(yy*width+xx)*3+3),(y*rect.width+x)*3);}
  reads.push(rect);return{pixels:{format:'rgb8',width:rect.width,height:rect.height,data},release:free};
 }},domain.descriptor,{budget});
 return{budget,width,rgb,domain,view,reads,source:{view,domain},async close(){await view.dispose();assert.equal(budget.total(),0);}};
}
const read=async store=>{const out=new Float32Array(store.byteLength/4);await store.readInto(new Uint8Array(out.buffer));return out;};
test('Full-source gray bytes and coefficients remain exact to the unmodified native preparer',async()=>{
 const h=await fixture(0,{selected:false});let population;
 try{population=await prepareXfeatStrictPopulation(h.source,{budget:h.budget});assert.equal(population.contexts.length,1);const native=await createPost({wasmMemory:allocateWasmMemory({initial:256,maximum:512})}),written=[];
  const metrics=await prepareXfeatRows(researchRows({width:h.width,height:98,data:h.rgb}),{write(bytes){written.push(new Float32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4).slice());}},native),expected=new Float32Array(metrics.width*metrics.height);written.forEach((row,i)=>expected.set(row,i*metrics.width));
  assert.deepEqual(await read(population.contexts[0].gray),expected);assert.equal(population.normalization.mean,metrics.mean);assert.equal(population.normalization.inverseStd,metrics.inverseStd);assert.equal(population.contexts[0].nativeFrame.syntheticPixels,0);
 }finally{await population?.dispose();await h.close();}
});
test('Real native preparation reads no excluded RGB, keeps every owned real gray value, and excludes padding from common moments',async()=>{
 const a=await fixture(0),b=await fixture(255);let pa,pb;
 try{pa=await prepareXfeatStrictPopulation(a.source,{budget:a.budget});pb=await prepareXfeatStrictPopulation(b.source,{budget:b.budget});assert.deepEqual(pa.normalization,pb.normalization);let sum=0,sum2=0,n=0,padding=0;
  for(let i=0;i<pa.contexts.length;i++){
   const r=pa.contexts[i];if(!r.evaluable)continue;const values=await read(r.gray);assert.deepEqual(values,await read(pb.contexts[i].gray));const frame=r.nativeFrame;padding+=frame.syntheticPixels;
   assert.equal((frame.origin[0]+a.domain.origin[0])%32,0);assert.equal((frame.origin[1]+a.domain.origin[1])%32,0);
   for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){
    const real=x>=frame.left&&x<frame.left+frame.preparedWidth&&y>=frame.top&&y<frame.top+frame.preparedHeight,value=values[y*r.width+x];
    if(!real){assert.equal(value,pa.normalization.mean);assert.equal(f(f(value-pa.normalization.mean)*pa.normalization.inverseStd),0);continue;}
    const xx=r.rect.x+x-frame.left,yy=r.rect.y+y-frame.top,ox=xx+a.domain.origin[0],oy=yy+a.domain.origin[1],at=(oy*a.width+ox)*3;
    assert.equal(value,f((a.rgb[at]+a.rgb[at+1]+a.rgb[at+2])/3));
    if(!r.ownedRectangles.some(o=>xx>=o.x&&xx<o.x+o.width&&yy>=o.y&&yy<o.y+o.height))continue;sum+=value;sum2+=value*value;n++;
   }
  }
  assert(padding>0);assert.equal(pa.normalization.sum,sum);assert.equal(pa.normalization.sum2,sum2);assert.equal(pa.normalization.samples,n);assert.equal(n,pa.metadata.coverage.uniqueObservedPixels);assert(a.reads.length>0);
 }finally{await pa?.dispose();await pb?.dispose();await a.close();await b.close();}
});
test('Cooperative descriptor sampling still aborts before publication and retires its real Native owners',async()=>{
 const h=await fixture(0),controller=new AbortController();let samples=0,poolDisposed=false;
 const poolFactory=()=>({metrics:{controlledGraph:true,provider:'wasm'},reserve(){},async execute(population,consume){for(const r of population.contexts.filter(r=>r.evaluable)){const w=r.width,height=r.height,heat=new Float32Array(w*height),dense=new Float32Array(w*height),reliability=new Float32Array(w*height/64).fill(.9);for(let y=0;y<height;y++)for(let x=0;x<w;x++)heat[y*w+x]=(x%8===4&&y%8===4)?.9:.01;for(let i=0;i<dense.length;i++)dense[i]=Math.fround(Math.sin(i*.17));await consume(r,{x:0,y:0,cw:w,ch:height},{heat,dense,reliability});}},dispose(){poolDisposed=true;}});
 const postFactory=async options=>{const p=await createXfeatStrictPost(options),ordinary=p.module._xfeat_sample;p.module._xfeat_sample=(...args)=>{ordinary(...args);if(++samples===20)controller.abort();};return p;};
 try{await assert.rejects(extractXfeatStrictNative(h.source,{candidateDomain:h.domain,budget:h.budget,profile:{maxWorkers:1},limit:100,signal:controller.signal,poolFactory,postFactory,maskFactory:()=>createNativeMasks()}),{code:'CANCELLED'});assert.equal(samples,20);assert.equal(poolDisposed,true);}
 finally{await h.close();}
});
