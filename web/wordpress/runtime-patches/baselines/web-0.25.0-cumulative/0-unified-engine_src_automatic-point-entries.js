import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {panels,polygonArea,signedDistance,roundEven,sourceLabel} from './clone-relations.js';
import {createCloneEntryGeometry} from './clone-entry-geometry.js';

// Packed equivalent of native pair_relations, preserving its rectangle fast
// path and float32 OpenCV query coordinates for non-rectangular panels.
async function relations(result,{signal}){
 const zones=panels(result.regions??[]).sort((a,b)=>polygonArea(a[1])-polygonArea(b[1])),points=result.points,pairs=result.pairs,n=points.length/7,count=pairs.length/4,members=new Uint8Array(n*zones.length),labels=new Int32Array(n).fill(-1),output=new Int32Array(count*2).fill(-1);
 for(let z=0;z<zones.length;z++){
  const poly=zones[z][1],xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys),rectangle=poly.length===4&&new Set(xs).size===2&&new Set(ys).size===2;
  for(let i=0;i<n;i++){if(i%4096===0)await controlCheckpoint(signal);const x=points[i*7],y=points[i*7+1];if(x>=x0&&x<=x1&&y>=y0&&y<=y1&&(rectangle||signedDistance(poly,[Math.fround(x),Math.fround(y)])>=0)){members[i*zones.length+z]=1;if(labels[i]===-1)labels[i]=z;}}
 }
 for(let i=0;i<count;i++){
  if(i%4096===0)await controlCheckpoint(signal);const a=pairs[i*4],b=pairs[i*4+1];requireValue(Number.isInteger(a)&&a>=0&&a<n&&Number.isInteger(b)&&b>=0&&b<n,'Invalid classical pair endpoint');let left=labels[a],right=labels[b];for(let z=0;z<zones.length;z++)if(members[a*zones.length+z]&&members[b*zones.length+z]){left=right=z;break;}
  left=left<0?-1:zones[left][0];right=right<0?-1:zones[right][0];output[i*2]=Math.min(left,right);output[i*2+1]=Math.max(left,right);
 }
 return output;
}
const nested=sides=>[sides.a,sides.b].map(a=>Array.from({length:a.length/2},(_,i)=>[a[i*2],a[i*2+1]]));
const distinct=a=>new Set(Array.from({length:a.length/2},(_,i)=>roundEven(a[i*2])+','+roundEven(a[i*2+1]))).size;

/** Native automatic_clones.point_entries over actual M3/M4 packed results.
 * geometry must supply M3's real pairedBiomes and biomeSides implementations. */
