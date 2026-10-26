// Standard raster exports read one complete native page paint. Painting every
// export band independently changes native antialiasing at some boundaries.
import {createCanonicalPdfComposite} from './pdf-canonical-composite.js?v=0.25.0';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
import {retainResult} from './unified-engine/src/retained-result.js';
const cancelled=()=>Object.assign(new Error('Retained PDF export raster released.'),{code:'CANCELLED'});
export function createRetainedPdfExportRaster(program,{budget,release=()=>program.close(),reference={density:1,width:program.width,height:program.height},compositeFactory=createCanonicalPdfComposite}={}){
 const {width,height,density}=reference;if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isFinite(density)||density<=0||width!==Math.ceil(program.width*density)||height!==Math.ceil(program.height*density))throw new RangeError('Invalid intrinsic PDF export reference.');let composite=null;const canonical=()=>composite??=compositeFactory(program,reference,{budget,maxPixels:width*height,maxDimension:Math.max(width,height)}),retained=retainResult({descriptor:{id:program.owner,width,height,format:'rgb8'},async dispose(){await composite?.close();await release();}});let baseReleased=false;
 function lease(retire){const frames=new Set(),retiring=new Map(),reads=new Set();let closed=false,closing;
  function retireFrame(frame){if(!frames.has(frame))return Promise.resolve();if(retiring.has(frame))return retiring.get(frame);const task=Promise.resolve().then(()=>frame.release()).then(()=>{frames.delete(frame);retiring.delete(frame);},error=>{retiring.delete(frame);throw error;});retiring.set(frame,task);return task;}
  async function read(rect,options){if(closed)throw cancelled();let frame,published=false,failed=false,primary;try{frame=await canonical().readWindow(rect,options);frames.add(frame);if(closed)throw cancelled();frames.delete(frame);published=true;return{...frame.pixels,release:()=>frame.release()};}catch(error){failed=true;primary=error;throw error;}finally{if(!published&&frame)await retireCompositeOwners([()=>retireFrame(frame)],failed?{primary}:{});}}
  return{owner:program.owner,width,height,get exportReadWorkspaceBytes(){return(composite?.metrics.ready?0:width*height*7+262144*7)+width*32*3*2;},readPixels(rect,options){const task=read(rect,options);reads.add(task);task.then(()=>reads.delete(task),()=>reads.delete(task));return task;},get metrics(){return composite?.metrics??{reference,ready:false,lazy:true};},close(){closed=true;if(closing)return closing;closing=(async()=>{await Promise.allSettled([...reads]);await retireCompositeOwners([...frames].map(frame=>()=>retireFrame(frame)));await retire();})();closing.then(()=>{},()=>{closing=null;});return closing;}};
 }

 return{owner:program.owner,width,height,get metrics(){return composite?.metrics??{reference,ready:false,lazy:true};},fork(){if(baseReleased)throw cancelled();const held=retained.lease();return lease(()=>held.dispose());},close(){baseReleased=true;return retained.dispose();}};
}
