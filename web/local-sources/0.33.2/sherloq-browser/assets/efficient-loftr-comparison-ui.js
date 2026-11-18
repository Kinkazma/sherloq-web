const copy=value=>structuredClone(value),validPolygon=p=>Array.isArray(p)&&p.length>=3&&p.every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite));
// Original acquisitions carry edge polygons on a half-open pixel grid. Only
// their integer axis rectangles are converted here. Persisted native scientific
// polygons bypass this function; nonrectangular roles retain their polygon.
function polygon(r){
 const p=r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]],corners=new Set(p.map(([x,y])=>x+':'+y));
 if(r.kind==='acquisition'&&r.originalGeometry&&[r.x0,r.y0,r.x1,r.y1].every(Number.isSafeInteger)&&p.length===4&&corners.size===4&&[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]].every(([x,y])=>corners.has(x+':'+y)))return[[r.x0,r.y0],[r.x1-1,r.y0],[r.x1-1,r.y1-1],[r.x0,r.y1-1]];
 return p;
}
const bbox=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
export function efficientLoFtrDeclaredAcquisitions(rectangles=[]){return rectangles.filter(r=>r?.kind!=='exclusion').map(r=>({id:r.id??null,envelope:r.envelope===true||r.kind==='envelope',polygon:polygon(r),originalRole:r.kind==='acquisition'&&r.originalGeometry?{id:r.id,bounds:[r.x0,r.y0,r.x1,r.y1],polygon:copy(r.polygon),nativeRegion:copy(polygon(r))}:null})).filter(r=>validPolygon(r.polygon));}
function pair(value){if(!Array.isArray(value)||value.length!==2||!value.every(validPolygon))return null;if(JSON.stringify(bbox(value[0]))===JSON.stringify(bbox(value[1])))return null;return copy(value);}
/** Two scientific matcher roles, separate from the number/mode of analysis
 * windows. An incomplete explicit choice is never replaced by an inferred one.
 * The backend retains the final native crop/clamping validation. */
export function efficientLoFtrComparisonPair(settings,rectangles,choice){
 if(choice!==undefined&&choice!==null)return pair(choice.regions);
 const retained=pair(settings?.regions);if(retained)return retained;
 const legacy=efficientLoFtrDeclaredAcquisitions(rectangles).filter(r=>!r.envelope);return legacy.length===2?pair(legacy.map(r=>r.polygon)):null;
}
export function restoreEfficientLoFtrComparisonChoice(value){if(!value||typeof value!=='object'||!Array.isArray(value.regions)||value.regions.length!==2)return undefined;return{regions:value.regions.map(p=>validPolygon(p)?copy(p):null),...(Array.isArray(value.originalRoles)&&value.originalRoles.length===2?{originalRoles:copy(value.originalRoles)}:{})};}

export function efficientLoFtrComparisonGeometry(settings,rectangles,choice){
 let roles;if(choice!==undefined&&choice!==null){if(!pair(choice.regions))return undefined;roles=choice.originalRoles;}
 else{if(pair(settings?.regions))return undefined;const a=efficientLoFtrDeclaredAcquisitions(rectangles).filter(r=>!r.envelope);if(a.length!==2)return undefined;roles=a.map(r=>r.originalRole);}
 return Array.isArray(roles)&&roles.length===2&&roles.some(Boolean)?{roles:copy(roles)}:undefined;
}
