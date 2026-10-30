import "../../runtime-context.js?v=0.30.0";
import {requireValue} from './errors.js';

// This specific historical bridge appended one computed frame without its
// derived marker. Recognize its exact construction without rewriting persisted
// scientific geometry or its fingerprint. Explicit/named windows stay literal.
function historicalOriginalFrame(scope,r){
 const regions=scope.regions,searches=scope.searchRegions,keys=['x0','y0','x1','y1'];
 if(scope.version!=='original-source-regions-batch-1'||r.envelope!==true||r.role!=='cross-panel-search'||r.derived!==undefined||r.manual===true||r.explicit===true||r.id!==undefined||r.zoneId!==undefined||!Array.isArray(regions)||regions.length<2||!Array.isArray(searches)||searches.length!==regions.length+1||searches.at(-1)!==r)return false;
 if(regions.some((region,i)=>JSON.stringify(region)!==JSON.stringify(searches[i])))return false;
 const rect=scope.sourceRegionDomain?.rect,b=keys.map(k=>r[k]);
 if(!rect||b.some((v,i)=>!Number.isFinite(v)||v!==rect[keys[i]])||!Number.isSafeInteger(scope.width)||!Number.isSafeInteger(scope.height)||b[0]<0||b[1]<0||b[2]>scope.width||b[3]>scope.height||b[0]>=b[2]||b[1]>=b[3])return false;
 if(regions.some(region=>keys.some(k=>!Number.isFinite(region[k]))))return false;
 const bounds=[Math.min(...regions.map(v=>v.x0)),Math.min(...regions.map(v=>v.y0)),Math.max(...regions.map(v=>v.x1)),Math.max(...regions.map(v=>v.y1))];
 if(b.some((v,i)=>v!==bounds[i]))return false;
 const polygon=[[b[0],b[1]],[b[2],b[1]],[b[2],b[3]],[b[0],b[3]]];
 return JSON.stringify(r.polygon)===JSON.stringify(polygon);
}

/** Select declared analysis windows before UI transport removes their metadata.
 * A derived bounding frame describes geometry; it is not another acquisition.
 * Automatic preparation may explicitly request that frame as a search window.
 * Direct task.regions remains authoritative in the canonical window planner.
 */
export function declaredCloneScopeRegions(scope){
 const regions=scope.individual?.includeEnvelope===false?scope.regions:scope.searchRegions??scope.regions;
 requireValue(Array.isArray(regions),'Scientific clone windows must be an array.');
 return regions.filter(r=>(r.envelope!==true&&r.kind!=='envelope')||(r.derived!==true&&!historicalOriginalFrame(scope,r))||r.manual===true||r.explicit===true||scope.individual?.includeEnvelope===true);
}
