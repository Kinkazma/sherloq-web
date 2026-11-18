import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {adjustPerceptualCurveTables,ADJUST_PERCEPTUAL_CURVE_POLICY} from './adjust-perceptual-curve.js';
import {native16CompositeEqualizationPlan,native16EqualizationConsumed,markNative16EqualizationConsumed} from './native16-equalization-contract.js';
import {createNative16DisplayOwner} from './native16-display-owner.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';

// This is a working-code adapter, never a conversion of RGB primaries. The
// physical Original and its profile remain the authority for photo display.
export const NATIVE16_DOMAIN_POLICY='native16-working-domain/srgb-channel-curve/1';
export const NATIVE16_DOMAIN_TABLE_BYTES=2*65536*Uint16Array.BYTES_PER_ELEMENT;
export const NATIVE16_DOMAIN_VIEW_BYTES=4096;
const PREPARED=Symbol('prepared native16 working domain'),tablesByBudget=new WeakMap(),viewsBySource=new WeakMap(),observedByWorkingSurface=new WeakMap();
const DIAGNOSTICS=new Set(['detail.gradient','detail.echo','noise.minmax','noise.separation','colors.pca','colors.space','detail.frequency','detail.wavelets','noise.blocking','colors.plots','pixels.defects']);
const RAW_CODES=new Set(['inspection.histogram','colors.stats','noise.planes']);
const CIE=new Set(['xyz','lab','luv']);
const ack=async fn=>{const reply=await fn();if(reply===false||reply===0)throw new EngineError('BUSY','The native domain owner has not acknowledged retirement.');return reply;};
const linear=d=>d?.format==='rgb16'&&d.depth===16&&d.channels===3&&d.color?.model==='RGB'&&(d.color.transfer===8||String(d.color.transfer).toLowerCase()==='linear');

export function native16DomainCapability(operation){
 if(operation==='inspection.adjust')return{policy:NATIVE16_DOMAIN_POLICY,contract:'adjust-ordered-pair',reason:'Adjustment owns its complete ordered transfer pair and neutral bypass.'};
 if(operation==='inspection.sherloq7c')return{policy:NATIVE16_DOMAIN_POLICY,contract:'frozen-single-native16-engine',reason:'The fixed native16 graph contract is preserved.'};
 if(RAW_CODES.has(operation))return{policy:NATIVE16_DOMAIN_POLICY,contract:'observed-source-codes',reason:'Exact observed words remain the numerical input; no transfer curve rewrites their histogram, ranks or bits.'};
 return{policy:NATIVE16_DOMAIN_POLICY,contract:'perceptual-if-explicit-linear-rgb16',curveEligibility:'explicit-linear-RGB16-only',primariesConverted:false,physicalExceptions:['CIE-XYZ-Lab-Luv','gradient-linear709'],reason:'Declared linear RGB16 uses a shared per-channel sRGB working curve, preserving primaries; photographic results return before Original ICC display, diagnostics keep their defined output domain. Physical CIE/linear-luminance modes and other declared source transfers preserve their own contract.'};
}

export function native16DomainPlan(operation,params={},descriptor,options={}){
 const originalColor=descriptor?.color??null,base={policy:NATIVE16_DOMAIN_POLICY,curvePolicy:ADJUST_PERCEPTUAL_CURVE_POLICY,operation,sourceColor:originalColor,primariesConverted:false,observedCodesPreserved:false,apply:false,photo:false};
 if(operation==='inspection.adjust')return{...base,reason:'adjust-owns-its-ordered-domain-pair'};
 if(operation==='inspection.sherloq7c')return{...base,observedCodesPreserved:true,reason:'frozen-single-native16-engine'};
 if(RAW_CODES.has(operation))return{...base,observedCodesPreserved:true,reason:'exact-observed-code-contract'};
 if(operation==='colors.space'&&CIE.has(params.space??'rgb')||operation==='detail.gradient'&&params.luma==='linear709')return{...base,observedCodesPreserved:true,reason:'physical-profile-transfer-contract'};
 if(options.native16Domain==='source')return{...base,observedCodesPreserved:true,reason:'explicit-internal-source-domain'};
 const photo=operation==='inspection.magnifier'||operation==='noise.separation'&&params.denoised===true||operation==='pixels.defects'&&params.mode===2;
 if(!photo&&!DIAGNOSTICS.has(operation))return{...base,observedCodesPreserved:true,reason:'unported-scientific-contract'};
 if(operation==='inspection.magnifier'&&params.mode==='identity'&&!native16CompositeEqualizationPlan(operation,params))return{...base,photo:true,observedCodesPreserved:true,reason:'photographic-identity-bypasses-both-curves'};
 if(!linear(descriptor))return{...base,photo,observedCodesPreserved:true,reason:'source-is-not-declared-linear-rgb16'};
 return{...base,apply:true,photo,reason:photo?'perceptual-photo-return-before-original-display':'perceptual-code-diagnostic',workingTransfer:'srgb',outputTransfer:photo?originalColor.transfer:'diagnostic-defined',inverseOnDiagnostic:false};
}

