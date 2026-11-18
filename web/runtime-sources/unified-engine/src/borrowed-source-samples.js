import "../../runtime-context.js?v=0.33.2";
// Exact typed windows over the RGB surface already owned by Original.
// This adapter retains metadata and window loans, never the underlying store.
import {EngineError,requireValue,checkAbort} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';
import {displayGeometry} from './display-sampling.js';

const ack=async action=>{const answer=await action();if(answer===false||answer===0)throw answer;return answer;};
const typeNames=new Set(['unsigned-integer','float16','float32','float64','unknown']);
const roles=new Set(['decoded','developed','color-converted','presentation']);
const bits=value=>Number.isSafeInteger(value)&&value>0&&value<=64?value:null;

export function createBorrowedSourceSamples({surface,budget,bindingOriginal,sourcePrecision,isCurrent,onOwner}={}){
 const d=surface?.descriptor;
 requireValue(d&&['rgb8','rgb16'].includes(d.format)&&typeof surface.readWindow==='function'
  &&[d.width,d.height,d.revision].every(v=>Number.isSafeInteger(v)&&v>0)
  &&Number.isSafeInteger(d.width*d.height*3)&&typeof d.id==='string'&&d.id.length>0&&d.id.length<=256
  &&budget?.reserve&&typeof isCurrent==='function'&&typeof onOwner==='function',
 'A live Original RGB surface and its parent ownership are required.');
 requireValue(bindingOriginal&&['imageId','sourceSurfaceId'].every(k=>typeof bindingOriginal[k]==='string'
  &&bindingOriginal[k].length>0&&bindingOriginal[k].length<=256)
  &&Number.isSafeInteger(bindingOriginal.sourceRevision)&&bindingOriginal.sourceRevision>0
  &&/^[a-f0-9]{64}$/.test(bindingOriginal.sourceSha256??'')&&['encoded','fixture'].includes(bindingOriginal.kind),
 'Borrowed samples require the established canonical Original binding.');
 const native=d.format==='rgb16',Type=native?Uint16Array:Uint8Array,containerBits=native?16:8;
 const coded=sourcePrecision?.coded,decoded=sourcePrecision?.decoded;
 requireValue(!sourcePrecision||sourcePrecision.schema==='sherloq.source-precision/1'
  &&(!native||decoded?.sampleType==='uint16'&&decoded.containerBits===16),
 'The selected Original view differs from its qualified sample representation.');
 const binding=Object.freeze(Object.fromEntries(['imageId','sourceSurfaceId','sourceRevision','sourceSha256','kind'].map(k=>[k,bindingOriginal[k]]))),pending=new Set(),windows=new Set();
 let funding,closed=false,closing=false,disposal;
 const owner={
  get descriptor(){requireValue(descriptor,'Borrowed source descriptor is not ready.');return descriptor;},
  get state(){return{closed,closing,pendingReads:pending.size,windows:windows.size,funded:!!funding};},
  readWindow(rect,hooks={}){
   let task;task=(async()=>{
    checkAbort(hooks.signal);requireValue(!closing&&!closed,'Borrowed source is closing.');checkCurrent();
    requireValue(rect&&['x','y','width','height'].every(k=>Number.isSafeInteger(rect[k]))
     &&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0
     &&rect.x<=d.width-rect.width&&rect.y<=d.height-rect.height,'Borrowed sample window is outside Original.');
    const selected=Object.freeze({x:rect.x,y:rect.y,width:rect.width,height:rect.height});
    const row={part:null,fee:budget.reserve(256),retiring:undefined,retired:false,unpublished:true};windows.add(row);
    row.retire=()=>{
     if(row.retired)return Promise.resolve();if(row.retiring)return row.retiring;
     const flight=(async()=>{if(row.part)await ack(()=>row.part.release());row.part=null;
      row.fee();row.fee=null;row.retired=true;windows.delete(row);})();
     row.retiring=flight;flight.then(()=>{row.retiring=undefined;},()=>{row.retiring=undefined;});return flight;
    };
    try{
     // This is the sole pixel allocation, funded by the existing surface.
     // No frame-sized clone, decoder, CMS or histogram is introduced here.
     row.part=await surface.readWindow(selected,{signal:hooks.signal,reserve:bytes=>budget.reserve(bytes)});
     checkAbort(hooks.signal);checkCurrent();requireValue(!closing&&!closed,'Borrowed source retired during its read.');
     const p=row.part?.pixels;
     requireValue(row.part?.surfaceId===d.id&&row.part.revision===d.revision
      &&row.part.origin?.[0]===selected.x&&row.part.origin?.[1]===selected.y
      &&p?.format===d.format&&p.width===selected.width&&p.height===selected.height
      &&p.data instanceof Type&&p.data.length===selected.width*selected.height*3
      &&typeof row.part.release==='function','Original returned a different view or window.');
     row.unpublished=false;return{surfaceId:descriptor.id,revision:descriptor.revision,bindingOriginal:binding,
      origin:[selected.x,selected.y],width:p.width,height:p.height,samples:p.data,release:row.retire};
    }catch(primary){try{await row.retire();}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;}
   })();pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;
  },
  readSampledWindow(tile,hooks={}){
   let task;task=(async()=>{
    checkAbort(hooks.signal);requireValue(!closing&&!closed,'Borrowed source is closing.');checkCurrent();
    const g=displayGeometry(d,tile),read=native?surface.readNativeSampledWindow:surface.readSampledWindow;
    requireValue(typeof read==='function','The captured Original has no native sampled reader.');
    const row={part:null,fee:budget.reserve(256),retiring:undefined,retired:false,unpublished:true};windows.add(row);
    row.retire=()=>{
     if(row.retired)return Promise.resolve();if(row.retiring)return row.retiring;
     const flight=(async()=>{if(row.part)await ack(()=>row.part.release());row.part=null;
      row.fee();row.fee=null;row.retired=true;windows.delete(row);})();
     row.retiring=flight;flight.then(()=>{row.retiring=undefined;},()=>{row.retiring=undefined;});return flight;
    };
    try{
     // The existing surface owns both the sampled output and its scanline
     // scratch. A native16 sample never goes through its SDR display reader.
     row.part=await read.call(surface,g,{signal:hooks.signal,reserve:bytes=>budget.reserve(bytes)});
     checkAbort(hooks.signal);checkCurrent();requireValue(!closing&&!closed,'Borrowed source retired during its read.');
     const p=row.part?.pixels;
     requireValue(surface.descriptor.id===d.id&&surface.descriptor.revision===d.revision
      &&p?.format===d.format&&p.width===g.width&&p.height===g.height
      &&p.data instanceof Type&&p.data.length===g.width*g.height*3
      &&typeof row.part.release==='function','Original returned a different sampled view.');
     row.unpublished=false;return{surfaceId:descriptor.id,revision:descriptor.revision,bindingOriginal:binding,
      origin:[g.x,g.y],width:p.width,height:p.height,samplingStep:g.step,
      logicalRect:Object.freeze({x:g.x,y:g.y,width:g.w,height:g.h}),samples:p.data,
      ...(row.part.metrics?{metrics:row.part.metrics}:{}),release:row.retire};
    }catch(primary){try{await row.retire();}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;}
   })();pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;
  },
  dispose(){
   if(closed)return Promise.resolve();if(disposal)return disposal;closing=true;
   const flight=(async()=>{await Promise.allSettled([...pending]);
    // Published leases belong to B and are retired by its ACK protocol. Only
    // unpublished failed reads may be retried here without a peer receipt.
    for(const row of [...windows])if(row.unpublished)await row.retire();
    requireValue(windows.size===0,'Borrowed source awaits outstanding window ACKs.');
    funding?.();funding=null;closed=true;})();disposal=flight;
   flight.then(()=>{disposal=undefined;},()=>{disposal=undefined;});return flight;
  },
 };
 function checkCurrent(){if(isCurrent()!==true)throw new EngineError('SOURCE_CHANGED','The captured Original RGB owner changed.');}
 let descriptor;
 // The retirement ledger must know this owner before its first admission.
 onOwner(owner);
 try{
  checkCurrent();funding=budget.reserve(4096);
  const role=native&&roles.has(decoded?.role)?decoded.role:'presentation',codedDepth=bits(coded?.depth);
  const sampleModel=role==='developed'?'developed-rgb-view':role==='color-converted'?'converted-rgb-view':
   role==='presentation'?'sdr-rgb-presentation':'decoded-rgb-view';
  descriptor=Object.freeze({schema:'sherloq.native-samples/1',format:'native-samples',id:crypto.randomUUID(),revision:1,
   width:d.width,height:d.height,channels:3,channelMap:Object.freeze(['R','G','B']),
   sampleType:native?'uint16':'uint8',containerBits,sourceDepth:codedDepth,domain:'decoded',selectedFrame:0,
   identityStatus:'fixed',bindingOriginal:binding,sampleModel,sampleRole:role,orientation:1,
   coordinates:'oriented-original-view',storage:'borrowed-original',
   valueEncoding:Object.freeze({kind:'code-values',range:Object.freeze([0,native?65535:255]),
    codedSampleType:typeNames.has(coded?.sampleType)?coded.sampleType:'unknown',codedDepth,
    decodedRole:role,containerBits,hdr:sourcePrecision?.hdr===true,gainMap:sourcePrecision?.gainMap===true,
    gainMapApplied:decoded?.gainMapApplied===true,originalViewSurfaceId:d.id,originalViewRevision:d.revision,
    originalStorageOrientation:d.orientation??1,orientationAlreadyApplied:true,
    preservedChannels:'RGB view only; alpha, CMYK inks and physical sensor are separate source domains'})});
  return owner;
 }catch(error){throw withRetirementOwner(error,owner,error);}
}
