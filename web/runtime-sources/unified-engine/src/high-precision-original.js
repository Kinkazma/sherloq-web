import "../../runtime-context.js?v=0.33.2";
import {decodedSourceResourcePlan as resourcePlan} from './decoded-source-resource-plan.js';
import {createDecodedSourceProvider} from './decoded-source-provider.js';
import {nativeMagickResource} from './native-magick-resources.js';
import {projectNativeSdr} from './project-native-sdr.js';
import {createBorrowedRgb16WorkingSurface} from './borrowed-rgb16-surface.js';
import {EngineError,checkAbort,requireValue} from './errors.js';
import {withRetirementOwner} from './owner-retirement-error.js';

const MiB=1024**2;

function projectionPlan({metadata,budget,colorBackend}){
 const model=metadata.sourceModel,floating=metadata.sampleType==='float32',units=metadata.valueEncoding?.units;
 const icc=metadata.color?.iccProfile,available=budget.limit-budget.total();
 const inputUnits=floating?({'relative-color-1':'relative','normalized-ink0..1':'normalized-ink','percent-ink0..100':'percent-ink'})[units]
  ??(!icc&&model!=='CMYK'?'nominal-float-0..1':null):'uint16-code-values';
 const colorHeapBytes=32*MiB;
 return{
  colorContract:{inputUnits,alphaPolicy:'omit-decoded-alpha',...(icc?{
   dynamicRange:floating?'icc-relative':'sdr',extendedPolicy:'lcms-defined',intent:1,blackPointCompensation:false,
   profile:{kind:'embedded',sha256:icc.sha256}
  }:{dynamicRange:'numeric-preview',codeViewPolicy:'nominal-interval-clipped',profile:{kind:'none'}})},
  admission:{maximumWindowBytes:8*MiB,colorHeapBytes,displayBytes:icc&&colorBackend!=='cpu'&&!floating&&model==='RGB'?
   Math.min(64*MiB,Math.max(0,Math.floor((available-colorHeapBytes)/4))):0,
   ioHeadroomBytes:4*MiB,backend:colorBackend??'auto',storage:'auto'}
 };
}

/** Consume the real Ping handoff. The caller has already installed this
 * transaction in its existing failed-import ledger and owns its retirement. */
export async function prepareHighPrecisionOriginal({owner,handoff,budget,sourceFile,colorBackend,signal,onProgress,loadLegacyDisplay}){
 const source=handoff.source,blob=source.blob(),header=handoff.header,decoderReadMemory=handoff.decoderReadMemory;
 requireValue(source===owner.record.source&&handoff.kind==='hp-source-handoff'&&handoff.selection?.kind==='high-precision','The captured Original handoff is required.');
 const stop=()=>owner.abort(signal.reason);signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();
 const started=performance.now();
 const run=async()=>{
  checkAbort(owner.signal);const bindingOriginal=await owner.fixIdentity(),integrity=source.integrity();
  requireValue(handoff.sha256===bindingOriginal.sourceSha256&&integrity?.sha256===handoff.sha256,'The retained Original manifest differs from its Ping handoff.');
  let metadata,profile;
  const getTemporarySession=owner.record.ensureTemporarySession;
  const provider=createDecodedSourceProvider({header,originalBlob:blob,sourceIntegrity:integrity,
   isCurrent:()=>owner.matchesFixed(bindingOriginal),resourceForQuantum:nativeMagickResource,workerFactory:url=>new Worker(url,{type:'module'}),
   resourcePlan:({selection})=>resourcePlan({budget,blob,integrity,header,selection,decoderReadMemory}),
   storageOptions:{storage:'auto',getTemporarySession},
   adoptDecodedMetadata(value){
    const accepted=owner.adoptDecodedMetadata(value),{colorProfileOwner,...facts}=value;
    metadata=Object.freeze({...facts,...accepted});profile=colorProfileOwner;return accepted;
   }});
  onProgress?.({phase:'decode',fraction:0});
  const pin=await owner.prepareSamples(provider);checkAbort(owner.signal);
  let projection=await projectNativeSdr({pin,decodedMetadata:metadata,budget,signal:owner.signal,getTemporarySession,
   onPreview:onProgress?preview=>onProgress({phase:'source-preview',preview}):undefined,
   adoptDependent:value=>owner.adoptDependent(value),readProfile:profile?.readProfile?.bind(profile),
   ...projectionPlan({metadata,budget,colorBackend})});
  if(projection.status!=='ready'){
   // An explicit colour limitation must not make an already supported
   // file impossible to open. Keep A and use the existing display-only
   // reader, with its own store owner, for this exceptional case.
   const limit=projection,d=pin.source.descriptor;
   let legacy,cleanup;
   const store={byteLength:d.width*d.height*3,get storage(){return legacy?.store.storage;},
    readInto(target,offset,hooks){return legacy.store.readInto(target,offset,hooks);},
    async dispose(){if(cleanup){const ack=await cleanup.dispose();if(ack===false||ack===0)throw ack;cleanup=null;}
     if(legacy){await legacy.retire();legacy=null;}}};
   owner.adoptDependent(store);
   try{legacy=await loadLegacyDisplay({signal:owner.signal});}
   catch(error){cleanup=error?.cleanupOwner;throw error;}
   requireValue(legacy?.store?.byteLength===store.byteLength&&legacy.sha256===bindingOriginal.sourceSha256
    &&legacy.width===d.width&&legacy.height===d.height,'The legacy display did not read the same Original and grid.');
   projection={store,width:d.width,height:d.height,projection:{status:'legacy-display',limitation:limit.code,
    sourceSamplesPreserved:true,physicalToneMapApplied:null}};
  }
  checkAbort(owner.signal);
  const surface=owner.createPresentation(projection.store,projection),descriptor=pin.source.descriptor;
  const nativeSurface=createBorrowedRgb16WorkingSurface({pin,decodedMetadata:metadata,budget,
   maximumWindowBytes:4*MiB,readProfile:profile?.readProfile?.bind(profile)});
  if(nativeSurface)owner.adoptDependent(nativeSurface);
  const provenance={decoder:'magick-native',format:header.format,sourceFormat:header.sourceFormat,layout:'paged-rgb',
   orientationApplied:true,orientation:descriptor.orientation,sourceSize:[descriptor.sourceWidth,descriptor.sourceHeight],originalBytesPreserved:true,
   sourceSamples:header.sourceSamples,sourceDepth:descriptor.sourceDepth,sourceSampleType:descriptor.sampleType,
   sourceColor:metadata.color,sourceColorSpace:metadata.sourceModel,cicp:metadata.color?.cicp,
   sourceAlpha:{present:metadata.channelMap.includes('A'),association:metadata.alphaAssociation,displayRepresentation:'omitted'},
   displayDepth:8,displayProjection:projection.projection};
  Object.assign(owner.record,{sourceFile,segmented:true,retainedBytes:0,store:projection.store,workingDepth:nativeSurface?16:8,
   metrics:{storage:projection.store.storage,temporaryBackend:owner.record.session?.backend??null,
    decodeMs:performance.now()-started,originalBlobBytes:blob.size,displayProjection:projection.projection}});
  onProgress?.({phase:'decode',fraction:1});checkAbort(owner.signal);
  return owner.adopt({surface,nativeSurface,provenance});
 };
 try{return await owner.trackOperation(run());}
 catch(error){
  // Provider children belong to B; projection children were adopted before
  // construction. Only this image's transaction may retire those children.
  if(error?.cleanupOwner)throw withRetirementOwner(error,owner,error.cleanupErrors?.at(-1)??error);
  throw error;
 }finally{signal?.removeEventListener('abort',stop);}
}
