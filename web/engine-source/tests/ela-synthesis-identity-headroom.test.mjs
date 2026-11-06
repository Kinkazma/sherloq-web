import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {Budget} from '../src/cache.js';
import {checkAbort} from '../src/errors.js';
import {equalizationState,equalizationPlan} from '../src/equalization-settings.js';
import {usesAlternateRecompression} from '../src/recompression-plan.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {prepareSourceRegionDomain,sourceRegionDomainShape,sourceRegionTransportBytes} from '../src/source-region-dispatch.js';
import {createElaSynthesisService} from '../src/ela-synthesis-service.js';

// No pixels are allocated or calculated. Execute the actual admission helpers
// against real compiled certificates and metadata-only Original descriptors.
const code=await readFile(new URL('../src/index.js',import.meta.url),'utf8');
const boundCode=code.slice(code.indexOf(' function visibleElaNativeBytes('),code.indexOf(' async function synthesisSourceAlias(',code.indexOf(' function visibleElaNativeBytes(')));
const prepareCode=code.slice(code.indexOf(' async function prepareElaSynthesisNativeHeadroom('),code.indexOf(' async function prepareVisibleElaNativeHeadroom(',code.indexOf(' async function prepareElaSynthesisNativeHeadroom(')));
assert(boundCode&&prepareCode);const MiB=1024**2,sha='a'.repeat(64),width=1536,height=1024;
function fixture({active=true,segmented=false}={}){
 const budget=new Budget(1024**3),original={sha256:sha,provenance:{format:'jpeg'},surface:{descriptor:{width,height,format:'rgb8'},readWindow(){throw Error('Admission must not read image pixels.');}},...(segmented?{segmented:true}:{pixels:{width,height,format:'rgb8',data:{byteLength:width*height*3}}})},images=new Map([['original',original]]),calls=[],codec={};let validations=0,context;
 context=vm.createContext({images,image:id=>images.get(id),budget,codec,imageCodec:codec,RUNTIME_RESERVE:32*MiB,knownHeapBytes:()=>0,cpuKernel:'auto',profile:{maxWorkers:10},Worker:function(){},equalizationPlan,usesAlternateRecompression,sourceRegionDomainShape,sourceRegionTransportBytes,checkAbort,busy:false,idle(){assert.equal(context.busy,false);},async prepareSourceRegionDomain(...args){validations++;return prepareSourceRegionDomain(...args);},elaSynthesis:{hasFor:()=>active,async prepareNative(bytes){calls.push(bytes);}}});vm.runInContext(boundCode+'\n'+prepareCode,context);
 const eq=equalizationState();eq.method='histogram';const task={id:'native-frame',imageId:'original',operation:'ela.classic',backend:'cpu',params:{quality:75,scale:1,contrast:0,linear:false,grayscale:false,equalization:eq}};
 return{budget,original,images,calls,context,task,get validations(){return validations;},bound:(t=task,proof)=>context.visibleElaNativeBytes(t,proof),prepare:t=>context.prepareElaSynthesisNativeHeadroom(t)};
}
async function certificate(kind='whole'){
 const state=await createOriginalSourceRegionsState({sourceSha256:sha,width,height});
 if(kind==='rectangle')await state.add('acquisition',{x0:16,y0:8,x1:112,y1:104});
 if(kind==='hole')await state.add('exclusion',{x0:40,y0:40,x1:48,y1:48});
 return(await compileOriginalSourceRegions(state.snapshot())).descriptor;
}

test('a raw whole-image claim receives no refined bound until the existing validator binds its Original and grid',async()=>{
 const h=fixture(),descriptor=await certificate(),domain=await prepareSourceRegionDomain(h.original,descriptor),task={...h.task,sourceRegionDomain:descriptor},snapshot=JSON.stringify(task),normal=h.bound();
 assert(normal<h.budget.limit);assert.equal(h.bound(task),h.budget.limit);assert.equal(h.bound(task,{original:h.original,domain,sourceRegionDomain:descriptor}),normal);assert.equal(JSON.stringify(task),snapshot);assert.equal(task.sourceRegionDomain.fingerprint,domain.fingerprint);
 assert.equal(h.bound({...task,imageId:'unknown'}),h.budget.limit,'An unknown image and unvalidated domain remain conservative');
 assert.equal(h.bound(task,{original:{...h.original},domain,sourceRegionDomain:descriptor}),h.budget.limit,'A stale owner cannot authorize whole-image admission');assert.equal(h.bound(task,{original:h.original,domain,sourceRegionDomain:structuredClone(descriptor)}),h.budget.limit,'Another transported command cannot borrow this proof');
});

