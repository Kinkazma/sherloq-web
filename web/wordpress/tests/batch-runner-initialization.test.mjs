import test from 'node:test';
import assert from 'node:assert/strict';
import {createBatchRunner} from '../sherloq-browser/assets/batch-runner.js';
import {batchCatalog,catalogRecipe,batchPairSelection} from '../sherloq-browser/assets/batch-catalog.js';

const deployment={engineVersion:'test',engineCommit:'fixed',runtimeSourceIncrementSha256:'fixed'};
function fixture(){
 const recipe=catalogRecipe(batchCatalog.find(item=>item.params.algorithm==='EfficientLoFTR').id);
 const image={id:'image-a',hash:'exact-pixels',name:'image.png',width:160,height:96,selected:true,family:'photography',blob:new Blob(['original']),occurrences:[{studyId:'study'}],state:'done',score:{clones:0,additional:0,total:0,incomplete:false}};
 image.pairSelection=batchPairSelection(image,[{x0:8,y0:12,x1:56,y1:60},{x0:80,y0:20,x1:144,y1:68}],'manual');
 const engine={version:'test',commit:'fixed',increment:'fixed',batch:'0.2.0',memoryBudgetBytes:4*1024**3,m2MemoryBudgetBytes:2*1024**3};
 const configuration={options:{panels:false},pairSelections:{[image.hash]:structuredClone(image.pairSelection)},recipes:[{id:recipe.id,operation:recipe.operation,params:recipe.params,signal:recipe.signal,backend:'auto'}]};
 const path='resultats/'+image.id+'/'+recipe.id+'.npz',archive=new Blob([Uint8Array.from([80,75,3,4,1,2,3,4])]);
 image.runs=[{toolId:recipe.id,status:'done',params:structuredClone(recipe.params),files:[path],entries:[],cloneMaximum:0,positive:false}];
 image.restored={engine:structuredClone(engine),configuration:structuredClone(configuration)};
 const stored=new Map([['comparaisons/old.json',new Blob(['old'])],[path,archive]]),events=[];
 let deletionFailure,computations=0;
 const artifacts={keys:()=>stored.keys(),has:path=>stored.has(path),get:async path=>stored.get(path),set:async(path,value)=>stored.set(path,value),async delete(path){if(deletionFailure)throw deletionFailure;return stored.delete(path);}};
 const model={images:[image],studies:[{id:'study',name:'Study',errors:[]}],artifacts,engine};
 const runner=createBatchRunner({onProgress:event=>events.push(event),toolFactory(){computations++;throw Error('A completed, matching scientific run must be reused.');}});
 return {runner,model,image,recipe,path,archive,events,stored,set deletionFailure(error){deletionFailure=error;},get computations(){return computations;}};
}
async function withDeployment(callback){
 const original=globalThis.fetch;
 globalThis.fetch=async()=>({ok:true,json:async()=>deployment});
 try{return await callback();}finally{globalThis.fetch=original;}
}

test('a storage refusal during batch initialization releases the runner and retry preserves completed work',async()=>withDeployment(async()=>{
 const f=fixture(),runs=f.image.runs,pair=structuredClone(f.image.pairSelection),pixels=f.image.blob;
 const error=Object.assign(new Error('Storage deletion failed',{cause:new Error('IDB transaction aborted')}),{code:'STORAGE_FAILURE',details:{operation:'delete',path:'comparaisons/old.json'}});
 f.deletionFailure=error;
 await assert.rejects(f.runner.run(f.model,[f.recipe],{reuse:true,panels:false}),actual=>actual===error&&actual.cause.message==='IDB transaction aborted'&&actual.details.operation==='delete');
 assert.equal(f.runner.running,false);assert.equal(f.computations,0);
 assert.equal(f.image.state,'done');assert.equal(f.image.runs,runs);assert.equal(f.image.blob,pixels);assert.deepEqual(f.image.pairSelection,pair);
 assert.equal(await f.model.artifacts.get(f.path),f.archive);assert.equal(f.model.artifacts.has('comparaisons/old.json'),true);
 f.deletionFailure=null;
 const result=await f.runner.run(f.model,[f.recipe],{reuse:true,panels:false});
 assert.equal(result,f.model);assert.equal(f.runner.running,false);assert.equal(f.computations,0);
 assert.equal(f.image.reused,true);assert.equal(f.image.runs,runs);assert.equal(f.image.history,undefined);assert.deepEqual(f.image.pairSelection,pair);
 assert.deepEqual(new Uint8Array(await (await f.model.artifacts.get(f.path)).arrayBuffer()),new Uint8Array(await f.archive.arrayBuffer()));
 assert.equal(f.model.artifacts.has('comparaisons/old.json'),false);assert.equal(f.events.at(-1).phase,'finished');
}));

test('a configuration download refusal preserves its original cause and a later run can reuse the existing result',async()=>withDeployment(async()=>{
 const f=fixture(),fetchDeployment=globalThis.fetch,error=Object.assign(new TypeError('Failed to fetch',{cause:new Error('network unavailable')}),{code:'NETWORK_TRANSIENT'});
 globalThis.fetch=async()=>{throw error;};
 await assert.rejects(f.runner.run(f.model,[f.recipe],{reuse:true,panels:false}),actual=>actual===error&&actual.cause.message==='network unavailable');
 assert.equal(f.runner.running,false);assert.equal(f.image.state,'done');assert.equal(await f.model.artifacts.get(f.path),f.archive);assert.equal(f.computations,0);
 globalThis.fetch=fetchDeployment;
 await f.runner.run(f.model,[f.recipe],{reuse:true,panels:false});
 assert.equal(f.runner.running,false);assert.equal(f.image.reused,true);assert.equal(f.computations,0);assert.equal(await f.model.artifacts.get(f.path),f.archive);
}));
