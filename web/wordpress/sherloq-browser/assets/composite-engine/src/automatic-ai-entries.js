import {streamedD2prlRegions} from './d2prl-regions-stream.js';
import {requireValue,checkAbort} from './errors.js';import {createCloneEntryGeometry} from './clone-entry-geometry.js';
export async function forgeryscopeEntries(result,{budget,low=10,high=Infinity,maximumOverlap=.8,signal,wasmBinary}={}){
 requireValue(Number.isFinite(low)&&low>=0&&high>=low&&maximumOverlap>=0&&maximumOverlap<=1&&Array.isArray(result?.metadata?.zones),'Forgeryscope zones and display filters required');
 const geometry=await createCloneEntryGeometry({budget,signal,wasmBinary}),found=new Map();let complete=false;
 try{
  for(const [zoneIndex,zone]of result.metadata.zones.entries()){
   const origin=zone.origin??[0,0],matches=[...(zone.comparisons??[]).map((match,index)=>({match,index,branch:match.branch??'microscopy'})),...(zone.lane_pairs??[]).map((match,index)=>({match:{...match,accepted:true,supported:false},index,branch:'lanes'}))];
   for(const {match,index,branch}of matches){checkAbort(signal);const supported=!!match.supported;if(!(match.accepted??supported))continue;const title={microscopy:'Microscopy',blots:'Western blots',lanes:'Lanes'}[branch];requireValue(title,'Unknown Forgeryscope branch');
    const polygons=[0,1].map(i=>(match['display_polygon'+i]??match['polygon'+i]).map(([x,y])=>[x+origin[0],y+origin[1]])),owned=await geometry.entry('Forgeryscope Auto',polygons,supported?match.inliers??0:1,{zone:zoneIndex,comparison:index,score:match.score,branch,evidence:supported?'geometry':'similarity',accepted:true},{signal});
    if(!owned)continue;let kept=false;try{const {entry}=owned,{distance,overlap}=geometry.compare(entry.polygons);if(distance<low||distance>high||overlap>=maximumOverlap)continue;Object.assign(entry,{label:`Forgeryscope Auto · ${title} · ${supported?'Geometry':'Similarity'}`,center_distance_px:distance,search_context:'forgeryscope-zone:'+zoneIndex,...(!supported?{count_kind:'pairs'}:{})});found.get(entry.id)?.release();found.set(entry.id,owned);kept=true;}finally{if(!kept)owned.release();}
   }
  }
  complete=true;let released=false;return {entries:[...found.values()].map(x=>x.entry),release(){if(released)return;released=true;for(const value of found.values())value.release();}};
 }finally{geometry.dispose();if(!complete)for(const value of found.values())value.release();}
}
export async function d2prlEntries(result,{budget,minimum=result?.metadata?.min_component??500,refilter,signal,onProgress,wasmBinary,temporarySession,getTemporarySession}={}){
 requireValue(result&&Number.isInteger(minimum)&&minimum>=0&&minimum<=5000,'D2PRL result and component minimum required');
 let current=result,filtered,geometry,prepared;
 try{checkAbort(signal);if(minimum!==(result.metadata?.min_component??500)){requireValue(typeof refilter==='function','Refilter the retained native D2PRL grids before changing the region minimum');current=filtered=await refilter(minimum,{signal});requireValue(current?.metadata?.min_component===minimum&&current.width===result.width&&current.height===result.height,'D2PRL refilter minimum or source dimensions differ');}
  if(current.layout==='segmented')return prepared=await streamedD2prlRegions({...current,mask:current.stores?.mask,boxes:result.metadata?.boxes??[],minimum},{budget,signal,onProgress,temporarySession,getTemporarySession});
  geometry=await createCloneEntryGeometry({budget,maxPixels:current.width*current.height,signal,wasmBinary});return prepared=await geometry.regions({...current,boxes:result.metadata?.boxes??[],minimum},{signal,onProgress});
 }finally{try{geometry?.dispose();await filtered?.release?.();}catch(error){await prepared?.release?.();throw error;}}
}
