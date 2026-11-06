import test from 'node:test';
import assert from 'node:assert/strict';
import {createEnergyParameterPreview} from '../sherloq-browser/assets/energy-parameter-preview.js';
import {renderEnergy} from '../sherloq-browser/assets/energy-render.js';

const params={quality:75,block:16,minimum:1,profile:'manual',histogramLow:10,histogramHigh:990,shadow:50,highlight:50};
const preview={maxWidth:80,maxHeight:80,adaptive:false};
const presentation={view:'overlay',opacity:70};
function fixture(){
 const width=80,height=80,n=width*height,live=new Map(),audit={sourceReads:0,fieldReads:0,renders:0,segments:0};let serial=0,abortOnRender=null,abortOnPlane=null;
 const source={width,height,format:'rgb8',data:Uint8Array.from({length:n*3},(_,i)=>(i*17+i%11)%256)};
 const values={energy_scope:new Int32Array(n).fill(1),energy_low_score:new Float32Array(n).fill(1),energy_high_score:new Float32Array(n).fill(2),...Object.fromEntries([0,1,2].map(q=>['energy_plane_'+q,new Float32Array(n).fill(q+1)]))};
 const analysis={id:'native',imageId:'source',provenance:{originalSha256:'a'.repeat(64),params:{...params}},planeSurfaces:Object.fromEntries(Object.keys(values).map(name=>[name,{id:name,revision:1,width,height,format:name==='energy_scope'?'int32':'float32'}])),data:{width,height,metadata:{quality:75,block:16,energy:{quantiles:[.01,.99],thresholds:[5,5]}},energy_summary:[{id:1,bbox:[0,0,width,height]}]}};
 const engine={async reserveExternalMemory({bytes}){const lease={id:++serial,bytes};live.set(lease.id,lease);return lease;},async releaseExternalMemory(id){assert.ok(live.delete(id),'one release per admitted lease');},async readPlane({surfaceId,rect}){audit.fieldReads++;const Type=values[surfaceId].constructor,data=new Type(rect.width*rect.height);for(let y=0;y<rect.height;y++)data.set(values[surfaceId].subarray((rect.y+y)*width+rect.x,(rect.y+y)*width+rect.x+rect.width),y*rect.width);if(surfaceId===abortOnPlane?.name)abortOnPlane.controller.abort();return{plane:{width:rect.width,height:rect.height,data}};}};
 const owner=createEnergyParameterPreview({adaptive:false,engine,readOriginal:async(_analysis,tile)=>{audit.sourceReads++;const w=Math.ceil(tile.w/tile.step),h=Math.ceil(tile.h/tile.step),data=new Uint8Array(w*h*3);for(let y=0;y<h;y++)for(let x=0;x<w;x++)data.set(source.data.subarray(((y*tile.step)*width+x*tile.step)*3,((y*tile.step)*width+x*tile.step)*3+3),(y*w+x)*3);return{width:w,height:h,format:'rgb8',data};},dependencies:{energyParams:p=>({...p}),energyProfile:()=>({quantiles:[.01,.99],thresholds:[5,5]}),prepareEnergy:async(_source,_planes,_quantiles,_log,{draftSourceScope})=>({energy_scope:draftSourceScope,energy_low_score:new Float32Array(draftSourceScope.length).fill(1),energy_high_score:new Float32Array(draftSourceScope.length).fill(2),energy_summary:[{id:1,bbox:[0,0,width,height]}]}),energyLogData:()=>new Int32Array(1),referenceLogFunction:()=>Math.log,segmentEnergy:async base=>{audit.segments++;return{labels:new Int32Array(base.width*base.height).fill(1),regions:[{id:1}]};},energyColor:()=>[170,70,20],renderEnergy:async(...args)=>{audit.renders++;const frame=await renderEnergy(...args);abortOnRender?.abort();return frame;}}});
 return{owner,analysis,audit,live,values,setRenderAbort:controller=>abortOnRender=controller,setPlaneAbort:(name,controller)=>abortOnPlane={name,controller},bytes:()=>[...live.values()].reduce((n,l)=>n+l.bytes,0)};
}
const render=(h,options={})=>h.owner.render(h.analysis,{params,presentation,preview,...options});

