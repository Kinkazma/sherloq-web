import{adaptiveIdentity}from'./unified-engine/src/adaptive-runtime.js';
const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min;
// The domain was already compiled/admitted for this job. This reads only its
// bounded geometry metadata, never rows, pixels, cores or a second compilation.
function geometry(value,seen=new Set(),depth=0){
 if(!value)return null;if(depth>6||seen.has(value)||value.schema!=='sherloq.source-region-domain/1')throw Error('Unknown cost geometry');seen.add(value);
 try{const s=value.snapshot,w=s?.width,h=s?.height,r=value.rect;if(s?.schema!=='sherloq.source-regions/1'||!integer(w,1)||!integer(h,1)||!r||!['x0','x1','y0','y1'].every(k=>integer(r[k]))||r.x1<=r.x0||r.y1<=r.y0||r.x1>w||r.y1>h||!integer(value.countIncluded,1)||value.countIncluded>w*h||!Array.isArray(s.zones)||s.zones.length>512)throw Error('Incomplete cost geometry');
 const zones=[];let points=0;if(s.enabled)for(const z of s.zones){if(!z.enabled||z.kind==='acquisition'&&s.positiveMode==='whole')continue;if(!['acquisition','exclusion'].includes(z.kind)||!Array.isArray(z.polygon)||z.polygon.length<3||(points+=z.polygon.length)>4096||!z.polygon.every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite)))throw Error('Unknown polygon metadata');zones.push({kind:z.kind,polygon:z.polygon});}
 return{grid:[w,h],envelope:[r.x0,r.y0,r.x1,r.y1],included:value.countIncluded,enabled:s.enabled,positiveMode:s.positiveMode,zones,ceiling:geometry(value.ceiling,seen,depth+1)};
 }finally{seen.delete(value);}
}
export async function usefulOperationWork({owner,task,source,parameters,crypto=globalThis.crypto}={}){
 if(owner.work)return structuredClone(owner.work);const contract=owner.resourceContext?.workContract,category=owner.resourceContext?.workCategory;if(!contract||!category)return null;
 try{const p={...parameters};if(owner.resourceContext.workParameters)for(const k of Object.keys(p))if(!owner.resourceContext.workParameters.includes(k))delete p[k];
 const domain=geometry(task.sourceRegionDomain),material={schema:'sherloq.useful-operation-cost-shape/1',dimensions:[source.width,source.height],domain,parameters:p,shapeContract:contract};if(new TextEncoder().encode(JSON.stringify(material)).byteLength>64*1024)return null;
 const units=task.sourceRegionDomain?.countIncluded??source.width*source.height;if(!Number.isSafeInteger(units)||units<1)return null;return{category,contract,unit:'original-pixel',layout:owner.resourceContext.sourceLayout??'unknown',shape:await adaptiveIdentity(material,{crypto}),units,code:owner.codeSha256,coverage:'complete-operation'};
 }catch{return null;}
}
