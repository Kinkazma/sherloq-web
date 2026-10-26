import test from 'node:test';
import assert from 'node:assert/strict';
import {createEngine} from '../src/index.js';
import {FocalEngine} from '../src/focal.js';
import {AdaiflEngine} from '../src/adaifl.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';

for(const [method,Constructor]of[['focal',FocalEngine],['adaifl',AdaiflEngine]])test(method+' real engine dispatch binds separate strict native owners and reuses them on view changes',async t=>{
 const native=[],cached=new Map();t.after(()=>cached.clear());
 t.mock.method(Constructor.prototype,'analyze',async function(params,{backend}){
  let value=cached.get(this.prefix),hit=!!value;
  if(!value){let first;for(let y=0;y<this.image.height;y++){const lease=await this.image.readRows(y,1);try{first??=lease.pixels.data[0];for(let x=0;x<this.image.width;x++){const at=x*3;assert.equal(lease.pixels.data[at+2],17);}}finally{lease.release();}}
   native.push({prefix:this.prefix,width:this.image.width,height:this.image.height,first});value={map:new Float32Array(4096).fill(first/255),...(method==='focal'?{features:new Float32Array(4096*288).fill(first)}:{mask:new Uint8Array(4096).fill(first%2)}),metadata:{native_shape:[64,64],image_shape:[this.image.height,this.image.width],provider:backend==='cpu'?'wasm':backend}};cached.set(this.prefix,value);
  }
  return{...value,metadata:{...value.metadata,result_reused:hit},release(){}};
 });
 const engine=createEngine({memoryBudgetBytes:256*1024**2,computeProfile:'maximum',cpuKernel:'single'}),width=24,height=18,bytes=Uint8Array.of(31,27,19),pixels={width,height,format:'rgb8',data:Uint8Array.from({length:width*height*3},(_,i)=>i%3===2?17:Math.floor(i/3)%width)};
 try{const source=await engine.load({id:'strict-source',bytes,pixels});await engine.loadM3Models({models:{[method]:{controlled:true}}});const state=await createOriginalSourceRegionsState({width,height,sourceSha256:source.sha256});await state.add('acquisition',{x0:2,y0:2,x1:11,y1:16});await state.add('acquisition',{x0:15,y0:2,x1:22,y1:16});await state.add('exclusion',{x0:5,y0:6,x1:8,y1:10});const domain=await compileOriginalSourceRegions(state.snapshot()),task={id:'native-a',imageId:source.id,operation:'ai.localization.'+method,params:{},backend:'cpu',sourceRegionDomain:domain.descriptor},answer=await engine.run(task);
  assert.equal(native.length,5);assert.equal(new Set(native.map(n=>n.prefix)).size,5);assert.equal(answer.data.fragments.length,5);assert.equal(answer.data.metadata.strictSourceRegions.includedPixels,domain.countIncluded);assert.equal(answer.data.metadata.native_shape,null);assert.equal(answer.provenance.coordinates,'native-grids-per-fragment; bounds in source-region-native pixels');assert.equal(answer.provenance.sourceRegionResearch.excludedSamplesRead,false);assert.deepEqual(answer.sourceRegionOrigin,domain.origin);assert.equal(answer.sourceRegionDomain.fingerprint,domain.fingerprint);
  const second=await engine.run({...task,id:'native-map',view:{mode:'map'}});assert.equal(native.length,5);assert.equal(second.metrics.cache.result,true);assert.equal(second.data.metadata.result_reused,true);assert.deepEqual(second.data.fragments.map(f=>f.metadata.image_shape),answer.data.fragments.map(f=>f.metadata.image_shape));assert.deepEqual(engine.original(source.id),bytes);
  await assert.rejects(engine.run({...task,id:'unsupported-independent-scope',params:{scientificScope:{regions:[{x0:0,y0:0,x1:24,y1:18}]}}}),{code:'SOURCE_SCOPE_UNSUPPORTED'});assert.equal(native.length,5);
  for(const output of[answer,second]){await engine.releaseSurface(output.surface.id);await engine.releaseSurface(output.sourceRegionSourceSurface.id);}await engine.unload(source.id);await engine.unloadM3Models();const m=engine.capabilities().memory;assert.equal(m.retainedBytes+m.cacheBytes+m.activeReservationBytes,0);
 }finally{await engine.dispose();}
});
