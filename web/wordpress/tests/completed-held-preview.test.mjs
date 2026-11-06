import test from 'node:test';
import assert from 'node:assert/strict';
import {canContinueHeldPreview,completedHeldPreviewFrame} from '../sherloq-browser/assets/completed-held-preview.js';
import {createGenericHeldPreviewOwner} from '../sherloq-browser/assets/generic-held-preview-owner.js';

const clone=value=>structuredClone(value);
const pixels=()=>({format:'rgb8',width:2,height:1,data:Uint8Array.of(0,1,2,3,4,5)});
function retained(kind='median'){
 const live={source:{},domain:{},basis:{},current:true},captured={...live};
 const proof=()=>live.current&&live.source===captured.source&&live.domain===captured.domain&&live.basis===captured.basis;
 const config=kind==='clones'?{operation:'tampering.copyMove.sparse',field:'view.minimum',policy:{kind:'retained',strategy:'clones',final:'retained-native'},params:{algorithm:'ORB',minimum:8},view:{minimum:2,low:0,high:100},extras:{sparseView:{minimum:2,low:0,high:100}}}:kind==='ssg'?{operation:'tampering.copyMove.sparse',field:'maskThreshold',policy:{kind:'retained',strategy:'ssg-localization',final:'native'},params:{algorithm:'SSG',maskThreshold:.1,minimumArea:5,ssimRadius:3},view:{},extras:{}}:kind==='d2'?{operation:'ai.clones.d2prl',field:'minimum',policy:{kind:'retained',strategy:'d2prl-refilter',final:'retained-native'},params:{minimum:12},view:{mode:'overlay'},extras:{}}:{operation:'various.median',field:'threshold',policy:{kind:'retained',strategy:'median',final:'native'},params:{threshold:.1,variance:10,speckle:false},view:{},extras:{}};
 const a={phase:'preview',toolId:config.operation,continuous:true,generation:7,gestureEpoch:12,controlRequestId:101,...config,completedPreviewCurrent:proof};
 const b={...clone({...a,completedPreviewCurrent:undefined}),completedPreviewCurrent:proof,controlRequestId:102};
 if(kind==='clones'){b.view.minimum=6;b.extras.sparseView.minimum=6;}else b.params[a.field]=kind==='d2'?24:.3;
 const result=kind==='clones'?{operation:a.operation,exact:true,metrics:{nativePresentation:true,retainedNativeTables:true,nativeAnalysisCalls:0,inferenceCalls:0}}:kind==='d2'?{operation:a.operation,exact:false,provisional:true,approximate:true,exportable:false,params:{minimum:12},metrics:{inferences:0,retainedD2Refilter:true,calculatedMinimum:12}}:{exact:false,provisional:true,approximate:true,exportable:false,...(kind==='ssg'?{params:clone(a.params)}:{}),metrics:{nativeAnalysisCalls:0,inferenceCalls:0}};
 return{a,b,result,live};
}
function generic({operation='inspection.adjust',field='brightness',strategy,kind='pixel-proxy',family='derived-pixel'}={}){
 const live={params:{[field]:10,method:'native'},view:{mode:'map'},extras:{},source:{},domain:{},basis:{}};
 const owner=createGenericHeldPreviewOwner({getState:()=>live,capture:()=>{const {source,domain,basis}=live;return()=>source===live.source&&domain===live.domain&&basis===live.basis;}});
 const event=value=>({phase:'preview',operation,toolId:operation,field,policy:{kind,...(strategy?{strategy}:{}),final:'native'},continuous:true,generation:9,gestureEpoch:15,controlRequestId:value,params:clone(live.params),view:clone(live.view),extras:clone(live.extras)});
 const a=owner(event(201));live.params[field]=25;const b=owner(event(202));
 const result={operation,pixels:pixels(),heldPreview:{version:1,operation,family,requested:{params:clone(a.params),view:clone(a.view)},calculated:{params:clone(a.params),view:clone(a.view)}}};
 return{a,b,result,live};
}

