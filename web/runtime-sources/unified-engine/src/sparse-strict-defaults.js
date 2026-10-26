import "../../runtime-context.js?v=0.25.0";
import {certifySparseRequestedGeometry} from './source-region-requested-geometry.js';
import {createOriginalSourceRegionsState,compileOriginalSourceRegions} from './source-region-geometry.js';
import {nativeSourceRegionMembership,nativeSourceRegionDefaultRegions,sourceRegionHasNativeAcquisitions} from './source-region-native-regions.js';
import {requireValue,checkAbort,controlCheckpoint,EngineError} from './errors.js';
const rectangle=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
/** Search jobs describe positive acquisitions, not the rectangular pieces used
 * to omit actual RGB negatives. Rebuild the verified positive ceiling chain
 * without those negatives so an interior hole never becomes a new job. */
export async function strictSparseDefaultTask(task,domain,{signal}={}){
 checkAbort(signal);requireValue(task.operation==='tampering.copyMove.sparse'&&task.sourceRegionLocalization?.domainFingerprint===domain.fingerprint&&task.sourceRegionLocalization?.coordinates==='source-region-native','Strict Sparse defaults require verified localized coordinates.');
 const out={...task,params:structuredClone(task.params??{})};const suppliedRegions=!!out.params.regions?.length;
 const levels=[];for(let d=domain.descriptor;d;d=d.ceiling)levels.push(d.snapshot);let positive=null;
 for(const snapshot of levels.reverse()){
  checkAbort(signal);const state=await createOriginalSourceRegionsState({sourceSha256:domain.sourceSha256,width:domain.sourceWidth,height:domain.sourceHeight});await state.replaceZones(snapshot.zones.filter(z=>z.kind==='acquisition'),{positiveMode:snapshot.positiveMode,enabled:snapshot.enabled});positive=await compileOriginalSourceRegions(state.snapshot(),{ceiling:positive});
 }
 if(!positive||positive.empty)throw new EngineError('SOURCE_SCOPE_EMPTY','No positive sparse source acquisition remains.');
 let polygons,partitioned=false;
 if(sourceRegionHasNativeAcquisitions(positive))polygons=nativeSourceRegionDefaultRegions(nativeSourceRegionMembership(positive)).map(r=>r.polygon.map(([x,y])=>[x+positive.origin[0]-domain.origin[0],y+positive.origin[1]-domain.origin[1]]));
 else{
  // Arbitrary polygon intersections use their exact native row intervals. This
  // is an explicit search decomposition, never a filled or painted RGB image.
  partitioned=true;const completed=[],active=new Map();for(let y=domain.origin[1];y<domain.origin[1]+domain.height;y++){
   if(y%32===0)await controlCheckpoint(signal);const spans=positive.originalRowIntervals(y).map(([a,b])=>[Math.max(a,domain.origin[0]),Math.min(b,domain.origin[0]+domain.width)]).filter(([a,b])=>b>a),next=new Map();
   for(const[a,b]of spans){const key=a+','+b,prior=active.get(key);next.set(key,prior&&prior[3]===y?[prior[0],prior[1],prior[2],y+1]:[a,y,b,y+1]);active.delete(key);}completed.push(...active.values());active.clear();for(const[k,v]of next)active.set(k,v);
   if(completed.length+active.size>8192)throw new EngineError('SOURCE_SCOPE_METADATA_LIMIT','The exact native Sparse acquisition decomposition exceeds its bounded search metadata; no acquisition pixels were dropped.');
  }completed.push(...active.values());polygons=completed.map(b=>rectangle(b.map((v,i)=>v-domain.origin[i%2])));
 }
 // A negative along the outer edge can shrink the RGB crop. Positive search
 // polygons may retain their original vertices; the source/candidate owners
 // still enforce the exact signed domain before any native input read.
 polygons=polygons.filter(p=>Math.max(...p.map(v=>v[0]))>0&&Math.max(...p.map(v=>v[1]))>0&&Math.min(...p.map(v=>v[0]))<domain.width&&Math.min(...p.map(v=>v[1]))<domain.height);
 requireValue(polygons.length>0,'Strict Sparse source has no intersecting acquisition.');requireValue(!out.params.compare||(suppliedRegions?out.params.regions.length===2:polygons.length===2),'Compare requires its two explicitly supplied native ROI polygons, or exactly two effective source acquisitions when no native ROI was supplied.');if(!suppliedRegions)out.params.regions=structuredClone(polygons);
 const frame=rectangle([0,0,domain.width,domain.height]);if(!suppliedRegions&&!out.params.compare&&polygons.length>1&&!polygons.some(p=>JSON.stringify(p)===JSON.stringify(frame)))out.params.regions.push(frame);
 if(!out.params.guides?.length&&!out.params.compare)out.params.guides=structuredClone(polygons);
 const nativeParameterGeometry=certifySparseRequestedGeometry(task,out.params,domain,{polygons,positiveFingerprint:positive.fingerprint});
 out.sourceRegionLocalization={...out.sourceRegionLocalization,...(nativeParameterGeometry?{nativeParameterGeometry}:{}),sparseDefaults:{positiveFingerprint:positive.fingerprint,effectiveAcquisitions:polygons.length,polygonSearchDecomposition:partitioned},policy:'Verified positive acquisition ceiling intersections and comparison envelope; true negatives partition native RGB preparation only. Matching remains global.'};checkAbort(signal);return out;
}
