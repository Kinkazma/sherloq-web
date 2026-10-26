import test from 'node:test';
import assert from 'node:assert/strict';
import {Budget} from '../src/cache.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from '../src/source-region-geometry.js';
import {createStrictXfeatCopyEngine} from '../src/xfeat-strict-copy.js';
import {prepareXfeatStrictPopulation} from '../src/xfeat-strict-preparation.js';

async function fixture(stage,primaryValue){
 const sha='a'.repeat(64),budget=new Budget(4294967296),state=await createOriginalSourceRegionsState({sourceSha256:sha,width:64,height:64}),domain=await compileOriginalSourceRegions(state.snapshot()),control={allow:false,stores:new Set(),refusals:0},primary=arguments.length>1?primaryValue:Object.freeze(Object.assign(new Error('controlled primary '+stage),{code:'CONTROLLED_PRIMARY'})),ack=Object.freeze(Object.assign(new Error('controlled derived store ACK refusal'),{code:'CONTROLLED_ACK'}));
 const temporarySession={backend:'opfs',async create(n){const free=budget.reserve(n),data=new Uint8Array(n),store={async write(value,at){data.set(value,at);},async readInto(target,at){target.set(data.subarray(at,at+target.byteLength));},async dispose(){if(!control.stores.has(store))return;if(!control.allow){control.refusals++;throw ack;}control.stores.delete(store);free();}};control.stores.add(store);return store;}};
 const source={sha256:sha,temporarySession,surface:{descriptor:{format:'rgb8',width:64,height:64},async readWindow(r){const free=budget.reserve(r.width*r.height*3);return{pixels:{format:'rgb8',width:r.width,height:r.height,data:new Uint8Array(r.width*r.height*3).fill(87)},release:free};}}},record={...source,originalSource:source,sourceRegionDomain:domain.descriptor};
 const engine=createStrictXfeatCopyEngine(record,budget,{maxWorkers:10},{storage:'temporary',preparationFactory:(source,options)=>prepareXfeatStrictPopulation(source,{...options,storage:'temporary',...(stage==='construction'?{onProgress(){throw primary;}}:{})}),poolFactory:()=>({metrics:{modelSessions:0},async reserve(){},async execute(){throw primary;},async dispose(){}})});
 return{budget,engine,control,primary,ack,sha};
}
for(const stage of ['construction','extraction'])test('unconfirmed derived '+stage+' stores stay reachable for retry through the public strict XFeat owner',async()=>{
 const h=await fixture(stage);try{
  await assert.rejects(h.engine.analyze({algorithm:'XFeat'},{models:{'xfeat-paged':{sha256:'1'.repeat(64)}},backend:'cpu',sourceSha256:h.sha}),e=>e===h.primary);
  assert.equal(h.control.stores.size,stage==='construction'?1:3);assert(h.control.refusals>0);assert(h.budget.total()>0);await assert.rejects(h.engine.dispose());assert(h.control.stores.size>0,'An unconfirmed ACK cannot make the disk owner disappear.');h.control.allow=true;await h.engine.dispose();assert.equal(h.control.stores.size,0);assert.equal(h.budget.total(),0);
 }finally{h.control.allow=true;await h.engine.dispose();for(const store of [...h.control.stores])await store.dispose();}
});
test('falsy extraction primaries survive unconfirmed cleanup and retry',async()=>{
 for(const primary of [undefined,null,false,0,'']){const h=await fixture('extraction',primary);let caught=false;try{try{await h.engine.analyze({algorithm:'XFeat'},{models:{'xfeat-paged':{sha256:'1'.repeat(64)}},backend:'cpu',sourceSha256:h.sha});}catch(error){caught=true;assert.equal(error,primary);}assert(caught);assert.equal(h.control.stores.size,3);h.control.allow=true;await h.engine.dispose();assert.equal(h.control.stores.size,0);assert.equal(h.budget.total(),0);}finally{h.control.allow=true;await h.engine.dispose();for(const store of [...h.control.stores])await store.dispose();}}
});
