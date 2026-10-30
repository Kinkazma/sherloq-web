import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort} from './errors.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {prepareObservedNlmAtlasInto,renderObservedNlmBatchCore} from './observed-atlas.js';

// Consecutive descriptors only. No pixels or full-image list are retained.
export function* groupNlmBoundaryCores(cores,{enabled=false,maxEntries=16}={}){
 requireValue(Number.isSafeInteger(maxEntries)&&maxEntries>=1&&maxEntries<=64,'Invalid NLM group bound');let group=[];
 for(const core of cores){
  if(!enabled||!core.observedBoundary){if(group.length){yield group;group=[];}yield[core];continue;}
  group.push(core);if(group.length===maxEntries){yield group;group=[];}
 }
 if(group.length)yield group;
}

export async function executeNlmAtlasGroup(group,p,{gpu,view,domain,signal,cooperate,ioWorkspaceBytes,commit,single}={}){
 requireValue(Array.isArray(group)&&group.length>=1&&group.length<=16&&typeof commit==='function'&&typeof single==='function','Bounded NLM consumers required');
 let cursor=0;
 while(cursor<group.length){
  checkAbort(signal);const base=cursor,remaining=group.slice(base);let result;
  if(remaining.length>=2&&remaining.every(core=>core.observedBoundary)&&typeof gpu?.computeAtlases==='function'){
   result=await gpu.computeAtlases(remaining.map(core=>({width:core.width*27,height:27})),p,{signal,ioWorkspaceBytes,
    prepareAtlas(entry,context){return prepareObservedNlmAtlasInto(view,domain,remaining[entry.index],{...context,cooperate});}
   });
  }
  if(!result){await single(group[cursor]);cursor++;continue;}
  let failed=false,primary;
  try{
   requireValue(Array.isArray(result.atlasEntries)&&result.atlasEntries.length>=2&&result.atlasEntries.length<=remaining.length,'NLM atlas prefix differs from its request');
   for(const entry of result.atlasEntries){requireValue(entry.index===cursor-base&&entry.points===group[cursor].width,'NLM atlas order differs from its source cores');await cooperate?.();checkAbort(signal);await commit(group[cursor],renderObservedNlmBatchCore(result,entry.index,p));cursor++;}
  }catch(error){failed=true;primary=error;throw error;}
  finally{await retireCompositeOwners([()=>result.release()],failed?{primary}:{});}
 }
}
