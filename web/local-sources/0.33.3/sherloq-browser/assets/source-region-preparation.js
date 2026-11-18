import {compileOriginalSourceRegions,createOriginalSourceRegionsState} from './unified-engine/src/source-region-geometry.js';
import {sourceRegionDomainShape} from './unified-engine/src/source-region-capabilities.js';

const envelopes=new WeakMap();
/** Region detection prepares editable candidates inside the enclosing native
 * rectangle. It is not a scientific analysis of an arbitrary membership mask.
 * Keep the requested domain separate so callers cannot silently widen analysis.
 */
export async function sourceRegionDetectionInput(input,{strict=false}={}){
 if(typeof strict!=='boolean')throw Object.assign(new Error('The geometric detection scope mode must be boolean.'),{code:'INVALID_INPUT'});
 const requested=await compileOriginalSourceRegions(input);
 if(requested.empty)throw Object.assign(new Error('Active regions contain no pixels for region preparation.'),{code:'SOURCE_SCOPE_EMPTY'});
 let detector=requested;
 if(!strict&&sourceRegionDomainShape(requested)==='membership'){
  let pending=envelopes.get(requested);
  if(!pending){pending=(async()=>{const state=await createOriginalSourceRegionsState({sourceSha256:requested.sourceSha256,width:requested.sourceWidth,height:requested.sourceHeight});await state.add('acquisition',requested.rect,{id:'preparation-envelope',origin:'derived'});return compileOriginalSourceRegions(state.snapshot());})();envelopes.set(requested,pending);pending.catch(()=>envelopes.delete(requested));}
  detector=await pending;
 }
 return{domain:detector.descriptor,requestedDomain:requested.descriptor,origin:detector.origin,preparation:{purpose:strict?'strict-geometric-detection':'preparation-envelope',context:strict?'strict-native-contexts':'envelope-not-scientific-membership',requestedFingerprint:requested.fingerprint,detectorFingerprint:detector.fingerprint}};
}
