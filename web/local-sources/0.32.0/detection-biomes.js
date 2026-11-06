import {biomeSides,distinctCentres,roundEven} from './unified-engine/src/copy-geometry.js';
import {alignedParent} from './unified-engine/src/sparse-biome-area.js';
import {needsBiomeFormation,pairedBiomeMethod} from './unified-engine/src/sparse-biome-correspondence.js';
import {sparseCopyViewParams} from './unified-engine/src/sparse-copy-view.js';

const invalid=message=>Object.assign(new TypeError(message),{code:'DETECTION_BIOMES_INVALID'});
const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);
// Same integer pixel centres as Clone2 drawing. Collinear native contours keep
// their endpoints; they do not acquire an invented area or expanded rectangle.
export function detectionBiomeHull(side){
 const sorted=[...new Map(Array.from({length:side.length/2},(_,i)=>{const p=[roundEven(side[i*2]),roundEven(side[i*2+1])];if(!p.every(Number.isFinite))throw invalid('Native clone coordinates must be finite.');return [p.join(','),p];})).values()].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
 if(sorted.length<3)return sorted;const lower=[],upper=[];
 for(const p of sorted){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
 for(let i=sorted.length-1;i>=0;i--){const p=sorted[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
 lower.pop();upper.pop();return lower.concat(upper);
}

/** Extracts presentation geometry only from actual Clone2 groups. Native
 * selectedGroups/visible is the eligibility authority (including native overlap
 * rejection); optional style filters can narrow it, never invent new matches. */
export function detectionBiomes(output,{style=output?.style,nativeParentsOnly=false}={}){
 if(!output||output.status!=='ok'||!['tampering.copyMove.sparse','tampering.copyMove.dense'].includes(output.operation)||output.data?.params?.algorithm==='SSG'||output.data?.metadata?.algorithm==='SSG')return {identity:null,groups:[]};
 if(typeof output.id!=='string'||!output.id)throw invalid('A native result generation ID is required.');
 const data=output.data;if(!data||!Array.isArray(data.groups)||!((data.points instanceof Float32Array)||(data.points instanceof Float64Array))||data.points.length%7||!(data.pairs instanceof Float64Array)||data.pairs.length%4||!Array.isArray(data.bases))throw invalid('Native Clone2 group data is incomplete.');
 const view=sparseCopyViewParams(style??{}),selected=output.selectedGroups,visible=output.visible;
 if(selected!==undefined&&!Array.isArray(selected)||visible!==undefined&&!Array.isArray(visible))throw invalid('Native displayed-group metadata is invalid.');
 // A raw map or an unqualified all-groups array is not a rendered biome list.
 if(selected===undefined&&visible===undefined)return {identity:null,groups:[]};
 const qualified=new Map();
 if(selected!==undefined)for(const item of selected){if(!Number.isSafeInteger(item?.index)||item.index<0||item.index>=data.groups.length||qualified.has(item.index)||!(Array.isArray(item.rows)||ArrayBuffer.isView(item.rows)))throw invalid('Native selected groups are invalid.');qualified.set(item.index,Array.from(item.rows));}
 else for(const item of visible){if(!Array.isArray(item)||!Number.isSafeInteger(item[0])||item[0]<0||item[0]>=data.groups.length||qualified.has(item[0]))throw invalid('Native visible groups are invalid.');qualified.set(item[0],Array.from(data.groups[item[0]]));}
 const chosen=new Set(view.chosen),hidden=new Set(view.hidden),groups=[];
 for(const [index,rows]of qualified){
  if(hidden.has(index)||chosen.size&&!chosen.has(index))continue;const wantedRows=new Set(rows),members=new Set();for(const row of data.groups[index])if(wantedRows.has(row))members.add(row);
  if(rows.some(row=>!Number.isSafeInteger(row)||row<0||row>=data.pairs.length/4||!members.has(row))||new Set(rows).size!==rows.length)throw invalid('Selected pair rows do not belong to their native clone group.');
  const kept=rows.filter(row=>data.pairs[row*4+3]>=view.low&&data.pairs[row*4+3]<=view.high);if(kept.length<view.minimum)continue;
  const oriented=pairedBiomeMethod(view.biomeMethod)?alignedParent(data,index,kept):null,filteredSides=oriented?{a:oriented.a.flat(),b:oriented.b.flat()}:biomeSides(data.points,data.pairs,kept);if(Math.min(distinctCentres(filteredSides.a),distinctCentres(filteredSides.b))<view.minimum)continue;
  // The drawing ABI widens compact Float32 points to doubles. Borrow their
  // numeric coordinates without a second copy of the full feature array.
  const drawingPoints=data.points instanceof Float32Array?new Proxy({length:data.points.length},{get:(target,key)=>key==='length'?target.length:data.points[key]}):data.points,sides=oriented||drawingPoints===data.points?filteredSides:biomeSides(drawingPoints,data.pairs,kept);
  const color=Array.from(data.bases[index]??[]);if(color.length!==3||!color.every(c=>Number.isInteger(c)&&c>=0&&c<=255))throw invalid('Native biome color is invalid.');
  const polygons=[detectionBiomeHull(sides.a),detectionBiomeHull(sides.b)];if(polygons.some(p=>!p.length))throw invalid('A native biome side is empty.');
  groups.push({id:'native-biome-'+index,nativeGeometry:true,nativeGroupIndex:index,color:[color[2],color[1],color[0]],polygons,pairIndexIds:kept,coordinates:'original-pixel-centres',method:data.params?.algorithm??data.metadata?.algorithm??data.metadata?.profile??output.operation});
 }
 // A generation ID binds the native output. Do not stringify the entire pair
 // membership again merely to identify a presentation-only sidebar state.
 const identity=JSON.stringify([output.id,output.imageId??null,output.operation,output.provenance?.originalSha256??null,output.surface?.id??null,output.surface?.revision??null,output.provenance?.decode?.sourceSize??null,view.low,view.high,view.minimum,view.chosen,view.hidden,view.biomeMethod,view.maxBiomeArea]);
 const area=data.metadata?.presentation?.traceSelection?.biomeArea;
 const paired=['paired-local','paired-envelope'].includes(view.biomeMethod),areaMatches=paired?area?.schema==='sparse-biome-area/4'&&area.method===view.biomeMethod:area?.schema==='sparse-biome-area/3'&&view.biomeMethod==='compact'&&view.maxBiomeArea<100;
 if(!nativeParentsOnly&&needsBiomeFormation(view)&&!(areaMatches&&area.percent===view.maxBiomeArea))return{identity,groups:[],unavailable:'derived-biome-presentation-unavailable'};
 if(!nativeParentsOnly&&areaMatches&&area.percent===view.maxBiomeArea){
  if(area.derived!==true||!Array.isArray(area.partitions))throw invalid('Derived biome formation metadata is invalid.');
  const children=[];
  for(const parent of groups){
   const entries=area.partitions.filter(p=>p.parent===parent.nativeGroupIndex),expected=parent.pairIndexIds.slice().sort((a,b)=>a-b),actual=entries.flatMap(p=>p.rows??[]).sort((a,b)=>a-b);
   if(JSON.stringify(actual)!==JSON.stringify(expected))throw invalid('Derived biome occurrence ownership differs from its native parent.');
   const subIds=new Set(),originalModel=data.models?.[parent.nativeGroupIndex],positions=new Map(),wantedRows=new Set(parent.pairIndexIds);for(let k=0;k<data.groups[parent.nativeGroupIndex].length;k++){const row=data.groups[parent.nativeGroupIndex][k];if(wantedRows.has(row))positions.set(row,k);}
   for(const item of entries){
    if(!Number.isSafeInteger(item.subIndex)||item.subIndex<0||subIds.has(item.subIndex)||!Array.isArray(item.rows)||!item.rows.length||!Array.isArray(item.hulls)||item.hulls.length!==2||item.hulls.some(h=>!Array.isArray(h)||!h.length||h.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite)))||!Array.isArray(item.supportCentres)||item.supportCentres.length!==2||item.supportCentres.some(side=>!Array.isArray(side)||!side.length||side.some(p=>!Array.isArray(p)||p.length!==2||!p.every(Number.isSafeInteger)))||typeof item.supportOnly!=='boolean')throw invalid('Derived biome contours are invalid.');
    subIds.add(item.subIndex);
    if(item.derivedModel&&(item.modelSource!=='native-parent'||item.derivedModel.nativeParentGroupIndex!==item.parent||item.derivedModel.modelSource!=='native-parent'||item.derivedModel.independentlyRefitted!==false||JSON.stringify(item.derivedModel.matrix)!==JSON.stringify(data.models?.[item.parent]?.matrix)))throw invalid('Derived biome model provenance is invalid.');
    if(item.derivedModel){
     const source=originalModel?.source_point_indices,target=originalModel?.destination_point_indices,ids=item.derivedModel;
     if(!(Array.isArray(source)||ArrayBuffer.isView(source))||!(Array.isArray(target)||ArrayBuffer.isView(target))||source.length!==data.groups[parent.nativeGroupIndex].length||target.length!==data.groups[parent.nativeGroupIndex].length||!Array.isArray(ids.source_point_indices)||!Array.isArray(ids.destination_point_indices)||ids.source_point_indices.length!==item.rows.length||ids.destination_point_indices.length!==item.rows.length||item.rows.some((row,k)=>ids.source_point_indices[k]!==source[positions.get(row)]||ids.destination_point_indices[k]!==target[positions.get(row)]))throw invalid('Derived biome orientation differs from its fitted native parent.');
    }
    if(item.colorBgr!==undefined&&(!Array.isArray(item.colorBgr)||item.colorBgr.length!==3||!item.colorBgr.every(c=>Number.isInteger(c)&&c>=0&&c<=255)))throw invalid('Derived biome palette is invalid.');
    children.push({...parent,id:'native-biome-'+item.parent+'-area-'+item.subIndex,parentNativeGroupIndex:item.parent,subIndex:item.subIndex,color:item.colorBgr?.slice().reverse()??parent.color,biomeAreaDerived:true,supportOnly:item.supportOnly,supportCentres:item.supportCentres.map(side=>side.map(p=>[...p])),supportReason:item.supportReason,derivedModel:item.derivedModel,polygons:item.hulls.map(h=>h.map(p=>[...p])),pairIndexIds:item.rows.slice()});
   }
  }
  return{identity,groups:children};
 }
 return {identity,groups};
}
