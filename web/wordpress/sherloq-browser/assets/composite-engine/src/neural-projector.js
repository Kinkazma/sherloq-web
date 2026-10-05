import "../../runtime-context.js?v=0.14.5";
import{EngineError}from'./errors.js';import{createNeuralSpatialRows}from'./neural-spatial-rows.js';import{segmentedNeuralProjection}from'./segmented-neural-projection.js';
export function createNeuralProjector({budget,contiguous,postprocess,family,side,kind}){
 let image,spatial;
 return{
  setImage(value){image=value;},
  async run(input,hooks){
   if(input.layout!=='segmented')return contiguous.run(input,hooks);
   if(!image?.segmented)throw new EngineError('INVALID_INPUT','Immutable segmented projection source required');
   if(!spatial){const{default:factory}=await import('../vendor/segmentation/spatial-bands.js');spatial=await createNeuralSpatialRows(factory,{budget});}
   const result=await segmentedNeuralProjection({...input,family,side,kind},{budget,spatial,postprocess,temporarySession:image.session,getTemporarySession:image.ensureTemporarySession,...hooks});return{...result,release:result.dispose};
  },
  dispose(){spatial?.dispose();spatial=null;image=null;}
 };
}
