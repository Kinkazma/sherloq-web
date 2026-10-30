import "../../runtime-context.js?v=0.30.0";
import {requireValue,checkAbort,createCooperator,EngineError} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {displayGeometry} from './display-sampling.js';
const READ=4096,preparedGeometry=new WeakSet();
/** Scientific cells remain in the immutable native atlas. This describes only
 * how a source-coordinate display texel addresses one native shifted cell. */
export function ghostSpatialContexts(data){
 requireValue(Array.isArray(data?.sourceDimensions)&&data.sourceDimensions.length===2&&data.sourceDimensions.every(v=>Number.isSafeInteger(v)&&v>0)&&Array.isArray(data.fragments),'Ghost presentation requires its exact source grid and native contexts.');
 const [width,height]=data.sourceDimensions,roll=data.roll??[0,0];requireValue(Array.isArray(roll)&&roll.length===2&&roll.every(v=>Number.isInteger(v)&&v>=0&&v<=7),'Invalid native Ghost circular phase.');
 const contexts=[];for(const c of data.fragments){requireValue(Array.isArray(c.bounds)&&c.bounds.length===4&&c.bounds.every(Number.isSafeInteger),'Invalid Ghost context bounds.');const[x0,y0,x1,y1]=c.bounds;requireValue(x0>=0&&y0>=0&&x1>x0&&y1>y0&&x1<=width&&y1<=height,'Ghost context leaves its source grid.');if(!c.evaluable)continue;requireValue(Array.isArray(c.atlasBounds)&&c.atlasBounds.length===4&&c.atlasBounds.every(Number.isSafeInteger)&&c.columns===Math.floor((x1-x0)/16)&&c.rows===Math.floor((y1-y0)/16)&&c.columns>0&&c.rows>0&&c.atlasBounds[2]-c.atlasBounds[0]===c.columns&&c.atlasBounds[3]-c.atlasBounds[1]===c.rows&&c.atlasBounds[0]>=0&&c.atlasBounds[1]>=0&&c.atlasBounds[2]<=data.cols&&c.atlasBounds[3]<=data.rows,'Ghost atlas cell geometry changed.');const owned=c.ownedRectangles;if(owned)requireValue(Array.isArray(owned)&&owned.every(r=>[r.x,r.y,r.width,r.height].every(Number.isSafeInteger)&&r.width>0&&r.height>0&&r.x>=x0&&r.y>=y0&&r.x+r.width<=x1&&r.y+r.height<=y1&&ghostSpatialCell(c,r.x,r.y,roll)&&ghostSpatialCell(c,r.x+r.width-1,r.y+r.height-1,roll)),'Ghost ownership must remain inside genuine complete native cells.');contexts.push(Object.freeze({bounds:Object.freeze([...c.bounds]),atlasBounds:Object.freeze([...c.atlasBounds]),columns:c.columns,rows:c.rows,...(owned?{ownedRectangles:Object.freeze(owned.map(r=>Object.freeze({...r})))}:{})}));}
 const geometry=Object.freeze({width,height,roll:Object.freeze([...roll]),contexts:Object.freeze(contexts),atlasWidth:data.cols,atlasHeight:data.rows});preparedGeometry.add(geometry);return geometry;
}
export function ghostSpatialCell(c,x,y,roll=[0,0]){
 const[x0,y0,x1,y1]=c.bounds;if(x<x0||x>=x1||y<y0||y>=y1)return null;
 const sx=(x-x0+roll[0])%(x1-x0),sy=(y-y0+roll[1])%(y1-y0);if(sx>=c.columns*16||sy>=c.rows*16)return null;
 return{x:c.atlasBounds[0]+Math.floor(sx/16),y:c.atlasBounds[1]+Math.floor(sy/16)};
}
/** Paint a sampled source-coordinate RGB frame. readCellRow returns a complete
 * bounded native atlas row for the context, owned until its release. */
