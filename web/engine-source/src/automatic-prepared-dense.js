import {combineDenseWindowPresentation} from './dense-window-presentation.js';
import {createSparseCloneWindowEngine} from './sparse-clone-window-engine.js';
import {createDenseNativeWindowCallback} from './dense-native-windows.js';
import {requireValue,checkAbort} from './errors.js';
const shift=(polygons,origin)=>(polygons??[]).map(p=>p.map(([x,y])=>[x+origin[0],y+origin[1]]));

/** The existing automatic dense provider is instantiated once per canonical
 * window. Its native descriptors, passes, maps and geometry remain owned by
 * that window. The explicit global route uses one separate native provider. */
export function createAutomaticPreparedDense(image,budget,{geometry,profile,getContext,windowEngineFactory=createSparseCloneWindowEngine,nativeFactory}={}){
 requireValue(image?.surface?.descriptor&&typeof getContext==='function','Prepared automatic Dense requires its source and verified context getter.');
 const lifetime=new AbortController();let engine,closed=false,active=false,finished=Promise.resolve(),closing;
 const admitted=({task})=>task.params?.scientificScope?.status==='ready';
 return{
  clearCheckpoint:key=>engine?.clearCheckpoint?.(key),
  async analyze(params,hooks={}){
   requireValue(!closed&&!active,'Prepared automatic Dense is busy or disposed.');checkAbort(hooks.signal);active=true;let finish;finished=new Promise(resolve=>finish=resolve);
   const signal=hooks.signal?AbortSignal.any([hooks.signal,lifetime.signal]):lifetime.signal;
   try{
    const context=await getContext({...hooks,signal});checkAbort(signal);const d=image.surface.descriptor;
    requireValue(context?.width===d.width&&context.height===d.height&&context.sourceDomain?.sourceSha256===image.sha256&&context.origin[0]===(image.sourceRegionOrigin?.[0]??0)&&context.origin[1]===(image.sourceRegionOrigin?.[1]??0),'Prepared Dense context differs from its source grid.');
    const original=context.originalTask,scope=original?.params?.scientificScope??original?.scientificScope;
    requireValue(scope?.status==='ready','Original dense preparation is required; no whole-image fallback is permitted.');
    const cloneWindowMode=hooks.cloneWindowMode??original.cloneWindowMode??'independent';requireValue(['independent','global'].includes(cloneWindowMode),'Invalid automatic clone window mode.');
    const input={...params,regions:shift(params.regions,context.origin),excluded:shift(params.excluded,context.origin),guides:shift(params.guides,context.origin),scientificScope:scope};
    const task={...original,operation:'tampering.copyMove.sparse',cloneWindowMode,params:input,backend:hooks.backend??original.backend??'auto'};delete task.sourceRegionLocalization;delete task.scientificScope;
    engine??=windowEngineFactory(image,budget,profile,{callbackFactory:createDenseNativeWindowCallback,presentationFactory:combineDenseWindowPresentation,callbackOptions:{geometry,...(nativeFactory?{nativeFactory}:{})},admitIndependent:admitted,admitGlobal:admitted});
    return await engine.analyze(input,{...hooks,signal,scientificScope:undefined,sourceRegionTask:task});
   }finally{active=false;finish();}
  },
  dispose(){closed=true;lifetime.abort();if(closing)return closing;closing=(async()=>{await finished;await engine?.dispose();})();void closing.finally(()=>closing=null).catch(()=>{});return closing;}
 };
}
