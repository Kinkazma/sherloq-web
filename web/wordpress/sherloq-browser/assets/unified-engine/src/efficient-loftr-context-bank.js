import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {efficientLoFtrLiteralContextShape} from './efficient-loftr-literal-contexts.js';

const raw=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength),identity={rotation:0,reflected:false};
function ready(layout){requireValue(layout?.schema==='sherloq.efficient-loftr-context-bank-layout/26'&&!layout.closed&&layout.banks.length===2,'Live two-ROI native context layout required.');}
function bank(layout,side){ready(layout);requireValue(side===0||side===1,'Native ROI side must remain0/1.');return layout.banks[side];}
function admitted(budget,bytes){requireValue(Number.isSafeInteger(bytes)&&bytes>=0&&typeof budget?.reserve==='function','Exact context bank memory admission required.');return budget.reserve(bytes);}

/** No numeric operator. Each input context retains its own unchanged native
 * grid. Source side0 stays untransformed; only target side1 gets the requested
 * existing native variant. RGB and feature membership are never deduplicated
 * or reordered here: the canonical literal RGB plan already owns that domain.
 */
export function createEfficientLoFtrContextBankLayout(plan,variant=identity,{budget,signal}={}){
 requireValue(plan?.schema==='sherloq.efficient-loftr-literal-context-plan/3'&&plan.status==='ready'&&plan.banks?.length===2,'Ready canonical literal-context plan required.');
 requireValue([0,90,180,270].includes(variant.rotation)&&typeof variant.reflected==='boolean','Existing native target variant required.');checkAbort(signal);
 const release=admitted(budget,1024*plan.banks.reduce((n,b)=>n+b.contexts.length,0));let returned=false;
 try{
  const banks=plan.banks.map((b,side)=>{requireValue(b.side===side&&b.contexts.length>0,'Native comparison ROI order changed.');requireValue(new Set(b.contexts.map(c=>c.id)).size===b.contexts.length,'Native context dictionary IDs must be unique.');let coarseCells=0,aggregateTokens=0;
   const contexts=b.contexts.map((source,index)=>{requireValue(source.index===index&&source.side===side&&source.sourceDomainFingerprint===plan.sourceDomainFingerprint,'Literal context ownership changed.');const effectiveVariant=side===0?identity:variant,shape=efficientLoFtrLiteralContextShape(source,effectiveVariant);
    requireValue([shape.width,shape.height].every(n=>Number.isSafeInteger(n)&&n>=32&&n%32===0),'Native padded context dimensions changed.');const c={...source,coarse:{width:shape.width/8,height:shape.height/8},aggregate:{width:shape.width/32,height:shape.height/32},fine:{width:shape.width,height:shape.height},effectiveVariant:{...effectiveVariant},coarseOffset:coarseCells,aggregateOffset:aggregateTokens};coarseCells+=c.coarse.width*c.coarse.height;aggregateTokens+=c.aggregate.width*c.aggregate.height;requireValue(Number.isSafeInteger(coarseCells)&&Number.isSafeInteger(aggregateTokens),'Native population integer bound exceeded.');return c;});
   requireValue(coarseCells===b.coarseCells&&aggregateTokens===b.aggregateTokens,'A native rotation/reflection must preserve its token population.');return{...b,contexts,coarseCells,aggregateTokens};
  });
  let closed=false;returned=true;return{schema:'sherloq.efficient-loftr-context-bank-layout/26',get closed(){return closed;},sourceDomainFingerprint:plan.sourceDomainFingerprint,targetVariant:{...variant},banks,spatialPolicy:'local-native-before-bank; no Original phase or RoPE reset',qualified:false,
   // Existing border04 consumes this borrowed, variant-correct spatial view.
   nativeLocalBorderPlan:{...plan,banks,release(){}},release(){if(!closed){closed=true;release();}}};
 }finally{if(!returned)release();}
}

/** q/k/v are ALREADY projected and, for self layers, already passed through
 * their actual local native RoPE. This function copies bytes only. A whole
 * one-context input retains its exact native tensor dimensions and order.
 */
export async function joinEfficientLoFtrContextSequences(layout,side,tensors,{budget,signal}={}){
 const b=bank(layout,side);requireValue(tensors instanceof Map&&tensors.size===b.contexts.length,'Exactly one local projected tensor per context required.');checkAbort(signal);
 const release=admitted(budget,b.aggregateTokens*256*4+256*b.contexts.length);let returned=false;
 try{
  const data=new Float32Array(b.aggregateTokens*256),ranges=[];
  for(const c of b.contexts){const t=tensors.get(c.id),dims=[1,c.aggregate.height,c.aggregate.width,256];requireValue(t?.type==='float32'&&t.data instanceof Float32Array&&JSON.stringify(t.dims)===JSON.stringify(dims)&&t.data.length===dims.reduce((n,v)=>n*v,1),'Local projected grid/type differs '+c.id);
   raw(data).set(raw(t.data),c.aggregateOffset*256*4);ranges.push({contextId:c.id,offset:c.aggregateOffset,tokens:c.aggregate.width*c.aggregate.height,nativeDims:dims,effectiveVariant:c.effectiveVariant});if(c.index%16===0)await controlCheckpoint(signal);
  }
  checkAbort(signal);ready(layout);let released=false;returned=true;return{type:'float32',data,dims:b.contexts.length===1?[...ranges[0].nativeDims]:[1,1,b.aggregateTokens,256],side,ranges,qualified:false,copyPolicy:'exact bytes after native local spatial/projection/RoPE only',release(){if(!released){released=true;release();}}};
 }finally{if(!returned)release();}
}