test('Service.begin passes its already validated identity context and preserves the actual source-domain fingerprint',async()=>{
 const h=fixture(),descriptor=await certificate(),bounds=[];let admitted;
 const service=createElaSynthesisService({budget:h.budget,getImage:()=>h.original,getSurface:()=>{},publish:()=>{},cache:{reader:async()=>null,close:async()=>{}},nativeHeadroomFor:(task,context)=>{bounds.push({task,context});return h.bound(task,context);},createAccumulator:async options=>{admitted=options;return{dispose(){}};}});
 try{const job=await service.begin({imageId:'original',sourceRegionDomain:descriptor});assert.equal(bounds.length,99);assert.equal(admitted.nativeHeadroomBytes,h.bound({...h.task,backend:undefined}));assert(admitted.nativeHeadroomBytes<h.budget.limit);assert.equal(job.sourceRegionDomain.fingerprint,descriptor.fingerprint);for(const row of bounds){assert.equal(row.context.original,h.original);assert.equal(row.context.sourceRegionDomain,descriptor);assert.equal(sourceRegionDomainShape(row.context.domain),'identity');assert.equal(row.task.sourceRegionDomain,descriptor);}
  const stack=width*height*3*99,bank=4*MiB,migration=2*MiB,occupied=40*MiB;assert(occupied+stack+bank+migration+admitted.nativeHeadroomBytes<h.budget.limit,'The complete 467140608-byte stack may fit without spending native headroom');
 }finally{await service.close();}assert.equal(h.budget.total(),0);
});

test('per-native admission uses exactly the same verified whole-image bound, without losing EQ or transport provenance',async()=>{
 const h=fixture(),descriptor=await certificate(),task={...h.task,sourceRegionDomain:descriptor};await h.prepare(task);assert.equal(h.validations,1);assert.deepEqual(h.calls,[h.bound()]);assert.equal(h.context.busy,false);assert.equal(task.sourceRegionDomain,descriptor);assert.equal(h.budget.total(),0);
 const noEq={...h.task,params:{quality:75,scale:1,contrast:0,linear:false,grayscale:false}},scoped={...noEq,sourceRegionDomain:descriptor};await h.prepare(scoped);assert.equal(h.calls.at(-1),h.bound(noEq));assert.equal(h.budget.total(),0);
});

test('real rectangles, holes and unknown segmented layouts retain the full-budget fallback',async()=>{
 for(const kind of ['rectangle','hole']){const h=fixture(),descriptor=await certificate(kind),task={...h.task,sourceRegionDomain:descriptor};await h.prepare(task);assert.equal(h.calls[0],h.budget.limit);assert.equal(h.budget.total(),0);}
 const h=fixture({segmented:true}),descriptor=await certificate();await h.prepare({...h.task,sourceRegionDomain:descriptor});assert.equal(h.calls[0],h.budget.limit);assert.equal(h.budget.total(),0);
});

test('forged geometry/counts/fingerprint, wrong source and wrong grid cannot authorize RAM refinement',async()=>{
 const rectangle=await certificate('rectangle'),whole=await certificate();
 const forged={...structuredClone(rectangle),rect:{x0:0,y0:0,x1:width,y1:height},origin:[0,0],width,height,countIncluded:width*height};
 const wrongFingerprint={...structuredClone(whole),fingerprint:'0'.repeat(64)},wrongSource={...structuredClone(whole),snapshot:{...structuredClone(whole.snapshot),sourceSha256:'b'.repeat(64)}},wrongGrid={...structuredClone(whole),snapshot:{...structuredClone(whole.snapshot),width:width+1}};
 for(const descriptor of [forged,wrongFingerprint,wrongSource,wrongGrid]){const h=fixture();await assert.rejects(h.prepare({...h.task,sourceRegionDomain:descriptor}),{code:'SOURCE_REGIONS_INVALID'});assert.equal(h.calls.length,0);assert.equal(h.context.busy,false);assert.equal(h.budget.total(),0);}
});

test('no active synthesis job introduces no new domain validation on completed preview paths',async()=>{
 const h=fixture({active:false});await h.prepare({...h.task,sourceRegionDomain:{untrusted:true}});assert.equal(h.validations,0);assert.deepEqual(h.calls,[h.budget.limit]);assert.equal(h.budget.total(),0);
});
