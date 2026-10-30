import "../../runtime-context.js?v=0.30.0";
import {EngineError,checkAbort} from './errors.js';

const schema='sherloq.native-region-membership/1',hash=/^[a-f0-9]{64}$/;
const fail=message=>new EngineError('SOURCE_REGIONS_INVALID',message);
const rectangle=b=>[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
function rectangular(polygon){
 if(!Array.isArray(polygon))return false;
 const p=polygon.length===5&&polygon[0]?.[0]===polygon[4]?.[0]&&polygon[0]?.[1]===polygon[4]?.[1]?polygon.slice(0,4):polygon;
 if(p.length!==4||p.some(v=>!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite)))return false;
 const xs=new Set(p.map(v=>v[0])),ys=new Set(p.map(v=>v[1]));return xs.size===2&&ys.size===2&&new Set(p.map(v=>JSON.stringify(v))).size===4&&p.every((v,i)=>v[0]===p[(i+1)%4][0]||v[1]===p[(i+1)%4][1]);
}
function descriptorOf(domain){return domain?.descriptor??domain;}
/** This is a context contract, not a general mask adapter. Each level consists
 * solely of rectangular acquisitions. Explicit exclusions, including a hole
 * in the space between acquisitions, must use a separately qualified adapter. */
export function sourceRegionHasNativeAcquisitions(domain){
 let descriptor=descriptorOf(domain),levels=0;
 while(descriptor){
  if(++levels>64||descriptor.schema!=='sherloq.source-region-domain/1')return false;
  const s=descriptor.snapshot;if(!s||typeof s.enabled!=='boolean'||!Array.isArray(s.zones)||!['whole','selected'].includes(s.positiveMode))return false;
  if(s.enabled){
   if(s.zones.some(z=>z.enabled&&z.kind==='exclusion'))return false;
   if(s.positiveMode==='selected'){
    const positives=s.zones.filter(z=>z.enabled&&z.kind==='acquisition');
    if(!positives.length||positives.some(z=>!rectangular(z.polygon)))return false;
   }
  }
  descriptor=descriptor.ceiling;
 }
 return levels>0;
}
/** Candidate centres use the exact original pixel lattice: an original source
 * pixel x is admitted using the geometric centre x+.5, then neural resampling
 * addresses it at integer coordinate x. Never reinterpret a fractional edge. */
export function nativeSourceRegionMembership(domain){
 if(!sourceRegionHasNativeAcquisitions(domain)||!hash.test(domain?.fingerprint??'')||!Array.isArray(domain.origin))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','Native independent zones require rectangular acquisitions without any explicit source exclusion.');
 const levels=[];let d=descriptorOf(domain),count=0;
 while(d){const s=d.snapshot,polygons=!s.enabled||s.positiveMode==='whole'?[rectangle([0,0,s.width,s.height])]:s.zones.filter(z=>z.enabled&&z.kind==='acquisition').map(z=>z.polygon),rectangles=[];
  for(const p of polygons){
   const xs=p.map(v=>v[0]),ys=p.map(v=>v[1]),b=[Math.max(domain.origin[0],Math.ceil(Math.min(...xs)-.5-1e-9)),Math.max(domain.origin[1],Math.ceil(Math.min(...ys)-.5-1e-9)),Math.min(domain.origin[0]+domain.width,Math.floor(Math.max(...xs)-.5+1e-9)+1),Math.min(domain.origin[1]+domain.height,Math.floor(Math.max(...ys)-.5+1e-9)+1)];
   if(b[2]>b[0]&&b[3]>b[1]){if(++count>8192)throw new EngineError('SOURCE_SCOPE_METADATA_LIMIT','The native acquisition chain has too many rectangles.');rectangles.push(b.map((v,i)=>v-domain.origin[i%2]));}
  }
  if(!rectangles.length)throw new EngineError('SOURCE_SCOPE_EMPTY','A native acquisition ceiling contains no admitted pixels.');levels.push({rectangles});d=d.ceiling;
 }
 return{schema,coordinates:'source-region-native',domainFingerprint:domain.fingerprint,sourceSha256:domain.sourceSha256,width:domain.width,height:domain.height,levels};
}
export function compileNativeSourceRegionMembership(value,{width,height,sourceSha256}={}){
 if(value===undefined)return null;
 if(value?.schema!==schema||value.coordinates!=='source-region-native'||!hash.test(value.domainFingerprint??'')||value.sourceSha256!==sourceSha256||value.width!==width||value.height!==height||!Array.isArray(value.levels)||!value.levels.length||value.levels.length>64)throw fail('Invalid native acquisition candidate membership.');
 let count=0;for(const level of value.levels){if(!Array.isArray(level?.rectangles)||!level.rectangles.length)throw fail('A native acquisition level must contain rectangles.');for(const b of level.rectangles)if(++count>8192||!Array.isArray(b)||b.length!==4||!b.every(Number.isSafeInteger)||b[0]<0||b[1]<0||b[2]>width||b[3]>height||b[2]<=b[0]||b[3]<=b[1])throw fail('Native acquisition rectangles differ from the source grid.');}
 return{admits(x,y){const ix=Math.floor(x+.5),iy=Math.floor(y+.5);return Number.isFinite(x)&&Number.isFinite(y)&&ix>=0&&iy>=0&&ix<width&&iy<height&&value.levels.every(level=>level.rectangles.some(b=>ix>=b[0]&&iy>=b[1]&&ix<b[2]&&iy<b[3]));}};
}
export function nativeSourceRegionDefaultRegions(membership){
 let rectangles=membership.levels[0].rectangles;
 for(const level of membership.levels.slice(1)){
  const next=new Map();
  for(const a of rectangles)for(const b of level.rectangles){const intersection=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];if(intersection[2]<=intersection[0]||intersection[3]<=intersection[1])continue;next.set(intersection.join(','),intersection);if(next.size>8192)throw new EngineError('SOURCE_SCOPE_METADATA_LIMIT','The intersected native acquisition plan exceeds its bounded rectangle metadata; no fragment was discarded.');}
  rectangles=[...next.values()];
 }
 return rectangles.map((b,i)=>({id:'source-region-'+i,kind:'region',x0:b[0],y0:b[1],x1:b[2],y1:b[3],polygon:rectangle(b)}));
}
/** Complement is candidate geometry, never an RGB hole. Half-pixel boundaries
 * describe the exact excluded integer centres without dropping a neighbour at
 * a half-open rectangle's far edge. Work scales with rectangle events, not
 * image size, and never reads source pixels. */
