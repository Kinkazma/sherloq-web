import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort} from './errors.js';
import {joinEfficientLoFtrContextSequences,splitEfficientLoFtrContextMessages,planEfficientLoFtrContextFineRows} from './efficient-loftr-context-bank.js';
import {joinEfficientLoFtrContextCoarseFeatures,splitEfficientLoFtrNormalizedCoarse,joinEfficientLoFtrContextFinePatches} from './efficient-loftr-coarse-fine-bank.js';
import {applyEfficientLoFtrNativeLocalBorder} from './efficient-loftr-common-bank-address.js';

const native=(kind,layer=0)=>({library:'native-stages01',kind,layer}),domain=(kind,layer=0,side=0)=>({library:'native-domain04',kind,layer,side});
const shape=t=>t?.dims,eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function tensor(t,type,dims){if(dims===null){requireValue(Array.isArray(t?.dims)&&t.dims.length===1&&Number.isSafeInteger(t.dims[0])&&t.dims[0]>=0,'Native selected tensor must be rank1.');dims=t.dims;}const C=type==='float32'?Float32Array:type==='int64'?BigInt64Array:Uint8Array;requireValue(t?.type===type&&t.data instanceof C&&eq(shape(t),dims)&&t.data.length===dims.reduce((n,d)=>n*d,1),'Literal native stage tensor type/shape changed.');if(type==='float32')requireValue(t.data.every(Number.isFinite),'Native literal-bank tensor must be finite.');if(type==='bool')requireValue(t.data.every(v=>v===0||v===1),'Native bool payload changed.');return t;}
const view=(t,dims)=>({type:t.type,data:t.data,dims});

/** One analysis only: two scientific matcher roles, never two independent
 * analysis windows. runStage derives the frozen native cut, binds these ordered
 * inputs to its exact native input names and returns independently owned host
 * tensors in its exact native output order. The host executor supplies and
 * audits real inference OR an explicitly labelled model+feed-identical replay.
 * This module contains no ORT import, model fetch, GPU or neural Worker.
 */
