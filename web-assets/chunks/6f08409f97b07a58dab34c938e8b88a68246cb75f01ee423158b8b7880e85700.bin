import "../../runtime-context.js?v=0.25.0";
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {receiveNativeSourceChannel} from './native-source-channel.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

/** A named scientific consumer distinct from the presentation envelope. Source
 * reads use Original coordinates, and every inference read must be wholly
 * admitted before any RGB enters RITA normalization/reflect padding. */
export async function receiveRitaStrictSourceInput(input,{budget,signal}={}){
 let source,metadata;
 try{
  checkAbort(signal);metadata=budget.reserve(sourceRegionTransportBytes(input?.sourceRegionDomain,{allowAliases:true})*8+65536);const domain=await compileOriginalSourceRegions(input?.sourceRegionDomain);checkAbort(signal);
  if(domain.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','RITA source selection admits no original pixels.');
  requireValue(input.purpose==='analysis-native-contexts'&&input.analysisContext==='native-rita-contexts-only'&&input.preparationContext===undefined&&input.sha256===domain.sourceSha256&&input.width===domain.width&&input.height===domain.height&&Array.isArray(input.origin)&&input.origin.length===2&&input.origin[0]===domain.origin[0]&&input.origin[1]===domain.origin[1],'RITA native transport differs from its bound Original domain.');
  source=receiveNativeSourceChannel(input,{budget,signal});let closed=false;const descriptor=Object.freeze({id:'rita-original/'+domain.fingerprint,revision:1,width:domain.sourceWidth,height:domain.sourceHeight,format:'rgb8'});
  function local(rect){requireValue(rect&&['x','y','width','height'].every(k=>Number.isSafeInteger(rect[k]))&&rect.width>0&&rect.height>0,'Invalid RITA Original window.');const r={...rect,x:rect.x-domain.origin[0],y:rect.y-domain.origin[1]};requireValue(r.x>=0&&r.y>=0&&r.x+r.width<=domain.width&&r.y+r.height<=domain.height,'RITA Original read exceeds its bound envelope.');return r;}
  function read(rect,hooks,scientific){
   checkAbort(signal);if(closed)throw new EngineError('DISPOSED','RITA native source is closed.');const r=local(rect);
   if(scientific)for(let y=r.y;y<r.y+r.height;y++){const spans=domain.rowIntervals(y).filter(([a,b])=>a<r.x+r.width&&b>r.x);requireValue(spans.length===1&&spans[0][0]<=r.x&&spans[0][1]>=r.x+r.width,'RITA scientific source read includes unadmitted pixels.');}
   return source.readWindow(r,hooks);
  }
  return{width:domain.sourceWidth,height:domain.sourceHeight,segmented:true,sha256:domain.sourceSha256,strictRitaContexts:true,sourceRegionDomain:domain.descriptor,surface:{descriptor,readWindow:(r,h)=>read(r,h,true)},presentationSurface:{descriptor,readWindow:(r,h)=>read(r,h,false)},provenance:{originalSourceSha256:domain.sourceSha256,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],analysisContext:'native-rita-contexts-only',encodedSourceRewritten:false},dispose(){if(closed)return;closed=true;try{source.dispose();}finally{metadata();metadata=null;}}};
 }catch(error){try{source?.dispose();}catch(cleanup){if(error&&typeof error==='object'&&Object.isExtensible(error))try{error.cleanupError=cleanup;}catch{}}finally{metadata?.();if(!source)try{input?.port?.postMessage({type:'close'});input?.port?.close?.();}catch{}}throw error;}
}
