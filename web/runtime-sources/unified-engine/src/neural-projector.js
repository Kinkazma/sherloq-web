import {EngineError,requireValue} from './errors.js';
import {createNeuralSpatialRows} from './neural-spatial-rows.js';
import {segmentedNeuralProjection} from './segmented-neural-projection.js';
export function createNeuralProjector({budget,contiguous,postprocess,family,side,kind}){
 let image,spatial,pending,busy=false,disposed=false;
 async function clear(){const previous=pending;pending=null;await previous?.state?.dispose();}
 return {
  setImage(value){requireValue(!busy&&!disposed,'Neural projection unavailable');image=value;},
  async run(input,hooks={}){
   requireValue(!busy&&!disposed,'Neural projection unavailable');busy=true;
   try{
    if(input.layout!=='segmented'){await clear();return await contiguous.run(input,hooks);}
    if(!image?.segmented)throw new EngineError('INVALID_INPUT','Immutable segmented projection source required');
    const identity=JSON.stringify([hooks.checkpointKey,input.width,input.height,input.minimum,input.exclusions,input.mode,input.zones.map(z=>[z.id,z.bounds])]);
    if(pending&&(pending.source!==image.surface||pending.identity!==identity||!hooks.checkpointKey||pending.raw.some((raw,i)=>raw!==input.zones[i]?.raw)))await clear();
    if(!spatial){const {default:factory}=await import('../vendor/segmentation/spatial-bands.js');spatial=await createNeuralSpatialRows(factory,{budget});}
    const holder=pending??{key:hooks.checkpointKey,source:image.surface,identity,raw:input.zones.map(z=>z.raw),state:null};
    try{
     const result=await segmentedNeuralProjection({...input,family,side,kind},{budget,spatial,postprocess,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,...hooks,checkpoint:holder.state,onCheckpoint:hooks.checkpointKey?state=>{holder.state=state;pending=holder;}:undefined});
     pending=null;return {...result,release:result.dispose};
    }catch(error){if(pending?.state?.disposed)pending=null;throw error;}
   }finally{busy=false;}
  },
  async releaseCheckpoint(key){requireValue(!busy,'Neural projection busy');if(key===undefined||pending?.key===key)await clear();},
  async dispose(){requireValue(!busy,'Neural projection busy');disposed=true;await clear();spatial?.dispose();spatial=null;image=null;}
 };
}
