import "../../runtime-context.js?v=0.33.2";
// One RAW interpolation pair in the existing Original SourceSamples owner.
import{EngineError,requireValue,checkAbort}from'./errors.js';
import{createNativeSampleBank}from'./native-sample-bank.js';
import{createOwnedNativeColorMetadata}from'./native-color-metadata.js';
import{createBorrowedSourceSamples}from'./borrowed-source-samples.js';
import{createRgbSurface}from'./rgb-surface.js';
import{createSourceSamplesCodecPeer}from'./source-samples-codec-peer.js';
import{createCapturedCodecCpuPhase}from'./captured-codec-cpu-phase.js';
import{retireCompositeOwners}from'./composite-owner-release.js';
const MiB=1024**2,HOST_LE=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
const ack=async fn=>{const n=await fn();if(n===false||n===0)throw n;return n;};
const PROCESSING=Object.freeze({workingColorSpace:'prophoto-d65-linear',cameraWhiteBalance:true});
export function createPrepareProviderRawDemosaic({record,execution,isCurrent,workerFactory,storageOptions={},beforeAdmission=async()=>{}}={}){
 requireValue(record&&execution?.budget&&typeof isCurrent==='function'&&typeof workerFactory==='function','Captured RAW Original and shared execution are required.');
 return async context=>{
  const recipe=context.representation,quality=recipe?.quality,blob=record.source?.blob?.()??record.blob;
  requireValue(context.domain==='decoded'&&context.frame===0&&recipe?.kind==='raw-demosaic-rgb'&&[0,3,4].includes(quality)
   &&blob instanceof Blob&&record.provenance?.rawSensorAvailableFromOriginal===true&&record.sha256===context.bindingOriginal.sourceSha256
   &&execution.budget===context.budget,'RAW development needs the same admitted Original and budget.');
  checkAbort(context.signal);requireValue(isCurrent()===true,'RAW Original changed.');
  const inspectHeap=Math.max(16*MiB,Math.ceil((blob.size+32*MiB)/(16*MiB))*16*MiB),initial=inspectHeap+blob.size+2*MiB+16384;
  await beforeAdmission(initial,quality);checkAbort(context.signal);
  const phase=context.codecPhase({bytes:initial,label:'histogram-raw-demosaic'});
  let header,geometry,profile,nativeBank,sdrBank,nativeSurface,sdrSurface,displaySurface,ownsDisplay=false,failureOwner;
  const borrowed=new Set();
  const owner={async dispose(){await retireCompositeOwners([()=>ownsDisplay?displaySurface?.dispose():undefined,
   ()=>nativeBank?.dispose(),()=>sdrBank?.dispose(),()=>failureOwner?.dispose(),...Array.from(borrowed,x=>()=>x.dispose())]);nativeBank=sdrBank=nativeSurface=sdrSurface=displaySurface=failureOwner=null;borrowed.clear();}};
  context.adoptSourceOwner(owner);
  const cpu=createCapturedCodecCpuPhase({execution,signal:context.signal,resourceOwner:phase.id,label:'raw-demosaic-codec'});
  const current=()=>{checkAbort(context.signal);if(isCurrent()!==true)throw new EngineError('SOURCE_CHANGED','RAW Original changed during interpolation.');};
  const sampleSemantics=view=>({developmentApplied:true,colorConversionApplied:view==='sdr8',qualityRequested:quality,
   qualityEffective:header.rawDevelopment.qualityEffective,methodEffective:header.rawDevelopment.methodEffective,
   cfa:header.rawDevelopment.cfa.kind,view,originalBanksUnchanged:true,representation:{schema:recipe.schema,kind:recipe.kind,quality,view}});
  const wrap=(surface,view)=>({...surface,descriptor:Object.freeze({...surface.descriptor,
   sampleModel:view==='rgb16'?'raw-developed-rgb':'raw-developed-sdr-rgb',sampleRole:view==='rgb16'?'developed':'presentation',
   sampleSemantics:Object.freeze(sampleSemantics(view)),color:view==='rgb16'?(surface.descriptor.color??record.nativeSurface?.descriptor.color??null):Object.freeze({model:'RGB',primaries:'srgb',transfer:'srgb'}),
   provenance:Object.freeze({decoder:'LibRaw-0.22.2-Release',qualityRequested:quality,qualityEffective:header.rawDevelopment.qualityEffective,
    methodEffective:header.rawDevelopment.methodEffective,rawDevelopment:header.rawDevelopment,developmentGeometry:geometry.developmentGeometry??geometry,
    acquisition:'same-captured-original',originalBanksUnchanged:true})})});
  const createBanks=async()=>{
   requireValue(header&&geometry&&profile&&!nativeBank&&!sdrBank,'Working profile and real Read geometry must precede bank construction.');
   const shape={width:geometry.width,height:geometry.height,orientation:1,channels:3,channelMap:['R','G','B'],domain:'decoded',
    sourceDepth:Number.isSafeInteger(header.codedDepth)&&header.codedDepth>0?header.codedDepth:null,bindingOriginal:context.bindingOriginal,budget:context.budget,signal:context.signal,...storageOptions};
   try{
    nativeBank=await createNativeSampleBank({...shape,sampleType:'uint16',sampleModel:'raw-developed-rgb',sampleSemantics:sampleSemantics('rgb16'),
     valueEncoding:{kind:'developed-linear-code-values',range:[0,65535],containerBits:16,codedDepth:header.codedDepth,units:'LibRaw linear working RGB16 codes'},color:profile.color,
     provenance:{decoder:'LibRaw-0.22.2-Release',developmentGeometry:geometry.developmentGeometry,originalBanksUnchanged:true}});
    sdrBank=await createNativeSampleBank({...shape,sampleType:'uint8',sampleModel:'raw-developed-sdr-rgb',sampleSemantics:sampleSemantics('sdr8'),
     valueEncoding:{kind:'color-managed-sdr-code-values',range:[0,255],containerBits:8,codedDepth:header.codedDepth,units:'sRGB display codes'},
     color:{model:'RGB',primaries:'srgb',transfer:'srgb'},provenance:{decoder:'LibRaw-0.22.2-Release + shared LCMS SDR projection',developmentGeometry:geometry.developmentGeometry,originalBanksUnchanged:true}});
   }catch(error){failureOwner=error?.cleanupOwner;throw error;}
  };
  const handle=async(action,value)=>cpu.suspend(async()=>{
   current();
   if(action==='decode-header'){
    requireValue(!header&&value?.format==='raw'&&value.nativeSampleType==='uint16'&&value.nativeSampleDepth===16&&value.rawDevelopment?.qualityEffective===quality
     &&value.rawDevelopment.cfa?.kind==='bayer-rgb'&&Number.isSafeInteger(value.codecMemoryBytes),'The RAW interpolation header differs from the captured recipe.');
    header=value;const width=value.width,band=width*Math.max(1,Math.min(32,Math.floor(MiB/(width*6))))*6;
    const capacity=value.codecMemoryBytes+blob.size+3*band+16384;await beforeAdmission(Math.max(0,capacity-phase.state.capacity),quality);current();phase.admitCapacity(Math.max(capacity,phase.state.capacity));return{nativeBytes:value.codecMemoryBytes};
   }
   if(action==='decode-residency'){
    const g=value?.rawGeometry;requireValue(header&&!geometry&&g?.owner==='libraw-developed-frame/1'&&g.width===record.surface.descriptor.width&&g.height===record.surface.descriptor.height&&JSON.stringify(g.developmentGeometry)===JSON.stringify(record.provenance.developmentGeometry),'Developed grid differs from the canonical Original.');geometry=g;return{nativeBytes:value.codecMemoryBytes};
   }
   if(action==='decoded-native-profile'){
    requireValue(geometry&&!profile&&value.bytes instanceof Uint8Array&&value.bytes.byteLength>=128&&value.bytes.byteLength<=1024
     &&value.rawDevelopment?.qualityEffective===quality&&value.color?.workingColorSpace===PROCESSING.workingColorSpace,'The developed working ICC differs.');
    profile=await createOwnedNativeColorMetadata({color:{...value.color,iccProfileBytes:value.bytes}},{budget:context.budget,signal:context.signal});
    try{context.adoptAuxiliaryOwner(profile);}catch(error){await ack(()=>profile.dispose());throw error;}await createBanks();return{admitted:true};
   }
   if(action==='decoded-native-band'||action==='decoded-band'){
    const native=action==='decoded-native-band',bank=native?nativeBank:sdrBank,sampleBytes=native?2:1;
    requireValue(bank&&value.bytes instanceof Uint8Array&&Number.isSafeInteger(value.rows)&&value.rows>0&&value.bytes.byteLength===geometry.width*value.rows*3*sampleBytes,'RAW output band differs from its admitted pair.');
    let bytes=value.bytes;if(native&&!HOST_LE){bytes=bytes.slice();for(let i=0;i<bytes.length;i+=2){const a=bytes[i];bytes[i]=bytes[i+1];bytes[i+1]=a;}}
    await bank.writeBand({y:value.y,width:geometry.width,rows:value.rows,samples:native?new Uint16Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/2):bytes},{signal:context.signal});return{stored:true};
   }
   throw new EngineError('INVALID_INPUT','Unknown RAW development preparation action.');
  });
  const peer=createSourceSamplesCodecPeer({workerURL:new URL('./raw-demosaic-codec-worker.js',import.meta.url),workerFactory,signal:cpu.codecSignal,handleRequest:handle});const codec=cpu.capture(peer);phase.adopt(codec);
  const p=record.provenance,canBorrow=quality===3&&p.decoder==='LibRaw-0.22.2-Release'&&p.demosaic===3&&p.cameraWhiteBalance===true&&p.workingColorSpace===PROCESSING.workingColorSpace
   &&record.nativeSurface?.descriptor.format==='rgb16'&&record.surface?.descriptor.format==='rgb8';
  const result=await codec.start({blob,sourceSha256:context.bindingOriginal.sourceSha256,processing:{...PROCESSING,demosaic:quality},inspectOnly:canBorrow});current();
  if(canBorrow){
   header=result.header;requireValue(header.rawDevelopment?.qualityEffective===3&&header.width===record.surface.descriptor.width&&header.height===record.surface.descriptor.height
    &&p.decoder==='LibRaw-'+header.rawInspection.decoder,'The borrowed AHD Original does not match its captured decoder/grid.');geometry=p.developmentGeometry;
   nativeSurface=wrap(createBorrowedSourceSamples({surface:record.nativeSurface,budget:context.budget,bindingOriginal:context.bindingOriginal,sourcePrecision:record.sourcePrecision,isCurrent,onOwner:x=>borrowed.add(x)}),'rgb16');
   Object.defineProperty(nativeSurface,'readColorProfile',{value:(hash,hooks)=>record.nativeSurface.readColorProfile(hash,hooks)});
   sdrSurface=wrap(createBorrowedSourceSamples({surface:record.surface,budget:context.budget,bindingOriginal:context.bindingOriginal,sourcePrecision:record.sourcePrecision,isCurrent,onOwner:x=>borrowed.add(x)}),'sdr8');displaySurface=record.surface;
  }else{
   requireValue(nativeBank&&sdrBank&&profile,'The RAW interpolation did not return its complete pair.');nativeSurface=wrap(await nativeBank.seal({signal:context.signal}),'rgb16');sdrSurface=wrap(await sdrBank.seal({signal:context.signal}),'sdr8');
   Object.defineProperty(nativeSurface,'readColorProfile',{value:(hash,hooks)=>profile.readProfile(hash,hooks)});
   displaySurface=createRgbSurface(sdrBank.store,{width:geometry.width,height:geometry.height,orientation:1,budget:context.budget,ownsStore:false});ownsDisplay=true;
  }
  context.publishSource({...nativeSurface,selectView:view=>view==='rgb16'?nativeSurface:view==='sdr8'?sdrSurface:null,getDisplaySurface:()=>displaySurface});
 };
}