/** Common native merge produces [1,sumTokens,256]. Copy it back to the SAME
 * context intervals before native local Resize/MLP/LN/residual. No recluster,
 * averaging, sorting, normalization or numeric message calculation occurs.
 */
export async function splitEfficientLoFtrContextMessages(layout,side,tensor,{budget,signal}={}){
 const b=bank(layout,side);requireValue(tensor?.type==='float32'&&tensor.data instanceof Float32Array&&JSON.stringify(tensor.dims)===JSON.stringify([1,b.aggregateTokens,256])&&tensor.data.length===b.aggregateTokens*256,'Complete native merged message bank required.');checkAbort(signal);
 const release=admitted(budget,tensor.data.byteLength+256*b.contexts.length);let returned=false;
 try{const contexts=new Map();for(const c of b.contexts){const tokens=c.aggregate.width*c.aggregate.height,data=new Float32Array(tokens*256),start=c.aggregateOffset*256*4;raw(data).set(raw(tensor.data).subarray(start,start+data.byteLength));contexts.set(c.id,{type:'float32',data,dims:[1,tokens,256],context:c});if(c.index%16===0)await controlCheckpoint(signal);}
  checkAbort(signal);ready(layout);let released=false;returned=true;return{contexts,side,qualified:false,copyPolicy:'native merge messages split at unchanged canonical local offsets',release(){if(!released){released=true;release();}}};
 }finally{if(!returned)release();}
}

export function addressEfficientLoFtrContextCell(layout,side,index){
 const b=bank(layout,side);if(typeof index==='bigint'){requireValue(index>=0n&&index<=BigInt(Number.MAX_SAFE_INTEGER),'Native coarse index integer bound exceeded.');index=Number(index);}requireValue(Number.isSafeInteger(index)&&index>=0&&index<b.coarseCells,'Native coarse index lies outside its ROI bank.');
 let lo=0,hi=b.contexts.length;while(lo+1<hi){const mid=(lo+hi)>>>1;if(b.contexts[mid].coarseOffset<=index)lo=mid;else hi=mid;}const context=b.contexts[lo],localIndex=index-context.coarseOffset;
 return{side,context,localIndex,x:(localIndex%context.coarse.width)*8,y:Math.floor(localIndex/context.coarse.width)*8};
}

/** Only addresses the native selected rows. Local native gather models still
 * build every patch (source8/pad0,target10/pad1). Ordinals restore the exact
 * native common matching order after per-context gather batches, including
 * any repeated target row. There is no fragment matching or pair deduplication.
 */
export async function planEfficientLoFtrContextFineRows(layout,left,right,{budget,signal}={}){
 ready(layout);requireValue(left instanceof BigInt64Array&&right instanceof BigInt64Array&&left.length===right.length,'Native int64 common source/target row indices required.');checkAbort(signal);
 const count=left.length;requireValue(count<=0xffffffff,'Native fine row ordinal bound exceeded.');const release=admitted(budget,count*40+1024*layout.banks.reduce((n,b)=>n+b.contexts.length,0));let returned=false;
 try{const banks=[];for(let side=0;side<2;side++){
   const indices=side===0?left:right,centers=new Float32Array(count*2),counts=new Uint32Array(layout.banks[side].contexts.length),positions=new Uint32Array(counts.length);
   for(let ordinal=0;ordinal<count;ordinal++){const a=addressEfficientLoFtrContextCell(layout,side,indices[ordinal]);counts[a.context.index]++;if(ordinal%256===0)await controlCheckpoint(signal);}
   const slots=layout.banks[side].contexts.map(c=>counts[c.index]?{context:c,localIndices:new BigInt64Array(counts[c.index]),ordinals:new Uint32Array(counts[c.index])}:null);
   for(let ordinal=0;ordinal<count;ordinal++){const a=addressEfficientLoFtrContextCell(layout,side,indices[ordinal]),slot=slots[a.context.index],position=positions[a.context.index]++;centers[2*ordinal]=a.x;centers[2*ordinal+1]=a.y;slot.localIndices[position]=BigInt(a.localIndex);slot.ordinals[position]=ordinal;if(ordinal%256===0)await controlCheckpoint(signal);}
   const contexts=slots.filter(Boolean);
   banks.push({side,centers:{type:'float32',dims:[count,2],data:centers},contexts});
  }
  checkAbort(signal);ready(layout);let released=false;returned=true;return{count,banks,qualified:false,orderPolicy:'native common pair order retained; local native gather requests only',release(){if(!released){released=true;release();}}};
 }finally{if(!returned)release();}
}
