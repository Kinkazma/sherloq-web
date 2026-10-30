import "../../runtime-context.js?v=0.30.0";
import {compileOriginalSourceRegions} from './source-region-geometry.js';
import {sourceRegionTransportBytes} from './source-region-transport.js';
import {receiveNativeSourceChannel} from './native-source-channel.js';
import {EngineError,checkAbort,requireValue} from './errors.js';

/** A new, explicitly scientific TruFor consumer. It does not broaden the old M2
 * rectangle admission. Analysis reads reject every partially admitted window;
 * Original-only presentation has a separate reader and never enters a graph. */
export async function receiveTruforStrictSourceInput(input,{budget,signal}={}) {
 let source,metadata;try {
  checkAbort(signal);metadata=budget.reserve(sourceRegionTransportBytes(input?.sourceRegionDomain,{allowAliases:true})*8+65536);
  const domain=await compileOriginalSourceRegions(input?.sourceRegionDomain);checkAbort(signal);
  if(domain.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','The source selection admits no original pixels.');
  requireValue(input.purpose==='analysis-native-contexts'&&input.analysisContext==='native-trufor-contexts-only'&&input.preparationContext===undefined&&input.sha256===domain.sourceSha256&&input.width===domain.width&&input.height===domain.height&&Array.isArray(input.origin)&&input.origin.length===2&&input.origin[0]===domain.origin[0]&&input.origin[1]===domain.origin[1],'TruFor context transport differs from its bound original source.');
  source=receiveNativeSourceChannel(input,{budget,signal});let closed=false;
  const descriptor={id:'trufor-original/'+domain.fingerprint,revision:1,width:domain.sourceWidth,height:domain.sourceHeight,format:'rgb8'};
  const local=rect=>{
   requireValue(rect&&['x','y','width','height'].every(k=>Number.isSafeInteger(rect[k]))&&rect.width>0&&rect.height>0,'Invalid TruFor original window.');
   const r={...rect,x:rect.x-domain.origin[0],y:rect.y-domain.origin[1]};
   requireValue(r.x>=0&&r.y>=0&&r.x+r.width<=domain.width&&r.y+r.height<=domain.height,'TruFor original window exceeds its bound envelope.');return r;
  };
  const read=(rect,hooks,scientific)=>{
   checkAbort(signal);if(closed)throw new EngineError('DISPOSED','TruFor native source is closed.');const r=local(rect);
   if(scientific)for(let y=r.y;y<r.y+r.height;y++){
    const spans=domain.rowIntervals(y).filter(([a,b])=>a<r.x+r.width&&b>r.x);
    if(spans.length!==1||spans[0][0]>r.x||spans[0][1]<r.x+r.width)throw new EngineError('SOURCE_REGION_PARTIAL_WINDOW','TruFor analysis may only read entirely admitted native contexts.');
   }
   return source.readWindow(r,hooks);
  };
  return{width:domain.sourceWidth,height:domain.sourceHeight,sha256:domain.sourceSha256,segmented:true,strictTruforContexts:true,sourceRegionDomain:domain.descriptor,
   surface:{descriptor,readWindow:(rect,hooks)=>read(rect,hooks,true)},presentationSurface:{descriptor,readWindow:(rect,hooks)=>read(rect,hooks,false)},
   provenance:{originalSourceSha256:domain.sourceSha256,sourceRegionDomain:domain.descriptor,sourceRegionOrigin:[...domain.origin],analysisContext:'native-trufor-contexts-only',encodedSourceRewritten:false},
   async dispose(){if(closed)return;closed=true;try{await source.dispose();}finally{metadata();metadata=null;}}
  };
 }catch(error){try{await source?.dispose();}finally{metadata?.();if(!source)try{input?.port?.postMessage({type:'close'});input?.port?.close?.();}catch{}}throw error;}
}
