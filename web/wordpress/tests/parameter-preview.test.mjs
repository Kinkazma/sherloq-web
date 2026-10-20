import test from 'node:test';
import assert from 'node:assert/strict';
import {inflateSync} from 'node:zlib';
import {createAdaptivePreview} from '../sherloq-browser/assets/adaptive-preview.js';
import {encodeParameterPreviewPng,createParameterPreview,projectParameterPreviewParams} from '../sherloq-browser/assets/tool-parameter-preview.js';
const pixels=(w=8,h=6)=>({width:w,height:h,format:'rgb8',data:Uint8Array.from({length:w*h*3},(_,i)=>(i*13+17)%256)});
const request=(patch={})=>({operation:'inspection.adjust',params:{brightness:7},field:'brightness',sourceIdentity:'native-A/1',logicalWidth:800,logicalHeight:600,...patch});
function harness({source=pixels(),readSource,readReference,run,load,readDisplay,reserve,release}={}){
 const calls={loads:[],runs:[],reads:[],released:[],unloaded:[],workers:0,disposed:0,reserves:[],freed:[]},sources=new Map();let frame;
 const api={async load(input,hooks){calls.loads.push(structuredClone(input));if(load)return load(input,hooks);sources.set(input.id,input.pixels);return{id:input.id,surface:{id:'surface-'+input.id,revision:1,width:input.pixels.width,height:input.pixels.height,format:'rgb8'}};},async run(task,hooks){calls.runs.push(structuredClone(task));if(run)return run(task,hooks);const input=sources.get(task.imageId);frame={...input,data:input.data.map(v=>(v+(task.params.brightness??0))&255)};return{surface:{id:'result-'+calls.runs.length,revision:1,width:input.width,height:input.height,format:'rgb8'},data:{score:123}};},async readDisplay(input,hooks){calls.reads.push(input);return readDisplay?readDisplay(input,hooks):{pixels:frame};},async releaseSurface(id){calls.released.push(id);},async releaseTable(id){calls.released.push(id);},async unload(id){calls.unloaded.push(id);sources.delete(id);},async dispose(){calls.disposed++;sources.clear();}};
 const preview=createParameterPreview({adaptive:false,readSource:readSource??(async()=>({pixels:source,sourceIdentity:'native-A/1',logicalWidth:800,logicalHeight:600})),readReference,engineFactory:async()=>{calls.workers++;return api;},reserve:reserve??(async options=>{calls.reserves.push(options);return{id:calls.reserves.length};}),release:release??(async lease=>calls.freed.push(lease))});return{preview,calls,api};
}
test('derived PNG is a real lossless RGB file including multiple stored blocks',()=>{
 const p=pixels(192,176),png=encodeParameterPreviewPng(p);assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);let at=8,idat;
 while(at<png.length){const count=new DataView(png.buffer,png.byteOffset+at).getUint32(0),name=new TextDecoder().decode(png.subarray(at+4,at+8));if(name==='IHDR'){assert.equal(new DataView(png.buffer,png.byteOffset+at+8).getUint32(0),p.width);assert.equal(png[at+17],2);}if(name==='IDAT')idat=png.slice(at+8,at+8+count);at+=12+count;}
 const raw=inflateSync(idat);assert.equal(raw.length,p.height*(p.width*3+1));for(let y=0;y<p.height;y++){assert.equal(raw[y*(p.width*3+1)],0);assert.deepEqual(new Uint8Array(raw.subarray(y*(p.width*3+1)+1,(y+1)*(p.width*3+1))),p.data.subarray(y*p.width*3,(y+1)*p.width*3));}
 assert.throws(()=>encodeParameterPreviewPng(pixels(2049,1)),{code:'INVALID_INPUT'});
});
test('pixel preview uses an isolated real-byte source and returns only provisional RGB',async()=>{
 const {preview,calls}=harness();const frame=await preview.preview(request());assert.equal(frame.exact,false);assert.equal(frame.pixels.logicalWidth,800);assert.equal(frame.pixels.logicalHeight,600);assert.equal(frame.pixels.width,8);assert.equal(frame.pixels.data[0],24);assert.equal(frame.metrics.scientificFinalChanged,false);assert.equal(frame.data,undefined);assert.equal(calls.loads[0].provenance.derived,true);assert.equal(calls.loads[0].provenance.parentSourceIdentity,'native-A/1');assert.notEqual(calls.loads[0].id,'native-A/1');assert.equal(calls.runs[0].backend,'cpu');assert.deepEqual(calls.released,['result-1']);assert.equal(calls.reserves.length,1);assert.equal(calls.reserves[0].signal,undefined);assert.doesNotThrow(()=>structuredClone(calls.reserves[0]));await preview.dispose();assert.equal(calls.disposed,1);assert.equal(calls.freed.length,1);assert.equal(preview.state.workerResident,false);
});
test('source and worker are reused across values but a new native identity invalidates both',async()=>{
 let reads=0;const {preview,calls}=harness({readSource:async args=>{reads++;return{pixels:pixels(),sourceIdentity:args.sourceIdentity,logicalWidth:800,logicalHeight:600};}});await preview.preview(request());await preview.preview(request({params:{brightness:12}}));assert.equal(reads,1);assert.equal(calls.workers,1);assert.equal(calls.loads.length,1);await preview.preview(request({sourceIdentity:'native-B/2'}));assert.equal(reads,2);assert.equal(calls.workers,2);assert.equal(calls.disposed,1);assert.equal(calls.freed.length,1);await preview.dispose();assert.equal(calls.freed.length,2);
});
test('all generic pixel families use the original requested parameters without final changes',async()=>{
 const operations=['inspection.adjust','inspection.magnifier','detail.gradient','detail.echo','colors.space','colors.pca','detail.wavelets','detail.frequency','noise.separation','noise.planes','noise.minmax','pixels.defects','noise.blocking','colors.stats','tampering.contrast','various.illuminant'];const {preview,calls}=harness();
 for(const operation of operations){const params={testValue:13};await preview.preview(request({operation,params}));assert.deepEqual(params,{testValue:13});assert.equal(calls.runs.at(-1).params.testValue,13);}
 assert.equal(calls.loads.length,1);assert.equal(calls.workers,1);await preview.dispose();
});
test('global proxy computations disclose that their basis/statistics are provisional',async()=>{
 const {preview}=harness();for(const operation of ['colors.pca','detail.wavelets','detail.frequency','noise.blocking']){const answer=await preview.preview(request({operation}));assert.match(answer.metrics.analysisApproximation,/Global basis\/statistics/);assert.equal(answer.exact,false);}await preview.dispose();
});
test('models, JPEG, byte operations and stereo correspondence never enter generic proxy worker',async()=>{
 const {preview,calls}=harness();for(const operation of ['m2.rita','ai.clones.d2prl','ai.text.doctamper','ela.classic','jpeg.zero','jpeg.quality','noise.prnu','metadata.exiftool','various.stereogram'])await assert.rejects(preview.preview(request({operation})),{code:'PREVIEW_UNAVAILABLE'});assert.equal(calls.workers,0);assert.equal(calls.reserves.length,0);await preview.dispose();
});
test('sampling preserves byte values and refuses an accidentally full-sized source',async()=>{
 const sampled=pixels(192,128),{preview,calls}=harness({readSource:async()=>({pixels:sampled})});await preview.preview(request());assert.deepEqual(calls.loads[0].pixels.data,sampled.data);await preview.dispose();const bad=harness({readSource:async()=>pixels(300,200)});await assert.rejects(bad.preview.preview(request()),{code:'INVALID_INPUT'});assert.equal(bad.calls.workers,0);await bad.preview.dispose();
});
test('late source or geometry changes are cancelled before any worker allocation',async()=>{
 for(const answer of [{pixels:pixels(),sourceIdentity:'different'},{pixels:pixels(),logicalWidth:801,logicalHeight:600}]){const {preview,calls}=harness({readSource:async()=>answer});await assert.rejects(preview.preview(request()),{code:'CANCELLED'});assert.equal(calls.loads.length,0);assert.equal(calls.workers,0);await preview.dispose();}
});
test('comparison reads the reference, disables expensive metrics only in the provisional task, and caches its identity',async()=>{
 const {preview,calls}=harness({readReference:async()=>({pixels:pixels(),logicalWidth:800,logicalHeight:600,sourceIdentity:'reference/1'})});const params={view:'difference',metrics:true,equalized:true,referenceImageId:'native-ref'};await preview.preview(request({operation:'comparison.image',params}));await preview.preview(request({operation:'comparison.image',params}));assert.equal(params.metrics,true);assert.equal(params.referenceImageId,'native-ref');assert.equal(calls.runs[0].params.metrics,false);assert.match(calls.runs[0].params.referenceImageId,/parameter-preview-reference/);assert.equal(calls.loads.length,2);assert.equal(calls.runs[0].params.equalized,true);await preview.dispose();
});
test('comparison rejects missing or mismatched references without inventing a paired image',async()=>{
 const missing=harness();await assert.rejects(missing.preview.preview(request({operation:'comparison.image'})),{code:'PREVIEW_UNAVAILABLE'});await missing.preview.dispose();const wrong=harness({readReference:async()=>({pixels:pixels(7,6)})});await assert.rejects(wrong.preview.preview(request({operation:'comparison.image'})),{code:'INVALID_INPUT'});assert.equal(wrong.calls.runs.length,0);await wrong.preview.dispose();
});
test('one in-flight job is explicit and reset cancels only its isolated worker work',async()=>{
 let entered,aborted=false;const gate=new Promise(resolve=>entered=resolve);const {preview,calls}=harness({run:async(_task,{signal})=>{entered();return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>{aborted=true;reject(Object.assign(Error('cancel'),{code:'CANCELLED',imagesCleared:true}));},{once:true}));}});const running=preview.preview(request());await gate;await assert.rejects(preview.preview(request()),{code:'BUSY'});const resetting=preview.reset();await assert.rejects(running,{code:'CANCELLED'});await resetting;assert.equal(aborted,true);assert.equal(calls.disposed,1);assert.equal(calls.freed.length,1);assert.equal(preview.state.sourceCached,false);await preview.dispose();await assert.rejects(preview.preview(request()),{code:'DISPOSED'});
});
test('abort after native sampling is checked without passing an abort to the original engine',async()=>{
 const controller=new AbortController();let samples=0;const {preview,calls}=harness({readSource:async()=>{samples++;controller.abort();return{pixels:pixels()};}});await assert.rejects(preview.preview(request({signal:controller.signal})),{code:'CANCELLED'});assert.equal(samples,1);assert.equal(calls.workers,0);await preview.dispose();
});
test('failed allocation/initialization releases its reservation exactly once',async()=>{
 let releases=0;const preview=createParameterPreview({adaptive:false,readSource:async()=>pixels(),reserve:async()=>({id:1}),release:async()=>releases++,engineFactory:async()=>{throw Object.assign(Error('out'),{code:'MEMORY_LIMIT'});}});await assert.rejects(preview.preview(request()),{code:'MEMORY_LIMIT'});assert.equal(releases,1);assert.equal(preview.state.reservationActive,false);await preview.dispose();assert.equal(releases,1);
});
test('surface cleanup failure is surfaced instead of silently marking a draft ready',async()=>{
 const {preview,api}=harness();api.releaseSurface=async()=>{throw Object.assign(Error('release failed'),{code:'CLEANUP_FAILED'});};await assert.rejects(preview.preview(request()),{code:'CLEANUP_FAILED'});await preview.dispose();
});
test('explicit nonadaptive fixtures reuse one bounded grid without changing native parameters',async()=>{
 const sides=[],{preview,calls}=harness({readSource:async args=>{sides.push(args.side);return{pixels:pixels(),sourceIdentity:args.sourceIdentity,logicalWidth:800,logicalHeight:600};}});
 for(const operation of ['inspection.adjust','noise.minmax','detail.frequency','various.illuminant','noise.minmax','inspection.adjust']){const answer=await preview.preview(request({operation}));assert.equal(answer.metrics.maximumSide,192);}
 assert.deepEqual(sides,[192]);assert.equal(calls.workers,1);assert.equal(preview.state.cachedSourceGrids,1);await preview.dispose();assert.equal(preview.state.cachedSourceGrids,0);assert.equal(calls.freed.length,1);
});
test('a memory failure cannot return a draft and the next request reloads its sampled source cleanly',async()=>{
 let attempts=0;const {preview,calls}=harness({run:async task=>{attempts++;if(attempts===1)throw Object.assign(Error('not admitted'),{code:'MEMORY_LIMIT'});return{pixels:pixels()};}});await assert.rejects(preview.preview(request()),{code:'MEMORY_LIMIT'});assert.equal(preview.state.workerResident,false);assert.equal(preview.state.sourceCached,false);assert.equal(calls.freed.length,1);const next=await preview.preview(request());assert.equal(next.exact,false);assert.equal(calls.loads.length,2);assert.equal(calls.workers,2);await preview.dispose();assert.equal(calls.freed.length,2);
});
const geometry={width:129,height:97,logicalWidth:2064,logicalHeight:1552};
test('spatial supports are projected only in the draft and both parameter sets are disclosed',async()=>{
 const input={radius:15,contrast:91,grayscale:true},copy=structuredClone(input),{preview,calls}=harness();
 const answer=await preview.preview(request({operation:'detail.echo',params:input}));
 assert.deepEqual(input,copy);assert.deepEqual(answer.metrics.requestedParams,copy);assert.equal(answer.metrics.previewParams.radius,1);assert.equal(answer.metrics.previewParams.contrast,91);assert.equal(calls.runs[0].params.radius,1);assert.equal(answer.metrics.scientificFinalChanged,false);assert.equal(answer.metrics.spatialProjection.adjustments[0].field,'radius');await preview.dispose();
});
test('blocks fit the real db8 proxy detail without accepting invalid native block dimensions',()=>{
 const large=projectParameterPreviewParams('noise.blocking',{block:100},geometry);assert.equal(large.params.block,6);assert.ok(large.params.block<=56);
 const half=projectParameterPreviewParams('noise.blocking',{block:100},{...geometry,logicalWidth:257,logicalHeight:193});assert.equal(half.params.block,50);
 assert.throws(()=>projectParameterPreviewParams('noise.blocking',{block:100},{...geometry,logicalWidth:20,logicalHeight:20}),{code:'INVALID_INPUT'});
 assert.equal(projectParameterPreviewParams('noise.blocking',{block:0},geometry).params.block,0);assert.equal(projectParameterPreviewParams('noise.blocking',{block:null},geometry).params.block,null);
});
test('intensity and mode controls never become spatial units',()=>{
 const unchanged=[['inspection.adjust',{brightness:54,width:255,sweep:127,threshold:200,sharpen:3}],['noise.separation',{mode:4,radius:10,sigma:200,levels:255}],['noise.planes',{filter:2,bit:7,channel:3}],['detail.frequency',{split:100,smooth:100,threshold:100,filter:0}],['noise.minmax',{filter:0,minimum:4,maximum:4}],['pixels.defects',{radius:1,threshold:255,spread:128,kind:2,mode:2}]];
 for(const [operation,input]of unchanged)assert.deepEqual(projectParameterPreviewParams(operation,input,geometry).params,input,operation);
 assert.equal(projectParameterPreviewParams('inspection.adjust',{sharpen:100},geometry).params.sharpen,8);
 assert.equal(projectParameterPreviewParams('noise.separation',{mode:0,radius:10,sigma:200},geometry).params.radius,1);
 assert.equal(projectParameterPreviewParams('noise.minmax',{filter:5},geometry).params.filter,1);
 assert.equal(projectParameterPreviewParams('pixels.defects',{radius:2},geometry).params.radius,1);
 assert.equal(projectParameterPreviewParams('detail.frequency',{filter:15},geometry).params.filter,1);
});
test('cell sizes remain in their supported enum and report the coarse-grid limit',()=>{
 for(const operation of ['tampering.contrast','various.illuminant']){
  const answer=projectParameterPreviewParams(operation,{block:256,mode:1},geometry);assert.equal(answer.params.block,32);assert.equal(answer.params.mode,1);assert.equal(answer.projection.limitations.length,1);
  assert.equal(projectParameterPreviewParams(operation,{block:128},{...geometry,logicalWidth:258,logicalHeight:194}).params.block,64);
  assert.equal(projectParameterPreviewParams(operation,{block:129},geometry).params.block,129);
 }
});
test('wavelet levels follow dyadic support and the selected filter length without substituting a filter',()=>{
 const small={width:129,height:97,logicalWidth:2064,logicalHeight:1552};
 assert.equal(projectParameterPreviewParams('detail.wavelets',{wavelet:'db1',level:6,threshold:50},small).params.level,2);
 for(const [wavelet,length]of [['db20',40],['sym20',40],['coif5',30],['bior3.9',20],['bior6.8',18]]){
  const {params,projection}=projectParameterPreviewParams('detail.wavelets',{wavelet,level:6,threshold:40,mode:'hard'},small),maximum=Math.max(0,Math.floor(Math.log2(97/(length-1))));
  assert.equal(params.wavelet,wavelet);assert.ok(params.level<=maximum);assert.equal(params.threshold,40);assert.equal(params.mode,'hard');assert.equal(projection.adjustments[0].field,'level');
 }
 const none=projectParameterPreviewParams('detail.wavelets',{wavelet:'db20',level:6,threshold:40},{...small,width:16,height:12});assert.equal(none.params.level,0);assert.equal(none.projection.limitations.length,1);
 const auto=projectParameterPreviewParams('detail.wavelets',{wavelet:'db1',level:null,threshold:40},small);assert.equal(auto.params.level,1);
 const same={...small,logicalWidth:129,logicalHeight:97};assert.equal(projectParameterPreviewParams('detail.wavelets',{wavelet:'db1',level:null},same).params.level,null);
});
test('full-sized draft grids preserve valid values and invalid values are left to native validators',()=>{
 const full={width:192,height:144,logicalWidth:192,logicalHeight:144};for(const [operation,params]of [['inspection.adjust',{sharpen:99}],['detail.echo',{radius:15}],['noise.separation',{radius:10}],['noise.blocking',{block:50}],['noise.minmax',{filter:5}],['detail.frequency',{filter:15}],['pixels.defects',{radius:2}],['various.illuminant',{block:256}]])assert.deepEqual(projectParameterPreviewParams(operation,params,full).params,params);
 assert.equal(projectParameterPreviewParams('detail.echo',{radius:16},geometry).params.radius,16);assert.equal(projectParameterPreviewParams('detail.echo',{radius:null},geometry).params.radius,null);assert.throws(()=>projectParameterPreviewParams('detail.echo',{}, {...geometry,width:0}),{code:'INVALID_INPUT'});
});
