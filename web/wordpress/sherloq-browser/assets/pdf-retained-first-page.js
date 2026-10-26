// Share the existing useful page paint with native command/resource capture.
// The reader owns the base reference; cache/presentation users borrow leases.
import {createRetainedPdfProgram} from './pdf-retained-display-program.js';
import {retainResult} from './unified-engine/src/retained-result.js';
import {retireCompositeOwners} from './unified-engine/src/composite-owner-release.js';
const cancelled=()=>Object.assign(new Error('Retained PDF page capture released.'),{code:'CANCELLED'});
const check=signal=>{if(signal?.aborted)throw signal.reason??cancelled();};
export function createRetainedPdfFirstPage(page,record,{budget,version,build,signal,maxPixels,programFactory=createRetainedPdfProgram}={}){
 record={id:String(record?.id),width:record?.width,height:record?.height};
 if(typeof budget?.reserve!=='function')throw new TypeError('PDF first useful paint requires a Budget.');
 let blob,viewport,ownerReleased=false,initialPaints=0;
 const program=programFactory(page,record,{budget,version,build,signal,maxPixels,async onInitialPaint(frame){check(frame.signal);const release=budget.reserve(frame.width*frame.height*4);try{const value=await frame.canvas.convertToBlob({type:'image/png'});check(frame.signal);if(!(value instanceof Blob)||!value.size)throw new Error('Initial native PDF page encoding failed.');if(!ownerReleased)blob=value;viewport={width:frame.viewport.width,height:frame.viewport.height,scale:frame.viewport.scale,rotation:frame.viewport.rotation??0,transform:[...frame.viewport.transform],viewBox:frame.viewport.viewBox?[...frame.viewport.viewBox]:undefined};initialPaints++;}finally{release();}}});
 const retained=retainResult({descriptor:Object.freeze({id:String(record.id),revision:1,width:record.width,height:record.height,format:'rgb8'}),dispose:()=>program.close()});
 const owner={
  async ready(){if(ownerReleased)throw cancelled();await program.ready();if(ownerReleased)throw cancelled();if(!blob)throw new Error('Initial PDF presentation was not published.');return{blob,width:record.width,height:record.height,viewport:structuredClone(viewport),nativeDisplay:owner};},
  borrowProgram(){if(ownerReleased)throw cancelled();const held=retained.lease(),controller=new AbortController(),operations=new Set(),frames=new Set(),retiring=new Map();let released=false,closeTask;
   const alive=signal=>{check(signal);if(released)throw cancelled();};
   function retireFrame(frame){if(!frames.has(frame))return Promise.resolve();if(retiring.has(frame))return retiring.get(frame);const task=Promise.resolve().then(()=>frame.release()).then(()=>{frames.delete(frame);retiring.delete(frame);},error=>{retiring.delete(frame);throw error;});retiring.set(frame,task);return task;}
   function start(work){const task=work();operations.add(task);task.then(()=>operations.delete(task),()=>operations.delete(task));return task;}
   const proxy={owner:program.owner,width:program.width,height:program.height,revision:program.revision,native:true,nativePdf:true,
    prepare:()=>!released&&program.prepare(),
    ready(){return start(async()=>{alive();await program.ready();alive();});},
    draw(context){alive();return program.draw(context);},
    samplePixels(request,{signal:readSignal}={}){return start(async()=>{const signal=readSignal?AbortSignal.any([readSignal,controller.signal]):controller.signal;alive(signal);let frame,failed=false,primary,published=false;try{frame=await program.samplePixels(request,{signal});frames.add(frame);alive(signal);frames.delete(frame);published=true;return frame;}catch(error){failed=true;primary=error;throw error;}finally{if(!published&&frame)await retireCompositeOwners([()=>retireFrame(frame)],failed?{primary}:{});}});},
    paintCanonical(reference,{signal:readSignal,...options}={}){return start(async()=>{const signal=readSignal?AbortSignal.any([readSignal,controller.signal]):controller.signal;alive(signal);const result=await program.paintCanonical(reference,{...options,signal});alive(signal);return result;});},
    get metrics(){return{...program.metrics,borrowReleased:released,borrowPending:operations.size,pendingBorrowFrames:frames.size};},
    close(){if(closeTask)return closeTask;released=true;controller.abort(cancelled());closeTask=(async()=>{await Promise.allSettled([...operations]);await retireCompositeOwners([...frames].map(frame=>()=>retireFrame(frame)));await held.dispose();})();closeTask.then(()=>{},()=>{closeTask=null;});return closeTask;}
   };return proxy;
  },
  get metrics(){return{initialPaints,initialBlobBytes:blob?.size??0,ownerReleased,program:program.metrics};},
  close(){ownerReleased=true;blob=null;return retained.dispose();}
 };return owner;
}
