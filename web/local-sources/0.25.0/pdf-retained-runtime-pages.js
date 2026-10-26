import {pdfEffectReference} from './pdf-retained-effect-context.js?v=0.25.0';
import {createRetainedPdfEffectService} from './pdf-retained-effect-service.js?v=0.25.0';
import {pdfRetainedDensity} from './pdf-retained-page.js?v=0.25.0';
// Native page owners kept independently from the source-image analysis runtime.
import {createRetainedPdfPresentation} from './pdf-retained-presentation.js?v=0.25.0';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
const cancelled=()=>Object.assign(new Error('Retained PDF runtime pages released.'),{code:'CANCELLED'});
export function createRetainedPdfRuntimePages({budget,changed=()=>{},onError=()=>{},presentationFactory=createRetainedPdfPresentation,effectServiceFactory=createRetainedPdfEffectService}={}){
 if(typeof budget?.reserve!=='function')throw new TypeError('PDF runtime pages require a Budget.');
 const entries=new Map(),leases=new Set(),tasks=new Set();let closing=false,closed=false,closeTask;
 function trackLease(lease){leases.add(lease);const close=lease.close;let task;lease.close=()=>{if(task)return task;task=Promise.resolve().then(()=>close()).then(()=>{leases.delete(lease);},error=>{task=null;throw error;});task.catch(()=>{});return task;};return lease;}
 function retire(entry){return(async()=>{if(entry.exportRaster)await entry.exportRaster.close();if(entry.effects)await entry.effects.close();else if(entry.effectSource){await entry.effectSource.close();entry.effectSource=null;}if(entry.presentation)await entry.presentation.close();else await entry.program?.close();entries.delete(entry.page);})();}
 async function acquire(page){if(closing)throw cancelled();if(!page?.nativeDisplay||typeof page.nativeDisplay.borrowProgram!=='function')throw new TypeError('Captured native PDF page required.');let entry=entries.get(page);if(!entry){entry={page,program:null,presentation:null};entries.set(page,entry);let failed=false,primary;try{entry.program=page.nativeDisplay.borrowProgram();entry.presentation=presentationFactory(entry.program,{budget,changed,onError});}catch(error){failed=true;primary=error;throw error;}finally{if(failed)await retireCompositeOwners([()=>retire(entry)],{primary});}}if(closing)throw cancelled();return trackLease(entry.presentation.fork());}
 function referenceFor(entry){if(!entry.reference){const density=pdfRetainedDensity(entry.page.placements??[]);entry.reference=pdfEffectReference(Math.ceil(entry.page.width*density),Math.ceil(entry.page.height*density),density);}return entry.reference;}
 function effects(entry){if(!entry.effects){entry.effectSource??=entry.presentation.fork();entry.effects=effectServiceFactory(entry.program,entry.effectSource,referenceFor(entry),{budget,changed,onError});entry.effectSource=null;}return entry.effects;}
 return{acquire(page){const task=acquire(page);tasks.add(task);task.then(()=>tasks.delete(task),()=>tasks.delete(task));return task;},
  exportSize(page){const entry=entries.get(page);if(!entry)throw new TypeError('Select a retained native PDF page before its export.');const grid=referenceFor(entry);return{width:grid.width,height:grid.height};},
  effectsSurface(page,parameters){if(closing)throw cancelled();const entry=entries.get(page);if(!entry)throw new TypeError('Select a retained native PDF page before its effects.');return trackLease(effects(entry).surface(parameters));},
  rasterSource(surface){if(closing)throw cancelled();for(const entry of entries.values()){const value=entry.effects?.rasterSource(surface);if(value)return value;}const entry=[...entries.values()].find(value=>value.program?.owner===surface?.owner);return entry?effects(entry).rawRasterSource():null;},
  get metrics(){return{closing,closed,pages:entries.size,leases:leases.size,pending:tasks.size,entries:[...entries.values()].map(entry=>({...entry.presentation?.metrics??entry.program?.metrics??{},effects:entry.effects?.metrics??null}))};},
  close(){if(closed)return Promise.resolve();if(closeTask)return closeTask;closing=true;closeTask=(async()=>{await Promise.allSettled([...tasks]);await retireCompositeOwners([...leases].map(lease=>()=>lease.close()));await retireCompositeOwners([...entries.values()].map(entry=>()=>retire(entry)));closed=true;})();closeTask.then(()=>{},()=>{closeTask=null;});return closeTask;}
 };
}
