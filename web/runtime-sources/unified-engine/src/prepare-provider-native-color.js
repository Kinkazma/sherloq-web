import "../../runtime-context.js?v=0.33.2";
// One explicit source representation on the existing Original service. It
// neither changes the ordinary decoded view nor performs a colour conversion.
import {createDecodedSourceProvider} from './decoded-source-provider.js';
import {decodedSourceResourcePlan} from './decoded-source-resource-plan.js';
import {createBorrowedSourceSamples} from './borrowed-source-samples.js';
import {nativeMagickResource} from './native-magick-resources.js';
import {parseSourceFacts} from './magick-ping-facts.js';
import {inspectTiffSource} from './tiff-header-source.js';
import {inspectPngSource} from './png-header-source.js';
import {nativeTiffReadMemoryPlan} from './native-tiff-read-memory.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';
const ack=async action=>{const value=await action();if(value===false||value===0)throw value;return value;};
const list=value=>Array.isArray(value)?value:[value];
const same=(a,b)=>a&&b&&['imageId','sourceSurfaceId','sourceRevision','sourceSha256','kind'].every(key=>a[key]===b[key]);
const unsupported=message=>{throw new EngineError('NATIVE_COLOR_UNSUPPORTED',message);};

/** Bounded metadata only, from the captured Original byte source. The actual
 * useful SDK Read must confirm these facts before it may emit any samples. */
export async function inspectOriginalColorHeader({source,budget,signal,expectedWidth,expectedHeight,isCurrent}={}){
 requireValue(typeof source?.read==='function'&&Number.isSafeInteger(source.byteLength)&&budget?.reserve
  &&typeof isCurrent==='function','A captured, financed Original byte source is required.');
 const current=()=>{checkAbort(signal);if(isCurrent()!==true)throw new EngineError('SOURCE_CHANGED','The native colour Original changed.');};
 current();const signature=await source.read(0,Math.min(8,source.byteLength),{signal});let tiff,png;
 try{const b=signature.bytes;tiff=b[0]===73&&b[1]===73||b[0]===77&&b[1]===77;png=b.length===8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v);}finally{signature.release();}
 current();if(!tiff&&!png)unsupported('This native representation needs an existing faithful HP bank or qualified native16 header.');
 // Inspectors release their temporary account at return. Their returned
 // directories/chunks are still read below, so retain those exact credits
 // until this wrapper has reduced them to public scalar facts.
 const inspectedCredits=[];
 try{
 const {header,metrics}=await(tiff?inspectTiffSource:inspectPngSource)(source,{signal,account:bytes=>{
  const release=budget.reserve(bytes);inspectedCredits.push(release);return()=>{};
 }});current();
 requireValue(header.width===expectedWidth&&header.height===expectedHeight,'The native source header differs from Original geometry.');
 if(header.depth!==16)unsupported('The header route establishes unsigned16 only; source8 retains its existing reader.');
 let model,base,alpha=false,association='unknown',photo=null;
 if(tiff){
  const entries=header.directories?.[0]?.entries??[],value=(tag,fallback)=>entries.find(e=>e.tag===tag)?.value??fallback;
  const samples=header.samples??1,bits=list(header.bits??16),formats=list(value(339,1)),extra=entries.find(e=>e.tag===338);
  if(bits.length!==samples||bits.some(v=>v!==16)||formats.some(v=>v!==1))unsupported('The native16 header must establish uniform unsigned channel codes.');
  photo=header.photometric;model=photo===5?'CMYK':[0,1].includes(photo)?'GRAY':photo===2?'RGB':null;
  if(!model)unsupported('This header does not establish RGB, gray or CMYK colour channels.');
  base=model==='CMYK'?['C','M','Y','K']:model==='GRAY'?['Y']:['R','G','B'];
  if(model==='CMYK'&&(value(332,1)!==1||value(334,4)!==4))unsupported('The source does not establish the four standard CMYK inks.');
  if(extra){const values=list(extra.value);if(values.length!==1||![1,2].includes(values[0])||samples!==base.length+1)unsupported('The source extra-channel layout is not established.');alpha=true;association=values[0]===1?'premultiplied':'straight';}
  else if(samples!==base.length)unsupported('The native channel count differs from its colour model.');
 }else{
  model=[0,4].includes(header.colorType)?'GRAY':[2,6].includes(header.colorType)?'RGB':null;
  if(!model)unsupported('The native16 PNG header does not establish a direct colour model.');
  if(header.alpha===true&&![4,6].includes(header.colorType))unsupported('A tRNS-derived alpha channel has no established native16 coded-sample contract here.');
  base=model==='GRAY'?['Y']:['R','G','B'];alpha=header.alpha===true;association=alpha?'straight':'unknown';
 }
 const names=[...base,...(alpha?['A']:[])];
 const sourceSamples=parseSourceFacts(JSON.stringify({schema:'sherloq.coder-source-samples/1',precisionOrigin:'decoder-source-header',
  coder:tiff?'TIFF':'PNG',sourceModel:model,channels:names.map(name=>({name,role:name==='A'?'alpha':'color',codedType:'uint',codedBits:16,exponentBits:0})),
  alpha:{present:alpha,association},valueEncoding:{headerOrigin:tiff?'original-tiff-directories':'original-png-ihdr',
   photometric:photo,codedPolarity:photo===0?'zero-is-white':'decoder-colour-codes'}}));
 const decoderReadMemory=tiff?nativeTiffReadMemoryPlan(header,{encodedBytes:source.byteLength}):null;
 return{header:{format:header.format,decoderCoder:sourceSamples.coder,width:header.width,height:header.height,
   sourceWidth:header.sourceWidth,sourceHeight:header.sourceHeight,orientation:header.orientation??1,sourceSamples},
  sourceSamples,decoderReadMemory,metrics};
 }finally{for(const release of inspectedCredits)release();}
}