export function nativeSourceRegionCandidateExclusions(membership){
 const rectangles=nativeSourceRegionDefaultRegions(membership).map(r=>[r.x0,r.y0,r.x1,r.y1]),ys=[...new Set([0,membership.height,...rectangles.flatMap(b=>[b[1],b[3]])])].sort((a,b)=>a-b),complete=[],active=new Map();
 for(let i=0;i+1<ys.length;i++){
  const y0=ys[i],y1=ys[i+1],xs=rectangles.filter(b=>b[1]<=y0&&b[3]>=y1).map(b=>[b[0],b[2]]).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),included=[];
  for(const [a,b]of xs){const prior=included.at(-1);if(prior&&a<=prior[1])prior[1]=Math.max(b,prior[1]);else included.push([a,b]);}
  const absent=[];let x=0;for(const [a,b]of included){if(a>x)absent.push([x,a]);x=Math.max(x,b);}if(x<membership.width)absent.push([x,membership.width]);
  const next=new Map();for(const [a,b]of absent){const key=a+','+b,prior=active.get(key);if(prior&&prior[3]===y0){prior[3]=y1;next.set(key,prior);active.delete(key);}else next.set(key,[a,y0,b,y1]);}for(const b of active.values())complete.push(b);active.clear();for(const [key,b]of next)active.set(key,b);
  if(complete.length+active.size>8192)throw new EngineError('SOURCE_SCOPE_METADATA_LIMIT','The native candidate complement exceeds its bounded polygon metadata; no pixels were silently admitted.');
 }
 complete.push(...active.values());return complete.map(b=>rectangle(b.map(v=>v-.5)));
}
export function nativeSourceRegionDefaultJobs(membership,{signal}={}){
 checkAbort(signal);const regions=nativeSourceRegionDefaultRegions(membership),jobs=regions.map(r=>({id:r.id,kind:'region',bounds:[r.x0,r.y0,r.x1,r.y1]}));
 // Only literal declared acquisitions are analysis jobs. A bounding frame
 // remains geometry and cannot silently add a neural analysis.
 if(jobs.length>256)throw new EngineError('SOURCE_REGION_NATIVE_ZONE_LIMIT','The native neural model accepts at most 256 declared jobs; no acquisition was silently discarded.',{details:{requestedJobs:jobs.length,maximum:256}});
 for(const zone of jobs)if(zone.bounds[2]-zone.bounds[0]<8||zone.bounds[3]-zone.bounds[1]<8)throw new EngineError('SOURCE_REGION_NATIVE_ZONE_MINIMUM','Every native neural acquisition must measure at least 8 by 8 pixels; no small acquisition was silently discarded.',{details:{zoneId:zone.id,bounds:zone.bounds,minimum:8}});
 return jobs;
}
