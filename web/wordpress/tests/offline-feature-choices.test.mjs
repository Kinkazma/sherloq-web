import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {offlineFeatureVolumes,renderOfflineFeatureChoices,offlineServerPresentChunks} from '../sherloq-browser/assets/offline-feature-choices.js';
import {localFeaturePolicy} from '../sherloq-browser/assets/feature-policy.js';
import {selectedFeatureIds} from '../sherloq-browser/assets/feature-catalog.js';

const h=id=>id.repeat(64),core=h('1'),shared=h('2'),heavy=h('3'),small=h('4'),privateHash=h('5');
function fixture(policy={}){
 const file=(hash,size,localOnly=false)=>({sha256:hash,size,chunks:[hash],type:'application/octet-stream',...(localOnly?{localOnly:true}:{})});
 return {identity:h('a'),manifest:{schema:'sherloq.dependencies/1',slots:['engine'],chunks:{[core]:10,[shared]:20,[heavy]:30,[small]:5,[privateHash]:40},files:{'engine/core.bin':file(core,10),'engine/shared.bin':file(shared,20),'engine/heavy.bin':file(heavy,30),'engine/small.bin':file(small,5),'engine/private.bin':file(privateHash,40,true)}},catalog:{schema:'sherloq.features/1',groups:[{id:'core',fr:'Interface et outils protégés',en:'Protected interface and tools'},{id:'neural',fr:'Méthodes apprises',en:'Learned methods'}],features:[{id:'shared',group:null,fr:'Bibliothèque partagée',en:'Shared library',internal:true,protected:false,resources:['engine/shared.bin'],dependsOn:[],tasks:[]},{id:'core',group:'core',fr:'Outils légers et démarrage',en:'Light tools and startup',protected:true,resources:['engine/core.bin'],dependsOn:[],tasks:[{operation:'original'}]},{id:'heavy',group:'neural',fr:'Algorithme lourd',en:'Heavy algorithm',protected:false,resources:['engine/heavy.bin'],dependsOn:['shared'],tasks:[{operation:'heavy'}]},{id:'submode',group:'neural',fr:'Sous-fonction indépendante',en:'Independent subfunction',protected:false,resources:['engine/small.bin'],dependsOn:['shared'],tasks:[{operation:'heavy',params:{variant:'independent'}}]},{id:'restricted',group:'neural',fr:'Modèle à importer',en:'Import-only model',protected:false,resources:['engine/private.bin'],dependsOn:[],tasks:[{operation:'restricted'}]}]},featurePolicy:{schema:'sherloq.feature-policy/1',disabledFeatures:policy.disabledFeatures||[],disabledGroups:policy.disabledGroups||[]}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function environment(initial=fixture(),options={}){
 const {document,window}=parseHTML('<html lang="fr"><head></head><body><section id="choices"></section></body></html>');let plan=initial;const changes=[],errors=[];
 Object.defineProperty(globalThis,'MutationObserver',{value:window.MutationObserver,configurable:true,writable:true});
 const container=document.getElementById('choices'),widget=renderOfflineFeatureChoices(document,container,{getPlan:()=>plan,onChange:state=>{changes.push(state);plan.featurePolicy=state;},onError:error=>errors.push(error),...options});
 const input=id=>[...container.querySelectorAll('input')].find(input=>input.dataset.featureTarget===id);
 return {document,container,widget,changes,errors,input,get plan(){return plan;},setPlan(value){plan=value;return widget.setPlan(value);}};
}
test('public volume totals count shared dependencies once and never schedule local-only bytes',()=>{
 const plan=fixture(),total=offlineFeatureVolumes(plan,{verifiedPresentChunks:new Set([core,shared])}),one=offlineFeatureVolumes(plan,{featureIds:['heavy'],verifiedPresentChunks:new Set([shared])}),local=offlineFeatureVolumes(plan,{featureIds:['restricted']}),imported=offlineFeatureVolumes(plan,{featureIds:['restricted'],verifiedPresentChunks:new Set([privateHash])});assert.equal(total.publicBytes,65);assert.equal(total.presentBytes,30);assert.equal(total.remainingBytes,35);assert.equal(total.localOnlyBytes,40);assert.equal(one.publicBytes,50);assert.equal(one.presentBytes,20);assert.equal(one.remainingBytes,30);assert.equal(local.publicBytes,0);assert.equal(local.localOnlyBytes,40);assert.equal(local.presentBytes,null);assert.equal(local.remainingBytes,null);assert.equal(imported.localOnlyPresentBytes,40);assert.equal(imported.localOnlyRemainingBytes,0);
});
test('local installer counts verified original TAR chunks without fetching or copying resource bodies',async()=>{
 const plan={...fixture(),local:true,appBase:new URL('http://127.0.0.1:8953/token/'),config:{offlineMode:'archive',managedStorage:true}},requests=[];
 const present=await offlineServerPresentChunks(plan,new Set([core]),{fetcher:async(url,options)=>{requests.push({url:String(url),options});return Response.json({presentChunks:[shared,heavy,small,'unrelated']});}});
 assert.deepEqual([...present].sort(),[core,shared,heavy,small].sort());assert.equal(offlineFeatureVolumes(plan,{verifiedPresentChunks:present}).remainingBytes,0);
 assert.equal(requests.length,1);assert.equal(requests[0].url,'http://127.0.0.1:8953/token/__managed/inventory');assert.equal(requests[0].options.credentials,'omit');
});
test('installer keeps native on-read or unavailable archive presence unknown and makes no online inventory request',async()=>{
 const plan={...fixture(),local:true,appBase:new URL('http://127.0.0.1:8953/token/'),config:{offlineMode:'archive',managedStorage:false}},cache=new Set([core]);
 assert.equal(await offlineServerPresentChunks(plan,cache,{fetcher:async()=>Response.json({presentChunks:[heavy],verification:'verified-on-read'})}),null);
 assert.equal(await offlineServerPresentChunks({...plan,config:{...plan.config,managedStorage:true}},cache,{fetcher:async()=>new Response('',{status:503})}),null);
 let requested=false;const online=await offlineServerPresentChunks({...plan,local:false},cache,{fetcher:async()=>{requested=true;throw Error('Online inventory must not be read');}});assert.equal(requested,false);assert.deepEqual([...online],[core]);
});
test('installer uses human catalogue names and defaults new public functions on with a protected core',async()=>{
 const env=environment();try{await settle();assert.match(env.container.textContent,/Algorithme lourd/);assert.match(env.container.textContent,/Sous-fonction indépendante/);assert.match(env.container.textContent,/Dépendances : Bibliothèque partagée/);assert.match(env.container.textContent,/présence à vérifier/);assert.match(env.container.textContent,/imports locaux à vérifier 40 o/);assert.equal(env.input('heavy').checked,true);assert.equal(env.input('submode').checked,true);assert.equal(env.input('core').checked,true);assert.equal(env.input('core').disabled,true);assert.equal(env.changes.length,0);}finally{env.widget.dispose();}
});
test('group exclusion changes the candidate plan before download without changing online application policy',async()=>{
 const original=localFeaturePolicy.snapshot(),local=localFeaturePolicy.local,env=environment(fixture(),{getPresentChunks:async()=>new Set([core])});try{await settle();const group=env.input('group:neural');group.checked=false;group.onchange();await settle();assert.deepEqual(env.widget.state().disabledGroups,['neural']);assert.deepEqual(env.plan.featurePolicy.disabledGroups,['neural']);assert.equal(env.input('heavy').checked,false);assert.equal(env.input('heavy').disabled,true);assert.equal(offlineFeatureVolumes(env.plan).publicBytes,10);assert.equal(env.input('core').checked,true);assert.equal(env.errors.length,0);assert.deepEqual(localFeaturePolicy.snapshot(),original);assert.equal(localFeaturePolicy.local,local);}finally{env.widget.dispose();}
});
test('imported archive exclusions override defaults and remain until an explicit function toggle',async()=>{
 const env=environment();try{await settle();await env.setPlan(fixture({disabledFeatures:['heavy','future.feature']}));assert.equal(env.input('heavy').checked,false);assert.equal(env.input('submode').checked,true);assert.deepEqual(env.widget.state().disabledFeatures,['future.feature','heavy']);env.input('heavy').checked=true;env.input('heavy').onchange();await settle();assert.equal(env.input('heavy').checked,true);assert.deepEqual(env.plan.featurePolicy.disabledFeatures,['future.feature']);}finally{env.widget.dispose();}
});
test('reenabling an imported group preserves separate individual exclusions and new features inherit disabled groups',async()=>{
 const plan=fixture({disabledGroups:['neural'],disabledFeatures:['heavy']}),env=environment(plan);try{await settle();plan.catalog.features.push({id:'new.public',group:'neural',fr:'Nouvelle fonction',en:'New function',protected:false,resources:[],dependsOn:[],tasks:[{operation:'new.public'}]});await env.widget.render();assert.equal(env.input('new.public').checked,false);env.input('group:neural').checked=true;env.input('group:neural').onchange();await settle();assert.equal(env.input('heavy').checked,false);assert.equal(env.input('submode').checked,true);assert.equal(env.input('new.public').checked,true);assert.deepEqual(env.plan.featurePolicy.disabledFeatures,['heavy']);}finally{env.widget.dispose();}
});
test('only verified supplied hashes count as present and the expensive presence scan is reused for checkbox changes',async()=>{
 let scans=0;const env=environment(fixture(),{getPresentChunks:async()=>{scans++;return new Set([core,shared]);}});try{await settle();assert.equal(scans,1);assert.match(env.container.querySelector('.offline-feature-total').textContent,/présentes 30 o/);env.input('heavy').checked=false;env.input('heavy').onchange();await settle();assert.equal(scans,1);assert.match(env.container.querySelector('.offline-feature-total').textContent,/présentes 30 o/);assert.match(env.container.querySelector('.offline-feature-total').textContent,/à recevoir 5 o/);await env.widget.refreshPresence();assert.equal(scans,2);}finally{env.widget.dispose();}
});
test('choices remain locked during preparation and the protected selected resource remains mandatory',async()=>{
 let locked=true;const env=environment(fixture(),{locked:()=>locked});try{await settle();assert.equal(env.input('heavy').disabled,true);env.input('heavy').checked=false;env.input('heavy').onchange();await settle();assert.equal(env.changes.length,0);locked=false;env.widget.setLocked(false);assert.equal(env.input('heavy').disabled,false);assert.equal(env.input('core').disabled,true);assert.ok(selectedFeatureIds(env.plan.catalog,env.widget.state()).has('core'));}finally{env.widget.dispose();}
});