function tableOwner(budget){
 let owner=tablesByBudget.get(budget);if(owner)return owner;
 let encode,decode,refs=0,preparations=0;
 function clear(){if(refs)return 0;const bytes=encode?NATIVE16_DOMAIN_TABLE_BYTES:0;encode?.release();decode?.release();encode=decode=null;return bytes;}
 owner={
  acquire(){
   if(!encode){let a,b;try{a=allocateOwnedTypedArray(Uint16Array,65536,{budget,owner:'native16-domain',label:'encode-table'});b=allocateOwnedTypedArray(Uint16Array,65536,{budget,owner:'native16-domain',label:'inverse-table'});adjustPerceptualCurveTables({encodeTarget:a.data,decodeTarget:b.data});encode=a;decode=b;preparations++;}catch(primary){a?.release();b?.release();throw primary;}}
   refs++;let released=false;return{encode:encode.data,decode:decode.data,release(){if(released)return;released=true;refs--;}};
  },clear,get missingBytes(){return encode?0:NATIVE16_DOMAIN_TABLE_BYTES;},
  snapshot(){return{residentBytes:encode?NATIVE16_DOMAIN_TABLE_BYTES:0,activeMappings:refs,preparations};}
 };
 budget.registerAsyncReclaimer?.(async()=>clear(),{owner:'native16-domain',label:'idle-shared-transfer-tables',allocationKind:'array-buffer'});
 tablesByBudget.set(budget,owner);return owner;
}

export function native16DomainAdditionalBytes(operation,params,descriptor,{budget,...options}={}){
 const plan=native16DomainPlan(operation,params,descriptor,options);
 return plan.apply?(plan.photo?2:1)*NATIVE16_DOMAIN_VIEW_BYTES+(budget?tablesByBudget.get(budget)?.missingBytes??NATIVE16_DOMAIN_TABLE_BYTES:NATIVE16_DOMAIN_TABLE_BYTES):0;
}

export function native16DomainCachedSurface(source){return viewsBySource.get(source)?.view??source;}
// Private registry proof, not caller-supplied provenance, establishes which
// exact Original/proxy lattice a transformed working view borrowed.
export function native16DomainSourceSurface(surface){return observedByWorkingSurface.get(surface)??surface;}

function workingColor(color){
 const {iccProfile,profile,...rest}=color??{};
 return Object.freeze({...rest,transfer:'srgb',role:'temporary-perceptual-working-codes',...(iccProfile||profile?{originalLinearProfileReference:iccProfile??profile}:{}),primariesConverted:false});
}

