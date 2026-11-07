import {adaptiveIdentity} from './unified-engine/src/adaptive-runtime.js';

const schema='sherloq.nlm-cost-geometry/1',maximumBytes=64*1024;
const storage=new Set(['memory','opfs','indexeddb','blob']);
const integer=(v,min=0,max=131072)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const bad=()=>{throw new TypeError('Incomplete bounded compiled NLM geometry');};
const pair=(v,w,h)=>Array.isArray(v)&&v.length===2&&v.every(Number.isFinite)&&v[0]>=0&&v[0]<=w&&v[1]>=0&&v[1]<=h;

// This consumes only the descriptor of the domain already compiled for the
// requested operation. It neither compiles a second domain nor walks its rows,
// cores or pixels. Exact source/domain identity stays in analysisComparisonIdentity.
export async function nlmCostGeometry({descriptor,sourceStorage,layout,params,crypto=globalThis.crypto}={}){
 try{
  if(!storage.has(sourceStorage)||!['native-regions','membership'].includes(layout))return null;
  if(params?.mode!==4||!integer(params.radius,1,10)||!integer(params.sigma,1,200)||typeof params.grayscale!=='boolean'||typeof params.denoised!=='boolean'||!integer(params.levels,0,255))return null;
  let zones=0,vertices=0;const active=new Set();
  function domain(value,depth=0){
   if(depth>6||!value||active.has(value)||value.schema!=='sherloq.source-region-domain/1')bad();
   active.add(value);
   try{
    const s=value.snapshot,w=s?.width,h=s?.height;
    if(s?.schema!=='sherloq.source-regions/1'||!integer(w,1)||!integer(h,1)||typeof s.enabled!=='boolean'||!['whole','selected'].includes(s.positiveMode)||!Array.isArray(s.zones))bad();
    const r=value.rect;
    if(!r||!['x0','x1'].every(k=>integer(r[k],0,w))||!['y0','y1'].every(k=>integer(r[k],0,h))||r.x1<=r.x0||r.y1<=r.y0||value.width!==r.x1-r.x0||value.height!==r.y1-r.y0||!Array.isArray(value.origin)||value.origin.length!==2||value.origin[0]!==r.x0||value.origin[1]!==r.y0||!integer(value.countIncluded,1,w*h)||value.countIncluded>value.width*value.height)bad();
    if(s.zones.length>8192)bad();
    const effective=[];
    if(s.enabled)for(const z of s.zones){
     if(typeof z?.enabled!=='boolean'||!['acquisition','exclusion'].includes(z.kind))bad();
     if(!z.enabled||z.kind==='acquisition'&&s.positiveMode==='whole')continue;
     if(++zones>512||!Array.isArray(z.polygon)||z.polygon.length<3||(vertices+=z.polygon.length)>4096||!z.polygon.every(p=>pair(p,w,h)))bad();
     // Keep vertex and zone order conservatively. IDs, labels, revisions,
     // source SHA and original (superseded) edit geometry do not affect rows.
     effective.push({kind:z.kind,polygon:z.polygon.map(p=>[p[0],p[1]])});
    }
    return{grid:[w,h],envelope:[r.x0,r.y0,r.x1,r.y1],centres:value.countIncluded,enabled:s.enabled,positiveMode:s.enabled?s.positiveMode:'whole',zones:effective,ceiling:value.ceiling==null?null:domain(value.ceiling,depth+1)};
   }finally{active.delete(value);}
  }
  const material={schema,layout,sourceStorage,parameters:Object.fromEntries(['mode','radius','sigma','grayscale','denoised','levels'].map(k=>[k,params[k]])),domain:domain(descriptor)};
  if(new TextEncoder().encode(JSON.stringify(material)).byteLength>maximumBytes)return null;
  return schema+':'+await adaptiveIdentity(material,{crypto});
 }catch{return null;}
}

export const NLM_COST_GEOMETRY_SCHEMA=schema;
