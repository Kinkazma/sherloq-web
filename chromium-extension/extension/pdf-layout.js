import {inversePlacement} from './vendor/batch-scope-geometry.js';
import {createBatchScopeMask} from './vendor/batch-scope-mask.js';
import {nativeTiles,tileId} from './native-tile-plan.js';

export const transformPoint=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export const multiplyMatrix=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function imagePlacement(viewport,occurrence,width,height){return multiplyMatrix(viewport.transform,multiplyMatrix(occurrence.matrix,[1/width,0,0,-1/height,0,1]));}
export function imageBounds(bounds,matrix){const inverse=inversePlacement(matrix),points=[[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]].map(([x,y])=>transformPoint(inverse,x,y));return {left:Math.min(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),right:Math.max(...points.map(p=>p[0])),bottom:Math.max(...points.map(p=>p[1]))};}
export async function eligiblePDFTiles(scope,width,height){
 const mask=createBatchScopeMask(scope,{width,height,sourceSha256:scope.sourceSha256}),ids=[];
 for(let y=0;y<height;y+=128){const rows=Math.min(128,height-y),part=mask.readRows(y,rows);try{for(const rect of nativeTiles(width,height,{left:0,top:y,right:width,bottom:y+rows})){let any=false;for(let row=0;row<rows&&!any;row++)any=part.data.subarray(row*width+rect.x,row*width+rect.x+rect.width).some(Boolean);if(any)ids.push(tileId(rect));}}finally{part.release();}await new Promise(r=>setTimeout(r,0));}
 return ids;
}
function path(ctx,polygons){ctx.beginPath();for(const polygon of polygons){polygon.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}}
function clipPageImage(ctx,item){ctx.beginPath();ctx.rect(0,0,item.job.width,item.job.height);ctx.clip();for(const polygon of item.occurrence.textExclusions??[]){path(ctx,[[[0,0],[item.job.width,0],[item.job.width,item.job.height],[0,item.job.height]],polygon]);ctx.clip('evenodd');}}
export function clipScientific(ctx,scope,width,height){
 if(!scope)return;path(ctx,scope.regions.map(r=>r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]]));ctx.clip();
 // Subtract the union of closed exclusions, without even-odd overlap holes.
 for(const polygon of scope.excluded){path(ctx,[[[0,0],[width,0],[width,height],[0,height]],polygon]);ctx.clip('evenodd');}
}
export function createPDFScopeClient({changed=()=>{}}={}){
 const worker=new Worker(new URL('./pdf-scope-worker.js',import.meta.url),{type:'module'}),jobs=new Map();let closed=false;
 worker.onmessage=({data})=>{const job=jobs.get(data.id);if(!job)return;jobs.delete(data.id);if(data.error)job.reject(Object.assign(Error(data.error.message),data.error));else job.resolve(data.scope);};
 worker.onerror=e=>{for(const job of jobs.values())job.reject(Error(e.message));jobs.clear();};
 return {prepare(image){if(closed)return Promise.reject(Error('PDF fermé'));const id=image.id;if(jobs.has(id))return jobs.get(id).promise;let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});jobs.set(id,{resolve,reject,promise});worker.postMessage({type:'prepare',id,image:{blob:image.blob,width:image.width,height:image.height,encoding:image.encoding}});return promise;},prioritize(ids){if(!closed)worker.postMessage({type:'priority',ids});},dispose(){closed=true;worker.postMessage({type:'dispose'});for(const job of jobs.values())job.reject(Object.assign(Error('PDF fermé'),{code:'CANCELLED'}));jobs.clear();worker.terminate();}};
}

export function pdfRawPresentation({page,entry,memory,changed=()=>{},onError=()=>{}}){
 const loading=new Map(),relevant=bounds=>page.placements.filter(item=>{const b=imageBounds(bounds,item.matrix);return b.right>0&&b.bottom>0&&b.left<item.job.width&&b.top<item.job.height;});
 function get(item){if(item.image.entry?.closed)item.image.entry=null;if(item.image.entry)return Promise.resolve(item.image.entry);if(!loading.has(item.job.id)){const task=memory.get(item.job.id,{foreground:true}).then(value=>{item.image.entry=value;changed();return value;}).finally(()=>loading.delete(item.job.id));loading.set(item.job.id,task);}return loading.get(item.job.id);}
 return {owner:entry.id,width:entry.bitmap.width,height:entry.bitmap.height,get revision(){return page.placements.map(v=>v.image.entry&&!v.image.entry.closed?'1':'0').join('');},prepare(bounds){let ready=true;for(const item of relevant(bounds))if(!item.image.entry||item.image.entry.closed){ready=false;void get(item).catch(onError);}return ready;},async ready(bounds){await Promise.all(relevant(bounds).map(get));},draw(ctx,bounds,scale){entry.raw.draw(ctx,bounds,scale);for(const item of relevant(bounds)){if(!item.image.entry||item.image.entry.closed){void get(item).catch(onError);continue;}ctx.save();ctx.transform(...item.matrix);clipPageImage(ctx,item);item.image.entry.raw.draw(ctx);ctx.restore();}},readPixels:rect=>entry.raw.readPixels(rect)};
}