export async function runEfficientLoFtrLiteralBanks({layout,inputs,threshold,runStage,budget,signal,onOwner,onStep}={}){
 requireValue(layout?.schema==='sherloq.efficient-loftr-context-bank-layout/26'&&!layout.closed&&layout.banks.length===2&&inputs instanceof Map&&typeof runStage==='function'&&typeof budget?.reserve==='function'&&typeof onOwner==='function','Live two-role layout, native executor, admitted inputs and parent owner required.');
 tensor(threshold,'float32',[]);requireValue(threshold.data[0]>0,'Native positive threshold required.');
 const contexts=layout.banks.flatMap(b=>b.contexts);requireValue(inputs.size===contexts.length,'Exactly one prepared native tensor per context/role required.');
 for(const c of contexts)tensor(inputs.get(c.id),'float32',[1,1,c.fine.height,c.fine.width]);checkAbort(signal);
 const owned=new Set(),steps=[],states=layout.banks.map(b=>new Map()),config={budget,signal};let closed=false,finished=false,failed=false,number=0;
 const keep=o=>{requireValue(o&&typeof o.release==='function','Native output or exact-copy owner required.');owned.add(o);return o;};
 const drop=async o=>{if(o&&owned.has(o)){await o.release();owned.delete(o);}};
 const owner={get closed(){return closed;},get pendingOwners(){return owned.size;},async dispose(){closed=true;let failed=false,primary;for(const o of [...owned].reverse())try{await drop(o);}catch(e){if(!failed){failed=true;primary=e;}}if(failed)throw primary;}};
 onOwner(owner);
 async function call(request,feed,expected,where){
  requireValue(!closed&&!layout.closed,'Literal-bank execution closed.');checkAbort(signal);const step={index:++number,request:{...request},...where};steps.push(step);await onStep?.(step);checkAbort(signal);
  const reply=keep(await runStage({...request,orderedInputs:feed,outputSpecs:expected,step}));requireValue(Array.isArray(reply.outputs)&&reply.outputs.length===expected.length,'Exact native output order required.');
  reply.outputs.forEach((t,i)=>tensor(t,expected[i][0],expected[i][1]));step.execution=reply.execution??null;return reply;
 }
 const f=(...dims)=>['float32',dims],i=(...dims)=>['int64',dims],b=(...dims)=>['bool',dims];
 async function updateBank(layer,side,peer){
  const q=new Map(),k=new Map(),v=new Map(),projected=[];
  for(const c of layout.banks[side].contexts){const state=states[side].get(c.id),a=await call(native('aggregate',layer),[state.feature],[f(1,256,c.aggregate.height,c.aggregate.width)],{layer,role:side,contextId:c.id});
   const p=await call(native('q-project',layer),a.outputs,[f(1,c.aggregate.height,c.aggregate.width,256)],{layer,role:side,contextId:c.id});await drop(a);let value=p.outputs[0];projected.push(p);
   if(layer%2===0){const r=await call(domain('rope-native',layer,0),[value],[f(1,c.aggregate.height,c.aggregate.width,256)],{layer,role:side,contextId:c.id,position:'native-local-q'});value=r.outputs[0];projected.push(r);}q.set(c.id,value);
  }
  for(const c of layout.banks[peer].contexts){const state=states[peer].get(c.id),a=await call(native('pool',layer),[state.feature],[f(1,256,c.aggregate.height,c.aggregate.width)],{layer,role:peer,queryRole:side,contextId:c.id});
   const p=await call(native('kv-project',layer),a.outputs,[f(1,c.aggregate.height,c.aggregate.width,256),f(1,c.aggregate.height,c.aggregate.width,256)],{layer,role:peer,queryRole:side,contextId:c.id});await drop(a);let key=p.outputs[0];projected.push(p);
   if(layer%2===0){const r=await call(domain('rope-native',layer,1),[key],[f(1,c.aggregate.height,c.aggregate.width,256)],{layer,role:peer,contextId:c.id,position:'native-local-k'});key=r.outputs[0];projected.push(r);}k.set(c.id,key);v.set(c.id,p.outputs[1]);
  }
  const jq=keep(await joinEfficientLoFtrContextSequences(layout,side,q,config)),jk=keep(await joinEfficientLoFtrContextSequences(layout,peer,k,config)),jv=keep(await joinEfficientLoFtrContextSequences(layout,peer,v,config));
  for(const p of projected)await drop(p);
  const tokens=layout.banks[side].aggregateTokens,a=await call(native('attention',layer),[jq,jk,jv],[f(1,tokens,8,32)],{layer,role:side,peerRole:peer,commonBank:true});await drop(jq);await drop(jk);await drop(jv);
  // Only the literal native flatten of the two trailing8x32 axes; same buffer.
  const m=await call(native('merge',layer),[view(a.outputs[0],[1,tokens,256])],[f(1,tokens,256)],{layer,role:side,commonBank:true});await drop(a);
  const split=keep(await splitEfficientLoFtrContextMessages(layout,side,m.outputs[0],config));await drop(m);
  for(const c of layout.banks[side].contexts){const state=states[side].get(c.id),r=await call(domain('redistribute',layer),[state.feature,split.contexts.get(c.id)],[f(1,256,c.coarse.height,c.coarse.width)],{layer,role:side,contextId:c.id});
   const u=await call(native('update',layer),[state.feature,r.outputs[0]],[f(1,256,c.coarse.height,c.coarse.width)],{layer,role:side,contextId:c.id});await drop(r);await drop(state.featureOwner);state.feature=u.outputs[0];state.featureOwner=u;
  }await drop(split);
 }
 try{
  for(const c of contexts){const r=await call(native('backbone'),[inputs.get(c.id)],[f(1,64,c.fine.height/2,c.fine.width/2),f(1,128,c.fine.height/4,c.fine.width/4),f(1,256,c.coarse.height,c.coarse.width)],{role:c.side,contextId:c.id});states[c.side].set(c.id,{backbone:r,feature:r.outputs[2],featureOwner:null});}
  for(let layer=0;layer<8;layer++){
   // Native order is sequential. In cross, side1 uses UPDATED side0.
   await updateBank(layer,0,layer%2===0?0:1);await updateBank(layer,1,layer%2===0?1:0);
  }
  const coarse=[];for(let side=0;side<2;side++)coarse.push(keep(await joinEfficientLoFtrContextCoarseFeatures(layout,side,new Map([...states[side]].map(([id,s])=>[id,s.feature])),config)));
  const L=layout.banks.map(b=>b.coarseCells),score=await call(domain('coarse-score'),coarse,[f(1,L[0],256),f(1,L[1],256),f(1,L[0],L[1])],{commonBank:true});for(const c of coarse)await drop(c);
  for(const s of states)for(const state of s.values()){await drop(state.featureOwner);state.featureOwner=null;state.feature=null;}
  const greater=await call(domain('coarse-threshold'),[score.outputs[2],threshold],[b(1,L[0],L[1])],{commonBank:true}),border=keep(await applyEfficientLoFtrNativeLocalBorder(greater.outputs[0].data,layout.nativeLocalBorderPlan,config));await drop(greater);
  // ReduceMax still sees the ENTIRE native dual-softmax matrix, never a score mask.
  const mutual=await call(domain('coarse-mutual'),[score.outputs[2],border],[iDynamic(),iDynamic(),fDynamic(),fDynamic()],{commonBank:true});await drop(border);
  const selected=mutual.outputs[0].data.length;requireValue(selected<=L[0],'Native mutual rows exceed the source coarse population.');requireValue(mutual.outputs.every(t=>t.dims[0]===selected),'Native selected indices/confidences cardinality differs.');
  const rows=keep(await planEfficientLoFtrContextFineRows(layout,mutual.outputs[0].data,mutual.outputs[1].data,config));
  let points;
  if(selected){
   const patches=[];
   for(let side=0;side<2;side++){
    const normalized=keep(await splitEfficientLoFtrNormalizedCoarse(layout,side,score.outputs[side],config)),maps=new Map();
    for(const c of layout.banks[side].contexts){const s=states[side].get(c.id),n=normalized.contexts.get(c.id),p=await call(domain('fine-pyramid',0,side),[n.sequence,n.height,n.width,s.backbone.outputs[0],s.backbone.outputs[1]],[f(1,64,c.fine.height,c.fine.width)],{role:side,contextId:c.id});await drop(s.backbone);s.backbone=null;
     const batch=rows.banks[side].contexts.find(r=>r.context.id===c.id);
     if(batch){const indices={type:'int64',data:batch.localIndices,dims:[batch.localIndices.length]},g=await call(domain('fine-gather',0,side),[p.outputs[0],indices,n.width],[f(batch.localIndices.length,side?100:64,64)],{role:side,contextId:c.id});maps.set(c.id,g);}
     await drop(p);
    }
    patches.push(keep(await joinEfficientLoFtrContextFinePatches(rows,side,new Map([...maps].map(([id,p])=>[id,p.outputs[0]])),config)));for(const p of maps.values())await drop(p);await drop(normalized);
   }
   points=await call(domain('fine-rows'),[patches[0],patches[1],rows.banks[0].centers,rows.banks[1].centers,mutual.outputs[3]],[f(selected,2),f(selected,2)],{commonBank:true,nativeLoop512:true});for(const p of patches)await drop(p);
  }
  await drop(score);for(const s of states)for(const state of s.values())await drop(state.backbone);
  // No fine confidence operation: the unchanged native coarse confidence is
  // exactly the full graph confidence output. Context ordinals remain available
  // for the native mapper and unchanged scientific postfilters at the caller.
  const result={schema:'sherloq.efficient-loftr-literal-bank-raw/28',keypoints0:points?.outputs[0]??{type:'float32',dims:[0,2],data:new Float32Array(0)},keypoints1:points?.outputs[1]??{type:'float32',dims:[0,2],data:new Float32Array(0)},confidence:mutual.outputs[3],rows,steps,logicalRequests:number,maximumLogicalRequests:59*contexts.length+36,qualified:false,dispose:owner.dispose};
  requireValue(number<=result.maximumLogicalRequests,'Literal native stage count exceeded its finite population bound.');finished=true;return result;
 }catch(error){failed=true;throw error;}finally{if(!finished)try{await owner.dispose();}catch(cleanupError){owner.cleanupError=cleanupError;if(!failed)throw cleanupError;}}
 function iDynamic(){return ['int64',null];}function fDynamic(){return ['float32',null];}
}