export async function automaticPointEntries(result,{budget,geometry,source=null,split=false,low=10,high=Infinity,maximumOverlap=.8,signal,wasmBinary}={}){
 const {points,pairs,groups,regions=[]}=result??{};
 requireValue((points instanceof Float32Array||points instanceof Float64Array)&&points.length%7===0&&pairs instanceof Float64Array&&pairs.length%4===0&&Array.isArray(groups)&&Array.isArray(regions)&&typeof geometry?.biomeSides==='function'&&(!split||typeof geometry.pairedBiomes==='function'),'Actual classical result and M3 geometry required');
 requireValue(Number.isFinite(low)&&low>=0&&high>=low&&Number.isFinite(maximumOverlap)&&maximumOverlap>=0&&maximumOverlap<=1,'Invalid classical display filters');
 const count=pairs.length/4,n=points.length/7;requireValue(!result.pair_search_regions||(result.pair_search_regions instanceof Int32Array&&result.pair_search_regions.length===count),'Invalid pair search owners');
 const maximum=groups.reduce((m,g)=>Math.max(m,g.length),0),workspace=budget.reserve(n*(regions.length+8)+count*512+regions.reduce((s,p)=>s+p.length*256,0)+8192),entries=[],leases=[];let kernel,complete=false;
 try{
  if(groups.length)kernel=await createCloneEntryGeometry({budget,maxVertices:Math.max(3,maximum*2),signal,wasmBinary});const pairRelations=groups.length?await relations(result,{signal}):null,contexts=regions.map(p=>kernel?.polygonKey(p)),tolerance=Array.isArray(result.params)?result.params[5]??50:result.params?.tolerance??result.geometry?.tolerance??50;
  for(let index=0;index<groups.length;index++){
   await controlCheckpoint(signal);const group=groups[index],model=result.models?.[index]??{},temporary=[],admit=bytes=>{const release=budget.reserve(bytes);temporary.push(release);return release;};
   try{
    requireValue((Array.isArray(group)||ArrayBuffer.isView(group))&&Array.from(group).every(i=>Number.isSafeInteger(i)&&i>=0&&i<count),'Invalid classical group');let parts=[group];
    if(split&&!model.source_panels?.length){admit(group.length*48);const subset=new Float64Array(group.length*4);for(let i=0;i<group.length;i++)subset.set(pairs.subarray(group[i]*4,group[i]*4+4),i*4);const components=await geometry.pairedBiomes(points,subset,tolerance,{signal,reserveMemory:admit});parts=components.map(rows=>Uint32Array.from(rows,i=>group[i]));}
    const name=source??result.group_algorithms?.[index];requireValue(typeof name==='string','Classical source provenance required');
    for(let partNumber=0;partNumber<parts.length;partNumber++){
     const partitions=new Map();for(const row of parts[partNumber]){const key=[result.pair_search_regions?.[row]??-2,pairRelations[row*2],pairRelations[row*2+1]],text=key.join(',');let item=partitions.get(text);if(!item){item={key,rows:[]};partitions.set(text,item);}item.rows.push(row);}
     const ordered=[...partitions.values()].sort((a,b)=>a.key[0]-b.key[0]||a.key[1]-b.key[1]||a.key[2]-b.key[2]);
     for(const {key,rows}of ordered){
      checkAbort(signal);const selected=rows.filter(i=>pairs[i*4+3]>=low&&pairs[i*4+3]<=high);if(selected.length<3)continue;
      const sides=geometry.biomeSides(points,pairs,selected);if(Math.min(distinct(sides.a),distinct(sides.b))<3)continue;const polygons=nested(sides),overlapLimit=result.self_match_filter?.maximum_overlap??maximumOverlap;
      if(kernel.compare(polygons).overlap>=overlapLimit)continue;
      const owner=key[0],origin=owner>=0&&owner<regions.length?regions[owner]:null,context=origin?'roi:'+contexts[owner]:owner===-1?'compare:'+contexts.join(':'):owner>=0?'whole-image':'unspecified';
      const provenance={group:index,part:partNumber,parts:parts.length,search_context:context,search_region:origin,search_region_index:owner,endpoint_region_indices:key.slice(1),...(result.biome_partitions?.length?{partition:result.biome_partitions[index]}:{})};
      const owned=await kernel.entry(name,polygons,selected.length,provenance,{signal});if(!owned)continue;let original,kept=false;
      try{
       original=selected.length===rows.length?null:await kernel.entry(name,nested(geometry.biomeSides(points,pairs,rows)),rows.length,provenance,{signal});if(selected.length!==rows.length&&!original)continue;
       if(kernel.compare(owned.entry.polygons).overlap>=maximumOverlap)continue;
       const identity=original?.entry??owned.entry;Object.assign(owned.entry,{id:identity.id,color:source&&result.bases?.length?Array.from(result.bases[index]):identity.color.slice(),search_context:context,label:sourceLabel(name)});entries.push(owned.entry);leases.push(owned.release);kept=true;
      }finally{original?.release();if(!kept)owned.release();}
     }
    }
   }finally{for(const release of temporary)release();}
  }
  checkAbort(signal);complete=true;let released=false;return {entries,release(){if(released)return;released=true;for(const release of leases)release();}};
 }finally{kernel?.dispose();workspace();if(!complete)for(const release of leases)release();}
}
