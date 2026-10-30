import "../../runtime-context.js?v=0.30.0";
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from './source-region-geometry.js';
import {prepareNeuralStrictSourceContext} from './neural-strict-source-context.js';
import {createForgeryscopeBoundedSource} from './forgeryscope-bounded-source.js';

// Manual acquisitions need not already have a learned panel class. The same
// native bounded provider used by aggregate analysis classifies unknown RGB
// fragments, while preserving known classes and all real exclusion holes.
export async function createScopedForgeryscopeSource(image,params,{budget,signal}={}){
 const d=image.surface.descriptor,state=await createOriginalSourceRegionsState({sourceSha256:image.sha256,width:d.width,height:d.height}),domain=await compileOriginalSourceRegions(state.snapshot());
 let prepared;
 try{
  prepared=await prepareNeuralStrictSourceContext({domain,task:{operation:'m2.forgeryscope',params}},{budget,signal});
  const source={sha256:image.sha256,descriptor:d,readWindow:(rect,hooks)=>image.surface.readWindow(rect,hooks)};
  return await createForgeryscopeBoundedSource({...prepared,source,width:domain.width,height:domain.height,origin:[...domain.origin]},{budget,signal});
 }finally{await prepared?.release();}
}
