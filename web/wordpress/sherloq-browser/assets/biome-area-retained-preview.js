import {biomeAreaReferences,biomeAreaWorkingBytes,partitionBiomeAreas,nativeBiomeCoordinates} from './unified-engine/src/sparse-biome-area.js';
import {detectionBiomeHull} from './detection-biomes.js?v=0.30.0';
import {needsBiomeFormation,biomeFormationSelectionCounts,formCorrespondenceBiomes} from './unified-engine/src/sparse-biome-correspondence.js';

export function biomeAreaPreviewBytes({operation,view,output}={}){
 return ['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(operation)&&output?.data?.params?.algorithm!=='SSG'&&needsBiomeFormation(view)&&Array.isArray(output?.data?.groups)?biomeAreaWorkingBytes(output.data,{sourceRegionDomain:output.sourceRegionDomain},biomeFormationSelectionCounts(output.data,view)):0;
}
// Only the existing Native-qualified display groups are subdivided. This uses
// the engine's same geometry helper; traces retain the full parent rows.
export async function retainedBiomeAreaGroups({output,groups,view,width,height,signal}={}){
 if(output.data?.params?.algorithm==='SSG'||!needsBiomeFormation(view))return{groups,metadata:null};
 const data=output.data,bytes=biomeAreaPreviewBytes({operation:output.operation,view,output}),selected=groups.map(g=>({index:g.nativeGroupIndex,rows:g.pairIndexIds}));
 const references=biomeAreaReferences({width,height},data,{sourceRegionDomain:output.sourceRegionDomain,sourceRegionOrigin:output.sourceRegionOrigin});
 const partition=await formCorrespondenceBiomes(data,selected,view.maxBiomeArea??100,references,{view,signal,minimum:view.minimum??4,reserveMemory:n=>{if(n>bytes)throw Object.assign(Error('Biome preview exceeds its admitted workspace.'),{code:'PREVIEW_UNAVAILABLE'});}});
 const parents=new Map(groups.map(g=>[g.nativeGroupIndex,g]));
 return{metadata:partition.metadata,groups:partition.leaves.map(g=>{
  const polygons=g.hulls;
  return{...parents.get(g.index),id:'native-biome-'+g.index+'-area-'+g.subIndex,parentNativeGroupIndex:g.index,subIndex:g.subIndex,color:g.colorBgr?.slice().reverse()??parents.get(g.index).color,biomeAreaDerived:true,supportOnly:g.supportOnly,supportCentres:g.supportCentres,supportReason:g.reason,derivedModel:g.model,polygons,pairIndexIds:Array.from(g.rows)};
 })};
}
