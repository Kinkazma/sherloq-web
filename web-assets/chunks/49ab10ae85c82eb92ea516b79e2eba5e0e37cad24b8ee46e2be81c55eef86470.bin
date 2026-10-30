import "../../runtime-context.js?v=0.30.0";
import {efficientLoFtrComparisonTask} from './efficient-loftr-comparison-task.js';
import {createSsgNativeWindowRegistration} from './ssg-native-window-registration.js';
import {createClassicalSparseWindowRegistration,hasSparseAnalysisWindows,sparseSourceAnalysisWindows} from './classical-sparse-window-registration.js';
import {createSparseCloneWindowEngine} from './sparse-clone-window-engine.js';
import {prepareCloneAnalysisWindows} from './clone-analysis-windows.js';
import {createLearnedSparseWindowCallback,LEARNED_SPARSE_WINDOW_ALGORITHMS} from './learned-sparse-native-windows.js';
import {createSiftNativeWindowCallback} from './sift-native-windows.js';
import {createEfficientLoFtrNativeWindowCallback} from './efficient-loftr-native-windows.js';
import {createAlikedStrictPoolRuntime} from './aliked-strict-pool-runtime.js';
import {requireValue} from './errors.js';
import {acquisitionsCallback,nativeAutomaticPanels} from './automatic-unprepared-clones.js';
const PANELS='SIFT + G2NN + RANSAC + Panels + Text';
const methods=Object.freeze([...LEARNED_SPARSE_WINDOW_ALGORITHMS,'SIFT + LightGlue','EfficientLoFTR',PANELS]);
// A true Original exclusion is a real single-window context even without a
// selected acquisition. Ordinary whole-image Panels keeps native panel detection.
const panelsWindowIntent=(task,image)=>{if(hasSparseAnalysisWindows(task,image))return true;for(let d=task.sourceRegionDomain??image?.sourceRegionDomain;d;d=d.ceiling)if(d.snapshot?.enabled&&d.snapshot.zones.some(z=>z.enabled&&z.kind==='exclusion'))return true;return false;};
const hasWindows=(task,image)=>[PANELS,'XFeat','XFeat + LighterGlue'].includes(task.params?.algorithm)?panelsWindowIntent(task,image):hasSparseAnalysisWindows(task,image);

export function createLearnedSparseWindowRegistration(){
 const classical=createClassicalSparseWindowRegistration(),ssg=createSsgNativeWindowRegistration();
 const learned=task=>task.operation==='tampering.copyMove.sparse'&&methods.includes(task.params?.algorithm);
 const mode=task=>{task=efficientLoFtrComparisonTask(task);const value=task.cloneWindowMode??'independent';requireValue(['independent','global'].includes(value),'Invalid clone-window mode.');return value;};
 return{
  key(task,image){return ssg.key(task,image)??classical.key(task,image)??(learned(task)&&hasWindows(task,image)?'native-learned-windows/union-input1/'+mode(task)+'/'+task.params.algorithm+(task.params.algorithm==='EfficientLoFTR'&&task.efficientLoFtrComparison?'/roles32/'+task.efficientLoFtrComparison.fingerprint:''):null);},
  completeOriginal(task,raw,image){
   ssg.completeOriginal(task,raw,image);classical.completeOriginal(task,raw,image);if(!learned(task)||hasWindows(task,image))return;
   const nativeMethod=raw.metadata?.algorithm??raw.params?.algorithm,nativeNoPanels=task.params.algorithm===PANELS&&nativeMethod===undefined&&raw.status==='no-regions'&&Array.isArray(raw.regions)&&raw.regions.length===0&&raw.preprocessing?.automatic_panels===true&&Array.isArray(raw.preprocessing.panels)&&raw.preprocessing.panels.length===0&&raw.preprocessing.envelope===null;
   requireValue(nativeNoPanels||nativeMethod===task.params.algorithm,'Ordinary native result changed its requested method.');const value=mode(task);
   raw.cloneWindowMode=value;raw.metadata={...raw.metadata,cloneWindowMode:value,cloneAnalysisWindows:{mode:value,route:'ordinary-original-single-native-job',matchingAcrossWindows:false,nativeCompare:raw.params?.compare===true,nativeParametersPreserved:true}};
  },
  create(image,budget,profile,task){
   if(ssg.key(task,image)!==null)return ssg.create(image,budget,profile,task);
   if(classical.key(task,image)!==null)return classical.create(image,budget,profile,task);
   requireValue(learned(task)&&hasWindows(task,image),'Explicit native learned analysis windows required.');
   const callbackFactory=task.params.algorithm===PANELS?settings=>acquisitionsCallback(createSiftNativeWindowCallback,{...settings,nativeAcquisitionPreparation:true}):task.params.algorithm==='EfficientLoFTR'?createEfficientLoFtrNativeWindowCallback:task.params.algorithm==='SIFT + LightGlue'?createSiftNativeWindowCallback:createLearnedSparseWindowCallback;
   return createSparseCloneWindowEngine(image,budget,profile,{callbackFactory,admitIndependent:()=>true,admitGlobal:()=>true,
    callbackOptions:{...(task.params.algorithm===PANELS?{panelsFactory:nativeAutomaticPanels}:{}),strictAlikedRuntime:({backend,profile,signal,family,models,inputSide,detectionThreshold})=>createAlikedStrictPoolRuntime({provider:backend==='cpu'?'wasm':backend==='webgpu'||globalThis.navigator?.gpu?'webgpu':'wasm',profile,signal,models,inputSide,detectionThreshold,modelKind:family==='ALIKED rotation'?'aliked-n16rot':'aliked-n16'})},
    prepareWindows(input,hooks){const t=input.task,p=t.params??{},explicit=Array.isArray(t.regions)&&(t.regions.length>0||p.selectionPresent===true)||p.scientificScope!=null||t.scientificScope!=null||p.selection!==undefined,windows=explicit?null:sparseSourceAnalysisWindows(input.domain.descriptor);return prepareCloneAnalysisWindows(windows?{...input,task:{...t,regions:windows}}:input,hooks);}
   });
  }
 };
}
