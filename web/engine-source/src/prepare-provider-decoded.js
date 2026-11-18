// Decoded producer callback for the existing Original-owned source service.
import {createBorrowedSourceSamples} from './borrowed-source-samples.js';
import {createNativeSampleBank} from './native-sample-bank.js';
import {createOwnedNativeColorMetadata} from './native-color-metadata.js';
import {EngineError,requireValue,checkAbort} from './errors.js';
import {selectDecodedRepresentation} from './decoded-source-selection.js';
import {createExistingPingPreflight} from './native-magick-source-preflight.js';
const TYPES={uint8:Uint8Array,uint16:Uint16Array,float32:Float32Array};
const maps={I:['Y'],IA:['Y','A'],RGB:['R','G','B'],RGBA:['R','G','B','A'],CMYK:['C','M','Y','K'],CMYKA:['C','M','Y','K','A']};
const ack=async action=>{const value=await action();if(value===false||value===0)throw value;return value;};
const same=(a,b)=>a&&b&&['imageId','sourceSurfaceId','sourceRevision','sourceSha256','kind'].every(key=>a[key]===b[key]);

/** B owns codec funding and every source, metadata and transport lifetime. */
export function createPrepareProviderDecoded({record,header,sourceSamples=record?.provenance?.sourceSamples??header?.sourceSamples,
 isCurrent,simpleRgb8=false,createFaithfulBorrow,codecPlan,createCodecPeer,storageOptions={},
 originalBlob=record?.source?.blob?.()??record?.blob,adoptDecodedMetadata,preflightOrigin='existing-q8-ping'}={}){
 requireValue(typeof isCurrent==='function'&&(record?.surface||typeof adoptDecodedMetadata==='function'),
  'An existing Original or a validating pending Original owner is required.');
 requireValue(Object.keys(storageOptions).every(key=>['storage','chunkBytes','temporarySession','getTemporarySession'].includes(key)),
  'Storage options cannot replace source type/domain/grid/identity.');
 let selected;
 const provider=async context=>{
  requireValue(context.domain==='decoded'&&context.frame===0&&isCurrent()===true,'This provider owns one current decoded frame0.');
  checkAbort(context.signal);selected??=selectDecodedRepresentation({sourceSamples,canBorrowFaithful:typeof createFaithfulBorrow==='function',simpleRgb8});
  if(selected.kind.startsWith('borrowed-')){
   if(selected.kind==='borrowed-faithful'&&createFaithfulBorrow){
    let faithfulSource,partial,creating=false,finishCreation,closed=false,retirement;
    const created=new Promise(resolve=>finishCreation=resolve),owner={dispose(){
     if(closed)return Promise.resolve();if(retirement)return retirement;
     const task=(async()=>{if(creating)await created;if(faithfulSource)await ack(()=>faithfulSource.dispose());else if(partial)await ack(()=>partial.dispose());
      faithfulSource=null;partial=null;closed=true;})();retirement=task;task.catch(()=>{if(retirement===task)retirement=null;});return task;
    }};
    // Register before construction can acquire a funded borrow. Cancellation
    // during its await keeps this owner until construction and retirement ACK.
    context.adoptSourceOwner(owner);creating=true;
    try{faithfulSource=await createFaithfulBorrow(context);}catch(error){partial=error?.cleanupOwner;throw error;}finally{finishCreation();}
    checkAbort(context.signal);requireValue(isCurrent()===true,'Original changed during faithful borrowing.');
    requireValue(faithfulSource.descriptor?.identityStatus==='fixed'&&faithfulSource.descriptor.storage==='borrowed-original'
     &&same(faithfulSource.descriptor.bindingOriginal,context.bindingOriginal),
     'The faithful provider belongs to another Original.');
    // This is an existing borrowed adapter with its own leases, not the
    // Original store: its dispose must never destroy the underlying Original.
    context.publishSource(faithfulSource);return;
   }
   const existing=record?.nativeSurface&&record.sourcePrecision?.defaultWorkingDepth===16?record.nativeSurface:record?.surface;
   requireValue(existing?.readWindow,'An existing source view is required for borrowing.');
   const borrowed=createBorrowedSourceSamples({surface:existing,budget:context.budget,bindingOriginal:context.bindingOriginal,
    sourcePrecision:record?.sourcePrecision,isCurrent,onOwner:context.adoptSourceOwner});
   if(selected.kind==='borrowed-presentation'){
    const fee=context.budget.reserve(512),owner={dispose(){fee();}};
    try{context.adoptAuxiliaryOwner(owner);}catch(error){fee();throw error;}
    const d=borrowed.descriptor,descriptor=Object.freeze({...d,valueEncoding:Object.freeze({...d.valueEncoding,
     decodedProviderLimitation:selected.reason,preservationQualified:false})});
    context.publishSource({descriptor,readWindow:(...args)=>borrowed.readWindow(...args)});
   }else context.publishSource(borrowed);return;
  }
  requireValue(typeof codecPlan==='function'&&typeof createCodecPeer==='function','The existing codec phase/peer admission must be supplied.');
  const plan=await codecPlan({stage:'bootstrap',context,selection:selected,header,sourceSamples});checkAbort(context.signal);
  requireValue(Number.isSafeInteger(plan?.bytes)&&plan.bytes>0,'A funded bootstrap codec plan is required.');
  const phase=context.codecPhase({bytes:plan.bytes,label:'decoded-source-codec'});
  let bank,bankCleanup,actual,profile,profileExpected=0;
  const sourceOwner={async dispose(){if(bank)await ack(()=>bank.dispose());else if(bankCleanup)await ack(()=>bankCleanup.dispose());bank=null;bankCleanup=null;}};
  context.adoptSourceOwner(sourceOwner);
  const request=async(action,value)=>{
   checkAbort(context.signal);requireValue(isCurrent()===true,'Original changed during decoded preparation.');
   if(action==='decoded-admit'){
    const grant=await codecPlan({stage:'decode',context,selection:selected,header:value,sourceSamples});
    requireValue(Number.isSafeInteger(grant?.bytes)&&grant.bytes>=phase.state.capacity,'A monotone codec/cache/band admission is required.');
    phase.admitCapacity(grant.bytes);return grant.admission;
   }
   if(action==='decoded-grid-admit'){
    const grant=await codecPlan({stage:'read-grid',context,selection:selected,header:value,sourceSamples});
    requireValue(Number.isSafeInteger(grant?.bytes)&&grant.bytes>=phase.state.capacity,'The useful Read transport refinement is not funded.');
    phase.admitCapacity(grant.bytes);return grant.admission;
   }
   if(action==='decoded-profile-admit'){
    requireValue(!profileExpected&&!profile&&Number.isSafeInteger(value.bytes)&&value.bytes>0,'Private profile admission differs.');
    const grant=await codecPlan({stage:'profile-transfer',context,selection:selected,header:value,sourceSamples});
    requireValue(Number.isSafeInteger(grant?.bytes)&&grant.bytes>=phase.state.capacity,'Private profile transfer is not funded.');
    phase.admitCapacity(grant.bytes);profileExpected=value.bytes;return{admitted:true};
   }
   if(action==='decoded-profile'){
    requireValue(profileExpected&&value.bytes instanceof Uint8Array&&value.bytes.byteLength===profileExpected&&!profile,'Unexpected private profile payload.');
    profile=await createOwnedNativeColorMetadata({color:{...value.color,iccProfileBytes:value.bytes}},{budget:context.budget,signal:context.signal});
    try{context.adoptAuxiliaryOwner(profile);}catch(error){await profile.dispose();throw error;}return{admitted:true};
   }
   if(action==='decoded-header'){
    const Type=TYPES[value?.sampleType],map=maps[value?.layout];
    requireValue(!actual&&Type&&map&&map.length===value.channels&&['RGB','GRAY','CMYK'].includes(value.sourceModel)
     &&value.layout.startsWith(value.sourceModel==='GRAY'?'I':value.sourceModel)
     &&value.orientationApplied===false&&value.colorConversionApplied===false
     &&[value.width,value.height].every(n=>Number.isSafeInteger(n)&&n>0)
     &&Number.isInteger(value.orientation)&&value.orientation>=1&&value.orientation<=8
     &&same(value.bindingOriginal,context.bindingOriginal)&&value.valueEncoding&&typeof value.valueEncoding.units==='string',
    'Decoded sample type, grid, units or Original differs.');
    requireValue(selected.kind!=='high-precision'||value.sampleType===selected.sampleType,'The selected HP representation was not established by the useful Read.');
    requireValue(selected.kind!=='q8-native-channels'||value.sampleType==='uint8','A source8 channel producer changed its sample representation.');
    const grid=record?.surface?.descriptor,sourceGrid=Object.freeze({width:value.width,height:value.height,orientation:value.orientation}),
     canonicalGrid=Object.freeze({width:value.orientation>=5?value.height:value.width,height:value.orientation>=5?value.width:value.height});
    if(grid)requireValue(canonicalGrid.width===grid.width&&canonicalGrid.height===grid.height,'The native Read oriented grid differs from the bound canonical Original.');
    requireValue(!profileExpected||profile,'The admitted private profile must precede source publication.');
    if(adoptDecodedMetadata){
     // The ICC owner is borrowed from B, never transferred or disposed here by
     // the consumer. Its readProfile allocates a separately funded read lease.
     const accepted=await ack(()=>adoptDecodedMetadata({bindingOriginal:context.bindingOriginal,sourceGrid,canonicalGrid,
      sampleType:value.sampleType,channels:value.channels,channelMap:Object.freeze([...map]),sourceModel:value.sourceModel,
      valueEncoding:Object.freeze({...value.valueEncoding}),alphaAssociation:value.alphaAssociation??'unknown',
      color:profile?.color??value.publicColor??null,colorProfileOwner:profile??null}));
     if(!grid)requireValue(same(accepted?.bindingOriginal,context.bindingOriginal)
      &&['width','height','orientation'].every(key=>accepted.sourceGrid?.[key]===sourceGrid[key])
      &&['width','height'].every(key=>accepted.canonicalGrid?.[key]===canonicalGrid[key]),
     'The pending Original did not acknowledge its reserved identity and actual Read grid.');
     checkAbort(context.signal);requireValue(isCurrent()===true,'Original changed during decoded metadata adoption.');
    }
    await codecPlan({stage:'source-bank',context,selection:selected,header:value,sourceSamples});
    const data={codedChannels:sourceSamples.channels,codedAlpha:sourceSamples.alpha,valueEncoding:value.valueEncoding};
    const fee=context.budget.reserve(4096+2*new TextEncoder().encode(JSON.stringify(data)).length);
    const metadataOwner={dispose(){fee();}};try{context.adoptAuxiliaryOwner(metadataOwner);}catch(error){fee();throw error;}
    actual=value;
    try{bank=await createNativeSampleBank({width:value.width,height:value.height,orientation:value.orientation,
     sampleType:value.sampleType,channels:value.channels,channelMap:map,sourceDepth:value.sourceDepth??null,
     domain:'decoded',sampleModel:'decoded-'+value.sourceModel.toLowerCase()+'-samples',bindingOriginal:context.bindingOriginal,
     sampleSemantics:{codedChannels:sourceSamples.channels,codedAlpha:sourceSamples.alpha,decodedChannelMap:map,
      ...(sourceSamples.sourceModel==='indexed'?{paletteExpansionApplied:true,codedIndicesMaterialized:false}:{}),decodedAlphaAssociation:value.alphaAssociation??'unknown',
      colorConversionApplied:false,developmentApplied:false,encodedIdentityPreservedSeparately:true,
      ...(context.representation?{representation:context.representation}:{}),
      ...(preflightOrigin==='native16-header'?{codedPhotometric:sourceSamples.valueEncoding?.photometric??null,
       codedPolarity:sourceSamples.valueEncoding?.codedPolarity??'not-specified',
       decodedPolarity:'decoder-semantic-channel-values',storedBitPatternClaimed:false}:{})},
     valueEncoding:value.valueEncoding,color:profile?.color??value.publicColor??null,
     provenance:{decoder:value.decoder,precisionOrigin:'decoder source header',selectedFrame:0,sourceFacts:sourceSamples,
      additionalNativeProbe:value.additionalNativeProbe??null,gridOwner:value.gridOwner??'decoder-read-before-orientation',
      ...(value.admissionGrid?{admissionGrid:value.admissionGrid}:{})},budget:context.budget,signal:context.signal,...storageOptions});}
    catch(error){bankCleanup=error?.cleanupOwner;throw error;}
    return{admitted:true};
   }
   if(action==='decoded-band'){
    requireValue(bank&&actual,'A source header must precede its bands.');
    const Type=TYPES[actual.sampleType];requireValue(value.samples instanceof Type&&value.width===actual.width
     &&value.layout===actual.layout,'Decoded band representation changed.');
    await bank.writeBand(value,{signal:context.signal});return{stored:true};
   }
   throw new EngineError('INVALID_INPUT','Unknown decoded producer action.');
  };
  const peer=createCodecPeer({selection:selected,phase,context,signal:context.signal,handleRequest:request});phase.adopt(peer);
  const preflight=selected.kind==='high-precision'?createExistingPingPreflight({header,sourceSamples,bindingOriginal:context.bindingOriginal,origin:preflightOrigin}):null;
  requireValue(originalBlob instanceof Blob,'The captured Original encoded owner is unavailable.');
  await peer.start({blob:originalBlob,sourceSha256:context.bindingOriginal.sourceSha256,bindingOriginal:context.bindingOriginal,
   sourceSamples,selection:selected,preflight,admission:plan.admission,frame:0});
  checkAbort(context.signal);requireValue(isCurrent()===true&&bank,'Decoded preparation did not complete on the captured Original.');
  const surface=await bank.seal({signal:context.signal});context.publishSource(surface);
  // B retires the codec phase (native close, then termination) before exposing
  // the first receipt; this callback must not create a second close protocol.
 };
 return provider;
}
