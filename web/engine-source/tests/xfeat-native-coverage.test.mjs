import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {prepareSparseStrictNativeContext} from '../src/sparse-strict-source.js';
import {createCompiledStrictDenseSource} from '../src/dense-strict-source.js';
import {localizeSourceRegionTask} from '../src/source-region-localize.js';
import {prepareXfeatStrictPopulation} from '../src/xfeat-strict-preparation.js';
import {extractXfeatStrictNative} from '../src/xfeat-strict-native-features.js';
import createMasks from '../vendor/sparse-extract/sparse-extract.js';

const sha='a'.repeat(64),poly=([a,b,c,d])=>[[a,b],[c,b],[c,d],[a,d]];
async function historical(poison=0){
 const budget=new Budget(256*1024**2),width=416,height=320,state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height}),acquisitions=[[48,48,166,136],[213,180,317,268]],hole=[60,60,68,68],reads=[];
 for(const[x0,y0,x1,y1]of acquisitions)await state.add('acquisition',{x0,y0,x1,y1});await state.add('exclusion',{x0:60,y0:60,x1:68,y1:68});const domain=await compileOriginalSourceRegions(state.snapshot());
 const original={sha256:sha,surface:{descriptor:{format:'rgb8',width,height},async readWindow(r){reads.push({...r});const free=budget.reserve(r.width*r.height*3),data=new Uint8Array(r.width*r.height*3);for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++){const xx=r.x+x,yy=r.y+y;assert(!(xx>=60&&xx<68&&yy>=60&&yy<68),'The excluded RGB hole was read.');for(let c=0;c<3;c++)data[(y*r.width+x)*3+c]=(xx*7+yy*11+c*13)%256;}return{pixels:{format:'rgb8',width:r.width,height:r.height,data},release:free};}}};
 const record={...original,originalSource:original,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],surface:{descriptor:{format:'rgb8',width:domain.width,height:domain.height},readWindow(){throw Error('Presentation RGB read');}}};
 const task=await localizeSourceRegionTask({id:'historical',operation:'tampering.copyMove.sparse',imageId:'source',params:{algorithm:'XFeat',compare:true,regions:acquisitions.map(poly),excluded:[poly(hole)]},sourceRegionDomain:domain.descriptor},domain,{strictSparseFragments:true});
 const prepared=await prepareSparseStrictNativeContext(record,task,{budget}),compiled=await createCompiledStrictDenseSource(prepared,{budget,excluded:task.params.excluded,original});
 return{budget,reads,prepared,compiled,async close(){await compiled.dispose();prepared.release();assert.equal(budget.total(),0);}};
}

// Independent dense integral/difference oracle. It does not consume the emitted
// rectangles or reuse the row-band sweep of the production cover planner.
function denseNativeSupport(view,width,height){
 const stride=width+1,prefix=new Int32Array(stride*(height+1)),delta=new Int32Array((width+2)*(height+2)),ds=width+2;
 for(let y=0;y<height;y++)for(let x=0;x<width;x++)prefix[(y+1)*stride+x+1]=+!view.includesRectangle({x,y,width:1,height:1})+prefix[y*stride+x+1]+prefix[(y+1)*stride+x]-prefix[y*stride+x];
 for(let y=0;y<=height-32;y++)for(let x=0;x<=width-32;x++){const forbidden=prefix[(y+32)*stride+x+32]-prefix[y*stride+x+32]-prefix[(y+32)*stride+x]+prefix[y*stride+x];if(!forbidden){delta[y*ds+x]++;delta[y*ds+x+32]--;delta[(y+32)*ds+x]--;delta[(y+32)*ds+x+32]++;}}
 const support=new Uint8Array(width*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*ds+x;delta[i]+=(x?delta[i-1]:0)+(y?delta[i-ds]:0)-(x&&y?delta[i-ds-1]:0);support[y*width+x]=+(delta[i]>0);}return support;
}
test('historical two-acquisition hole is covered wherever a real admitted32x32 context exists; moments own pixels once',async()=>{
 const h=await historical();let p;
 try{
  assert.equal(h.reads.length,0);p=await prepareXfeatStrictPopulation(h.compiled.source,{budget:h.budget});const{width,height}=h.compiled.source.domain,support=denseNativeSupport(h.compiled.source.view,width,height),[ox,oy]=h.compiled.source.domain.origin,owned=new Uint8Array(width*height);let selectedObserved=0,sum=0,sum2=0,samples=0;
  for(const c of p.contexts.filter(c=>c.evaluable)){assert.equal(c.scaleX,1);assert.equal(c.scaleY,1);assert(h.compiled.source.view.includesRectangle(c.rect));const data=new Float32Array(c.width*c.height);await c.gray.readInto(new Uint8Array(data.buffer));for(const r of c.ownedRectangles)for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++){assert(!owned[y*width+x]);owned[y*width+x]=1;const v=data[(y-c.rect.y)*c.width+x-c.rect.x];sum+=v;sum2+=v*v;samples++;}}
  assert.deepEqual(owned,support);for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(owned[y*width+x]&&h.prepared.candidateDomain.containsOriginal(x+ox,y+oy))selectedObserved++;
  assert.equal(h.prepared.candidateDomain.countIncluded,19472);assert.equal(selectedObserved,19136);assert.equal(p.metadata.coverage.noNativeSupportPixels,336);assert.equal(owned[(50-oy)*width+100-ox],1);assert.equal(p.normalization.samples,samples);assert.equal(p.normalization.sum,sum);assert.equal(p.normalization.sum2,sum2);assert(p.metadata.coverage.contextObservedPixels>samples);
 }finally{await p?.dispose();await h.close();}
});

const rect={x:0,y:0,width:64,height:64};
function syntheticPopulation(duplicate){return async(_source,{reserveInference})=>{const contexts=Array.from({length:duplicate?2:1},(_,index)=>({index,rect,width:64,height:64,scaleX:1,scaleY:1,evaluable:true,ownedRectangles:index?[]:[rect]}));await reserveInference(contexts);return{contexts,normalization:{mean:0,inverseStd:1,samples:4096},metadata:{controlled:true},async dispose(){}};};}
const controlledPool=()=>({metrics:{provider:'controlled',modelSessions:0},async reserve(){},async execute(p,consume){for(const c of p.contexts){const heat=new Float32Array(4096),dense=new Float32Array(4096),reliability=new Float32Array(64).fill(1);heat[20*64+20]=1;for(let i=0;i<64;i++)dense[i*64]=1;await consume(c,{x:0,y:0,cw:64,ch:64},{heat,dense,reliability});}},async dispose(){}});
test('overlapping context candidates are removed before the actual single native global ranking and descriptor bank',async()=>{
 const budget=new Budget(256*1024**2),source={view:{},domain:{width:64,height:64,origin:[0,0],sourceSha256:sha}},candidateDomain={sourceSha256:sha,containsOriginal:()=>true};let one,two;
 try{const options={candidateDomain,budget,limit:100,poolFactory:controlledPool,maskFactory:()=>createMasks()};one=await extractXfeatStrictNative(source,{...options,preparationFactory:syntheticPopulation(false)});two=await extractXfeatStrictNative(source,{...options,preparationFactory:syntheticPopulation(true)});assert.equal(one.totalFeatures,1);assert.equal(two.metadata.globalCandidates,one.metadata.globalCandidates);assert.deepEqual(two.points,one.points);assert.deepEqual(two.descriptors,one.descriptors);assert.equal(two.metadata.oneGlobalTopK,true);}finally{one?.release();two?.release();assert.equal(budget.total(),0);}
});
