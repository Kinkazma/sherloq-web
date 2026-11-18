// Transfer-oriented wrapper: failed pixel ACKs remain owned by this lease and
// must retire before its presentation/program owner can close.
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
const cancelled=()=>Object.assign(new Error('Retained PDF raster lease released.'),{code:'CANCELLED'});
export function createRetainedPdfRasterSource(source){
 if(typeof source?.readPixels!=='function'||typeof source?.close!=='function')throw new TypeError('Leased native PDF raster source required.');
 const frames=new Set(),retiring=new Map(),reads=new Set();let closing=false,closed=false,closeTask;
 function retire(frame){if(!frames.has(frame))return Promise.resolve();if(retiring.has(frame))return retiring.get(frame);const task=Promise.resolve().then(()=>frame.release?.()).then(()=>{frames.delete(frame);retiring.delete(frame);},error=>{retiring.delete(frame);throw error;});retiring.set(frame,task);return task;}
 async function read(rect,options){if(closing)throw cancelled();let frame,published=false,failed=false,primary;try{frame=await source.readPixels(rect,options);frames.add(frame);if(closing)throw cancelled();published=true;return frame;}catch(error){failed=true;primary=error;throw error;}finally{if(!published&&frame)await retireCompositeOwners([()=>retire(frame)],failed?{primary}:{});}}
 return{owner:source.owner,width:source.width,height:source.height,get exportReadWorkspaceBytes(){return source.exportReadWorkspaceBytes??0;},
  readPixels(rect,options){const task=read(rect,options);reads.add(task);task.then(()=>reads.delete(task),()=>reads.delete(task));return task;},releasePixels:retire,
  get metrics(){return{closing,closed,frames:frames.size,pending:reads.size};},
  close(){if(closed)return Promise.resolve();if(closeTask)return closeTask;closing=true;closeTask=(async()=>{await Promise.allSettled([...reads]);await retireCompositeOwners([...frames].map(frame=>()=>retire(frame)));await source.close();closed=true;})();closeTask.then(()=>{},()=>{closeTask=null;});return closeTask;}
 };
}
