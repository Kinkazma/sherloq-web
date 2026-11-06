import {minimumEnclosingBiomeDisk} from './sparse-biome-disk.js';
import {requireValue,checkAbort,createCooperator} from './errors.js';
import {roundEven,geometricErrors,median} from './copy-geometry.js';
import {sourceRegionPixelEnvelope} from './source-region-geometry.js';

const rectangle=([x0,y0,x1,y1])=>[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
function boundsArea(bounds){requireValue(Array.isArray(bounds)&&bounds.length===4&&bounds.every(Number.isFinite)&&bounds[2]>bounds[0]&&bounds[3]>bounds[1],'Biome area requires its analyzed window bounds.');return(Math.ceil(bounds[2])-Math.floor(bounds[0]))*(Math.ceil(bounds[3])-Math.floor(bounds[1]));}
function domainCeilings(domain,width,height){
 const ceilings=[];
 for(let d=domain;d;d=d.ceiling){const s=d.snapshot;if(!s?.enabled)continue;const active=s.zones.filter(z=>z.enabled),positive=active.filter(z=>z.kind==='acquisition');ceilings.push({polygons:s.positiveMode==='whole'||!positive.length?[rectangle([0,0,width,height])]:positive.map(z=>z.polygon),exclusions:active.filter(z=>z.kind==='exclusion').map(z=>z.polygon)});}
 return ceilings;
}
export function biomeAreaMetadataBytes(result,counts){
 const rows=counts?.rows??result.groups.reduce((n,g)=>n+g.length,0),groups=counts?.groups??result.groups.length,bytes=rows*4096+groups*8192+32768;
 requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Biome area metadata exceeds safe admission.');return bytes;
}
export function biomeAreaWorkingBytes(result,analysisImage,counts){
 const rows=counts?.rows??result.groups.reduce((n,g)=>n+g.length,0),groups=counts?.groups??result.groups.length;let vertices=0;
 for(const list of [result.params?.regions??[],result.params?.excluded??[],...(result.windowResults??[]).map(w=>w.polygon?.length?[w.polygon]:[])])for(const poly of list)vertices+=poly.length;
 for(let d=analysisImage?.sourceRegionDomain;d;d=d.ceiling)for(const z of d.snapshot?.zones??[])vertices+=z.polygon?.length??0;
 const bytes=rows*8192+groups*4096+vertices*128+(result.windowResults?.length??0)*2048+32768;
 requireValue(Number.isSafeInteger(bytes)&&bytes>=0,'Biome area workspace exceeds safe admission.');return bytes;
}
/** Geometry references only. No pixels, feature extraction or matcher calls. */
export function biomeAreaReferences(image,result,analysisImage=image){
 const metadata=result.metadata?.cloneAnalysisWindows,windows=result.windowResults??[],ranges=metadata?.ranges??[];
 if(result.cloneWindowMode==='independent'&&ranges.length){
  const byId=new Map(windows.map(w=>[w.id,w]));const refs=new Array(result.groups.length);
  for(const r of ranges){if(r.groupRows[0]===r.groupRows[1])continue;const w=byId.get(r.id);requireValue(w&&w.status==='complete','Biome area window ownership is unavailable.');const boundsPixels=boundsArea(w.bounds),domain=analysisImage?.sourceRegionDomain,source=domain?.snapshot,width=source?.width??image.width,height=source?.height??image.height,area=w.analyzedPixelCount??sourceRegionPixelEnvelope({width,height,polygons:w.polygon?.length>=3?[w.polygon]:[rectangle(w.bounds)],ceilings:domainCeilings(domain,width,height)}).countIncluded;requireValue(Number.isSafeInteger(area)&&area>0&&area<=boundsPixels,'Invalid admitted native window area.');const reference={area,kind:w.analyzedPixelCount!==undefined?'independent-native-context-admitted-pixels':'reconstructed-admitted-window-pixels',windowId:w.id,bounds:[...w.bounds]};for(let i=r.groupRows[0];i<r.groupRows[1];i++){requireValue(i>=0&&i<refs.length&&!refs[i],'Biome area window groups overlap.');refs[i]=reference;}}
  requireValue(Array.from(refs).every(Boolean),'A biome has no analyzed window area.');return refs;
 }
 if(result.cloneWindowMode==='global'&&result.globalResult?.analyzedPixelCount!==undefined){const w=result.globalResult,area=w.analyzedPixelCount;requireValue(Number.isSafeInteger(area)&&area>0&&area<=boundsArea(w.bounds),'Invalid admitted joint native area.');return result.groups.map(()=>({area,kind:'global-native-context-union-admitted-pixels',windowId:w.id,bounds:[...w.bounds],origin:[...w.origin]}));}
 const domain=analysisImage?.sourceRegionDomain,source=domain?.snapshot,width=source?.width??image.width,height=source?.height??image.height;
 requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0,'Biome area source dimensions are unavailable.');
 const p=result.params??{},regions=p.regions??result.regions??[],excluded=p.excluded??[],whole=rectangle([0,0,width,height]);
 let area,kind;
 if(!regions.length&&domain&&Number.isSafeInteger(domain.countIncluded)){area=domain.countIncluded;kind='source-region-admitted-pixels';}
 else{area=sourceRegionPixelEnvelope({width,height,polygons:regions.length?regions:[whole],exclusions:excluded,ceilings:domainCeilings(domain,width,height)}).countIncluded;kind=regions.length?'analyzed-zone-union-pixels':'whole-image-pixels';}
 requireValue(Number.isFinite(area)&&area>0,'Biome area reference is empty.');
 const reference={area,kind,...(domain?.fingerprint?{domainFingerprint:domain.fingerprint}:{}),origin:[...(metadata?.presentationOrigin??analysisImage?.sourceRegionOrigin??[0,0])]};return result.groups.map(()=>reference);
}
// Match copy_draw_group: widen compact points to doubles, orient against the
// first retained row, then cvRound each coordinate before constructing a hull.
export function nativeBiomeCoordinates(points,pairs,rows){
 const a=[],b=[];for(const row of rows){const i=pairs[row*4],j=pairs[row*4+1];requireValue(Number.isSafeInteger(row)&&row>=0&&row<pairs.length/4&&Number.isSafeInteger(i)&&i>=0&&i<points.length/7&&Number.isSafeInteger(j)&&j>=0&&j<points.length/7,'Biome area row escapes its native table.');const x=[points[i*7],points[i*7+1]],y=[points[j*7],points[j*7+1]];requireValue([...x,...y].every(Number.isFinite),'Biome area endpoints must be finite.');a.push(x);b.push(y);}
 if(rows.length){const ref=a[0],other=b[0],norm=(a,b)=>Math.sqrt((a[0]-b[0])**2+(a[1]-b[1])**2);for(let i=0;i<rows.length;i++)if(norm(a[i],ref)+norm(b[i],other)>norm(a[i],other)+norm(b[i],ref))[a[i],b[i]]=[b[i],a[i]];}
 return{a,b};
}
export function nativeBiomeHullArea(coordinates){
 const values=coordinates.map(p=>p.map(roundEven)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),unique=values.filter((p,i)=>!i||p[0]!==values[i-1][0]||p[1]!==values[i-1][1]);if(unique.length<3)return 0;
 const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lower=[],upper=[];
 for(const p of unique){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(let i=unique.length-1;i>=0;i--){const p=unique[i];while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}const hull=lower.slice(0,-1).concat(upper.slice(0,-1));let twice=0;for(let i=1;i+1<hull.length;i++)twice+=cross(hull[0],hull[i],hull[i+1]);return Math.abs(twice)/2;
}
/** Exact rounded convex support used for both admission and Native drawing. */
export function nativeBiomeHull(coordinates){
 const values=coordinates.map(p=>p.map(roundEven)).sort((a,b)=>a[0]-b[0]||a[1]-b[1]),unique=values.filter((p,i)=>!i||p[0]!==values[i-1][0]||p[1]!==values[i-1][1]);if(unique.length<3)return unique;
 const cross=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]),lower=[],upper=[];
 for(const p of unique){while(lower.length>=2&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}for(let i=unique.length-1;i>=0;i--){const p=unique[i];while(upper.length>=2&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function polygonArea(poly){let twice=0;for(let i=1;i+1<poly.length;i++)twice+=(poly[i][0]-poly[0][0])*(poly[i+1][1]-poly[0][1])-(poly[i][1]-poly[0][1])*(poly[i+1][0]-poly[0][0]);return Math.abs(twice)/2;}
/** Convex clipping, only on integer Native hulls; no image samples. */
export function hullOverlap(a,b){
 const small=Math.min(polygonArea(a),polygonArea(b));if(!small)return 0;let output=a;
 const cross=(u,v,p)=>(v[0]-u[0])*(p[1]-u[1])-(v[1]-u[1])*(p[0]-u[0]);
 for(let i=0;i<b.length&&output.length;i++){
  const u=b[i],v=b[(i+1)%b.length],input=output;output=[];let previous=input.at(-1),pdist=cross(u,v,previous);
  for(const current of input){const dist=cross(u,v,current);if((dist>=0)!==(pdist>=0)){const t=pdist/(pdist-dist);output.push([previous[0]+t*(current[0]-previous[0]),previous[1]+t*(current[1]-previous[1])]);}if(dist>=0)output.push(current);previous=current;pdist=dist;}
 }
 return Math.max(0,Math.min(1,polygonArea(output)/small));
}
export function alignedParent(result,index,rows){
 const parent=result.groups[index],model=result.models?.[index],a=[],b=[],pointIds=[[],[]],wanted=new Set(rows),positions=new Map();
 // Borrow the parent table while scanning; only selected row positions are
 // materialised, so a filtered4-row frame does not allocate a100k-row Map.
 for(let k=0;k<parent.length;k++)if(wanted.has(parent[k]))positions.set(parent[k],k);
 requireValue(positions.size===wanted.size,'Biome row is outside its parent.');
 if(model){
  const source=model.source_point_indices,target=model.destination_point_indices;
  requireValue((Array.isArray(source)||ArrayBuffer.isView(source))&&(Array.isArray(target)||ArrayBuffer.isView(target))&&source.length===parent.length&&target.length===parent.length,'Biome model does not align with its native parent.');
  for(const row of rows){const k=positions.get(row),s=source[k],t=target[k],p=result.pairs[row*4],q=result.pairs[row*4+1];requireValue(k!==undefined&&((s===p&&t===q)||(s===q&&t===p)),'Biome fitted orientation escapes its native pair.');a.push([result.points[s*7],result.points[s*7+1]]);b.push([result.points[t*7],result.points[t*7+1]]);pointIds[0].push(s);pointIds[1].push(t);}
  requireValue([...a,...b].every(p=>p.every(Number.isFinite)),'Biome fitted endpoint is nonfinite.');return{a,b,pointIds,model,orientation:'native-parent-fitted-point-indices'};
 }
 // The Native unfitted rule needs only the first parent row as its orientation
 // reference, not coordinates for every excluded occurrence.
 const sides=rows.length?nativeBiomeCoordinates(result.points,result.pairs,[parent[0],...rows]):{a:[],b:[]};
 for(let i=0;i<rows.length;i++){const row=rows[i],x=sides.a[i+1],y=sides.b[i+1];a.push(x);b.push(y);const s=result.pairs[row*4],t=result.pairs[row*4+1],normal=result.points[s*7]===x[0]&&result.points[s*7+1]===x[1];pointIds[0].push(normal?s:t);pointIds[1].push(normal?t:s);}
 return{a,b,pointIds,model:null,orientation:'native-parent-drawing-unfitted'};
}
function inheritedModel(model,ids,pointIds,rows,a,b,index){
 if(!model)return null;const errors=geometricErrors(Float64Array.from(ids.flatMap(i=>a[i])),Float64Array.from(ids.flatMap(i=>b[i])),model.matrix.flat()),distinct=[a,b].map(side=>new Set(ids.map(i=>side[i].map(roundEven).join(','))).size);return{...model,parentMedianErrorPx:model.median_error_px,parentMaximumErrorPx:model.maximum_error_px,median_error_px:median(errors),maximum_error_px:errors.reduce((x,y)=>Math.max(x,y),0),distinct_centres:distinct,nativeParentGroupIndex:index,source_point_indices:ids.map(k=>pointIds[0][k]),destination_point_indices:ids.map(k=>pointIds[1][k]),inliers:ids.length,derived:true,modelSource:'native-parent',independentlyRefitted:false,pair_indices:ids.map(k=>rows[k])};
}
/** Re-form Native validated correspondences. Spatial/area constraints act while
 * growing viable nuclei, before display; unassigned evidence is never erased. */
export async function partitionBiomeAreas(result,groups,percent,references,{signal,reserveMemory,minimum=4,observedHullsOnly=false,hardProximity=false,forceDerived=false,orientedFrame,reportDerivedRadius=true}={}){
 requireValue(Number.isInteger(percent)&&percent>=1&&percent<=100,'Invalid maximum biome area percentage.');if(percent===100&&!forceDerived)return null;
 requireValue(typeof reserveMemory==='function'&&Array.isArray(references)&&references.length===result.groups.length,'Biome area requires shared admission and one reference per native group.');
 const count=groups.reduce((n,g)=>n+g.rows.length,0);reserveMemory(count*8192+groups.length*4096+8192);checkAbort(signal);const cooperate=createCooperator(signal),leaves=[],summary=[];
 const tolerance=result.params?.tolerance??50;requireValue(Number.isFinite(tolerance)&&tolerance>=0,'Biome formation requires its native proximity tolerance.');
 requireValue(Number.isSafeInteger(minimum)&&minimum>=0,'Invalid derived biome support minimum.');
 const supportMinimum=Math.max(3,minimum),maxOverlap=result.self_match_filter?.maximum_overlap??result.mirror_policy?.maximum_overlap??null;
 for(const group of groups){
  await cooperate();const rows=Array.from(group.rows),reference=references[group.index],maximum=reference.area*percent/100;requireValue(Number.isFinite(maximum)&&maximum>0,'Invalid maximum biome surface.');
  const frame=orientedFrame??alignedParent(result,group.index,rows),{a,b}=frame,n=rows.length,remaining=new Set(Array.from({length:n},(_,k)=>k)),formed=[];
  const distance=(i,j)=>{const r=result.points instanceof Float32Array?Math.fround:x=>x,norm=(p,q)=>{const x=r(p[0]-q[0]),y=r(p[1]-q[1]);return r(Math.sqrt(r(r(x*x)+r(y*y))));},da=norm(a[i],a[j]),db=norm(b[i],b[j]);return Math.max(da,db);};
  const shape=ids=>{const coordinates=[ids.map(i=>a[i]),ids.map(i=>b[i])],hulls=coordinates.map(nativeBiomeHull),disks=observedHullsOnly?[]:hulls.map(minimumEnclosingBiomeDisk),areas=hulls.map(polygonArea),distinct=coordinates.map(side=>new Set(side.map(([x,y])=>roundEven(x)+','+roundEven(y))).size),overlap=hullOverlap(...hulls);let displacement=null;
   if(frame.model){const m=frame.model.matrix.flat(),values=ids.map(i=>{const [x,y]=a[i],w=x*m[6]+y*m[7]+m[8];return Math.hypot((x*m[0]+y*m[1]+m[2])/w-x,(x*m[3]+y*m[4]+m[5])/w-y);}).sort((x,y)=>x-y);displacement=values.length%2?values[values.length>>>1]:(values[values.length/2-1]+values[values.length/2])/2;}
   const nearIdentity=frame.model&&maxOverlap!==null&&displacement+1e-6<(result.params?.minimum??0),overlapping=maxOverlap!==null&&overlap>=maxOverlap;
   return{hulls,disks,areas,distinct,overlap,displacement,nearIdentity,overlapping,areaFits:Math.max(...areas)<=maximum&&disks.every(d=>d.area<=maximum),hasSurface:areas.every(x=>x>0)&&hulls.every(h=>h.length>=3)};
  };
  // Order growth by Native paired-endpoint proximity. The accepted parent
  // already validates these matches under one model: the child radius may
  // expand beyond the original candidate radius, but never cross parent/model
  // or window boundaries. Each new point is tested against BOTH
  // current hulls before admission. A valid nucleus stops at its support goal,
  // allowing the next nucleus to form instead of absorbing all nearby rows.
  const grow=async(seed,pool,need)=>{
   const ids=[seed],used=new Set(ids),dist=new Float64Array(n).fill(Infinity);for(const j of pool)dist[j]=distance(seed,j);
   while(ids.length<pool.size){
    const candidates=Array.from(pool).filter(j=>!used.has(j)&&Number.isFinite(dist[j])&&(!hardProximity&&frame.model||dist[j]<=tolerance)).sort((i,j)=>dist[i]-dist[j]||rows[i]-rows[j]||i-j);let next=-1;
    for(const j of candidates){const s=shape([...ids,j]);if(s.areaFits&&!s.overlapping&&!s.nearIdentity){next=j;break;}}
    if(next<0)break;ids.push(next);used.add(next);for(const j of pool)if(!used.has(j))dist[j]=Math.min(dist[j],distance(next,j));
    const s=shape(ids);if(Math.min(...s.distinct)>=need&&s.hasSurface)return ids;await cooperate();
   }
   return ids;
  };
  const whole=shape(Array.from(remaining));
  if(whole.areaFits&&!whole.overlapping&&!whole.nearIdentity){formed.push(Array.from(remaining));remaining.clear();}
  else{
   // Native support is counted on distinct cvRound centres, not scale rows.
   // Failed nuclei leave their rows available for a different seed and later
   // reassignment; they do not become hidden display leaves.
   for(const need of supportMinimum>3?[supportMinimum,3]:[3]){
    let progress=true;while(progress&&remaining.size>=need){progress=false;
     const seeds=Array.from(remaining),density=new Map(seeds.map(i=>[i,0]));for(let i=0;i<seeds.length;i++){for(let j=i+1;j<seeds.length;j++)if(distance(seeds[i],seeds[j])<=tolerance){density.set(seeds[i],density.get(seeds[i])+1);density.set(seeds[j],density.get(seeds[j])+1);}if(i%64===0)await cooperate();}
     seeds.sort((i,j)=>density.get(j)-density.get(i)||rows[i]-rows[j]||i-j);
     for(const seed of seeds){const ids=await grow(seed,remaining,need),s=shape(ids);if(Math.min(...s.distinct)<need||!s.hasSurface)continue;formed.push(ids);for(const i of ids)remaining.delete(i);progress=true;break;}
    }
   }
   // Residuals first get another chance against already viable nuclei, under
   // exactly the same area, topology and Native self-copy constraints.
   let changed=true;while(changed&&remaining.size){changed=false;for(const i of [...remaining]){
    const options=formed.map((ids,k)=>({k,edge:ids.reduce((best,j)=>Math.min(best,distance(i,j)),Infinity)})).filter(o=>Number.isFinite(o.edge)&&(!hardProximity&&frame.model||o.edge<=tolerance)).sort((x,y)=>x.edge-y.edge||x.k-y.k);
    for(const {k}of options){const s=shape([...formed[k],i]);if(s.areaFits&&!s.overlapping&&!s.nearIdentity){formed[k].push(i);remaining.delete(i);changed=true;break;}}await cooperate();
   }}
   // Irreducible evidence remains explicit. It is shown as its actual contour,
   // segment or point even in Biomes-only mode, never a fabricated positive area.
   while(remaining.size){const ids=await grow(remaining.values().next().value,remaining,Infinity);formed.push(ids);for(const i of ids)remaining.delete(i);}
  }
  formed.sort((x,y)=>x.reduce((m,i)=>Math.min(m,i),Infinity)-y.reduce((m,i)=>Math.min(m,i),Infinity));let subIndex=0;
  for(const rawIds of formed){const ids=rawIds.sort((i,j)=>i-j),s=shape(ids),model=inheritedModel(frame.model,ids,frame.pointIds,rows,a,b,group.index),reason=s.nearIdentity?'near-identity-subset':s.overlapping?'overlapping-subset':!s.hasSurface?'insufficient-two-dimensional-support':Math.min(...s.distinct)<supportMinimum?'inherited-model-below-preferred-nucleus-support':null;
   const leaf={index:group.index,subIndex:subIndex++,rows:Uint32Array.from(ids,i=>rows[i]),areas:s.areas,distinctCentres:s.distinct,hullVisible:true,belowPreferredMinimum:Math.min(...s.distinct)<supportMinimum,hulls:s.hulls,disks:s.disks,supportCentres:[a,b].map(side=>[...new Map(ids.map(i=>{const p=side[i].map(roundEven);return[p.join(','),p];})).values()]),maximumArea:maximum,reference,model,orientation:frame.orientation,supportOnly:!s.hasSurface||s.nearIdentity||s.overlapping,reason};leaves.push(leaf);
   summary.push({parent:leaf.index,subIndex:leaf.subIndex,rows:Array.from(leaf.rows),hulls:s.hulls.map(h=>h.map(p=>[...p])),disks:s.disks,supportCentres:leaf.supportCentres.map(side=>side.map(p=>[...p])),areaSides:s.areas,distinctCentres:s.distinct,hullVisible:true,belowPreferredMinimum:leaf.belowPreferredMinimum,geometryKind:s.hulls.map(h=>h.length>=3?'polygon':h.length===2?'segment':'point'),supportOnly:leaf.supportOnly,supportReason:reason,derivedProximityRadius:reportDerivedRadius?ids.reduce((longest,i,k)=>k?Math.max(longest,ids.slice(0,k).reduce((nearest,j)=>Math.min(nearest,distance(i,j)),Infinity)):longest,0):null,...(!reportDerivedRadius?{derivedProximityRadiusStatus:'not-computed-diagnostic'}:{}),nativeCandidateTolerance:tolerance,overlapFraction:s.overlap,modelMedianDisplacementPx:s.displacement,modelSource:frame.model?'native-parent':'none-unfitted',independentlyRefitted:false,orientation:frame.orientation,maximumArea:maximum,reference:{...reference,...(reference.bounds?{bounds:[...reference.bounds]}:{})},derivedModel:model});
  }
 }
 checkAbort(signal);return{leaves,metadata:{schema:'sparse-biome-area/3',percent,metric:'rounded-convex-hull-and-smallest-enclosing-disk-area-of-each-model-aligned-side',reference:'admitted analyzed zone; independent windows retain separate native contexts',appliesTo:'derived Native correspondence grouping; raw matches and localization masks unchanged',formation:'native-paired-endpoint-proximity-order; adaptive-radius area-admitted support nuclei, residual reassignment and explicit degenerate support',nativeGroupsUnchanged:true,nativePairsUnchanged:true,nativeModelsUnchanged:true,derived:true,independentlyRefitted:false,tolerance,supportMinimum,preferredNucleusMinimum:supportMinimum,effectiveInheritedSurfaceMinimum:3,locality:{metric:'smallest-enclosing-disk-area',perParentReference:true,predicates:'exact-rational-on-rounded-native-centres',extent:'diameter <= 2*sqrt(maximumArea/PI); the same admitted-area reference per parent',degenerateSupport:'distinct centres only; no connecting segment'},parentGroups:groups.length,displaySubBiomes:leaves.length,coveredPairOccurrences:count,supportOnlyGroups:leaves.filter(g=>g.supportOnly).length,partitions:summary}};
}