// Into-read maps in the caller's funded destination. Fallback reads own one
// additional explicitly funded copy. No Original window is modified, and no
// frame-sized bank or RGB8 intermediate is created.
function mappedSurface(source,{budget,inverse=false,color,provenance,ownsSource=false,displayTransform,clearIdleTablesOnClose}={}){
 const d=source.descriptor,manager=tableOwner(budget),metaFee=budget.reserve(NATIVE16_DOMAIN_VIEW_BYTES),id=crypto.randomUUID();
 const descriptor=Object.freeze({...d,id,color,provenance}),pending=new Set(),states=new Set(),metrics={mappedWords:0,mappingMs:0,reads:0,intoReads:0,sampledReads:0};let closed=false,flight;
 const alive=signal=>{checkAbort(signal);if(closed)throw new EngineError('DISPOSED','The native16 domain view is closed.');if(source.descriptor.id!==d.id||source.descriptor.revision!==d.revision)throw new EngineError('SOURCE_CHANGED','The native16 domain input changed.');};
 const track=task=>{pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;};
 function state(){let done;const row={loan:null,output:null,published:false,retired:false,releaseFailed:false,debt:null,flight:null,retiredPromise:new Promise(resolve=>done=resolve),done};states.add(row);return row;}
 async function retire(row){
  if(row.retired)return;if(row.flight)return row.flight;
  const task=(async()=>{try{if(row.debt){await ack(()=>row.debt.dispose());row.debt=null;}if(row.loan){await ack(()=>row.loan.release());row.loan=null;}row.output?.release();row.output=null;row.retired=true;row.done();states.delete(row);}catch(error){row.releaseFailed=true;if(error?.cleanupOwner&&error.cleanupOwner!==view)row.debt=error.cleanupOwner;throw withRetirementOwner(error,view,error);}})();row.flight=task;void task.finally(()=>{if(row.flight===task)row.flight=null;}).catch(()=>{});return task;
 }
 async function map(words,signal){const lease=manager.acquire(),lut=inverse?lease.decode:lease.encode,cooperate=createCooperator(signal),start=performance.now();try{for(let start=0;start<words.length;start+=12288){await cooperate();alive(signal);const end=Math.min(words.length,start+12288);for(let i=start;i<end;i++)words[i]=lut[words[i]];}metrics.mappedWords+=words.length;metrics.mappingMs+=performance.now()-start;}finally{lease.release();}}
 function pixels(data,w,h){return{format:'rgb16',space:'RGB',depth:16,channels:3,sourceDepth:d.sourceDepth,range:[0,65535],width:w,height:h,color,data};}
 function geometry(rect={}){const{x=0,y=0,width=d.width,height=d.height}=rect;requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x<=d.width-width&&y<=d.height-height,'Invalid native domain window.');return{x,y,width,height};}
 async function read(rect,options,target){
  alive(options.signal);const g=geometry(rect),row=state(),n=g.width*g.height*3;
  try{
   if(target)requireValue(target instanceof Uint16Array&&target.length>=n,'Native domain destination is too small.');
   const output=target?target.subarray(0,n):(row.output=allocateOwnedTypedArray(Uint16Array,n,{...options,budget,owner:'native16-domain',label:inverse?'inverse-window':'encoded-window'})).data;
   row.loan=await(source.readWindowInto?source.readWindowInto(g,output,options):source.readWindow(g,options));alive(options.signal);
   requireValue(row.loan?.pixels?.data instanceof Uint16Array&&row.loan.pixels.data.length===n,'The native domain source returned a different typed extent.');
   if(row.loan.pixels.data.buffer!==output.buffer||row.loan.pixels.data.byteOffset!==output.byteOffset)output.set(row.loan.pixels.data);
   await ack(()=>row.loan.release());row.loan=null;await map(output,options.signal);metrics.reads++;if(target)metrics.intoReads++;
   // Into callers own their destination and historically need no window ACK.
   // Our temporary Source loan is already retired before publication.
   if(target){await retire(row);return{surfaceId:id,revision:descriptor.revision,origin:[g.x,g.y],pixels:pixels(output,g.width,g.height),release(){}};}
   row.published=true;return{surfaceId:id,revision:descriptor.revision,origin:[g.x,g.y],pixels:pixels(output,g.width,g.height),release:()=>retire(row)};
  }catch(primary){try{await retire(row);}catch(cleanup){throw withRetirementOwner(primary,view,cleanup);}throw primary;}
 }
 const view={
  descriptor,domainMetrics:()=>({...metrics,tables:manager.snapshot()}),
  readWindow:(rect={},options={})=>track(read(rect,options)),
  readWindowInto:(rect,target,options={})=>track(read(rect,options,target)),
  readWindowPlan(rect={}){const g=geometry(rect),base=source.readWindowPlan?.(g),fallback=source.readWindowInto?0:g.width*g.height*6;if(base&&base.known!==true)return{known:false,reason:'source-domain-read-plan-uninspectable'};return{known:true,outputBytes:g.width*g.height*6,additionalBytes:(base?.additionalBytes??Math.max(d.sourceWidth??d.width,d.sourceHeight??d.height)*6)+fallback+manager.missingBytes};},
  readNativeSampledWindow(tile,options={}){return track((async()=>{
   alive(options.signal);requireValue(typeof source.readNativeSampledWindow==='function','The native domain source has no exact sampler.');const row=state();
   try{row.loan=await source.readNativeSampledWindow(tile,options);alive(options.signal);const part=row.loan;
    requireValue(part?.pixels?.data instanceof Uint16Array,'Native domain sampling requires real UInt16 samples.');
    // The RGB16 surface sampler owns this temporary copy, not Original bytes.
    // Its existing output grant remains captured until the returned ACK.
    await map(part.pixels.data,options.signal);metrics.sampledReads++;row.published=true;
    return{...part,pixels:pixels(part.pixels.data,part.pixels.width,part.pixels.height),release:()=>retire(row),metrics:{...part.metrics,native16CodeDomain:NATIVE16_DOMAIN_POLICY}};
   }catch(primary){try{await retire(row);}catch(cleanup){throw withRetirementOwner(primary,view,cleanup);}throw primary;}
  })());},
  readSampledWindow(tile,options={}){return track((async()=>{
   const convert=options.displayTransform??displayTransform;requireValue(typeof convert==='function','Temporary working codes have no independent Original display authority.');const row=state();let retiringNative=false;
   try{row.loan=await view.readNativeSampledWindow(tile,options);const native=row.loan;row.output=allocateOwnedTypedArray(Uint8Array,native.pixels.data.length,{...options,budget,owner:'native16-domain',label:'returned-photo-display'});await convert(native.pixels,row.output.data,{...options,budget});alive(options.signal);
    // Publication follows the native ACK. If it refuses, both owned buffers
    // remain in this reachable retirement row; no finally can lose RGB8.
    retiringNative=true;await ack(()=>row.loan.release());row.loan=null;retiringNative=false;row.published=true;
    return{pixels:{format:'rgb8',width:native.pixels.width,height:native.pixels.height,data:row.output.data},release:()=>retire(row),metrics:{...native.metrics,presentationPrecision:8,conversion:'inverse-before-original-profile-display'}};
   }catch(primary){if(retiringNative){row.releaseFailed=true;throw withRetirementOwner(primary,view,primary);}if(primary?.cleanupOwner&&primary.cleanupOwner!==view)row.debt=primary.cleanupOwner;try{await retire(row);}catch(cleanup){throw withRetirementOwner(primary,view,cleanup);}throw primary;}
  })());},
  dispose(){if(flight)return flight;closed=true;const task=(async()=>{await Promise.allSettled([...pending]);for(const row of [...states]){if(!row.published||row.releaseFailed)await retire(row);else await row.retiredPromise;}if(ownsSource)await ack(()=>source.dispose());metaFee();if(clearIdleTablesOnClose?.())manager.clear();})();flight=task;void task.catch(()=>{if(flight===task)flight=null;});return task;}
 };
 return view;
}

