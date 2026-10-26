// Adapter for createPdfReaderSession's existing renderPage dependency.
// It does not mount UI, alter an image source, or start a scientific model.
import {version,build} from './pdf-native-library.js';
import {IMPORT_LIMITS} from './batch-import.js';
import {createRetainedPdfFirstPage} from './pdf-retained-first-page.js';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
const cancelled=()=>Object.assign(new Error('Retained PDF reader renderer released.'),{code:'CANCELLED'});
const check=signal=>{if(signal?.aborted)throw signal.reason??cancelled();};
export function createRetainedPdfReaderRenderer({budget,pageFactory=createRetainedPdfFirstPage,maxWindowPixels=4*1024**2}={}){
 if(typeof budget?.reserve!=='function')throw new TypeError('Retained reader renderer requires a Budget.');
 const owners=new Set(),pending=new Set(),lifetime=new AbortController();let closed=false,closeTask;
 async function render(page,{signal:readSignal,scale=2,maxRenderPixels=IMPORT_LIMITS.pixels}={}){
  const signal=readSignal?AbortSignal.any([readSignal,lifetime.signal]):lifetime.signal;check(signal);if(closed)throw cancelled();
  if(scale!==2)throw Object.assign(new RangeError('Retained native PDF presentation requires the qualified baseScale2.'),{code:'PDF_NATIVE_SCALE_UNSUPPORTED'});
  const viewport=page.getViewport({scale}),width=Math.ceil(viewport.width),height=Math.ceil(viewport.height);
  if(!Number.isSafeInteger(width*height)||width<1||height<1||width*height>maxRenderPixels)throw Object.assign(new RangeError('PDF page exceeds its admitted full-resolution render size.'),{code:'PDF_RENDER_LIMIT'});
  const owner=pageFactory(page,{id:'pdf-native-page-'+crypto.randomUUID(),width,height},{budget,version,build,signal,maxPixels:maxWindowPixels});owners.add(owner);let published=false,failed=false,primary;
  try{const value=await owner.ready();check(signal);if(closed)throw cancelled();published=true;return value;}catch(error){failed=true;primary=error;throw error;}
  finally{if(!published)await retireCompositeOwners([async()=>{await owner.close();owners.delete(owner);}],failed?{primary}:{});}
 }
 return{
  renderPage(page,options){const task=render(page,options);pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;},
  get metrics(){return{closed,pending:pending.size,ownedPages:owners.size,pages:[...owners].map(owner=>owner.metrics)};},
  close(){if(closeTask)return closeTask;closed=true;lifetime.abort(cancelled());closeTask=(async()=>{await Promise.allSettled([...pending]);await retireCompositeOwners([...owners].map(owner=>async()=>{await owner.close();owners.delete(owner);}));})();closeTask.then(()=>{},()=>{closeTask=null;});return closeTask;}
 };
}
