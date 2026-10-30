import "../../runtime-context.js?v=0.30.0";
import {checkAbort,requireValue,createCooperator} from './errors.js';
import {resamplingFourierParams,resamplingFourierGeometry} from './resampling-fourier.js';
import {cachedPreviewGeometry,reservePreview,previewUnavailable} from './cached-parameter-preview.js';
import {GRAY_PALETTE} from './gray-palette.js';
import {attachGpuCleanup} from './gpu-ack-retirement.js';
const pending=new WeakMap();
const nativeParams=p=>{const{gamma,rescale,...native}=p;return JSON.stringify(native);};
export async function retireFourierPreview(image){let failed=false,primary;for(const owner of [...(pending.get(image)??[])])try{await owner.retire();}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
export const createFourierPreviewOwner=image=>({dispose(){return retireFourierPreview(image);}});
function register(image){let set=pending.get(image);if(!set){set=new Set();pending.set(image,set);}let finish;const ready=new Promise(r=>finish=r),owner={finish,lease:null,frame:null,pin:null,fee:null,pages:new Set(),closing:null,done:false,
 retire(){if(this.done)return Promise.resolve();if(this.closing)return this.closing;const task=(async()=>{await ready;let failed=false,primary;const attempt=async action=>{try{await action();}catch(error){if(!failed){failed=true;primary=error;}}};for(const page of [...this.pages])await attempt(async()=>{await page.release?.();this.pages.delete(page);});if(!this.pages.size){await attempt(async()=>{await this.lease?.dispose();this.lease=null;});if(!this.lease){this.frame=null;await attempt(()=>{this.pin?.();this.pin=null;});if(!this.pin)await attempt(()=>{this.fee?.();this.fee=null;});}}if(failed)throw primary;this.done=true;set.delete(this);if(!set.size)pending.delete(image);})();this.closing=task;void task.finally(()=>{if(this.closing===task)this.closing=null;}).catch(()=>{});return task;}
 };set.add(owner);return owner;
}
function scopeIdentity(image,width,height,identity,sourceRegion){
 if(!identity||identity.sourceSha256!==image.sha256||identity.width!==width||identity.height!==height)previewUnavailable('Retained Fourier source identity differs.');const domain=sourceRegion?.domain;
 if(domain){const whole=domain.origin[0]===0&&domain.origin[1]===0&&domain.width===domain.sourceWidth&&domain.height===domain.sourceHeight&&domain.countIncluded===domain.sourceWidth*domain.sourceHeight,origin=image.sourceRegionOrigin??[0,0],fingerprint=image.provenance?.derivedInput?.sourceRegionFingerprint??null;if(domain.sourceSha256!==identity.sourceSha256||domain.width!==width||domain.height!==height||origin.some((v,i)=>v!==domain.origin[i])||fingerprint!==null&&fingerprint!==domain.fingerprint||fingerprint===null&&!whole)previewUnavailable('Fourier draft belongs to another Original source domain.');}
 else if(image.provenance?.derivedInput?.sourceRegionFingerprint)previewUnavailable('Fourier draft requires its original source domain.');
}
function retainedMagnitudePolicy(cache,g,p){
 let key,spectrum;try{key=JSON.parse(cache?.magnitude?.key);spectrum=JSON.parse(key[0]);}catch{previewUnavailable('Retained Fourier transform identity differs.');}
 if(!Array.isArray(key)||key.length!==3||key[1]!==p.center||key[2]!==p.highpass||!Array.isArray(spectrum)||![3,4].includes(spectrum.length)||JSON.stringify(spectrum.slice(0,3))!==JSON.stringify([g.selected,p.window,p.upsample]))previewUnavailable('Run the requested Fourier transform before its draft.');
 const policy=spectrum[3]??'native-fft-v1';if(!['native-fft-v1','DD-fft-v1'].includes(policy))previewUnavailable('Retained Fourier arithmetic identity differs.');
 if(policy==='DD-fft-v1'){
  const m=cache.magnitude,bound=m.errorBound,scale=p.rescale?1:m.high>m.low?1/(m.high-m.low):0;
  if(p.gamma>0&&p.gamma<1||!Number.isFinite(bound)||bound<0||bound*(2*p.gamma+1)*scale>5e-5)previewUnavailable('Run the native FFT for this numerically sensitive gamma before its draft.');
 }
 return policy;
}
export async function previewCachedFourier(image,imageId,input,preview={}, {budget,signal,onProgress,sourceRegion}={}){
 checkAbort(signal);const p=resamplingFourierParams(input),descriptor=image.surface?.descriptor??image.pixels,width=descriptor?.width,height=descriptor?.height,cache=image.resamplingCache;await retireFourierPreview(image);checkAbort(signal);
 let magnitude,master,side,low,high,identity,fragment=null,nativeEntry,arithmeticPolicy='native-fft-v1';
 if(cache?.sourceRegionIdentity){
  const{domain,original}=sourceRegion??{};if(cache.disposed||!domain||!original||original.sha256!==domain.sourceSha256||domain.width!==width||domain.height!==height||cache.sourceRegionIdentity!==JSON.stringify([domain.sourceSha256,domain.fingerprint,p.rect]))previewUnavailable('Retained Fourier contexts belong to another Original, domain or selection.');
  const sources=cache.previewSources,index=preview.fragmentIndex??0;requireValue(Number.isSafeInteger(index)&&index>=0,'Invalid Fourier preview fragment.');fragment=sources?.[index];if(!fragment||!Array.isArray(fragment.bounds)||fragment.bounds.length!==4||!Array.isArray(fragment.originalBounds)||fragment.originalBounds.length!==4||fragment.bounds.some((v,i)=>!Number.isSafeInteger(v)||fragment.originalBounds[i]!==v+domain.origin[i%2]))previewUnavailable('The selected native Fourier frequency grid is unavailable.');const inner=cache.entries.get(fragment.key),w=fragment.bounds[2]-fragment.bounds[0],h=fragment.bounds[3]-fragment.bounds[1],g=resamplingFourierGeometry(w,h,{...p,rect:null});if(inner?.disposed)previewUnavailable('The retained Fourier context is closed.');arithmeticPolicy=retainedMagnitudePolicy(inner,g,p);master=inner.magnitude.table;side=g.outputSide;low=inner.magnitude.low;high=inner.magnitude.high;identity={sourceSha256:domain.sourceSha256,domainFingerprint:domain.fingerprint,originalBounds:fragment.originalBounds};
 }else if(cache?.magnitude){
  if(cache.disposed)previewUnavailable('Fourier cache is closed.');scopeIdentity(image,width,height,cache.previewIdentity,sourceRegion);const g=resamplingFourierGeometry(width,height,p);arithmeticPolicy=retainedMagnitudePolicy(cache,g,p);master=cache.magnitude.table;side=g.outputSide;low=cache.magnitude.low;high=cache.magnitude.high;identity=cache.previewIdentity;
 }else{
  const parameters=nativeParams(p),prefix=imageId+'\0op/tampering.resampling.fourier/';for(const backend of['auto','cpu','webgpu']){const hit=budget.get(prefix+backend+'/'+parameters);if(hit?.value?.fourierNativeIdentity?.nativeParams===parameters){nativeEntry=hit;break;}}
  const native=nativeEntry?.value,id=native?.fourierNativeIdentity;if(!native||!id)previewUnavailable('The original native Fourier magnitude is not retained.');scopeIdentity(image,width,height,id,sourceRegion);const g=resamplingFourierGeometry(width,height,p);if(JSON.stringify(native.data.geometry)!==JSON.stringify(g)||!(native.data.magnitude instanceof Float64Array)||native.data.magnitude.length!==g.outputSide**2)previewUnavailable('Retained native Fourier dimensions differ.');magnitude=native.data.magnitude;side=g.outputSide;low=native.data.minimumMagnitude;high=native.data.maximumMagnitude;identity=id;
 }
 if(!fragment&&preview.fragmentIndex!==undefined&&preview.fragmentIndex!==0)previewUnavailable('This Fourier source has one native frequency grid.');if(!Number.isFinite(low)||!Number.isFinite(high)||low>high)previewUnavailable('Native Fourier magnitude normalization is unavailable.');if(master&&(master.descriptor?.format!=='float64-table'||master.descriptor.rowCount!==side**2||master.descriptor.gridWidth!==side||master.descriptor.gridHeight!==side))previewUnavailable('Native Fourier frequency table dimensions differ.');const owner=register(image);let failed=false,primary,pixels,frameData;
 try{
  // A RAM cache has no retained-table lease. A second conservative pin owns
  // its complete immutable backing even if optional cache pressure evicts it.
  if(nativeEntry)owner.pin=reservePreview(budget,nativeEntry.byteLength);
  const g=cachedPreviewGeometry(side,side,{...preview,maxSide:preview.maxSide??640},budget,{bytesPerPixel:32,fixedBytes:Math.max(side*40,1024**2)});owner.fee=reservePreview(budget,g.reservedBytes);if(master)owner.lease=master.lease();frameData=new Uint8Array(g.pixels*3);owner.frame=frameData;const cooperate=createCooperator(signal);
  for(let y=0;y<g.height;y++){
   await cooperate();checkAbort(signal);let page,hasPrimary=false,rowPrimary;
   try{if(owner.lease){page=await owner.lease.readRows({offset:y*g.step*side,length:side},{signal});owner.pages.add(page);requireValue(page.length===side&&page.data instanceof Float64Array&&page.data.length===side*3,'Invalid retained Fourier table row.');}for(let x=0;x<g.width;x++){const value=page?page.data[x*g.step*3+2]:magnitude[(y*g.step)*side+x*g.step];requireValue(Number.isFinite(value)&&value>=low&&value<=high,'Invalid retained Fourier magnitude.');const scaled=Math.pow(high>low?(value-low)/(high-low):0,p.gamma)*(p.rescale?high:1),gray=GRAY_PALETTE[Math.max(0,Math.min(255,Math.floor(scaled*256)))],at=(y*g.width+x)*3;frameData[at]=gray;frameData[at+1]=gray;frameData[at+2]=gray;}}
   catch(error){hasPrimary=true;rowPrimary=error;throw error;}finally{if(page)try{await page.release?.();owner.pages.delete(page);}catch(cleanup){if(hasPrimary)attachGpuCleanup(rowPrimary,cleanup);else throw cleanup;}}
  }
  checkAbort(signal);pixels={width:g.width,height:g.height,format:'rgb8',data:frameData.slice(),logicalWidth:side,logicalHeight:side};onProgress?.({phase:'fourier-cached-preview',completed:1,total:1});checkAbort(signal);
  return{pixels,exact:false,metrics:{cacheOnly:true,exactNativeSamples:arithmeticPolicy==='native-fft-v1',exactRetainedSamples:true,fourierArithmeticPolicy:arithmeticPolicy,nativeAnalysisCalls:0,fftCalls:0,gpuCalls:0,scientificFinalChanged:false,admittedPreviewBytes:g.bytes,sampleDimensions:[g.width,g.height],sampleStep:g.step,sourceSha256:identity.sourceSha256,...(identity.domainFingerprint?{sourceRegionFingerprint:identity.domainFingerprint,strictSourceRegions:true}:{})},preview:{provisional:true,coordinateSpace:'frequency-grid',logicalDimensions:[side,side],sampleStep:g.step,gamma:p.gamma,rescale:p.rescale,sourceSha256:identity.sourceSha256,...(fragment?{fragmentId:fragment.id,originalBounds:fragment.originalBounds,sourceRegionFingerprint:identity.domainFingerprint}:{})}};
 }catch(error){failed=true;primary=error;throw error;}finally{frameData=null;magnitude=null;nativeEntry=null;master=null;owner.finish();try{await owner.retire();}catch(cleanup){if(failed)attachGpuCleanup(primary,cleanup);else throw cleanup;}}
}