function borrowFaithful(source,context,isCurrent){
 const d=source?.descriptor;
 requireValue(d?.format==='native-samples'&&d.domain==='decoded'&&['uint16','float32'].includes(d.sampleType)
  &&d.sampleSemantics?.colorConversionApplied===false&&same(d.bindingOriginal,context.bindingOriginal)
  &&typeof source.readWindow==='function'&&typeof context.borrowSource==='function','A faithful Original-owned native sample surface is required.');
 context.borrowSource(source);
 let closing=false,closed=false,flight,fee;const held=new Set(),pending=new Set();
 const check=signal=>{checkAbort(context.signal);checkAbort(signal);if(closing||isCurrent()!==true)throw new EngineError('SOURCE_CHANGED','The faithful native source changed.');};
 const descriptor=Object.freeze({...d,sampleSemantics:Object.freeze({...d.sampleSemantics,representation:context.representation}),
  provenance:Object.freeze({...d.provenance,nativeColorAcquisition:'borrowed-existing-original-bank',representation:context.representation})});
 const owner={descriptor,
  readWindow(rect,hooks={}){
   const row={window:null,retired:false,flight:null};let task;
   row.retire=()=>{if(row.retired)return Promise.resolve();if(row.flight)return row.flight;
    const run=(async()=>{if(row.window)await ack(()=>row.window.release());row.window=null;row.retired=true;held.delete(row);})();
    row.flight=run;void run.finally(()=>{if(row.flight===run)row.flight=null;}).catch(()=>{});return run;};
   task=(async()=>{check(hooks.signal);held.add(row);try{
    const signal=AbortSignal.any([context.signal,...(hooks.signal?[hooks.signal]:[])]);
    row.window=await source.readWindow(rect,{signal});check(hooks.signal);
    const Type=d.sampleType==='uint16'?Uint16Array:Float32Array;
    requireValue(row.window.width===rect.width&&row.window.height===rect.height&&row.window.samples instanceof Type
     &&row.window.samples.length===rect.width*rect.height*d.channels&&typeof row.window.release==='function',
    'A faithful source window must retain the requested complete grid and sample type.');
    return{surfaceId:d.id,revision:d.revision,bindingOriginal:context.bindingOriginal,
     width:row.window.width,height:row.window.height,samples:row.window.samples,origin:row.window.origin,release:row.retire};
   }catch(primary){try{await row.retire();}catch(cleanup){throw withRetirementOwner(primary,owner,cleanup);}throw primary;}})();
   pending.add(task);void task.finally(()=>pending.delete(task)).catch(()=>{});return task;
  },
  dispose(){if(closed)return Promise.resolve();if(flight)return flight;closing=true;
   const task=(async()=>{await Promise.allSettled([...pending]);for(const row of [...held])await row.retire();fee?.();fee=null;closed=true;})();
   flight=task;void task.finally(()=>{if(flight===task)flight=null;}).catch(()=>{});return task;}
 };
 context.adoptSourceOwner(owner);fee=context.budget.reserve(4096);return owner;
}