test('cancel after rendering retains only complete native inputs; next frame rereads nothing and matches a fresh render',async()=>{
 const h=fixture(),reference=fixture(),controller=new AbortController();h.setRenderAbort(controller);
 try{
  await assert.rejects(render(h,{signal:controller.signal}),{code:'CANCELLED'});
  assert.equal(h.audit.renders,1);assert.equal(h.audit.sourceReads,1);assert.equal(h.audit.fieldReads,3);assert.equal(h.bytes(),15*80*80,'the completed sampled grid survives a cancelled output');
  h.setRenderAbort(null);const recovered=await render(h),exact=await render(reference);
  assert.equal(recovered.draft.nativeSampleCache.hit,true);assert.equal(recovered.draft.nativeSampleCache.sourceReads,0);assert.equal(recovered.draft.nativeSampleCache.numericFieldsRead,0);assert.equal(h.audit.sourceReads,1);assert.equal(h.audit.fieldReads,3);assert.deepEqual(recovered.pixels.data,exact.pixels.data);
 }finally{await h.owner.dispose();await reference.owner.dispose();assert.equal(h.bytes(),0);assert.equal(reference.bytes(),0);}
});

test('source, domain, plane revision and sampling grid changes each invalidate the completed native input cache',async()=>{
 const h=fixture();try{
  await render(h);assert.equal(h.audit.sourceReads,1);
  h.analysis.provenance.originalSha256='b'.repeat(64);assert.equal((await render(h)).draft.nativeSampleCache.hit,false);
  h.analysis.sourceRegionDomain={fingerprint:'other'};assert.equal((await render(h)).draft.nativeSampleCache.hit,false);
  h.analysis.planeSurfaces.energy_low_score.revision++;assert.equal((await render(h)).draft.nativeSampleCache.hit,false);
  const smaller=await render(h,{preview:{...preview,maxWidth:40,maxHeight:40}});assert.equal(smaller.draft.nativeSampleCache.hit,false);assert.equal(smaller.pixels.width,40);assert.equal(h.audit.sourceReads,5);assert.equal(h.live.size,1);
 }finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('cancel inside a native field copy cannot retain a partial grid',async()=>{
 const h=fixture(),controller=new AbortController();h.setPlaneAbort('energy_low_score',controller);try{
  await assert.rejects(render(h,{signal:controller.signal}),{code:'CANCELLED'});assert.equal(h.live.size,0);assert.equal(h.audit.renders,0);h.setPlaneAbort(null,null);
  const frame=await render(h);assert.equal(frame.draft.nativeSampleCache.hit,false);assert.equal(h.audit.sourceReads,2);
 }finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});

test('a cancelled optional plane extension leaves the earlier complete grid valid; a later complete extension survives render cancellation',async()=>{
 const h=fixture();try{
  await render(h);const sourceReads=h.audit.sourceReads,fieldReads=h.audit.fieldReads,controller=new AbortController();h.setPlaneAbort('energy_plane_1',controller);
  await assert.rejects(render(h,{params:{...params,histogramLow:20},signal:controller.signal}),{code:'CANCELLED'});assert.equal(h.bytes(),15*80*80);h.setPlaneAbort(null,null);
  const original=await render(h);assert.equal(original.draft.nativeSampleCache.hit,true);assert.equal(h.audit.sourceReads,sourceReads);
  const cancelRender=new AbortController();h.setRenderAbort(cancelRender);await assert.rejects(render(h,{params:{...params,histogramLow:20},signal:cancelRender.signal}),{code:'CANCELLED'});h.setRenderAbort(null);const reads=h.audit.fieldReads;
  const extended=await render(h,{params:{...params,histogramLow:20}});assert.equal(extended.draft.nativeSampleCache.qualityPlanesHit,true);assert.equal(h.audit.fieldReads,reads);assert.equal(h.audit.sourceReads,sourceReads);assert.ok(reads>fieldReads);assert.equal(h.bytes(),27*80*80+512*1024);
 }finally{await h.owner.dispose();assert.equal(h.bytes(),0);}
});