export async function paintGhostSpatialFrame(data,{geometry,readCellRow,signal}={}){
 const g=geometry,cooperate=createCooperator(signal);requireValue(data instanceof Uint8Array&&data.length===g.width*g.height*3&&typeof readCellRow==='function','Invalid Ghost spatial frame owner.');
 for(const c of g.contexts){let rowLease,row=-1,primary,failed=false;try{const first=Math.max(0,Math.ceil((c.bounds[1]-g.y)/g.step)),last=Math.min(g.height,Math.ceil((c.bounds[3]-g.y)/g.step));for(let oy=first;oy<last;oy++){await cooperate();const y=g.y+oy*g.step,sy=(y-c.bounds[1]+g.roll[1])%(c.bounds[3]-c.bounds[1]);if(sy>=c.rows*16)continue;const ay=c.atlasBounds[1]+Math.floor(sy/16);if(ay!==row){await rowLease?.release?.();rowLease=null;rowLease=await readCellRow(c,ay,{signal});checkAbort(signal);requireValue(rowLease?.data instanceof Uint8Array&&rowLease.data.length===c.columns*3,'Ghost presentation row changed its native RGB extent.');row=ay;}
 const left=Math.max(0,Math.ceil((c.bounds[0]-g.x)/g.step)),right=Math.min(g.width,Math.ceil((c.bounds[2]-g.x)/g.step));for(let ox=left;ox<right;ox++){const x=g.x+ox*g.step;if(c.ownedRectangles&&!c.ownedRectangles.some(r=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height))continue;const sx=(g.x+ox*g.step-c.bounds[0]+g.roll[0])%(c.bounds[2]-c.bounds[0]);if(sx>=c.columns*16)continue;const src=Math.floor(sx/16)*3,dst=(oy*g.width+ox)*3;data[dst]=rowLease.data[src];data[dst+1]=rowLease.data[src+1];data[dst+2]=rowLease.data[src+2];}}
 }catch(error){failed=true;primary=error;throw error;}finally{try{await rowLease?.release?.();}catch(cleanup){if(!failed)throw cleanup;}}}
 checkAbort(signal);return data;
}
async function singleRowGhostBackground({background,origin=[0,0],geometry:g,target,signal,reserve}={}){
 const cooperate=createCooperator(signal);requireValue(background?.descriptor?.format==='rgb8'&&typeof background.readWindow==='function'&&target instanceof Uint8Array&&target.length===g.width*g.height*3,'Ghost spatial presentation needs its Original background.');
 let bytes=0;for(let oy=0;oy<g.height;oy++){await cooperate();for(let ox=0;ox<g.width;){const count=Math.min(g.width-ox,Math.max(1,Math.floor((READ-1)/g.step)+1)),width=(count-1)*g.step+1,lease=await background.readWindow({x:origin[0]+g.x+ox*g.step,y:origin[1]+g.y+oy*g.step,width,height:1},{signal,...(reserve?{reserve}:{})});let primary,failed=false;try{checkAbort(signal);const p=lease.pixels;requireValue(p?.format==='rgb8'&&p.width===width&&p.height===1&&p.data instanceof Uint8Array&&p.data.length===width*3,'Original Ghost backdrop changed its native grid.');bytes+=p.data.byteLength;for(let i=0;i<count;i++){const src=i*g.step*3,dst=(oy*g.width+ox+i)*3;target[dst]=p.data[src];target[dst+1]=p.data[src+1];target[dst+2]=p.data[src+2];}}catch(error){failed=true;primary=error;throw error;}finally{try{await lease.release?.();}catch(cleanup){if(!failed)throw cleanup;}}ox+=count;}}
 return bytes;
}
/** Group only useful source rows when the same4096-pixel transport bound can
 * hold them. Sparse/coarse grids that cannot benefit retain the row path. */
export async function ghostSpatialBackground(options={}){
 const {background,origin=[0,0],geometry:g,target,signal,reserve}=options;
 requireValue(g&&[g.width,g.height,g.step].every(v=>Number.isSafeInteger(v)&&v>0),'Invalid Ghost background sampling grid.');
 const span=(Math.min(g.width,Math.max(1,Math.floor((READ-1)/g.step)+1))-1)*g.step+1,capacity=Math.max(1,Math.floor((Math.floor(READ/span)-1)/g.step)+1);
 if(capacity<2||g.height<2)return singleRowGhostBackground(options);
 requireValue(background?.descriptor?.format==='rgb8'&&typeof background.readWindow==='function'&&target instanceof Uint8Array&&target.length===g.width*g.height*3,'Ghost spatial presentation needs its Original background.');
 const cooperate=createCooperator(signal);let bytes=0;
 for(let ox=0;ox<g.width;){const columns=Math.min(g.width-ox,Math.max(1,Math.floor((READ-1)/g.step)+1)),width=(columns-1)*g.step+1,available=Math.max(1,Math.floor((Math.floor(READ/width)-1)/g.step)+1);for(let oy=0;oy<g.height;){await cooperate();const rows=Math.min(g.height-oy,available),height=(rows-1)*g.step+1,lease=await background.readWindow({x:origin[0]+g.x+ox*g.step,y:origin[1]+g.y+oy*g.step,width,height},{signal,...(reserve?{reserve}:{})});let primary,failed=false;
  try{checkAbort(signal);const p=lease.pixels;requireValue(p?.format==='rgb8'&&p.width===width&&p.height===height&&p.data instanceof Uint8Array&&p.data.length===width*height*3,'Original Ghost backdrop changed its native grid.');bytes+=p.data.byteLength;for(let y=0;y<rows;y++)for(let x=0;x<columns;x++){const src=(y*g.step*width+x*g.step)*3,dst=((oy+y)*g.width+ox+x)*3;target[dst]=p.data[src];target[dst+1]=p.data[src+1];target[dst+2]=p.data[src+2];}}
  catch(error){failed=true;primary=error;throw error;}finally{try{await lease.release?.();}catch(cleanup){if(!failed)throw cleanup;}}oy+=rows;
 }ox+=columns;}return bytes;
}
/** Lazy spatial RGB presentation, no full source-sized canvas allocation. Its
 * only owned scientific object is the RGB atlas; Original remains borrowed
 * from the source/result lifecycle. Each read uses its own signal and leases. */