// A PDF page is the geometric background. Only its embedded native images are
// treated, then replaced at their exact PDF placements before the lens shader.
export function pdfPresentation({page,entry,memory,effects,force=false,changed=()=>{},onError=()=>{},beforePublish=async()=>{}}){
 const key=JSON.stringify(effects),inflight=new Map(),raw=pdfRawPresentation({page:page.rawPage??page,entry,memory,changed,onError});
 function relevant(bounds){return page.placements.map(item=>({...item,bounds:imageBounds(bounds,item.matrix)})).filter(item=>item.bounds.right>0&&item.bounds.bottom>0&&item.bounds.left<item.job.width&&item.bounds.top<item.job.height&&(force||item.image.allowedTiles?.length!==0));}
 function configure(item,source){
  const scopeKey=force?'full':item.image.scope?.fingerprint??'pending';
  if(source.raw.pdfScopeKey!==scopeKey){source.cache?.cancel();source.raw={...source.raw,pdfScopeKey:scopeKey,allowedTiles:force?undefined:item.image.allowedTiles,background:force||!!item.image.scope};}
 }
 function request(item){
  if(item.image.entry?.closed)item.image.entry=null;
  if(!item.image.entry){if(!inflight.has(item.job.id)){const task=memory.get(item.job.id,{foreground:true}).then(value=>{item.image.entry=value;changed();}).catch(onError).finally(()=>inflight.delete(item.job.id));inflight.set(item.job.id,task);}return null;}
  const source=item.image.entry;configure(item,source);if(!memory.prepared(source,effects)){if(!inflight.has(item.job.id)){const task=memory.prepare(source,effects).then(()=>beforePublish()).then(changed).catch(error=>{if(error.code!=='CANCELLED')onError(error);}).finally(()=>inflight.delete(item.job.id));inflight.set(item.job.id,task);}return null;}return memory.prepared(source,effects);
 }
 function draw(ctx,bounds,scale,snapshot){
  raw.draw(ctx,bounds,scale);
  const background=snapshot?snapshot.background:(force?memory.prepared(entry,effects):null);if(background)background.draw(ctx,bounds,scale);
  for(const item of relevant(bounds)){const source=snapshot?snapshot.sources.get(item.job.id):memory.prepared(item.image.entry,effects);if(!source)continue;ctx.save();ctx.transform(...item.matrix);ctx.beginPath();ctx.rect(0,0,item.job.width,item.job.height);ctx.clip();if(!force)clipScientific(ctx,item.image.scope,item.job.width,item.job.height);
   // Page text was painted after the embedded bitmap. Retain that page layer.
   for(const polygon of item.occurrence.textExclusions??[]){path(ctx,[[[0,0],[item.job.width,0],[item.job.width,item.job.height],[0,item.job.height]],polygon]);ctx.clip('evenodd');}
   source.draw(ctx,item.bounds,scale*Math.max(Math.hypot(item.matrix[0],item.matrix[1]),Math.hypot(item.matrix[2],item.matrix[3])));ctx.restore();
  }
 }
 const target={owner:entry.id,width:entry.bitmap.width,height:entry.bitmap.height,effectsKey:key,presentationKey:JSON.stringify([force,page.placements.map(v=>v.image.scope?.fingerprint)]),
  prepare(bounds,scale){const items=relevant(bounds);memory.retainPDFItems?.(items.map(item=>item.job.id));let ready=raw.prepare(bounds);if(force){const bg=memory.prepared(entry,effects);if(!bg){void memory.prepare(entry,effects).catch(onError);ready=false;}else if(!bg.prepare(bounds,scale))ready=false;}
   for(const item of relevant(bounds)){const source=request(item);if(!source||!source.prepare(item.bounds,scale*Math.max(Math.hypot(item.matrix[0],item.matrix[1]),Math.hypot(item.matrix[2],item.matrix[3]))))ready=false;}
   return ready;
  },draw,
  fork(){const sources=new Map();for(const item of page.placements){const source=memory.prepared(item.image.entry,effects);if(source&&!sources.has(item.job.id))sources.set(item.job.id,source.fork());}return retained(sources,force?memory.prepared(entry,effects)?.fork():null);
  }
 };return target;
 function retained(sources,background){entry.raw.retain?.();let closed=false;
  const lease={width:target.width,height:target.height,async readPixels(rect){if(closed)throw Error('PDF fermé');const bounds={left:rect.x,top:rect.y,right:rect.x+rect.width,bottom:rect.y+rect.height};await raw.ready(bounds);await background?.ready(bounds);for(const item of relevant(bounds))await sources.get(item.job.id)?.ready(item.bounds);if(closed)throw Error('PDF fermé');const canvas=new OffscreenCanvas(rect.width,rect.height),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.translate(-rect.x,-rect.y);draw(ctx,bounds,1,{background,sources});const rgba=ctx.getImageData(0,0,rect.width,rect.height).data,data=new Uint8Array(rect.width*rect.height*3);for(let a=0,b=0;a<rgba.length;a+=4,b+=3)data.set(rgba.subarray(a,a+3),b);return {width:rect.width,height:rect.height,format:'rgb8',data};},fork(){if(closed)throw Error('PDF fermé');return retained(new Map([...sources].map(([id,source])=>[id,source.fork()])),background?.fork());},close(){if(closed)return;closed=true;background?.close();for(const source of sources.values())source.close();entry.raw.release?.();}};return lease;
 }
}
