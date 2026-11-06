import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from './source-region-geometry.js';
import {createSourceRegionView} from './source-region-view.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';

/** The same spatial membership is rebound to the actual second source hash.
 * Both originals must have the same oriented grid before either is cropped. */
async function rebindDomain(descriptor,sha256,{signal}={}) {
 checkAbort(signal);const s=descriptor.snapshot,state=await createOriginalSourceRegionsState({sourceSha256:sha256,width:s.width,height:s.height});
 await state.replaceZones(s.zones,{enabled:s.enabled,positiveMode:s.positiveMode});
 const ceiling=descriptor.ceiling?await rebindDomain(descriptor.ceiling,sha256,{signal}):null;
 return compileOriginalSourceRegions(state.snapshot(),{ceiling});
}
export async function createComparisonDomainPair(original,reference,input,{budget,signal}={}) {
 requireValue(budget,'An explicit comparison domain budget is required.');let metadata,a,b;const spanLeases=[];
 try {
  checkAbort(signal);const metadataBytes=sourceRegionTransportBytes(input)*12+65536;metadata=budget.reserve(metadataBytes);
  const domain=await compileOriginalSourceRegions(input),first=original?.surface?.descriptor,second=reference?.surface?.descriptor;
  requireValue(first?.format==='rgb8'&&second?.format==='rgb8'&&first.width===second.width&&first.height===second.height,'Evidence and reference originals must share the same oriented native grid.');
  requireValue(original.sha256===domain.sourceSha256&&first.width===domain.sourceWidth&&first.height===domain.sourceHeight&&/^[a-f0-9]{64}$/i.test(reference.sha256??''),'The comparison domain must belong to its actual first source and native grid.');
  if(domain.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','The paired source domain has no admitted observations.');
  const referenceDomain=await rebindDomain(domain.descriptor,reference.sha256,{signal});checkAbort(signal);
  requireValue(referenceDomain.countIncluded===domain.countIncluded&&referenceDomain.width===domain.width&&referenceDomain.height===domain.height&&JSON.stringify(referenceDomain.origin)===JSON.stringify(domain.origin),'Rebinding changed the paired native membership.');
  const lifetime=new AbortController();a=await createSourceRegionView({...original.surface,sha256:original.sha256},domain.descriptor,{budget,signal:lifetime.signal,maxReadPixels:262144});b=await createSourceRegionView({...reference.surface,sha256:reference.sha256},referenceDomain.descriptor,{budget,signal:lifetime.signal,maxReadPixels:262144});
  const spans=[];let count=0,disposed=false,disposal;
  for(let y=0;y<domain.height;y++) {
   const row=domain.rowIntervals(y),other=referenceDomain.rowIntervals(y);requireValue(JSON.stringify(row)===JSON.stringify(other),'The paired source memberships differ.');
   for(const[x,right]of row){spanLeases.push(budget.reserve(128));spans.push({offset:count,x,y,length:right-x});count+=right-x;}
   if(y%256===0)await controlCheckpoint(signal);
  }
  requireValue(count===domain.countIncluded,'The paired observations do not cover their source domain.');
  const find=offset=>{let lo=0,hi=spans.length;while(lo<hi){const mid=(lo+hi)>>1;if(spans[mid].offset+spans[mid].length<=offset)lo=mid+1;else hi=mid;}return lo;};
  const observations=(view,source)=>({sha256:source.sha256,session:source.session,ensureTemporarySession:source.ensureTemporarySession,surface:{descriptor:Object.freeze({id:'comparison-observations/'+source.surface.descriptor.id+'/'+source.surface.descriptor.revision+'/'+domain.fingerprint,revision:1,width:1,height:count,format:'rgb8'}),async readWindow(rect,{signal:extra}={}){
   checkAbort(extra);checkAbort(lifetime.signal);if(disposed)throw new EngineError('DISPOSED','Paired comparison observations are closed.');
   requireValue(rect?.x===0&&rect.width===1&&Number.isSafeInteger(rect.y)&&Number.isSafeInteger(rect.height)&&rect.y>=0&&rect.height>0&&rect.y+rect.height<=count&&rect.height<=262144,'Invalid compact comparison observation window.');
   const lease=budget.reserve(rect.height*3);let committed=false;
   try{const data=new Uint8Array(rect.height*3);let at=rect.y,out=0,index=find(at);while(at<rect.y+rect.height){const span=spans[index++],left=at-span.offset,length=Math.min(span.length-left,rect.y+rect.height-at);const part=await view.readWindow({x:span.x+left,y:span.y,width:length,height:1},{signal:extra});try{data.set(part.pixels.data,out*3);}finally{await part.release();}at+=length;out+=length;}checkAbort(extra);checkAbort(lifetime.signal);committed=true;let closed=false;return{pixels:{width:1,height:rect.height,format:'rgb8',data},release(){if(closed)return;closed=true;lease();}};}finally{if(!committed)lease();}
  }}});
  for(const span of spans)Object.freeze(span);Object.freeze(spans);
  const images=[observations(a,original),observations(b,reference)],certificate=Object.freeze({schema:'sherloq.paired-native-domain/1',originalSha256:original.sha256,referenceSha256:reference.sha256,originalDomainFingerprint:domain.fingerprint,referenceDomainFingerprint:referenceDomain.fingerprint,originalGrid:Object.freeze([first.width,first.height]),origin:Object.freeze([...domain.origin]),width:domain.width,height:domain.height,observations:count,observationOrder:'Original native row, then increasing admitted span and column',nonSpatialLayout:'one-column observation sequence; never input to a spatial/perceptual metric'});
  const retainedBytes=metadataBytes+spans.length*128;metadata();metadata=null;for(const lease of spanLeases)lease();budget.retain(retainedBytes);
  return{domain,referenceDomain,original,reference,images,views:[a,b],spans,certificate,
   contexts:()=>a.admittedRectangles(),
   offsetOf(x,y){let lo=0,hi=spans.length;while(lo<hi){const mid=(lo+hi)>>1,s=spans[mid];if(s.y<y||s.y===y&&s.x+s.length<=x)lo=mid+1;else hi=mid;}const s=spans[lo];requireValue(s&&s.y===y&&x>=s.x&&x<s.x+s.length,'Coordinate is not a paired observation.');return s.offset+x-s.x;},
   matches(firstSource,secondSource,d){return !disposed&&firstSource?.surface===original.surface&&secondSource?.surface===reference.surface&&firstSource.sha256===certificate.originalSha256&&secondSource.sha256===certificate.referenceSha256&&d?.fingerprint===domain.fingerprint&&firstSource.surface.descriptor===first&&secondSource.surface.descriptor===second;},
   dispose(){if(disposal)return disposal;if(disposed)return;disposed=true;lifetime.abort();let failure,first,second;try{first=a.dispose();}catch(error){failure=error;}try{second=b.dispose();}catch(error){failure??=error;}if([first,second].some(value=>value&&typeof value.then==='function')){disposal=Promise.allSettled([first,second]).then(answers=>{budget.retained-=retainedBytes;failure??=answers.find(x=>x.status==='rejected')?.reason;if(failure)throw failure;});return disposal;}budget.retained-=retainedBytes;if(failure)throw failure;}
  };
 }catch(error){try{await a?.dispose();}finally{try{await b?.dispose();}finally{for(const lease of spanLeases)lease();metadata?.();}}throw error;}
}
