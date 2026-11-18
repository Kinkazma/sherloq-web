import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';

// Routing/ownership only: no image decoder, numerical kernel, worker or GPU.
const text=await readFile(new URL('../src/index.js',import.meta.url),'utf8'),start=text.indexOf(' async function runSegmentedEla('),end=text.indexOf(' async function runSegmentedComparison(',start),code=text.slice(start,end);
function fixture({ram=true,refuseContiguous=false,failContiguous=false}={}){
 const token=Symbol(),data=Uint8Array.of(7,31,84,126,199,255),sourceSurface={descriptor:{id:'Original',revision:1,width:2,height:1,format:'rgb8'}},stagedSurface={descriptor:{id:'Staging',revision:1,width:2,height:1,format:'rgb8'}},original={sha256:'a'.repeat(64),segmented:true,surface:sourceSurface,provenance:{decoder:'unchanged'}},input=Object.assign(Object.create(original),{surface:stagedSurface}),resources=new Map();let creates=0,pins=0,returns=0,contiguous=0,streamed=0,reservations=0;
 const owner={active:true,original,nativeResources:resources},stage={image:input,metrics:{sourcePasses:1,storage:ram?'memory':'temporary'},borrowPixels(){if(!ram)return null;pins++;let closed=false;return{pixels:{width:2,height:1,format:'rgb8',data},release(){if(!closed){closed=true;returns++;}}};}},task={id:'frame',imageId:'original',operation:'ela.classic',backend:'auto',params:{quality:75,scale:1,contrast:0,linear:false},[token]:owner},codec={};let context;
 const publish=(id,record)=>record.surface.descriptor;
 context=vm.createContext({synthesisFrameToken:token,codec,imageCodec:codec,cpuKernel:'auto',busy:false,performance,Map,Object,structuredClone,RUNTIME_RESERVE:32*1024**2,profile:{maxWorkers:10},
  idle(){assert.equal(context.busy,false);},validateParams:p=>p,knownHeapBytes:()=>0,usesAlternateRecompression:()=>false,rgbRecompressionPlan:()=>({workingBytes:32,windowAllowance:16}),
  budget:{limit:512*1024**2,total:()=>0,reserve(){reservations++;let closed=false;return()=>{if(!closed){closed=true;reservations--;}};},get(){},put(){},snapshot:()=>({})},
  async createElaSynthesisSource(im){creates++;assert.equal(im,original);return stage;},
  async runContiguousEla(t,im,hooks){contiguous++;assert.equal(t,task);assert.equal(t.backend,'auto');assert.equal(im.pixels.data,data);assert.equal(im.segmented,false);assert.equal(im.surface,stagedSurface);assert.equal(owner.input,im);assert.equal(original.segmented,true);assert.equal(original.pixels,undefined);assert.equal(original.surface,sourceSurface);assert.equal(im.sha256,original.sha256);if(failContiguous)throw Error('native frame failed');if(refuseContiguous)return context.runSegmentedEla(t,im,{...hooks,allowContiguous:false});return{metrics:{kernel:'same-maintained-classic',backend:'auto'}};},
  async segmentedEla(im,p,hooks){streamed++;assert.equal(im.surface,stagedSurface);assert.equal(hooks.backend,'auto');return{surface:{descriptor:{id:'output',revision:1,width:2,height:1,format:'rgb8'}},metrics:{backend:'auto'}};},
  checkAbort(){},resultSurfaces:{publish},classicPreview:{beginCapture(){throw Error('Synthesis must not capture an interactive proxy');}},VERSION:'test',JPEG_OPTIONS:{}});
 vm.runInContext(code,context);
 return{context,task,owner,original,data,resources,run:()=>context.runSegmentedEla(task,original,{}),counts:()=>({creates,pins,returns,contiguous,streamed,reservations})};
}
test('RAM staging lends the same bytes to the maintained Classic kernel and preserves auto/pool choice',async()=>{
 const h=fixture();for(let i=0;i<2;i++){const out=await h.run();assert.equal(out.metrics.kernel,'same-maintained-classic');assert.equal(out.metrics.synthesisSource.sourcePasses,1);assert.equal(h.owner.input,null);assert.equal(h.original.pixels,undefined);}assert.deepEqual(h.counts(),{creates:1,pins:2,returns:2,contiguous:2,streamed:0,reservations:0});assert.equal(h.resources.size,1);
});
test('the existing contiguous admission fallback streams the same bank without copying or re-reading Original',async()=>{
 const h=fixture({refuseContiguous:true}),out=await h.run();assert.equal(out.metrics.synthesisSource.sourcePasses,1);assert.deepEqual(h.counts(),{creates:1,pins:1,returns:1,contiguous:1,streamed:1,reservations:0});assert.equal(h.owner.input,null);assert.equal(h.resources.size,1);
});
test('temporary staging stays on the existing bounded pipeline; a failed native frame returns the RAM pin',async()=>{
 const h=fixture({ram:false});await h.run();assert.deepEqual(h.counts(),{creates:1,pins:0,returns:0,contiguous:0,streamed:1,reservations:0});const failed=fixture({failContiguous:true});await assert.rejects(failed.run(),/native frame failed/);assert.equal(failed.owner.input,null);assert.deepEqual(failed.counts(),{creates:1,pins:1,returns:1,contiguous:1,streamed:0,reservations:0});
});
test('a tight live ledger keeps the same bounded pipeline without admitting a partial native phase',async()=>{
 const h=fixture();h.context.budget.limit=32*1024**2+60;await h.run();assert.deepEqual(h.counts(),{creates:1,pins:0,returns:0,contiguous:0,streamed:1,reservations:0});assert.equal(h.original.pixels,undefined);
});