export function createGhostSpatialSurface(atlas,{data,geometry:prepared,background,origin=[0,0],budget}={}){
 const native=prepared??ghostSpatialContexts(data);requireValue(preparedGeometry.has(native),'Ghost spatial geometry must be prepared and immutable.');requireValue(atlas?.descriptor?.format==='rgb8'&&atlas.descriptor.width===Math.max(1,native.atlasWidth)&&atlas.descriptor.height===Math.max(1,native.atlasHeight)&&budget&&background?.descriptor?.format==='rgb8','Invalid Ghost spatial surface inputs.');let closed=false,disposing;const pending=new Set(),alive=()=>{if(closed)throw new EngineError('DISPOSED','Ghost spatial surface is closed.');};
 const descriptor=Object.freeze({id:crypto.randomUUID(),revision:1,width:native.width,height:native.height,format:'rgb8',orientation:1,coordinates:'source-region-native-pixels',storage:'native-Ghost-atlas-with-Original-background',semantics:'Actual native16px shifted Ghost cells placed in source coordinates; elsewhere Original pixels are presentation only, never Ghost scores.'});
 function geometry(rect={},sampled=false){alive();if(sampled){const t=displayGeometry(descriptor,rect);return{...native,x:t.x,y:t.y,step:t.step,width:t.width,height:t.height};}const{x=0,y=0,width=descriptor.width,height=descriptor.height}=rect;requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x<=native.width-width&&y<=native.height-height,'Ghost spatial window leaves its source grid.');return{...native,x,y,step:1,width,height};}
 async function fill(g,target,options){alive();checkAbort(options.signal);const sourceBytes=await ghostSpatialBackground({background,origin,geometry:g,target,signal:options.signal,reserve:options.reserve});alive();await paintGhostSpatialFrame(target,{geometry:g,signal:options.signal,readCellRow:async(c,y,hooks)=>{alive();const lease=await atlas.readWindow({x:c.atlasBounds[0],y,width:c.columns,height:1},{...options,...hooks});try{alive();return{data:lease.pixels.data,release:()=>lease.release?.()};}catch(e){try{await lease.release?.();}catch{}throw e;}}});alive();return{surfaceId:descriptor.id,revision:1,origin:[g.x,g.y],pixels:{format:'rgb8',width:g.width,height:g.height,data:target},release(){},metrics:{sourceBytes,presentationOnlyOriginalBackground:true}};}
 function track(fn){alive();const promise=Promise.resolve().then(fn);pending.add(promise);promise.finally(()=>pending.delete(promise)).catch(()=>{});return promise;}
 function read(rect,options={},sampled=false){return track(async()=>{const g=geometry(rect,sampled),owner=allocateOwnedTypedArray(Uint8Array,g.width*g.height*3,{budget,...options,label:'Ghost spatial display'});try{const result=await fill(g,owner.data,options);result.release=owner.release;return result;}catch(e){owner.release();throw e;}});}
 return{descriptor,readWindow:(rect={},options={})=>read(rect,options),readSampledWindow:(tile,options={})=>read(tile,options,true),readWindowInto:(rect,target,options={})=>track(async()=>{const g=geometry(rect);requireValue(target instanceof Uint8Array&&target.length>=g.width*g.height*3,'Ghost spatial window destination is too small.');return fill(g,target.subarray(0,g.width*g.height*3),options);}),dispose(){if(disposing)return disposing;closed=true;return disposing=(async()=>{try{await Promise.allSettled([...pending]);await atlas.dispose();}catch(error){disposing=undefined;throw error;}})();}};
}
