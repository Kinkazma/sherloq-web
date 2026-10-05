import {requireValue,normalizeResourceError} from './errors.js';
export const SIFT_CONTINUATION_HALO=128,SIFT_CONTINUATION_CORE=256;
// Canonical windows retain all neighbours needed by the already-qualified
// Newton/orientation kernels. The native oracle verifies the dependency bound.
export function groupSiftContinuations(pending,width,height,{canonical=false}={}){
 const groups=new Map();for(let index=0;index<pending.length;index++){
  const state=pending[index].state,[x,y]=state;requireValue(state.length===4&&state.every(Number.isSafeInteger),'Invalid SIFT continuation state.');
  const cx=canonical?Math.floor(x/SIFT_CONTINUATION_CORE)*SIFT_CONTINUATION_CORE:x-128,cy=canonical?Math.floor(y/SIFT_CONTINUATION_CORE)*SIFT_CONTINUATION_CORE:y-128;
  const x0=Math.max(0,cx-128),y0=Math.max(0,cy-128),x1=Math.min(width,canonical?cx+SIFT_CONTINUATION_CORE+128:x+257),y1=Math.min(height,canonical?cy+SIFT_CONTINUATION_CORE+128:y+257),key=[x0,y0,x1,y1].join(':');
  let group=groups.get(key);if(!group){group={x0,y0,x1,y1,indices:[],states:[]};groups.set(key,group);}group.indices.push(index);group.states.push(state);
 }
 return [...groups.values()];
}
export function packSiftContinuationStates(group){
 const bytes=group.states.length*16;let output;try{output=new Int32Array(group.states.length*4);}catch(error){throw normalizeResourceError(error,{allocationKind:'array-buffer',requestedBytes:bytes});}
 group.states.forEach((state,index)=>output.set(state,index*4));return output;
}
export function siftContinuationDependencyRadius(kernelLengths,layers){
 const gaussian=kernelLengths.reduce((sum,length)=>sum+(length-1)/2,0),orientation=Math.ceil(4.5*1.6*2**((layers+.5)/layers))+1;
 return {gaussian,orientation,total:gaussian+Math.max(1,orientation),halo:SIFT_CONTINUATION_HALO};
}

// Group completion order may differ from seed order. Hold only unpublished
// owners, and commit each original seed once. An append is atomic; if it fails,
// the native batch and its exact continuation states remain in the checkpoint.
export function createSiftContinuationRound(count){return {count,published:0,groups:new Map(),slots:new Array(count),again:[]};}
export function acceptSiftContinuationBatch(round,groupIndex,group,result,pages,frees){
 let record=round.groups.get(groupIndex);
 if(!record){
  requireValue(result.statuses.length===group.indices.length&&result.states.length===group.indices.length*4&&result.offsets.length===group.indices.length+1,'Invalid SIFT continuation batch shape.');
  const release=result.retainOwnership?.();record={result,remaining:group.indices.length,release};round.groups.set(groupIndex,record);
  const dispose=()=>{record.result=null;record.release?.();record.release=null;};frees.push(dispose);
  for(let local=0;local<group.indices.length;local++)round.slots[group.indices[local]]={record,local};
 }
 while(round.published<round.count){
  const slot=round.slots[round.published];if(!slot)break;const {record,local}=slot,value=record.result,status=value.statuses[local];
  if(status===1)round.again.push({state:Array.from(value.states.subarray(local*4,local*4+4))});
  else pages.append(value.points.subarray(value.offsets[local],value.offsets[local+1]));
  // Nothing that can fail follows publication, so a retry cannot duplicate it.
  round.slots[round.published++]=null;if(--record.remaining===0){record.result=null;record.release?.();record.release=null;}
 }
}
