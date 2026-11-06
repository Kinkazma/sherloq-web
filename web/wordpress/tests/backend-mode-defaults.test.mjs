import test from 'node:test';
import assert from 'node:assert/strict';
import {BackendModePreferences,defaultBackend,requestedBackend,gpuBackendEligible} from '../sherloq-browser/assets/backend-mode-preferences.js';

function navigatorFixture(value){
 const previous=Object.getOwnPropertyDescriptor(globalThis,'navigator');Object.defineProperty(globalThis,'navigator',{configurable:true,value});
 return()=>{if(previous)Object.defineProperty(globalThis,'navigator',previous);else delete globalThis.navigator;};
}

test('Energy never converts a visible GPU API with no usable adapter into an implicit strict GPU choice',()=>{
 let probes=0;const restore=navigatorFixture({gpu:{requestAdapter:async()=>{probes++;return null;}}});
 try{
  assert.equal(gpuBackendEligible('ela.energy'),true);assert.equal(defaultBackend('ela.energy'),'auto');assert.equal(requestedBackend({operation:'ela.energy',params:{}}),'auto');
  assert.equal(probes,0,'synchronous defaults must not create hardware probes or devices');
 }finally{restore();}
});

test('SHERLOQ Precision defaults to automatic without mistaking API exposure for an adapter',()=>{
 let probes=0;const restore=navigatorFixture({gpu:{requestAdapter:async()=>{probes++;return null;}}});
 try{
  const task={operation:'inspection.sherloq7c',params:{computationMode:'precision'}};
  assert.equal(defaultBackend(task.operation,task.params),'auto');
  assert.equal(requestedBackend(task),'auto');
  assert.equal(requestedBackend({...task,backend:'webgpu'}),'webgpu');
  assert.equal(requestedBackend(task,{},{hasMode:()=>true,mode:()=> 'cpu'}),'cpu');
  assert.equal(requestedBackend(task,{},{hasMode:()=>true,mode:()=> 'webgpu'}),'webgpu');
  assert.equal(probes,0);
 }finally{restore();}
});

test('an available GPU remains selectable by the actual auto provider; UI defaults do not force a CPU path',()=>{
 let probes=0;const restore=navigatorFixture({gpu:{requestAdapter:async()=>{probes++;return{requestDevice:async()=>({})};}}});
 try{assert.equal(defaultBackend('ela.energy'),'auto');assert.equal(requestedBackend({operation:'ela.energy',params:{}}),'auto');assert.equal(probes,0);}
 finally{restore();}
});

test('explicit task and stored user choices remain strict even if GPU hardware is unavailable',()=>{
 const restore=navigatorFixture({});try{
  const task={operation:'ela.energy',params:{}},stored={hasMode:()=>true,mode:()=> 'webgpu'};
  assert.equal(requestedBackend({operation:'m2.splicebuster',params:{}},{},{hasMode:()=>true,mode:()=> 'cpu'}),'cpu');
  assert.equal(requestedBackend(task,{},stored),'webgpu');assert.equal(requestedBackend({...task,backend:'cpu'},{},stored),'cpu');assert.equal(requestedBackend({...task,backend:'webgpu'},{},{hasMode:()=>true,mode:()=> 'cpu'}),'webgpu');
  const choices=[{tool:'ela.energy',method:'default',mode:'webgpu'},{tool:'ela.classic',method:'default',mode:'cpu'}],modes=new BackendModePreferences({choices});assert.equal(modes.get('ela.energy'),'webgpu');assert.equal(modes.get('ela.classic'),'cpu');assert.deepEqual(modes.export(),choices);const restored=new BackendModePreferences();restored.restore({choices:modes.export()});assert.deepEqual(restored.export(),choices);
 }finally{restore();}
});

test('the automatic menu value is stable and default visitation never adds an explicit profile setting',()=>{
 const restore=navigatorFixture({gpu:{}});try{
  const preferences=new BackendModePreferences();assert.equal(preferences.get('ela.energy'),'auto');assert.equal(preferences.get('ela.classic'),'webgpu');assert.equal(preferences.get('unregistered-tool'),'auto');assert.deepEqual(preferences.export(),[]);
  const legacy=new BackendModePreferences({legacyMode:'webgpu'});assert.equal(legacy.get('ela.energy'),'webgpu');assert.equal(legacy.get('detail.gradient'),'auto');assert.deepEqual(legacy.export(),[{tool:'ela.energy',method:'default',mode:'webgpu'}]);
 }finally{restore();}
});

test('all other qualified tools preserve their historical GPU defaults when the API is exposed',()=>{
 const restore=navigatorFixture({gpu:{}});try{
  for(const tool of ['ela.classic','ela.biomes','jpeg.ghosts','jpeg.recompression','jpeg.quality','jpeg.zero','m2.splicebuster']){assert.equal(defaultBackend(tool),'webgpu',tool);assert.equal(requestedBackend({operation:tool,params:{}}),'webgpu',tool);}
  assert.equal(defaultBackend('tampering.copyMove.sparse',{algorithm:'SSG'}),'auto','the CPU-only SSG exception remains unchanged');assert.equal(defaultBackend('detail.gradient'),'auto');
 }finally{restore();}
});

test('without a GPU API, the historical CPU-capable automatic defaults remain unchanged for every tool',()=>{
 const restore=navigatorFixture({});try{for(const tool of ['ela.energy','ela.classic','ela.biomes','jpeg.ghosts','jpeg.recompression','jpeg.quality','jpeg.zero','m2.splicebuster'])assert.equal(defaultBackend(tool),'auto',tool);}
 finally{restore();}
});
