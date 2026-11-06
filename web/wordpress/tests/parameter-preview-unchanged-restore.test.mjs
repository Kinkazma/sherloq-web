// Actual app restore callback + control/session contracts, without browser or
// image arithmetic. Native pixel equivalence is qualified separately in the UI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {bindInteractiveControl} from '../sherloq-browser/assets/interactive-control.js';
import {createParameterPreviewSession} from '../sherloq-browser/assets/parameter-preview-session.js';

const app=readFileSync(new URL(process.env.SHERLOQ_RESTORE_APP_URL??'../sherloq-browser/assets/app.js',import.meta.url),'utf8');
const start=app.indexOf('\n restore:',app.indexOf('parameterSession=createParameterPreviewSession({'));
const end=app.indexOf('\n state:',start);
assert(start>=0&&end>start,'The actual parameter-session restore callback must be present');
const callback=app.slice(start,end).trim().replace(/^restore:/,'').replace(/,\s*$/,'');
const drain=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

function fixture({restoreSuccess=true}={}){
 const state={status:'Calcul terminé',display:'native',restores:0,runs:0,shown:[],commits:[]};
 const native={id:'native-95',operation:'detail.gradient',status:'ok',provenance:{params:{intensity:95}},metrics:{unanalysablePixels:4}};
 const context={busy:false,destroyed:false,sourceRegionsStale:false,resultMeta:native,individualClient:{result:native},individualUI:{operation:()=> 'detail.gradient',restorePresentation(){state.restores++;if(restoreSuccess)state.display='native';return restoreSuccess;}},status:value=>state.status=value,sourceRegionCompletedStatus:output=>'Calcul terminé · '+output.metrics.unanalysablePixels+' pixels non analysés'};
 const restore=new Function('context','with(context){return ('+callback+');}')(context);
 const timers=new Map();let next=0;
 const session=createParameterPreviewSession({schedule:fn=>{timers.set(++next,fn);return next;},unschedule:key=>timers.delete(key),preview:async event=>({params:event.params}),show:(answer)=>{state.shown.push(answer.params.intensity);state.display='proxy';state.status='Aperçu provisoire';},restore,commit:async event=>{state.runs++;state.commits.push(event.params.intensity);const value={...native,id:'native-'+event.params.intensity,provenance:{params:{...event.params}}};context.individualClient.result=context.resultMeta=value;state.display='native';state.status='Calcul terminé';}});
 return{state,context,restore,session,fireFinal(){const entries=[...timers.values()];timers.clear();for(const fn of entries)fn();}};
}

test('95→90 commits once; a held90→10→90 restores that native result and its status without another run',async()=>{
 const h=fixture(),control=Object.assign(new EventTarget(),{tagName:'INPUT',type:'range',value:'95',disabled:false}),document=Object.assign(new EventTarget(),{defaultView:new EventTarget()});control.ownerDocument=document;
 const frames=new Map();let frame=0,time=0,params={intensity:95};
 const dispatch=(phase,event)=>h.session.handle({phase,toolId:'detail.gradient',operation:'detail.gradient',field:'intensity',policy:{kind:'pixel-proxy',final:'native'},params:{...params},view:{},...event});
 const binding=bindInteractiveControl(control,{read:()=>({valid:true,value:Number(control.value)}),now:()=>time,schedule:fn=>{frames.set(++frame,fn);return frame;},cancelScheduled:key=>frames.delete(key),update:(value,event)=>{params.intensity=value;dispatch('value',event);},begin:event=>dispatch('begin',event),preview:event=>dispatch('preview',event),commit:event=>dispatch('commit',event),cancel:event=>dispatch('cancel',event)});
 const emit=(target,type,props={})=>target.dispatchEvent(Object.assign(new Event(type),props));
 const set=value=>{control.value=String(value);emit(control,'input');};
 const draw=async()=>{const pending=[...frames.values()];frames.clear();for(const fn of pending)fn();await drain();};
 emit(control,'pointerdown',{button:0,pointerId:1,clientX:0,clientY:0});set(90);emit(document,'pointerup',{pointerId:1});h.fireFinal();await h.session.settled();assert.equal(h.state.runs,1);
 emit(control,'pointerdown',{button:0,pointerId:2,clientX:0,clientY:0});set(10);emit(document,'pointermove',{buttons:1,pointerId:2,clientX:5,clientY:0});await draw();set(90);await draw();assert.equal(h.state.status,'Aperçu provisoire');assert.deepEqual(h.state.shown,[10,90]);
 time=200;emit(document,'pointerup',{pointerId:2});await h.session.settled();
 assert.equal(h.state.runs,1);assert.deepEqual(h.state.commits,[90]);assert.equal(h.state.restores,1);assert.equal(h.state.display,'native');assert.equal(h.state.status,'Calcul terminé · 4 pixels non analysés');assert.equal(h.context.resultMeta.id,'native-90');assert.equal(h.session.pending,false);assert.equal(binding.pending,false);binding.dispose();h.session.dispose();
});

