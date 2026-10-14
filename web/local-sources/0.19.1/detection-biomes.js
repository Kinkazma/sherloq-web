import {biomeSides,distinctCentres,roundEven} from './unified-engine/src/copy-geometry.js';
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
export function detectionBiomes(output,{style=output?.style}={}){
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
  if(hidden.has(index)||chosen.size&&!chosen.has(index))continue;const members=new Set(Array.from(data.groups[index]));
  if(rows.some(row=>!Number.isSafeInteger(row)||row<0||row>=data.pairs.length/4||!members.has(row))||new Set(rows).size!==rows.length)throw invalid('Selected pair rows do not belong to their native clone group.');
  const kept=rows.filter(row=>data.pairs[row*4+3]>=view.low&&data.pairs[row*4+3]<=view.high);if(kept.length<view.minimum)continue;
  const filteredSides=biomeSides(data.points,data.pairs,kept);if(Math.min(distinctCentres(filteredSides.a),distinctCentres(filteredSides.b))<view.minimum)continue;
  // The drawing ABI widens compact Float32 points to doubles. Borrow their
  // numeric coordinates without a second copy of the full feature array.
  const drawingPoints=data.points instanceof Float32Array?new Proxy({length:data.points.length},{get:(target,key)=>key==='length'?target.length:data.points[key]}):data.points,sides=drawingPoints===data.points?filteredSides:biomeSides(drawingPoints,data.pairs,kept);
  const color=Array.from(data.bases[index]??[]);if(color.length!==3||!color.every(c=>Number.isInteger(c)&&c>=0&&c<=255))throw invalid('Native biome color is invalid.');
  const polygons=[detectionBiomeHull(sides.a),detectionBiomeHull(sides.b)];if(polygons.some(p=>!p.length))throw invalid('A native biome side is empty.');
  groups.push({id:'native-biome-'+index,nativeGeometry:true,nativeGroupIndex:index,color:[color[2],color[1],color[0]],polygons,pairIndexIds:kept,coordinates:'original-pixel-centres',method:data.params?.algorithm??data.metadata?.algorithm??data.metadata?.profile??output.operation});
 }
 // A generation ID binds the native output. Do not stringify the entire pair
 // membership again merely to identify a presentation-only sidebar state.
 const identity=JSON.stringify([output.id,output.imageId??null,output.operation,output.provenance?.originalSha256??null,output.surface?.id??null,output.surface?.revision??null,output.provenance?.decode?.sourceSize??null,view.low,view.high,view.minimum,view.chosen,view.hidden]);
 return {identity,groups};
}