export function createPrepareProviderNativeColor({record,execution,isCurrent,workerFactory,faithfulSurface,storageOptions={},
 decodedProviderFactory=createDecodedSourceProvider}={}){
 requireValue(record&&typeof isCurrent==='function'&&typeof workerFactory==='function','A captured Original and existing codec factory are required.');
 return async context=>{
  requireValue(context.domain==='decoded'&&context.frame===0&&context.representation?.kind==='original-color-channels',
   'Original colour channels require their explicit source representation.');
  checkAbort(context.signal);requireValue(isCurrent()===true&&execution?.budget===context.budget,'The native channel owner must use the same Original and Core budget.');
  if(faithfulSurface?.descriptor?.sampleSemantics?.colorConversionApplied===false){context.publishSource(borrowFaithful(faithfulSurface,context,isCurrent));return;}
  const native=record.nativeSurface,model=native?.descriptor?.color?.sourceModel??native?.descriptor?.color?.model;
  if(model==='RGB'&&record.sourcePrecision?.decoded?.role==='decoded'&&record.sourcePrecision?.decoded?.sampleType==='uint16'
   &&native.descriptor.color?.iccAppliedToNative!==true){
   const borrow=createBorrowedSourceSamples({surface:native,budget:context.budget,bindingOriginal:context.bindingOriginal,
    sourcePrecision:record.sourcePrecision,isCurrent,onOwner:context.adoptSourceOwner});
   context.publishSource({...borrow,descriptor:Object.freeze({...borrow.descriptor,
    sampleSemantics:Object.freeze({representation:context.representation,colorConversionApplied:false}),
    provenance:Object.freeze({nativeColorAcquisition:'borrowed-existing-rgb16-original',representation:context.representation})})});return;
  }
  if(record.sourcePrecision?.coded?.depth!==16||record.sourcePrecision?.coded?.sampleType!=='unsigned-integer')
   unsupported('This request needs a faithful HP source or a qualified unsigned16 header; no source8 promotion is implied.');
  const source=record.source,blob=source?.blob?.()??record.blob,integrity=source?.integrity?.();
  requireValue(source&&blob instanceof Blob&&integrity?.sha256===context.bindingOriginal.sourceSha256
   &&record.sha256===context.bindingOriginal.sourceSha256,'The original encoded owner and fixed identity must precede native preparation.');
  let metadataFee;const metadataOwner={dispose(){metadataFee?.();metadataFee=null;}};
  context.adoptAuxiliaryOwner(metadataOwner);
  metadataFee=context.budget.reserve(16384);
  const facts=await inspectOriginalColorHeader({source,budget:context.budget,signal:context.signal,
   expectedWidth:record.surface.descriptor.width,expectedHeight:record.surface.descriptor.height,isCurrent});
  checkAbort(context.signal);requireValue(isCurrent()===true&&source.integrity()===integrity,'The captured Original changed during native header preparation.');
  const provider=decodedProviderFactory({record,header:facts.header,sourceSamples:facts.sourceSamples,originalBlob:blob,
   sourceIntegrity:()=>source.integrity(),isCurrent,resourceForQuantum:nativeMagickResource,workerFactory,storageOptions,
   preflightOrigin:'native16-header',captureCpu:true,execution,
   resourcePlan:({selection})=>decodedSourceResourcePlan({budget:context.budget,blob,integrity,header:facts.header,
    selection,decoderReadMemory:facts.decoderReadMemory})});
  await provider(context);
 };
}