function workingSource(source,budget){
 let entry=viewsBySource.get(source);if(entry){requireValue(entry.budget===budget,'A native domain source cannot cross budgets.');return entry.view;}
 const d=source.descriptor,view=mappedSurface(source,{budget,color:workingColor(d.color),provenance:Object.freeze({...d.provenance,native16CodeDomain:{policy:NATIVE16_DOMAIN_POLICY,role:'temporary-working-input',originalSurfaceId:d.id,originalRevision:d.revision,sourceTransfer:d.color.transfer,workingTransfer:'srgb',primariesConverted:false}})}),previous=source.dispose.bind(source);let closing;
 entry={budget,view,closed:false};viewsBySource.set(source,entry);observedByWorkingSurface.set(view,source);
 // Existing native transform/filter owners attach to the working view. Their
 // ACK runs before this borrowed view and then Original retire their storage.
 source.dispose=()=>{if(closing)return closing;const task=(async()=>{await ack(()=>view.dispose());await ack(previous);entry.closed=true;tableOwner(budget).clear();})();closing=task;void task.catch(()=>{if(closing===task)closing=null;});return task;};
 return view;
}

/** Public only inside the engine. Prepare before PCA model/cache identities or
 * plots borrowing; the ordinary native dispatcher also calls it defensively. */