test('unchanged restoration invalidates an outstanding proxy instead of repainting it after the native result',async()=>{
 const h=fixture();let resolve;const session=createParameterPreviewSession({preview:()=>new Promise(done=>resolve=done),show:()=>{throw Error('A cancelled proxy cannot paint');},commit:()=>{throw Error('The retained native result needs no run');},restore:h.restore});
 h.state.status='Aperçu provisoire';session.handle({phase:'begin'});session.handle({phase:'preview'});session.handle({phase:'cancel',reason:'unchanged'});resolve({params:{intensity:10}});await session.settled();assert.equal(h.state.status,'Calcul terminé · 4 pixels non analysés');assert.equal(h.state.display,'native');assert.equal(session.pending,false);session.dispose();h.session.dispose();
});

test('an unsuccessful restore leaves the status untouched',()=>{const h=fixture({restoreSuccess:false});h.state.status='Aperçu provisoire';h.restore('unchanged');assert.equal(h.state.status,'Aperçu provisoire');assert.equal(h.state.restores,1);h.session.dispose();});

for(const reason of ['source-change','tool-change','cancel','result-change'])test(reason+' is not reported as native completion',()=>{const h=fixture();h.state.status='Contexte modifié';h.restore(reason);assert.equal(h.state.status,'Contexte modifié');h.session.dispose();});

test('restoration during another native calculation preserves its status until that calculation is idle',()=>{const h=fixture();h.context.busy=true;h.state.status='Calcul en cours';h.restore('unchanged');assert.equal(h.state.display,'native');assert.equal(h.state.status,'Calcul en cours');h.context.busy=false;h.restore('unchanged');assert.equal(h.state.status,'Calcul terminé · 4 pixels non analysés');assert.equal(h.state.restores,2);h.session.dispose();});

for(const mismatch of ['missing-report','different-result','different-report-operation','different-tool','native-error','stale-source','closed'])test(mismatch+' cannot turn a restored presentation into a completed native result',()=>{
 const h=fixture();h.state.status='Aperçu provisoire';
 if(mismatch==='missing-report')h.context.resultMeta=null;
 if(mismatch==='different-result')h.context.individualClient.result={...h.context.resultMeta,id:'another-native'};
 if(mismatch==='different-report-operation')h.context.resultMeta={...h.context.resultMeta,operation:'inspection.adjust'};
 if(mismatch==='different-tool')h.context.individualUI.operation=()=> 'inspection.adjust';
 if(mismatch==='native-error')h.context.individualClient.result={...h.context.resultMeta,status:'error'};
 if(mismatch==='stale-source')h.context.sourceRegionsStale=true;
 if(mismatch==='closed')h.context.destroyed=true;
 h.restore('unchanged');assert.equal(h.state.status,'Aperçu provisoire');h.session.dispose();
});
