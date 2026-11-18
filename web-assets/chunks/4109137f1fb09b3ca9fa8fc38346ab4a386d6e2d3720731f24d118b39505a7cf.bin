import "../../runtime-context.js?v=0.33.3";
// Retire one failed image import through its existing resource owners.
import {onceDenseRetirement as once} from './dense-owner-retirement.js';
import {retireCompositeOwners} from './composite-owner-release.js';
export function createExtendedImportRetirement({upstreamOwner,surface,store,nativeBank,colorMetadata,session,source,releaseCredits}){
 let retired=false;
 const upstream=once(()=>upstreamOwner?.dispose());
 // A surface owns its store. A refused surface must never be bypassed by
 // disposing that store directly underneath it.
 const children=[once(()=>surface?surface.dispose():store?.dispose()),once(()=>nativeBank?.dispose())];
 const profile=once(()=>colorMetadata?.dispose()),temporary=once(()=>session?.dispose()),encoded=once(()=>source?.dispose()),credits=once(releaseCredits);
 const dispose=once(async()=>{await upstream();await retireCompositeOwners(children);await profile();await temporary();await encoded();await credits();retired=true;});
 return{dispose,get retired(){return retired;}};
}
