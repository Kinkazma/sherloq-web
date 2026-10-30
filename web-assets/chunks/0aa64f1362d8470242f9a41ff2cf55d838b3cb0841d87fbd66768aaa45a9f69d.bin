import "../../runtime-context.js?v=0.30.0";
import {hasSparseAnalysisWindows,sparseSourceAnalysisWindows} from './classical-sparse-window-registration.js';
import {createSparseCloneWindowEngine} from './sparse-clone-window-engine.js';
import {prepareCloneAnalysisWindows} from './clone-analysis-windows.js';
import {createSsgNativeWindowCallback} from './ssg-native-windows.js';
import {combineSsgWindowPresentation} from './ssg-window-presentation.js';
import {requireValue} from './errors.js';

export function createSsgNativeWindowRegistration(){
 const ssg=task=>task?.operation==='tampering.copyMove.sparse'&&task.params?.algorithm==='SSG',mode=task=>{const value=task.cloneWindowMode??'independent';requireValue(['independent','global'].includes(value),'Invalid SSG window mode.');return value;};
 return{
  key(task,image){return ssg(task)&&hasSparseAnalysisWindows(task,image)?'native-ssg-windows/1/'+mode(task):null;},
  completeOriginal(task,raw,image){if(!ssg(task)||hasSparseAnalysisWindows(task,image))return;requireValue(raw?.params?.algorithm==='SSG'&&raw.metadata?.algorithm==='SSG','Ordinary SSG completion needs its actual native result.');const value=mode(task);raw.cloneWindowMode=value;raw.metadata={...raw.metadata,cloneWindowMode:value,cloneAnalysisWindows:{mode:value,route:'ordinary-original-single-native-job',matchingAcrossWindows:false,nativeCompare:raw.params.compare===true,nativeParametersPreserved:true}};},
  create(image,budget,profile,task){
   requireValue(ssg(task)&&hasSparseAnalysisWindows(task,image),'SSG analysis windows must be declared.');
   const engine=createSparseCloneWindowEngine(image,budget,profile,{callbackFactory:createSsgNativeWindowCallback,presentationFactory:combineSsgWindowPresentation,admitIndependent:()=>true,admitGlobal:()=>true,prepareWindows(input,hooks){
    const t=input.task,p=t.params??{},explicit=Array.isArray(t.regions)&&(t.regions.length>0||p.selectionPresent===true)||p.scientificScope!=null||t.scientificScope!=null||p.selection!==undefined,windows=explicit?null:sparseSourceAnalysisWindows(input.domain.descriptor);
    return prepareCloneAnalysisWindows(windows?{...input,task:{...t,regions:windows}}:input,hooks);
   }});
   // A compiled native view borrows this exact Original, not merely a SHA label.
   // Crop aliases can change, but their underlying Original owner must not.
   const binding=value=>{const r=value.originalSource??value,d=r.surface?.descriptor??r.pixels;return{owner:r.pixels?.data??r.surface,sha:r.sha256,grid:[d.width,d.height,d.revision??0]};},original=binding(image),descriptor=Object.getOwnPropertyDescriptor(engine,'image');
   Object.defineProperty(engine,'image',{get:descriptor.get,set(value){if(value!==null){const next=binding(value);requireValue(next.owner===original.owner&&next.sha===original.sha&&JSON.stringify(next.grid)===JSON.stringify(original.grid),'Retained SSG windows require the same live Original owner and revision.');}descriptor.set(value);}});
   return engine;
  }
 };
}
