import "../../runtime-context.js?v=0.31.0";
import {Budget} from './cache.js';
import {resolveComputeProfile} from './profiles.js';
import {createSplicebusterAnalyzer as createComputeAnalyzer} from './splicebuster/analyzer.mjs';
import {renderWindow as renderSplicebusterWindow} from './splicebuster/splicebuster-render.mjs';
import {createSplicebusterNpzStream} from './splicebuster/splicebuster-npz-stream.mjs';

/** Native-grid Splicebuster. The host owns source lifetime; all inner workers
 * use its Budget/scheduler. Scores are raw Mahalanobis-squared, not likelihoods
 * of forgery. Original GRIP-UNINA terms and credits are retained in splicebuster/. */
export function createSplicebusterAnalyzer({budget,computeProfile='aggressive',resourceHints,
 maxWorkers,sourceAccounted=false,...configuration}={}){
 const profile=resolveComputeProfile(computeProfile,resourceHints);
 budget??=new Budget(profile.memoryBudgetBytes);
 const compute=createComputeAnalyzer({...configuration,budget,maxWorkers:maxWorkers??profile.maxWorkers,sourceAccounted});
 return {
  async analyze(image,params={},options={}){
   const result=await compute.analyze(image,params,options);
   // The M2 display path reads bounded native windows for both RAM and banked
   // results. No full-frame RGB heatmap is materialized by the interface.
   result.data.segmented=true;
   return result;
  },
  render(result,view='map',options={}){
   return renderSplicebusterWindow(result,{x:0,y:0,width:result.data.width,height:result.data.height},{...options,view,budget});
  },
  renderWindow(image,result,view='map',rect,options={}){
   // Opaque maps do not need to reread the original for every display row.
   // Request that source only when the caller explicitly asks for an overlay.
   const sourceSurface=options.opacity!==undefined&&options.opacity<1?image.surface:undefined;
   return renderSplicebusterWindow(result,rect,{...options,view,budget,sourceSurface});
  },
  exportNpz(result,options={}){return createSplicebusterNpzStream(result,{...options,budget});},
  clearCache:()=>compute.clearCache(),dispose:()=>compute.dispose(),memory:()=>compute.memory()
 };
}
