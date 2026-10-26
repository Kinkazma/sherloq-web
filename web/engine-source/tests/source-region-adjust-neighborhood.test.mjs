import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createSourceRegionView} from '../src/source-region-view.js';
import {createResultSurfaces} from '../src/segmented-results.js';
import {OPENCV_OPERATIONS} from '../src/opencv-operations.js';
import {sourceRegionAdjust} from '../src/source-region-adjust.js';
import {segmentedAdjust} from '../src/segmented-adjust.js';
import {createEngine} from '../src/index.js';
import {adjustClaheTables,adjustScopedClaheTables,adjustMapRows,adjustScopedMapRows,adjustLocalRows} from '../src/adjust-math.js';
const SHA='e'.repeat(64),W=37,H=29;
const rgb=Uint8Array.from({length:W*H*3},(_,i)=>(i*71+Math.floor(i/11)*23)%256);
const params=p=>OPENCV_OPERATIONS['inspection.adjust'].validate(p);
async function fixture({full=false,hole=true,poison=false,width=W,height=H,regions=null,source=rgb,budget=new Budget(128*1024**2)}={}){
 const W=width,H=height,rgb=source;
 const state=await createOriginalSourceRegionsState({width:W,height:H,sourceSha256:SHA});
 if(regions){for(const[kind,rect]of regions)await state.add(kind,rect);}
 else if(!full){await state.add('acquisition',{x0:0,y0:0,x1:16,y1:H});await state.add('acquisition',{x0:20,y0:0,x1:W,y1:H});if(hole)await state.add('exclusion',{x0:5,y0:8,x1:8,y1:12});}
 const domain=await compileOriginalSourceRegions(state.snapshot()),bytes=rgb.slice();if(poison)for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(!domain.containsOriginal(x,y))bytes.fill((x+y)%2?0:255,(y*W+x)*3,(y*W+x+1)*3);
 let record,reads=0,held=0;const read=async(r,science)=>{if(science){reads++;for(let y=r.y;y<r.y+r.height;y++)for(let x=r.x;x<r.x+r.width;x++)assert.ok(domain.containsOriginal(x,y),'Forbidden RGB entered native sharpen/HSV/CLAHE.');}const free=budget.reserve(r.width*r.height*3),data=new Uint8Array(r.width*r.height*3);for(let y=0;y<r.height;y++)data.set(bytes.subarray(((y+r.y)*W+r.x)*3,((y+r.y)*W+r.x+r.width)*3),y*r.width*3);held++;return{pixels:{width:r.width,height:r.height,format:'rgb8',data},release(){held--;free();}};};
 const original={surface:{descriptor:{width:W,height:H,format:'rgb8'},readWindow:r=>read(r,false)}},view=await createSourceRegionView({width:W,height:H,sha256:SHA,readWindow:r=>read(r,true)},domain.descriptor,{budget}),registry=createResultSurfaces(new Map());
 const f={budget,domain,original,view,record:()=>record,readState:()=>({reads,held}),publishResult(id,value){record=value;return registry.publishBundle(id,value);},async retire(){await registry.clear();record=undefined;},async clear(){await registry.clear();view.dispose();budget.clear();assert.equal(held,0);assert.equal(budget.total(),0);}};
 f.run=(p,hooks={})=>sourceRegionAdjust({...f,task:{id:'scope-adjust',imageId:'native-grid',operation:'inspection.adjust',params:params(p)},...hooks});return f;
}
async function rendered(f){const a=await f.record().surface.readWindow();let s;try{s=f.record().maskRecords?.analysis_scope?await f.record().maskRecords.analysis_scope.surface.readWindow():null;return{pixels:a.pixels.data.slice(),mask:s?s.pixels.data.slice():Uint8Array.from({length:f.domain.width*f.domain.height},(_,i)=>+f.domain.containsOriginal(i%f.domain.width+f.domain.origin[0],Math.floor(i/f.domain.width)+f.domain.origin[1]))};}finally{a.release();s?.release();}}
test('scoped native CLAHE tables equal the original arithmetic for complete equal-area tiles',async()=>{
 const area=29,hist=new Int32Array(16384),areas=new Int32Array(64).fill(area);for(let t=0;t<64;t++)for(let i=0;i<area;i++)hist[t*256+(i*23+t*11)%256]++;
 for(let level=2;level<=5;level++)assert.deepEqual(await adjustScopedClaheTables(hist,areas,level),await adjustClaheTables(hist,area,level));
});
test('scoped native map preserves global x/y, FMA and HSV conversion for cropped input rows',async()=>{
 const width=24,rows=16,bytes=Uint8Array.from({length:width*rows*3},(_,i)=>i%3===0?i%180:i%256),tables=Uint8Array.from({length:16384},(_,i)=>(i*13+Math.floor(i/256)*17)%256),all=await adjustMapRows(bytes,width,rows,0,24,16,2,tables);
 for(const [x,y,w,h]of [[0,0,1,1],[3,5,17,4],[23,15,1,1],[0,0,24,16]]){const crop=new Uint8Array(w*h*3),expected=new Uint8Array(w*h*3);for(let r=0;r<h;r++){crop.set(bytes.subarray(((y+r)*width+x)*3,((y+r)*width+x+w)*3),r*w*3);expected.set(all.subarray(((y+r)*width+x)*3,((y+r)*width+x+w)*3),r*w*3);}assert.deepEqual(await adjustScopedMapRows(crop,w,h,x,y,24,24,16,2,tables),expected);}
});
test('inconsistent scoped tile populations fail before native arithmetic and empty populations stay explicit',async()=>{
 const hist=new Int32Array(16384),areas=new Int32Array(64);areas[0]=1;await assert.rejects(async()=>adjustScopedClaheTables(hist,areas,2),{code:'INVALID_INPUT'});areas[0]=0;const tables=await adjustScopedClaheTables(hist,areas,2);for(let t=0;t<64;t++)for(let i=0;i<256;i++)assert.equal(tables[t*256+i],i);
});
test('full native sharpness and all CLAHE levels preserve original output and Otsu exactly',async()=>{
 const f=await fixture({full:true});try{for(const sharpen of [0,4,24,100])for(const equalize of [2,3,4,5])for(const threshold of [0,130,255]){
  const p=params({brightness:17,saturation:-21,hue:12,gamma:8,shadows:11,highlights:-12,sweep:130,width:181,sharpen,equalize,threshold,invert:true}),r=await f.run(p),actual=await rendered(f),native=await segmentedAdjust(f.original,p,{budget:f.budget,maxWorkers:1});try{const lease=await native.surface.readWindow();try{assert.deepEqual(actual.pixels,lease.pixels.data,JSON.stringify(p));}finally{lease.release();}assert.equal(r.metrics.otsuThreshold,native.metrics.otsuThreshold);assert.ok(actual.mask.every(Boolean));}finally{await native.surface.dispose();await f.retire();}
 }}finally{await f.clear();}
});
test('native sharpening without equalization preserves original output for every intensity',async()=>{
 const f=await fixture({full:true});try{for(const sharpen of [1,3,4,12,52,100]){const p=params({sharpen,threshold:0}),r=await f.run(p),actual=await rendered(f),native=await segmentedAdjust(f.original,p,{budget:f.budget,maxWorkers:1});try{const lease=await native.surface.readWindow();try{assert.deepEqual(actual.pixels,lease.pixels.data);}finally{lease.release();}assert.equal(r.metrics.otsuThreshold,native.metrics.otsuThreshold);}finally{await native.surface.dispose();await f.retire();}}}finally{await f.clear();}
});
test('true holes and acquisition gaps never reach native sharpening, CLAHE or Otsu and poison cannot alter useful output',async()=>{
 const a=await fixture(),b=await fixture({poison:true});try{for(const sharpen of [0,4,12])for(const equalize of [2,3,4,5])for(const threshold of [0,255]){
  const p={sharpen,equalize,threshold},ar=await a.run(p),br=await b.run(p),av=await rendered(a),bv=await rendered(b);assert.deepEqual(av.mask,bv.mask);assert.deepEqual(ar.metrics.claheTilePopulations,br.metrics.claheTilePopulations);assert.equal(ar.metrics.otsuThreshold,br.metrics.otsuThreshold);let supported=0;for(let i=0;i<av.mask.length;i++)if(av.mask[i]){supported++;assert.deepEqual(av.pixels.slice(i*3,i*3+3),bv.pixels.slice(i*3,i*3+3));}assert.ok(supported>0);assert.equal(supported,ar.metrics.analysedPixels);assert.equal(a.readState().held,0);await a.retire();await b.retire();
 }}finally{await a.clear();await b.clear();}
});
for(const phase of ['source-region-adjust-prefix','source-region-adjust-clahe-histogram','source-region-adjust-equalize','source-region-adjust-finish'])test('cancellation during '+phase+' preserves no unpublished stores or borrowed RGB',async()=>{
 const f=await fixture(),controller=new AbortController();try{await assert.rejects(f.run({sharpen:4,equalize:2,threshold:0},{signal:controller.signal,onProgress:e=>{if(e.phase===phase)controller.abort();}}),{code:'CANCELLED'});assert.equal(f.record(),undefined);assert.equal(f.readState().held,0);assert.equal(f.budget.active,0);}finally{await f.clear();}
});
test('live native budget refusal does not publish an incomplete transformed surface',async()=>{
 const f=await fixture(),limit=f.budget.limit;let lowered=false;try{await assert.rejects(f.run({sharpen:4,equalize:2},{onProgress:e=>{if(e.phase==='source-region-adjust-prefix'&&!lowered){lowered=true;f.budget.setLimit(1);}}}),{code:'MEMORY_LIMIT'});assert.equal(f.record(),undefined);assert.equal(f.readState().held,0);assert.equal(f.budget.active,0);}finally{f.budget.setLimit(limit);await f.clear();}
});
test('publication failure preserves its cause and retires both output and analysis scope',async()=>{
 const f=await fixture();try{await assert.rejects(f.run({sharpen:4,equalize:2},{publishResult(){throw new Error('publication failed');}}),/publication failed/);assert.equal(f.record(),undefined);assert.equal(f.budget.active,0);assert.equal(f.readState().held,0);}finally{await f.clear();}
});
test('A/B/A reuses the immutable mapped prefix and histogram when only threshold/inversion changes',async()=>{
 const f=await fixture();try{const a=await f.run({sharpen:4,equalize:2,width:181});assert.equal(a.metrics.analysisCacheHit,false);await f.retire();const b=await f.run({sharpen:4,equalize:2,width:151});assert.equal(b.metrics.analysisCacheHit,false);await f.retire();const before=f.readState().reads,a2=await f.run({sharpen:4,equalize:2,width:181,threshold:0,invert:true});assert.equal(a2.metrics.analysisCacheHit,true);assert.equal(a2.metrics.sourceReads,0);assert.equal(f.readState().reads,before);}finally{await f.clear();}
});
test('cancelled cached render keeps the previous displayed result and returns the borrowed cache owner',async()=>{
 const f=await fixture(),controller=new AbortController();try{await f.run({sharpen:4,equalize:2});const previous=f.record(),before=await rendered(f),reads=f.readState().reads;await assert.rejects(f.run({sharpen:4,equalize:2,threshold:0},{signal:controller.signal,onProgress:e=>{if(e.phase==='source-region-adjust-cached-prefix')controller.abort();}}),{code:'CANCELLED'});assert.equal(f.record(),previous);assert.deepEqual(await rendered(f),before);assert.equal(f.readState().reads,reads);const next=await f.run({sharpen:4,equalize:2,threshold:130});assert.equal(next.metrics.analysisCacheHit,true);assert.equal(next.metrics.sourceReads,0);}finally{await f.clear();}
});
test('pointwise and global-equalization prefixes retain native full-row HSV vector/scalar positions across all gaps',async()=>{
 const f=await fixture();try{for(const equalize of [0,1]){
  const p=params({brightness:17,saturation:-21,hue:12,gamma:8,shadows:11,highlights:-12,sweep:130,width:181,equalize}),nativePrefix=await adjustLocalRows({width:W,height:H,data:rgb},p,0,H),hist=new Float64Array(256);
  let expected=nativePrefix;if(equalize){for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(f.domain.containsOriginal(x,y))hist[nativePrefix[(y*W+x)*3+2]]++;const {equalizeHistogramLut}=await import('../src/pixel-utils.js');expected=await adjustMapRows(nativePrefix,W,H,0,40,32,1,equalizeHistogramLut(hist,f.domain.countIncluded));}
  await f.run(p);const lease=await f.record().surface.readWindow();try{for(let y=0;y<H;y++)for(let x=0;x<W;x++)if(f.domain.containsOriginal(x,y)){const at=(y*W+x)*3;assert.deepEqual(lease.pixels.data.slice(at,at+3),expected.slice(at,at+3));}}finally{lease.release();}await f.retire();
 }}finally{await f.clear();}
});
test('actual engine does not double-count its already protected native arithmetic heap on a warm scoped adjustment',async()=>{
 const api=createEngine({memoryBudgetBytes:128*1024**2,computeProfile:'maximum'});try{const loaded=await api.load({id:'image',bytes:Uint8Array.of(7,8,9),pixels:{width:W,height:H,format:'rgb8',data:rgb.slice()}}),s=await createOriginalSourceRegionsState({width:W,height:H,sourceSha256:loaded.sha256});await s.add('acquisition',{x0:0,y0:0,x1:16,y1:H});await s.add('acquisition',{x0:20,y0:0,x1:W,y1:H});await s.add('exclusion',{x0:5,y0:8,x1:8,y1:12});const d=await compileOriginalSourceRegions(s.snapshot()),task={id:'first',imageId:'image',operation:'inspection.adjust',backend:'cpu',params:{sharpen:4,equalize:2},sourceRegionDomain:d.descriptor},first=await api.run(task),second=await api.run({...task,id:'second',params:{...task.params,threshold:0,invert:true}});assert.equal(first.status,'ok');assert.equal(second.status,'ok');assert.equal(second.metrics.analysisCacheHit,true);assert.equal(second.metrics.sourceReads,0);assert.equal(api.capabilities().memory.activeReservationBytes,0);assert.ok(api.capabilities().memory.peakAccountedBytes<=128*1024**2);}finally{await api.dispose();assert.equal(api.capabilities().memory.retainedBytes,0);assert.equal(api.capabilities().memory.activeReservationBytes,0);}
});

