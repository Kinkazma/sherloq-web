import {EngineError,requireValue,checkAbort} from './unified-engine/src/errors.js';
import {withRetirementOwner} from './unified-engine/src/owner-retirement-error.js';
import {registerNativePreviewBacking} from './native-preview-frame-contract.js?v=0.33.3';

const CONTROL_BYTES=320*1024;
const CONTROL_RETAINED_BYTES=64*1024;
const CANVAS_BOOTSTRAP_BYTES=300*150*4;
const FRAME_METADATA_BYTES=1024;
const VIEW_METADATA_BYTES=256;
const ack=async action=>{const value=await action();if(value===0||value===false)throw value;return value;};
const integer=n=>Number.isSafeInteger(n)&&n>0;

function identity(value){
 requireValue(value&&['imageId','surfaceId'].every(k=>typeof value[k]==='string'&&value[k].length>0&&value[k].length<=256)
  &&integer(value.revision)&&/^[a-f0-9]{64}$/.test(value.sourceSha256??''),'A fixed native source binding is required.');
 return Object.freeze({imageId:value.imageId,surfaceId:value.surfaceId,revision:value.revision,sourceSha256:value.sourceSha256});
}

// The default factory adopts the canvas before its first size/context change.
// Resetting both dimensions first avoids a wide-frame × default150 temporary.
function browserCanvas({width,height,document,onCanvas}){
 requireValue(document?.createElement,'A canvas document is required.');
 const canvas=document.createElement('canvas');onCanvas(canvas);
 canvas.width=0;canvas.height=0;canvas.width=width;canvas.height=height;
 const context=canvas.getContext('2d');requireValue(context,'The preview canvas has no2D context.');
 return {canvas,put:image=>context.putImageData(image,0,0),close(){canvas.width=0;canvas.height=0;}};
}

/** Private component proposal. One reusable parent admission owns incoming
 * RGB, reusable RGBA and each distinct canvas. Local frame ACKs do not refund
 * that parent grant. Dropped JS references are not a claim of physical GC.
 * finance callbacks MUST capture the peer that issued their leases. */