export async function prepareNative16DomainContext(operation,params={},context={}){
 if(context[PREPARED])return context;
 const source=context.surface,plan=native16DomainPlan(operation,params,source?.descriptor,context),base={...context,sourceSurface:context.sourceSurface??source,native16DomainPlan:plan,[PREPARED]:true};
 if(!plan.apply)return base;
 requireValue(context.budget&&source?.descriptor.format==='rgb16','A funded real16-bit source is required by the native domain adapter.');checkAbort(context.signal);
 const tables=tableOwner(context.budget).acquire();tables.release();const surface=workingSource(source,context.budget),d=surface.descriptor;
 return{...base,surface,native16ProcessingBinding:context.sourceBinding?{...context.sourceBinding,nativeSurfaceId:d.id,nativeRevision:d.revision}:undefined,...(context.presentationGrid?{presentationGrid:{...context.presentationGrid,nativeSurfaceId:d.id,nativeRevision:d.revision}}:{})};
}

/** Diagnostics retain their defined palettes/tables. Only a real photo16 is
 * decoded, lazily in its funded read destination, before Original ICC display. */
export async function finishNative16DomainRecord(operation,params,context,record){
 if(!record)return record;const plan=context.native16DomainPlan??native16DomainPlan(operation,params,context.surface?.descriptor,context);
 const domain={...plan,sourceSurfaceId:context.sourceSurface?.descriptor.id,workingSurfaceId:context.surface?.descriptor.id,workingInputColor:context.surface?.descriptor.color,scientificOutputColor:plan.photo?context.sourceSurface?.descriptor.color:record.surface?.descriptor.color??null,mapping:plan.apply?'funded-native-window-LUT':'preserved-source-contract'};
 let surface=record.surface,display;
 if(plan.apply&&plan.photo&&surface){
  requireValue(surface.descriptor?.format==='rgb16'&&context.sourceBinding&&typeof context.isSourceCurrent==='function','A returned photo needs its captured Original color authority.');
  const original=context.sourceSurface,d=surface.descriptor;
  display=createNative16DisplayOwner({nativeSource:original,budget:context.budget,sourceBinding:context.sourceBinding,isCurrent:context.isSourceCurrent,displayAssumption:context.displayAssumption,totalPixels:d.width*d.height,backend:context.colorBackend??'auto'});
  try{surface=mappedSurface(surface,{budget:context.budget,inverse:true,ownsSource:true,color:original.descriptor.color,provenance:Object.freeze({...d.provenance,native16CodeDomain:{...domain,role:'photo-returned-to-original-transfer',inverseBeforeDisplay:true}}),displayTransform:display.displayTransform,clearIdleTablesOnClose:()=>viewsBySource.get(native16DomainSourceSurface(context.surface))?.closed===true});display.attach(surface);}catch(primary){await retireCompositeOwners([()=>surface!==record.surface?surface.dispose():undefined,()=>display.dispose()],{primary,requireAck:true});throw primary;}
 }
 const original=record,returned={...record,surface,provenance:{...record.provenance,native16Domain:domain},metrics:{...record.metrics,native16Domain:{policy:plan.policy,applied:plan.apply,reason:plan.reason,inverseBeforeDisplay:plan.apply&&plan.photo,primariesConverted:false,...(plan.apply?{workingView:context.surface.domainMetrics?.()}:{} )},...(surface!==record.surface?{retainedResultBytes:(record.metrics?.retainedResultBytes??0)+NATIVE16_DOMAIN_VIEW_BYTES}: {})},semantics:(record.semantics??'')+(plan.apply?(plan.photo?' Perceptual native16 working codes return to Original transfer before ICC presentation.':' Perceptual native16 code-domain diagnostic; no inverse is applied to its palette or coordinates.'):' Native16 source-code/physical contract preserved: '+plan.reason+'.')};
 if(surface!==record.surface){let closing;returned.dispose=()=>{if(closing)return closing;const task=retireCompositeOwners([()=>surface.dispose(),()=>original.dispose?original.dispose():original.surface.dispose()],{requireAck:true});closing=task;void task.catch(()=>{if(closing===task)closing=null;});return task;};}
 if(native16EqualizationConsumed(record))markNative16EqualizationConsumed(returned);
 return returned;
}