test('human two-acquisition geometry processes every selected centre, including sharpen and empty-CLAHE borders',async()=>{
 const width=416,height=320,source=Uint8Array.from({length:width*height*3},(_,i)=>60+(i*17+Math.floor(i/19))%196),regions=[['acquisition',{x0:62,y0:59,x1:155,y1:139}],['acquisition',{x0:172,y0:47,x1:274,y1:136}],['exclusion',{x0:92,y0:78,x1:105,y1:91}]],a=await fixture({width,height,regions,source}),b=await fixture({width,height,regions,source,poison:true});
 try{assert.equal(a.domain.countIncluded,16349);for(const sharpen of [0,4,100])for(const equalize of [0,1,2,3,4,5]){
  const p={brightness:-255,width:181,sharpen,equalize},ar=await a.run(p),br=await b.run(p),av=await rendered(a),bv=await rendered(b);assert.equal(ar.metrics.analysedPixels??ar.metrics.includedPixels,16349);assert.equal(ar.metrics.unanalysablePixels??0,0);assert.equal(ar.metrics.prefixPixels??ar.metrics.includedPixels,16349);assert.deepEqual(av.mask,bv.mask);assert.deepEqual(ar.metrics.claheTilePopulations,br.metrics.claheTilePopulations);let count=0;
  for(let y=0;y<a.domain.height;y++)for(let x=0;x<a.domain.width;x++){const at=y*a.domain.width+x,admitted=a.domain.containsOriginal(x+a.domain.origin[0],y+a.domain.origin[1]);assert.equal(av.mask[at],+admitted);if(admitted){count++;assert.deepEqual(av.pixels.slice(at*3,at*3+3),bv.pixels.slice(at*3,at*3+3));assert.ok(av.pixels[at*3]<60&&av.pixels[at*3+1]<60&&av.pixels[at*3+2]<60,'Selected centre retained Original instead of requested dark adjustment.');}else{const originalAt=((y+a.domain.origin[1])*width+x+a.domain.origin[0])*3;assert.deepEqual(av.pixels.slice(at*3,at*3+3),source.slice(originalAt,originalAt+3));}}
  assert.equal(count,16349);assert.equal(br.metrics.analysedPixels??br.metrics.includedPixels,count);await a.retire();await b.retire();
 }}finally{await a.clear();await b.clear();}
});
for(const [width,height]of [[1,1],[1,9],[8,1],[16,9]])test('thin native envelope '+width+'x'+height+' preserves native CLAHE padding and all selected centres',async()=>{
 const source=Uint8Array.from({length:width*height*3},(_,i)=>50+i*23%200),f=await fixture({width,height,source,full:true});try{for(const sharpen of [0,4,100])for(const equalize of [0,2,3,4,5]){const p=params({brightness:17,sharpen,equalize}),r=await f.run(p),actual=await rendered(f),native=await segmentedAdjust(f.original,p,{budget:f.budget,maxWorkers:1});try{const lease=await native.surface.readWindow();try{assert.deepEqual(actual.pixels,lease.pixels.data);}finally{lease.release();}assert.ok(actual.mask.every(Boolean));assert.equal(r.metrics.analysedPixels??r.metrics.includedPixels,width*height);}finally{await native.surface.dispose();await f.retire();}}}finally{await f.clear();}
});
test('isolated and one-pixel-thick admitted supports remain processed without excluded RGB',async()=>{
 const width=17,height=13,source=Uint8Array.from({length:width*height*3},(_,i)=>70+i*31%170),regions=[['acquisition',{x0:1,y0:1,x1:2,y1:2}],['acquisition',{x0:7,y0:3,x1:15,y1:4}],['acquisition',{x0:8,y0:7,x1:9,y1:12}]],a=await fixture({width,height,source,regions}),b=await fixture({width,height,source,regions,poison:true});try{for(const sharpen of [4,12,100])for(const equalize of [0,1,2,3,4,5]){const p={brightness:-255,sharpen,equalize},r=await a.run(p);await b.run(p);const av=await rendered(a),bv=await rendered(b);assert.equal(r.metrics.analysedPixels,a.domain.countIncluded);assert.equal(r.metrics.unanalysablePixels,0);assert.deepEqual(av.mask,bv.mask);for(let i=0;i<av.mask.length;i++)if(av.mask[i])assert.deepEqual(av.pixels.slice(i*3,i*3+3),bv.pixels.slice(i*3,i*3+3));await a.retire();await b.retire();}}finally{await a.clear();await b.clear();}
});
