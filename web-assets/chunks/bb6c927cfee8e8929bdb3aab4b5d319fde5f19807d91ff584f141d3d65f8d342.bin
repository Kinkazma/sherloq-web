import "../../runtime-context.js?v=0.14.5";
// Native adaptive microscopy matcher, with the bounded graph executor injected.
import {decideLightglueLayer,updateLightglueIndices} from './forgeryscope-lightglue-control.js';
import {checkAbort,checkpoint,requireValue} from './errors.js';
const tensor=(data,dims)=>({data,dims});
function gather(t,keep,axis) {
  const stride=t.dims.slice(axis+1).reduce((a,b)=>a*b,1),prefix=t.dims.slice(0,axis).reduce((a,b)=>a*b,1),n=t.dims[axis];
  const output=new Float32Array(prefix*keep.length*stride);
  for(let p=0;p<prefix;p++)for(let i=0;i<keep.length;i++)output.set(t.data.subarray((p*n+keep[i])*stride,(p*n+keep[i]+1)*stride),(p*keep.length+i)*stride);
  const dims=[...t.dims];dims[axis]=keep.length;return tensor(output,dims);
}
export async function runMicroMatcher(features,{runGraph,signal,onProgress}={}) {
  requireValue(typeof runGraph==='function','Graph executor required.');
  const n=features.descriptors0.dims[1],m=features.descriptors1.dims[1],prune0=new Uint32Array(n).fill(1),prune1=new Uint32Array(m).fill(1);
  let ids0=Uint32Array.from({length:n},(_,i)=>i),ids1=Uint32Array.from({length:m},(_,i)=>i),state,stop=1,layer=0;
  const empty=()=>({matches0:new Int32Array(n).fill(-1),matches1:new Int32Array(m).fill(-1),matching_scores0:new Float32Array(n),matching_scores1:new Float32Array(m),prune0,prune1,stop});
  await checkpoint(signal);if(!n||!m)return empty();
  state=await runGraph('initial',features);checkAbort(signal);
  for(layer=0;layer<9;layer++) {
    stop=layer+1;await checkpoint(signal);if(!ids0.length||!ids1.length)return empty();
    onProgress?.({stage:'lightglue-layer',completed:layer,total:9,points0:ids0.length,points1:ids1.length});
    const next=await runGraph(`layer-${layer}`,state);checkAbort(signal);
    state.desc0=next.next0;state.desc1=next.next1;
    if(layer===8)break;
    const decision=decideLightglueLayer({layer,totalPoints:n+m,confidence0:next.confidence0.data,confidence1:next.confidence1.data,matchability0:next.matchability0.data,matchability1:next.matchability1.data});
    if(decision.stop)break;
    state.desc0=gather(state.desc0,decision.keep0,1);state.desc1=gather(state.desc1,decision.keep1,1);
    state.encoding0=gather(state.encoding0,decision.keep0,3);state.encoding1=gather(state.encoding1,decision.keep1,3);
    ids0=updateLightglueIndices(ids0,decision.keep0,prune0);ids1=updateLightglueIndices(ids1,decision.keep1,prune1);
  }
  if(!ids0.length||!ids1.length)return empty();
  const matched=await runGraph(`assignment-${layer}`,{desc0:state.desc0,desc1:state.desc1});checkAbort(signal);
  const result=empty();
  for(let i=0;i<ids0.length;i++) {const j=Number(matched.matches0.data[i]);result.matches0[ids0[i]]=j<0?-1:ids1[j];result.matching_scores0[ids0[i]]=matched.scores0.data[i];}
  for(let j=0;j<ids1.length;j++) {const i=Number(matched.matches1.data[j]);result.matches1[ids1[j]]=i<0?-1:ids0[i];result.matching_scores1[ids1[j]]=matched.scores1.data[j];}
  onProgress?.({stage:'lightglue-complete',completed:stop,total:stop,points0:ids0.length,points1:ids1.length});return result;
}
