import {sourceRegionTransportBytes} from './source-region-transport.js';
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {sourceRegionDomainShape,sourceRegionUnlocalizedInput} from './source-region-capabilities.js';
import {receiveNativeSourceChannel} from './native-source-channel.js';
import {EngineError,checkAbort} from './errors.js';

// These analyzers consume an RGB grid. CAT-Net additionally needs JPEG/DCT
// coefficients in the same grid, and is deliberately absent from this adapter.
export const M2_NATIVE_RECTANGLE_METHODS=Object.freeze(['rita','trufor','cfa']);
export function assertM2SourceRegionTask(task,domain){
 const method=String(task.operation??'').replace(/^m2\./,''),shape=sourceRegionDomainShape(domain),unlocalized=sourceRegionUnlocalizedInput(task);
 if(shape==='empty')throw new EngineError('SOURCE_SCOPE_EMPTY','The source selection admits no original pixels.');
 if(shape==='identity')return{method,shape,adapter:'original-identity'};
 if(method==='catnet'&&['rectangle','native-regions','membership'].includes(shape)&&!unlocalized)return{method,shape,adapter:'catnet-original-stored-block-contexts'};
 if(['cfa','trufor','rita'].includes(method)&&['native-regions','membership'].includes(shape)&&!unlocalized)return{method,shape,adapter:method+'-strict-native-contexts'};
 if(shape!=='rectangle'||!M2_NATIVE_RECTANGLE_METHODS.includes(method)||unlocalized)throw new EngineError('SOURCE_SCOPE_UNSUPPORTED',method==='catnet'?'CAT-Net requires a qualified JPEG/DCT crop adapter aligned to the RGB grid.':'This M2 method has no qualified native adapter for this source domain or independent coordinates.',{details:{method,shape,reason:method==='catnet'?'DCT_CROP_UNQUALIFIED':shape==='membership'?'MEMBERSHIP_UNQUALIFIED':'INPUT_UNLOCALIZED',unlocalizedInput:unlocalized}});
 return{method,shape,adapter:'m2-native-rgb-rectangle'};
}
/** The same canonical compiler is used by the UI, engine and this worker.
 * A preparation envelope is never sufficient admission for scientific input. */
export async function receiveM2SourceRegionInput(method,input,{budget,signal,params={}}={}){
 let source,metadataLease;
 try{
  checkAbort(signal);const metadataBytes=sourceRegionTransportBytes(input?.sourceRegionDomain,{allowAliases:true});
  // Normalization, bounded scanline intersections and fingerprint serialization
  // are admitted before they allocate copies of the transported geometry.
  metadataLease=budget.reserve(metadataBytes*8+65536);const domain=await compileOriginalSourceRegions(input?.sourceRegionDomain);checkAbort(signal);
  metadataLease();metadataLease=budget.reserve(metadataBytes*2);
  const capability=assertM2SourceRegionTask({operation:'m2.'+method,params},domain);
  if(!['identity','rectangle'].includes(capability.shape))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','The rectangle consumer cannot admit a multi-context source.');
  if(!M2_NATIVE_RECTANGLE_METHODS.includes(method)||input?.purpose!=='analysis-rectangle'||input.analysisContext!=='admitted-native-rectangle'||input.preparationContext!==undefined||input.sha256!==domain.sourceSha256||input.width!==domain.width||input.height!==domain.height||input.origin?.[0]!==domain.origin[0]||input.origin?.[1]!==domain.origin[1])throw new EngineError('SOURCE_REGIONS_INVALID','M2 native input differs from its admitted original-source rectangle.');
  source=receiveNativeSourceChannel(input,{budget,signal});
  const descriptor={id:'m2-source-region-'+domain.fingerprint,revision:1,width:domain.width,height:domain.height,format:'rgb8'};
  const provenance={originalSourceSha256:domain.sourceSha256,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],analysisContext:'admitted-native-rectangle',encodedSourceRewritten:false,adapter:capability.adapter};
  return{width:domain.width,height:domain.height,sha256:domain.sourceSha256,segmented:true,surface:{descriptor,async readWindow(rect,hooks){const window=await source.readWindow(rect,hooks);return{...window,origin:[rect.x,rect.y]};}},provenance,metrics:{nativeSourceWindowBytes:1024**2},dispose(){try{source.dispose();}finally{metadataLease?.();metadataLease=null;}}};
 }catch(error){source?.dispose();metadataLease?.();if(!source)try{input?.port?.postMessage({type:'close'});input?.port?.close?.();}catch{}throw error;}
}
