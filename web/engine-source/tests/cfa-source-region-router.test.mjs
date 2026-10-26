import{test}from'node:test';import assert from'node:assert/strict';
import{Budget}from'../src/cache.js';
import{createCfaSourceRegionRouter}from'../src/cfa-source-region-router.js';
test('the M2 router shares one native owner and preserves its exact profile/configuration for legacy input',async()=>{
 const budget=new Budget(1024**2),calls=[],expected={data:{metadata:{method:'adaptive_cfa'}}},configuration={budget,computeProfile:'maximum',resourceHints:{maxWorkers:12},assets:{Original:{sha256:'a'}},runtimes:{wasm:{executor:'cfa'}}};let config,disposed=0;
 const router=createCfaSourceRegionRouter({...configuration,nativeFactory:value=>{config=value;return{async analyze(...args){calls.push(args);return expected;},render(){return'native-render';},renderWindow(){return'native-window';},clearCache(){calls.push('clear');},dispose(){disposed++;},memory(){return budget.snapshot();}};}});
 assert.deepEqual(config,configuration);const image={data:new Uint8Array(3),width:1,height:1},params={variant:'Original',block:32,tile:512},options={backend:'cpu'};assert.equal(await router.analyze(image,params,options),expected);assert.deepEqual(calls[0],[image,params,options]);assert.equal(router.render(image,expected,0),'native-render');assert.equal(router.renderWindow(image,expected,0,{}),'native-window');router.clearCache();await router.dispose();await router.dispose();assert.equal(disposed,1);
});
test('a router cannot overlap a legacy and strict source transaction on the shared native pool',async()=>{
 let finish;const gate=new Promise(r=>finish=r),budget=new Budget(1024**2),router=createCfaSourceRegionRouter({budget,nativeFactory:()=>({analyze:()=>gate,clearCache(){},dispose(){},memory(){return budget.snapshot();}})}),first=router.analyze({},{});try{await assert.rejects(router.analyze({strictCfaContexts:true},{}),{code:'BUSY'});}finally{finish({});await first;await router.dispose();}
});
