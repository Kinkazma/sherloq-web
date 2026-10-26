import {EngineError,requireValue} from './errors.js';
import {createNeuralSpatialRows} from './neural-spatial-rows.js';
import {segmentedNeuralProjection} from './segmented-neural-projection.js';
import {retireCompositeOwners} from './composite-owner-release.js';
export function createNeuralProjector({budget,contiguous,postprocess,family,side,kind}){
 let image,spatial,pending,busy=false,disposed=false,closing=false,clearTask,closeTask,retirementRequested=false;
 const failedConstructions=new Set();
 function clear(){
  if(clearTask)return clearTask;
  if(!pending&&!failedConstructions.size)return Promise.resolve();
  retirementRequested=true;
  const previous=pending;if(previous)previous.raw=[];
  const task=clearTask=Promise.resolve().then(async()=>{
   await retireCompositeOwners([
    previous?async()=>{await previous.state?.dispose();if(pending===previous)pending=null;}:undefined,
    ...[...failedConstructions].map(owner=>async()=>{await owner.dispose();failedConstructions.delete(owner);})
   ]);
   retirementRequested=false;
  });
  task.then(()=>{if(clearTask===task)clearTask=null;},()=>{if(clearTask===task)clearTask=null;});
  return task;
 }
 return {
  setImage(value){requireValue(!busy&&!disposed&&!closing&&!clearTask,'Neural projection unavailable');image=value;},
  async run(input,hooks={}){
   requireValue(!busy&&!disposed&&!closing&&!clearTask,'Neural projection unavailable');busy=true;
   try{
    if(retirementRequested||failedConstructions.size||pending?.state?.retiring)await clear();
    if(input.layout!=='segmented'){await clear();return await contiguous.run(input,hooks);}
    if(!image?.segmented)throw new EngineError('INVALID_INPUT','Immutable segmented projection source required');
    const identity=JSON.stringify([hooks.checkpointKey,input.width,input.height,input.minimum,input.exclusions,input.mode,input.zones.map(z=>[z.id,z.bounds,z.rawWidth??side,z.rawHeight??side]),...(input.scientificScope?[input.scientificScope.identity,input.scientificScope.policy]:[])]);
    if(pending&&(pending.source!==image.surface||pending.identity!==identity||!hooks.checkpointKey||pending.raw.some((raw,i)=>raw!==input.zones[i]?.raw)))await clear();
    if(!spatial&&!input.zones.every(z=>z.rawWidth!==undefined)){const {default:factory}=await import('../vendor/segmentation/spatial-bands.js');spatial=await createNeuralSpatialRows(factory,{budget});}
    const holder=pending??{key:hooks.checkpointKey,source:image.surface,identity,raw:input.zones.map(z=>z.raw),state:null};
    let retirementOwner;
    try{
     const result=await segmentedNeuralProjection({...input,family,side,kind},{budget,spatial,postprocess,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,...hooks,checkpoint:holder.state,onCheckpoint:hooks.checkpointKey?state=>{holder.state=state;pending=holder;}:undefined,onRetirementOwner:owner=>{retirementOwner=owner;hooks.onRetirementOwner?.(owner);}});
     pending=null;
     const owner=retirementOwner??{dispose:()=>result.dispose()};
     const release=async()=>{
      try{await owner.dispose();failedConstructions.delete(owner);}
      catch(error){failedConstructions.add(owner);throw error;}
     };
     // Successful published outputs belong to their consumer. Only a refused
     // release returns ownership to the projector for a later cleanup retry.
     return {...result,dispose:release,release};
    }catch(error){if(pending?.state?.retiring)pending.raw=[];if(pending?.state?.disposed)pending=null;if(retirementOwner&&!retirementOwner.disposed&&pending?.state!==retirementOwner)failedConstructions.add(retirementOwner);throw error;}
   }finally{busy=false;}
  },
  async releaseCheckpoint(key){requireValue(!busy,'Neural projection busy');if(key===undefined||pending?.key===key)await clear();},
  dispose(){
   requireValue(!busy,'Neural projection busy');if(disposed)return Promise.resolve();if(closeTask)return closeTask;closing=true;
   const task=closeTask=Promise.resolve().then(async()=>{
    await retireCompositeOwners([clear,async()=>{await spatial?.dispose();spatial=null;}]);
    image=null;disposed=true;
   });
   task.then(()=>{},()=>{if(closeTask===task)closeTask=null;});return task;
  }
 };
}
