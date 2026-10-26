import "../../runtime-context.js?v=0.25.0";
import {STRICT_SPARSE_CLASSICAL_ALGORITHMS} from './sparse-strict-copy.js';
import {createSparseCloneWindowEngine} from './sparse-clone-window-engine.js';
import {prepareCloneAnalysisWindows} from './clone-analysis-windows.js';
import {requireValue} from './errors.js';

// params.regions contains scientific native ROIs (notably the two compare
// inputs). It cannot by itself turn an ordinary Original job into window jobs.
function sourceWindows(descriptor){
 for(let d=descriptor;d;d=d.ceiling){const s=d.snapshot;if(s?.enabled&&s.positiveMode==='selected')return s.zones.filter(z=>z.enabled&&z.kind==='acquisition').map(z=>({id:z.id,kind:z.role==='envelope'?'envelope':'region',polygon:z.polygon}));}
 return null;
}
function windowIntent(task,image){
 const p=task.params??{},scope=p.scientificScope??task.scientificScope;
 return Array.isArray(task.regions)&&(task.regions.length>0||p.selectionPresent===true)||scope!==undefined&&scope!==null||p.selection!==undefined||sourceWindows(task.sourceRegionDomain??image?.sourceRegionDomain)!==null;
}
/** Register only the six already native classical methods. Existing ordinary
 * Original jobs, SSG and every learned/OCR method keep their current routes.
 * The shared callback does each native extraction and matching; no new method
 * or scientific parameter transformation is introduced by this registration. */
export function createClassicalSparseWindowRegistration(){
 const eligible=(task,image)=>task?.operation==='tampering.copyMove.sparse'&&STRICT_SPARSE_CLASSICAL_ALGORITHMS.includes(task.params?.algorithm??'SIFT + G2NN + RANSAC')&&windowIntent(task,image);
 return{
  // Called synchronously only after the ordinary native analyze has returned.
  // One Original job keeps its native scientific ROI comparison intact; with
  // no declared analysis windows, the mode option does not split this job.
  completeOriginal(task,raw,image){
   if(task?.operation!=='tampering.copyMove.sparse'||!STRICT_SPARSE_CLASSICAL_ALGORITHMS.includes(raw?.params?.algorithm)||windowIntent(task,image))return;
   const mode=task.cloneWindowMode??'independent';requireValue(['independent','global'].includes(mode),'Invalid clone-window mode.');
   raw.cloneWindowMode=mode;raw.metadata={...raw.metadata,cloneWindowMode:mode,cloneAnalysisWindows:{mode,route:'ordinary-original-single-native-job',matchingAcrossWindows:false,nativeCompare:raw.params.compare===true,qualificationScope:'existing ordinary native method; no declared-window adaptation',nativeParametersPreserved:true}};
  },
  key(task,image){if(!eligible(task,image))return null;const mode=task.cloneWindowMode??'independent';requireValue(['independent','global'].includes(mode),'Invalid clone-window mode.');return 'native-classical-declared-windows73/'+mode;},
  create(image,budget,profile,task){
   requireValue(eligible(task,image),'Only declared-window native classical methods are registered.');
   return createSparseCloneWindowEngine(image,budget,profile,{admitIndependent:()=>true,admitGlobal:()=>true,prepareWindows:(input,hooks)=>{
    const t=input.task,p=t.params??{},explicit=Array.isArray(t.regions)&&(t.regions.length>0||p.selectionPresent===true)||p.scientificScope!=null||t.scientificScope!=null||p.selection!==undefined;
    // Source acquisitions are Original analysis windows. Preserve the two
    // compare ROIs in params and explicitly give the canonical planner its
    // actual acquisitions instead of its legacy params.regions fallback.
    const windows=explicit?null:sourceWindows(input.domain.descriptor);
    return prepareCloneAnalysisWindows(windows?{...input,task:{...t,regions:windows}}:input,hooks);
   }});
  }
 };
}

export {windowIntent as hasSparseAnalysisWindows,sourceWindows as sparseSourceAnalysisWindows};