for(const kind of ['clones','median','ssg','d2']){
 test(kind+': a completed frame remains admissible while only its held field moves',()=>{
  const {a,b,result}=retained(kind);assert.equal(canContinueHeldPreview(a,b),true);assert.equal(completedHeldPreviewFrame(a,b,result),true);
  const raw={...b,phase:'value'};delete raw.completedPreviewCurrent;
  assert.equal(canContinueHeldPreview(a,raw),true);assert.equal(completedHeldPreviewFrame(a,raw,result),true);
 });
}
for(const options of [{},{operation:'inspection.histogram',field:'start',kind:'retained',strategy:'histogram',family:'retained-tables'},{operation:'jpeg.zero',field:'threshold',kind:'retained',strategy:'zero-native-cache',family:'native-postprocess'},{operation:'jpeg.ghosts',field:'low',strategy:'ghosts-recompression',family:'ghost-hybrid'}]){
 test('typed generic '+(options.family??'derived-pixel')+' keeps its existing producer admission',()=>{
  const {a,b,result}=generic(options);assert.equal(canContinueHeldPreview(a,b),true);assert.equal(completedHeldPreviewFrame(a,b,result),true);
  const raw={...b,phase:'value'};delete raw.completedPreviewCurrent;delete raw.genericHeldPreviewOwner;
  assert.equal(canContinueHeldPreview(a,raw),true);assert.equal(completedHeldPreviewFrame(a,raw,result),true);
 });
}
test('all identities and release boundaries reject continuing or publishing an old gesture',()=>{
 const changes=[{phase:'commit'},{phase:'cancel'},{phase:'begin'},{operation:'other'},{toolId:'other'},{field:'variance'},{generation:8},{gestureEpoch:13},{generation:0},{gestureEpoch:0},{continuous:false},{policy:{kind:'retained',strategy:'median',final:'explicit'}}];
 for(const change of changes){const {a,b,result}=retained();const other={...b,...change};assert.equal(canContinueHeldPreview(a,other),false,JSON.stringify(change));assert.equal(completedHeldPreviewFrame(a,other,result),false,JSON.stringify(change));}
});
test('source, domain, retained basis and live-source failures reject every route',()=>{
 for(const make of [retained,generic])for(const key of ['source','domain','basis']){const {a,b,result,live}=make();live[key]={};assert.equal(canContinueHeldPreview(a,b),false,key);assert.equal(completedHeldPreviewFrame(a,b,result),false,key);}
 const {a,b,result}=retained();for(const proof of [undefined,()=>false,()=>{throw Error('revoked');}]){const invalid={...a,completedPreviewCurrent:proof};assert.equal(canContinueHeldPreview(invalid,b),false);assert.equal(completedHeldPreviewFrame(invalid,b,result),false);}
});
test('a missing latest proof is allowed only for raw value, never an unowned preview',()=>{
 for(const make of [retained,generic]){const {a,b,result}=make();delete b.completedPreviewCurrent;assert.equal(canContinueHeldPreview(a,b),false);assert.equal(completedHeldPreviewFrame(a,b,result),false);b.phase='value';assert.equal(canContinueHeldPreview(a,b),true);b.completedPreviewCurrent=()=>false;assert.equal(canContinueHeldPreview(a,b),false);assert.equal(completedHeldPreviewFrame(a,b,result),false);}
});
test('a second parameter, method, view or extras change fails closed even during raw input',()=>{
 for(const make of [retained,generic])for(const mutate of [b=>b.params.method='another',b=>b.view.mode='other',b=>b.extras.layer='other']){const {a,b,result}=make();b.phase='value';delete b.completedPreviewCurrent;mutate(b);assert.equal(canContinueHeldPreview(a,b),false);assert.equal(completedHeldPreviewFrame(a,b,result),false);}
});
test('native clone mirror must equal the held display value and all scientific parameters stay equal',()=>{
 for(const mutate of [b=>b.extras.sparseView.minimum++,b=>b.params.minimum++,b=>b.view.low++]){const {a,b,result}=retained('clones');mutate(b);assert.equal(canContinueHeldPreview(a,b),false);assert.equal(completedHeldPreviewFrame(a,b,result),false);}
});
test('exact clone publication requires native retained tables and zero new analysis or inference',()=>{
 for(const change of [{exact:false},{operation:'other'},{metrics:{nativePresentation:false}},{metrics:{retainedNativeTables:false}},{metrics:{nativeAnalysisCalls:1}},{metrics:{inferenceCalls:1}}]){const {a,b,result}=retained('clones');const altered={...result,...change,...(change.metrics?{metrics:{...result.metrics,...change.metrics}}:{})};assert.equal(completedHeldPreviewFrame(a,b,altered),false,JSON.stringify(change));}
});
test('median and SSG rasters retain their provisional export lock and do not run analysis',()=>{
 for(const kind of ['median','ssg'])for(const change of [{exact:true},{provisional:false},{approximate:false},{exportable:true},{operation:'other'},{metrics:{nativeAnalysisCalls:1}},{metrics:{inferenceCalls:1}}]){const {a,b,result}=retained(kind),altered={...result,...change,...(change.metrics?{metrics:{...result.metrics,...change.metrics}}:{})};assert.equal(completedHeldPreviewFrame(a,b,altered),false,kind+JSON.stringify(change));}
});
test('SSG returned parameters cannot change another scientific setting',()=>{
 const {a,b,result}=retained('ssg');assert.equal(completedHeldPreviewFrame(a,b,{...result,params:{...result.params,ssimRadius:9}}),false);assert.equal(completedHeldPreviewFrame(a,b,{...result,params:{...result.params,maskThreshold:NaN}}),false);
});
test('D2 publishes only the calculated retained threshold with no inference',()=>{
 for(const change of [{params:{minimum:24}},{metrics:{calculatedMinimum:24}},{metrics:{inferences:1}},{metrics:{retainedD2Refilter:false}}]){const {a,b,result}=retained('d2'),altered={...result,...change,...(change.metrics?{metrics:{...result.metrics,...change.metrics}}:{})};assert.equal(completedHeldPreviewFrame(a,b,altered),false);}
 for(const minimum of [-1,5001,1.5,NaN]){const {a,b}=retained('d2');b.params.minimum=minimum;assert.equal(canContinueHeldPreview(a,b),false);}
});
test('generic producer family, requested values and bounded RGB8 payload remain authoritative',()=>{
 for(const mutate of [r=>r.heldPreview.family='unknown',r=>r.heldPreview.operation='other',r=>r.heldPreview.requested.params.brightness++,r=>r.pixels.data=new Uint8Array(5),r=>r.pixels.width=4097,r=>r.pixels.format='rgba8',r=>delete r.heldPreview]){const {a,b,result}=generic();mutate(result);assert.equal(completedHeldPreviewFrame(a,b,result),false);}
});
test('frequency is always delegated to its existing specialized admission',()=>{
 const {a,b,result}=generic({operation:'detail.frequency'});assert.equal(canContinueHeldPreview(a,b),false);assert.equal(completedHeldPreviewFrame(a,b,result),false);
});
test('slider reversal is allowed; publication monotonicity belongs to the single-flight scheduler',()=>{
 const {a,b,result}=retained();b.params.threshold=-.5;b.controlRequestId=a.controlRequestId+1;assert.equal(canContinueHeldPreview(a,b),true);assert.equal(completedHeldPreviewFrame(a,b,result),true);
});
test('admission owns no buffers or mutable records and malformed records fail closed',()=>{
 const {a,b,result}=generic(),before={a:clone({...a,completedPreviewCurrent:undefined}),b:clone({...b,completedPreviewCurrent:undefined}),result:clone(result)};assert.equal(completedHeldPreviewFrame(a,b,result),true);assert.deepEqual({...a,completedPreviewCurrent:undefined},before.a);assert.deepEqual({...b,completedPreviewCurrent:undefined},before.b);assert.deepEqual(result,before.result);
 for(const value of [null,{},undefined]){assert.equal(canContinueHeldPreview(value,b),false);assert.equal(completedHeldPreviewFrame(a,value,result),false);}
 const circular={...b,extras:{}};circular.extras.self=circular.extras;assert.equal(canContinueHeldPreview(a,circular),false);
});