export async function createNativePreviewFrameOwner({binding,maximumPixels,finance,isCurrent,onOwner,
 makeCanvas=browserCanvas,makeImageData=(data,width,height)=>new ImageData(data,width,height)}={}){
 const bound=identity(binding);
 requireValue(integer(maximumPixels)&&Number.isSafeInteger(maximumPixels*19+CONTROL_BYTES)
  &&finance&&typeof finance.reserve==='function'&&typeof finance.release==='function'
  &&typeof isCurrent==='function'&&typeof onOwner==='function'
  &&typeof makeCanvas==='function'&&typeof makeImageData==='function','An admitted reusable native frame owner is required.');
 let current=isCurrent,funding=finance,canvasFactory=makeCanvas,imageFactory=makeImageData;
 let closing=false,closed=false,ready=false,initializing,disposal,growing,serial=0,capacity=0,used=0,controlBytes=0,retiringCapacity=0,capacityAttempt=null; 
 let rgba=null,rgbaBytes=0,renderTail=Promise.resolve();
 const grants=[],frames=new Map(),canvases=new Set(),operations=new Set();
 const counters={frames:0,rendered:0,dropped:0,canvasCreates:0,canvasReuses:0,rgbaAllocations:0,rgbOwnershipEnded:0};
 const account=bytes=>{requireValue(Number.isSafeInteger(bytes)&&bytes>=0&&used+bytes<=capacity-retiringCapacity,'Native presentation exceeds its admitted capacity.');used+=bytes;};
 const unaccount=bytes=>{requireValue(Number.isSafeInteger(bytes)&&bytes>=0&&bytes<=used,'Invalid native frame accounting.');used-=bytes;};
 function sourceCurrent(){if(current?.()!==true)throw new EngineError('SOURCE_CHANGED','Native preview source changed.');}
 function open(){if(closing||closed)throw new EngineError('DISPOSED','Native frame owner is retiring.');}
 function track(task){operations.add(task);void task.then(()=>operations.delete(task),()=>operations.delete(task));return task;}
 async function reserve(bytes){
  const lease=await funding.reserve({bytes,label:'native-preview-presentation'});
  // An object receipt is adopted before validation, so a malformed reply from
  // an adapter does not hide a reservation which may already exist remotely.
  const grant=lease&&typeof lease==='object'?{lease,bytes,counted:false}:null;
  if(grant)grants.push(grant);
  requireValue(lease&&typeof lease.id==='string'&&lease.id.length>0&&lease.bytes===bytes,'Invalid native presentation admission receipt.');
  grant.counted=true;capacity+=bytes;return lease;
 }
 async function room(bytes){
  for(;;){
   if(used+bytes<=capacity-retiringCapacity)return;
   if(growing){await growing;continue;}
   const flight=reserve(used+bytes-(capacity-retiringCapacity));growing=flight;
   try{await flight;}finally{if(growing===flight)growing=null;}
  }
 }
 async function claim(bytes){for(;;){await room(bytes);if(used+bytes<=capacity-retiringCapacity){account(bytes);return;}}}
 function releaseRgb(row){
  if(!row.rgbBytes)return;row.pixels=null;unaccount(row.rgbBytes);row.rgbBytes=0;counters.rgbOwnershipEnded++;
 }
 async function closeCanvas(slot){
  if(slot.closed)return;if(slot.closing)return slot.closing;
  const task=(async()=>{
   if(slot.failureOwner){await ack(()=>slot.failureOwner.dispose());slot.failureOwner=null;}
   if(slot.backing)await ack(()=>slot.backing.close());
   else if(slot.canvas){slot.canvas.width=0;slot.canvas.height=0;}
   slot.backing=null;slot.canvas=null;slot.closed=true;canvases.delete(slot);unaccount(slot.bytes);
  })();slot.closing=task;void task.finally(()=>{if(slot.closing===task)slot.closing=null;}).catch(()=>{});return task;
 }
 function availableSlot(width,height){return [...canvases].find(s=>!s.closed&&!s.failed&&!s.row&&!s.closing&&s.width===width&&s.height===height);}
 async function prepareCanvas(row,document){
  if(row.slot){if(!row.slot.failed)return row.slot;await closeCanvas(row.slot);row.slot=null;}
  const reused=availableSlot(row.width,row.height);
  if(reused){reused.row=row;row.slot=reused;counters.canvasReuses++;return reused;}
  // Keep the pool finite by retiring a free incompatible backing before growth.
  const old=[...canvases].find(s=>!s.row&&!s.closing);
  if(old)await closeCanvas(old);
  const bytes=row.width*row.height*4;await claim(bytes+CANVAS_BOOTSTRAP_BYTES);const slot={width:row.width,height:row.height,bytes:bytes+CANVAS_BOOTSTRAP_BYTES,row,canvas:null,backing:null,closed:false,failed:true};
  row.slot=slot;
  try{
   canvases.add(slot);
   checkAbort(row.signal);open();sourceCurrent();
   const backing=await canvasFactory({width:row.width,height:row.height,document,onCanvas:canvas=>{requireValue(!slot.canvas&&canvas,'Only one pre-adopted canvas is permitted per backing.');slot.canvas=canvas;}});
   requireValue(backing&&backing.canvas===slot.canvas&&typeof backing.put==='function'&&typeof backing.close==='function','A pre-adopted canvas backing is required.');
   slot.backing=backing;slot.failed=false;unaccount(CANVAS_BOOTSTRAP_BYTES);slot.bytes=bytes;counters.canvasCreates++;return slot;
  }catch(error){const child=error?.cleanupOwner;if(child&&child!==owner&&typeof child.dispose==='function')slot.failureOwner=child;throw error;}
 }
 async function staging(bytes){
  if(rgbaBytes>=bytes)return rgba.subarray(0,bytes);
  // During replacement both old and new backings exist. Admit the complete
  // new array before allocation, then end ownership of the old staging.
  await claim(bytes);
  try{const next=new Uint8ClampedArray(bytes),old=rgbaBytes;rgba=next;rgbaBytes=bytes;if(old)unaccount(old);counters.rgbaAllocations++;return rgba;}
  catch(error){unaccount(bytes);throw error;}
 }
 function forgetRow(row){
  // Canvas references and the received RGB DTO have independent local ACKs.
  // A free canvas may be reused, but its still-held DTO never frees capacity.
  if(row.retired||!row.dtoAcknowledged||row.slot||row.adopted&&(!row.presentationClosed||row.presentationRefs.size))return false;
  releaseRgb(row);row.retired=true;frames.delete(row.id);unaccount(FRAME_METADATA_BYTES);row.signal=null;row.primary=null;return true;
 }
 async function detachCanvas(row){if(!row.slot)return;if(row.slot.failed)await closeCanvas(row.slot);else row.slot.row=null;row.slot=null;}
 function retireRow(row){
  if(row.retired)return Promise.resolve();if(row.retiring)return row.retiring;
  row.closing=true;
  const task=(async()=>{
   await row.producing?.catch(()=>{});await row.rendering?.catch(()=>{});
   if(row.adopted&&(!row.presentationClosed||row.presentationRefs.size))throw new EngineError('BUSY','Native presentation references still own the canvas.');
   if(!row.dtoAcknowledged){
    // A reservation which never received pixels has no published RGB DTO.
    if(row.received)throw new EngineError('BUSY','The received native RGB DTO has not been acknowledged.');
    row.dtoAcknowledged=true;
   }
   releaseRgb(row);await detachCanvas(row);requireValue(forgetRow(row),'Native frame retirement is not acknowledged.');
  })();row.retiring=task;void task.finally(()=>{if(row.retiring===task)row.retiring=null;}).catch(()=>{});return task;
 }
 function frameHandle(row){
  const handle={
   get binding(){return bound;},
   get state(){return {retired:row.retired,closing:row.closing,adopted:row.adopted,presentationClosed:row.presentationClosed,dtoAcknowledged:row.dtoAcknowledged,rgbOwned:!!row.pixels};},
   adoptPixels(pixels){
    requireValue(!row.retired&&row.rgbBytes===row.width*row.height*3&&pixels?.format==='rgb8'&&pixels.width===row.width&&pixels.height===row.height
     &&pixels.data instanceof Uint8Array&&pixels.data.length===row.width*row.height*3
     &&pixels.data.byteLength===pixels.data.buffer.byteLength,'The transferred native RGB frame differs from its admitted grid.');
    if(row.received){requireValue(row.pixels.data.buffer===pixels.data.buffer,'A received frame cannot change its backing.');return handle;}
    // Adopt before checking late cancellation, leaving retirement reachable.
    row.received=true;row.pixels=pixels;return handle;
   },
   produce(callback){
    requireValue(!row.producing&&!row.produced&&!row.received&&!row.closing&&!row.retired&&typeof callback==='function','One captured producer is required.');
    row.produced=true;
    const task=Promise.resolve().then(async()=>{open();sourceCurrent();checkAbort(row.signal);
     const result=await callback();handle.adoptPixels(result?.pixels??result);
     // Even a late response is first adopted under the existing RGB credit.
     checkAbort(row.signal);sourceCurrent();if(row.closing||closing)throw new EngineError('CANCELLED','Native frame retired during production.');return result;
    });row.producing=task;track(task);void task.finally(()=>{if(row.producing===task)row.producing=null;}).catch(()=>{});return task;
   },
   render({document=globalThis.document}={}){
    if(row.rendering)return row.rendering;
    const run=async()=>{
     requireValue(!row.retired&&!row.closing&&!row.adopted&&row.pixels,'A live unpublished native frame is required.');
     checkAbort(row.signal);open();sourceCurrent();
     const slot=await prepareCanvas(row,document),target=await staging(row.width*row.height*4);
     checkAbort(row.signal);open();sourceCurrent();
     const source=row.pixels.data;for(let a=0,b=0;a<source.length;a+=3,b+=4){target[b]=source[a];target[b+1]=source[a+1];target[b+2]=source[a+2];target[b+3]=255;}
     const image=imageFactory(target,row.width,row.height);
     requireValue(image?.width===row.width&&image?.height===row.height&&image.data instanceof Uint8ClampedArray
      &&image.data.buffer===target.buffer&&image.data.byteOffset===target.byteOffset&&image.data.byteLength===target.byteLength,'ImageData must borrow the already admitted RGBA staging.');
     await ack(()=>slot.backing.put(image));
     checkAbort(row.signal);open();sourceCurrent();row.rendered=true;counters.rendered++;
     // The result/session still holds the RGB DTO until its local drop ACK.
     // Painting alone must not end that ownership while answer.pixels exists.
     return {canvas:slot.canvas,width:row.width,height:row.height};
    };
    const task=renderTail.then(run);renderTail=task.catch(()=>{});row.rendering=task;
    track(task);void task.finally(()=>{if(row.rendering===task)row.rendering=null;}).catch(()=>{});return task;
   },
   adoptPresentation(){
    open();sourceCurrent();checkAbort(row.signal);
    requireValue(!row.retired&&!row.closing&&row.rendered&&!row.adopted,'A rendered native frame can be adopted only once.');
    const presentationRefs=new Set();let closedRef=false,retiring;
    const backing=registerNativePreviewBacking(Object.freeze({
     width:row.width,height:row.height,
     get canvas(){if(closedRef)throw new EngineError('DISPOSED','Native presentation reference retired.');return row.slot.canvas;},
     isCurrent(){try{return !closedRef&&!closing&&!row.closing&&!row.retired&&current?.()===true;}catch{return false;}},
     referenceOpened(view){requireValue(!closedRef&&!closing&&!row.closing&&current?.()===true&&view&&typeof view.close==='function','A live native presentation reference is required.');
      if(used+VIEW_METADATA_BYTES>capacity-retiringCapacity)throw new EngineError('MEMORY_LIMIT','The synchronous view reference exceeds its prepaid presentation metadata.');
      account(VIEW_METADATA_BYTES);try{row.presentationRefs.add(view);}catch(error){unaccount(VIEW_METADATA_BYTES);throw error;}
     },
     referenceClosed(view){requireValue(row.presentationRefs.has(view),'Unknown native presentation reference.');row.presentationRefs.delete(view);unaccount(VIEW_METADATA_BYTES);forgetRow(row);},
     close(view){if(closedRef)return Promise.resolve();if(retiring)return retiring;
      requireValue(row.presentationRefs.size===0||row.presentationRefs.size===1&&row.presentationRefs.has(view),'Only the last presentation reference can retire its backing.');
      const task=(async()=>{await row.producing?.catch(()=>{});await row.rendering?.catch(()=>{});await detachCanvas(row);row.presentationClosed=true;closedRef=true;forgetRow(row);})();
      retiring=task;void task.finally(()=>{if(retiring===task)retiring=null;}).catch(()=>{});return task;}
    }));row.presentationRefs=presentationRefs;row.adopted=true;return backing;
   },
   // The session invokes this in finally even after presentation adoption. Its
   // ACK ends the DTO's RGB ownership; the canvas retains its separate credit.
   async drop(){await row.producing?.catch(()=>{});await row.rendering?.catch(()=>{});row.dtoAcknowledged=true;if(row.adopted){releaseRgb(row);forgetRow(row);return false;}counters.dropped++;return retireRow(row);},
   dispose(){return retireRow(row);}
  };return Object.freeze(handle);
 }
 const owner={
  get binding(){return bound;},
  async beginCapacityAttempt(){
   open();sourceCurrent();
   // A prior refused release must finish against the same peer before a new
   // producer can reuse its capacity. It cannot be bypassed by a later gesture.
   if(capacityAttempt){if(!capacityAttempt.rollingBack)throw new EngineError('BUSY','A native capacity attempt is already active.');await capacityAttempt.rollback();}
   open();sourceCurrent();const beforeMaximum=maximumPixels,prior=new Set(grants);let complete=false,flight;
   const attempt={rollingBack:false,
    commit(){if(complete)return;if(attempt.rollingBack)throw new EngineError('BUSY','Native capacity retirement is still pending.');complete=true;if(capacityAttempt===attempt)capacityAttempt=null;},
    rollback(){if(complete)return Promise.resolve();if(flight)return flight;attempt.rollingBack=true;
     const task=(async()=>{
      open();sourceCurrent();await growing?.catch(()=>{});
      for(const grant of [...grants].reverse())if(!prior.has(grant)){
       requireValue(grant.counted&&capacity-retiringCapacity-(grant.retiring?0:grant.bytes)>=used,'New native capacity is still owned by live pixels or views.');
       // Keep remote ownership until ACK, but exclude this pending prefix from
       // all new local allocations/forks while release is in flight.
       if(!grant.retiring){grant.retiring=true;retiringCapacity+=grant.bytes;}
       await ack(()=>funding.release(grant.lease));grants.splice(grants.indexOf(grant),1);capacity-=grant.bytes;retiringCapacity-=grant.bytes;grant.retiring=false;
      }
      open();sourceCurrent();requireValue(grants.every(grant=>prior.has(grant)),'New native capacity acquired during retirement is still owned.');
      maximumPixels=beforeMaximum;complete=true;if(capacityAttempt===attempt)capacityAttempt=null;
     })();flight=track(task);void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return flight;
    }
   };capacityAttempt=attempt;return Object.freeze({commit:attempt.commit,rollback:attempt.rollback});
  },
  admitMaximumPixels(next){
   const task=(async()=>{open();sourceCurrent();requireValue(integer(next)&&Number.isSafeInteger(next*19+CONTROL_BYTES),'An admitted presentation pixel bound is required.');
    if(next<=maximumPixels)return;await reserve((next-maximumPixels)*19);open();sourceCurrent();maximumPixels=next;
   })();return track(task);
  },
  begin({width,height,epoch,signal}={}){
   const task=(async()=>{
    open();requireValue(ready,'Native presentation admission is not ready.');sourceCurrent();checkAbort(signal);
    requireValue(integer(width)&&integer(height)&&width*height<=maximumPixels&&integer(epoch),'An admitted native frame grid and epoch are required.');
    await claim(width*height*3+FRAME_METADATA_BYTES);
    const row={id:++serial,width,height,epoch,signal,rgbBytes:width*height*3,pixels:null,slot:null,rendered:false,adopted:false,presentationClosed:false,dtoAcknowledged:false,closing:false,retired:false};
    try{frames.set(row.id,row);counters.frames++;const handle=frameHandle(row);open();sourceCurrent();checkAbort(signal);return handle;}
    catch(primary){try{if(frames.get(row.id)===row)await retireRow(row);else unaccount(row.rgbBytes+FRAME_METADATA_BYTES);}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;}
   })();return track(task);
  },
  async closePresentations(){
   // Source/tool/panel retirement revokes new forks first, then closes existing
   // views before its caller waits for the client/Original to be disposed.
   closing=true;ready=false;await Promise.allSettled([...operations]);
   for(const row of [...frames.values()])for(const view of [...(row.presentationRefs??[])])await ack(()=>view.close());
  },
  dispose(){
   if(closed)return Promise.resolve();if(disposal)return disposal;closing=true;ready=false;
   const task=(async()=>{
    await initializing?.catch(()=>{});await growing?.catch(()=>{});await Promise.allSettled([...operations]);
    let failed=false,primary;
    for(const row of [...frames.values()])try{await retireRow(row);}catch(error){if(!failed){failed=true;primary=error;}}
    // Live canvas references prevent the parent grant from being refunded.
    if(failed)throw primary;
    for(const slot of [...canvases])await closeCanvas(slot);
    if(rgba){rgba=null;unaccount(rgbaBytes);rgbaBytes=0;}
    if(controlBytes){unaccount(controlBytes);controlBytes=0;}
    for(const grant of [...grants]){await ack(()=>funding.release(grant.lease));grants.splice(grants.indexOf(grant),1);if(grant.counted)capacity-=grant.bytes;if(grant.retiring){retiringCapacity-=grant.bytes;grant.retiring=false;}}
    renderTail=Promise.resolve();current=funding=canvasFactory=imageFactory=null;closed=true;
   })();disposal=task;void task.finally(()=>{if(disposal===task)disposal=null;}).catch(()=>{});return task;
  },
  get state(){return {closing,closed,ready,maximumPixels,capacityBytes:capacity,retiringCapacityBytes:retiringCapacity,claimedBytes:used,controlBytes,grants:grants.length,liveFrames:frames.size,canvasBackings:canvases.size,
   cachedRgbaBytes:rgbaBytes,inFlight:operations.size,...counters,meaning:'Admitted/live ownership; no physical garbage-collection or browser-process exit claim.'};}
 };
 const adopted=onOwner(owner);
 requireValue(adopted!==false&&adopted!==0,'Native frame owner adoption was not acknowledged.');
 if(adopted&&typeof adopted.then==='function'){void Promise.resolve(adopted).catch(()=>{});throw new EngineError('INVALID_INPUT','Native frame adoption must register its owner synchronously.');}
 try{open();initializing=reserve(maximumPixels*19+CONTROL_BYTES);await initializing;account(CONTROL_RETAINED_BYTES);controlBytes=CONTROL_RETAINED_BYTES;open();sourceCurrent();ready=true;return owner;}
 catch(primary){try{await owner.dispose();}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;}
}
