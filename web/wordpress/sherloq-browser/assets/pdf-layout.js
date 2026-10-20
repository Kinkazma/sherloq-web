import {inversePlacement} from './batch-scope-geometry.js';
import {createBatchScopeMask} from './batch-scope-mask.js';
import {nativeTiles,tileId} from './pdf-native-tile-plan.js';
import {pdfRgbCanvas,pdfCompositionProtection} from './pdf-native-composition.js';
import {createPdfScopeClient} from './pdf-native-scope-client.js';

export const transformPoint=(m,x,y)=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]];
export const multiplyMatrix=(a,b)=>[a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
export function imagePlacement(viewport,occurrence,width,height){return multiplyMatrix(viewport.transform,multiplyMatrix(occurrence.matrix,[1/width,0,0,-1/height,0,1]));}
export function imageBounds(bounds,matrix){const inverse=inversePlacement(matrix),points=[[bounds.left,bounds.top],[bounds.right,bounds.top],[bounds.left,bounds.bottom],[bounds.right,bounds.bottom]].map(([x,y])=>transformPoint(inverse,x,y));return {left:Math.min(...points.map(p=>p[0])),top:Math.min(...points.map(p=>p[1])),right:Math.max(...points.map(p=>p[0])),bottom:Math.max(...points.map(p=>p[1]))};}
export async function eligiblePDFTiles(scope,width,height,{signal}={}){
 const mask=createBatchScopeMask(scope,{width,height,sourceSha256:scope.sourceSha256}),ids=[];
 for(let y=0;y<height;y+=128){signal?.throwIfAborted();const rows=Math.min(128,height-y),part=mask.readRows(y,rows);try{for(const rect of nativeTiles(width,height,{left:0,top:y,right:width,bottom:y+rows})){let any=false;for(let row=0;row<rows&&!any;row++)any=part.data.subarray(row*width+rect.x,row*width+rect.x+rect.width).some(Boolean);if(any)ids.push(tileId(rect));}}finally{part.release();}await new Promise(r=>setTimeout(r,0));}
 return ids;
}
function path(ctx,polygons){ctx.beginPath();for(const polygon of polygons){polygon.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();}}
export function clipScientific(ctx,scope,width,height){
 if(!scope)return;path(ctx,scope.regions.map(r=>r.polygon??[[r.x0,r.y0],[r.x1,r.y0],[r.x1,r.y1],[r.x0,r.y1]]));ctx.clip();
 // Subtract the union of closed exclusions, without even-odd overlap holes.
 for(const polygon of scope.excluded){path(ctx,[[[0,0],[width,0],[width,height],[0,height]],polygon]);ctx.clip('evenodd');}
}
export const createPDFScopeClient=createPdfScopeClient;

// Presentation is progressive, but every requested scientific pixel is native.
// Original composites are also used before classification, so zooming a PDF page
// does not replace a high-resolution embedded image with the page overview.
export function pdfPresentation({page,entry,memory,effects,force=false,original=false,pageOnly:forcePageOnly=false,changed=()=>{},onError=()=>{},maxCompositionBytes=32*1024**2}){
 const key=JSON.stringify(effects),inflight=new Map(),rawPending=new Map(),originals=new Map(),guards=new Map(),guardPending=new Map(),guardCounts=new Map();let closed=false,revision=0,clock=0,leases=0,cleanBackground=null;
 const cancelled=()=>Object.assign(Error('PDF presentation released.'),{code:'CANCELLED'});
 const pageRecord=page;page={...page,placements:page.placements.map(item=>({...item,image:{...item.image}}))};Object.defineProperty(page,'backgroundEntry',{get:()=>pageRecord.backgroundEntry});
 const full={left:0,top:0,right:entry.bitmap.width,bottom:entry.bitmap.height};
 const alphaScene=page.placements.some(item=>item.image.hasAlpha===true||item.image.hasAlpha!==false&&item.image.encoding!=='embedded-jpeg');
 // Force on an alpha/unknown page operates once on the rendered full-page grid.
 // Re-inserting processed alpha images would otherwise apply the effect twice.
 const pageOnly=force&&(forcePageOnly||alphaScene);
 const changedNow=()=>{if(!closed){revision++;changed();}};
 const intersects=(bounds,item)=>{const b=imageBounds(bounds,item.matrix);return b.right>0&&b.bottom>0&&b.left<item.job.width&&b.top<item.job.height?{...item,bounds:b}:null;};
 const relevant=(bounds,all=false)=>page.placements.map(item=>intersects(bounds,item)).filter(item=>item&&(all||original||force||item.image.scope&&item.image.allowedTiles?.length!==0));
 const pendingScopes=()=>!original&&!force&&page.placements.some(item=>!item.image.scope||item.image.scopeTilesReady===false);
 const pendingError=()=>Object.assign(Error('PDF acquisition classification is not ready; native effects cannot yet be exported.'),{code:'PREPARATION_PENDING'});
 const cleanRaw=()=>{if(!cleanBackground&&page.backgroundEntry&&!page.backgroundEntry.closed)cleanBackground=page.backgroundEntry.raw.fork();return cleanBackground;};
 const observedError=error=>{if(error.code!=='CANCELLED'&&!closed)onError(error);};
 function launch(id,work){if(inflight.has(id))return inflight.get(id);const task=Promise.resolve().then(work).then(value=>{changedNow();return value;}).catch(error=>{observedError(error);throw error;}).finally(()=>inflight.delete(id));task.catch(()=>{});inflight.set(id,task);return task;}
 async function rawFor(item){let source=originals.get(item.job.id);if(source)return source;if(rawPending.has(item.job.id))return rawPending.get(item.job.id);const task=(async()=>{const value=await memory.get(item.job.id,{foreground:true});if(closed&&!leases)throw cancelled();if(!value)throw Error('PDF native image is unavailable.');item.image.entry=value;source=value.raw.fork();originals.set(item.job.id,source);return source;})().finally(()=>rawPending.delete(item.job.id));rawPending.set(item.job.id,task);return task;}

 function configure(item,source){const scopeKey=force?'full':item.image.scope?.fingerprint??'pending';if(source.raw.pdfScopeKey!==scopeKey){source.cache?.cancel();source.raw={...source.raw,pdfScopeKey:scopeKey,allowedTiles:force?undefined:item.image.allowedTiles,scientificScope:force?undefined:item.image.scope,background:force||!!item.image.scope};}}
 async function ensure(item){let source=item.image.entry;if(!source||source.closed)source=item.image.entry=await memory.get(item.job.id,{foreground:true});if(!source)throw Error('PDF native image is unavailable.');configure(item,source);await memory.prepare(source,effects);const result=memory.prepared(source,effects);if(!result)throw Error('Native image effects are unavailable.');return result;}
 function request(item){if(original){if(!originals.has(item.job.id))void launch('raw:'+item.job.id,()=>rawFor(item));return originals.get(item.job.id);}
  if(!item.image.entry||item.image.entry.closed){void launch('effect:'+item.job.id,()=>ensure(item));return null;}configure(item,item.image.entry);const source=memory.prepared(item.image.entry,effects);if(!source)void launch('effect:'+item.job.id,()=>ensure(item));return source;
 }
 function clipText(ctx,item){for(const polygon of item.occurrence.textExclusions??[]){path(ctx,[[[0,0],[item.job.width,0],[item.job.width,item.job.height],[0,item.job.height]],polygon]);ctx.clip('evenodd');}}
 function paintImage(ctx,item,source,bounds,scale,{guarded=false}={}){if(!source)return;ctx.save();ctx.transform(...item.matrix);ctx.beginPath();ctx.rect(0,0,item.job.width,item.job.height);ctx.clip();if(!original&&!force&&!guarded)clipScientific(ctx,item.image.scope,item.job.width,item.job.height);if(!guarded)clipText(ctx,item);source.draw(ctx,imageBounds(bounds,item.matrix),scale*Math.max(Math.hypot(item.matrix[0],item.matrix[1]),Math.hypot(item.matrix[2],item.matrix[3])));ctx.restore();}
 function rawDraw(ctx,bounds,scale){entry.raw.draw(ctx,bounds,scale);}
 function cleanup(){if(!closed||leases)return;for(const raw of originals.values())raw.close();originals.clear();cleanBackground?.close();cleanBackground=null;for(const guard of guards.values())guard.canvas.width=guard.canvas.height=0;guards.clear();}
 function trimGuards(){let bytes=guards.size*128*128*4;for(const [id,guard] of [...guards].sort((a,b)=>a[1].used-b[1].used)){if(bytes<=maxCompositionBytes)break;guard.canvas.width=guard.canvas.height=0;guards.delete(id);bytes-=guard.rect.width*guard.rect.height*4;}}
 async function guardFor(rect){const id=tileId(rect);if(guards.has(id)){const value=guards.get(id);value.used=++clock;return value;}if(guardPending.has(id))return guardPending.get(id);
  const task=(async()=>{if(alphaScene&&!cleanRaw())throw Object.assign(Error('Clean PDF background is not ready.'),{code:'PDF_BACKGROUND_PENDING'});const bounds={left:rect.x,top:rect.y,right:rect.x+rect.width,bottom:rect.y+rect.height},items=relevant(bounds,true);await Promise.all(items.map(rawFor));
   const reference=new OffscreenCanvas(rect.width,rect.height),rebuilt=new OffscreenCanvas(rect.width,rect.height),text=new OffscreenCanvas(rect.width,rect.height);try{const a=reference.getContext('2d',{willReadFrequently:true}),b=rebuilt.getContext('2d',{willReadFrequently:true}),t=text.getContext('2d');for(const c of [a,b,t])c.translate(-rect.x,-rect.y);rawDraw(a,bounds,1);(alphaScene?cleanRaw():entry.raw).draw(b,bounds,1);
    for(const item of items){paintImage(b,item,originals.get(item.job.id),bounds,1,{guarded:true});t.save();t.transform(...item.matrix);path(t,item.occurrence.textExclusions??[]);t.fillStyle='#fff';t.fill();t.restore();}
    const protection=pdfCompositionProtection(a.getImageData(0,0,rect.width,rect.height).data,b.getImageData(0,0,rect.width,rect.height).data,t.getImageData(0,0,rect.width,rect.height).data),canvas=new OffscreenCanvas(rect.width,rect.height),context=canvas.getContext('2d');context.putImageData(new ImageData(protection.cover,rect.width,rect.height),0,0);const guard={rect,canvas,protectedPixels:protection.protectedPixels,used:++clock};if(!closed||leases){guards.set(id,guard);guardCounts.set(id,{protectedPixels:protection.protectedPixels,occludedPixels:protection.occludedPixels,textPixels:protection.textPixels});trimGuards();changedNow();}else canvas.width=canvas.height=0;return guard;
   }finally{reference.width=reference.height=rebuilt.width=rebuilt.height=text.width=text.height=0;}
  })().finally(()=>guardPending.delete(id));task.catch(error=>{if(error.code!=='PDF_BACKGROUND_PENDING')observedError(error);});guardPending.set(id,task);return task;
 }
 function prepareRaw(bounds){let ready=true;for(const item of relevant(bounds,true))if(!originals.has(item.job.id)){void launch('raw:'+item.job.id,()=>rawFor(item));ready=false;}return ready;}
 function prepareGuard(bounds){if(pageOnly)return true;if(alphaScene&&!cleanRaw())return false;let ready=true;for(const rect of nativeTiles(entry.bitmap.width,entry.bitmap.height,bounds))if(!guards.has(tileId(rect))){void guardFor(rect).catch(()=>{});ready=false;}return ready;}
 function currentSource(item,snapshot){return snapshot?.sources.get(item.job.id)??(original?originals.get(item.job.id):memory.prepared(item.image.entry,effects));}
 function paintScene(ctx,bounds,scale,snapshot,guarded){if(guarded&&alphaScene)cleanRaw().draw(ctx,bounds,scale);else rawDraw(ctx,bounds,scale);
  // A guarded reconstruction contains every original placement in PDF order.
  // Scientific RGB is merged with original RGB before applying native alpha once.
  for(const item of relevant(bounds,guarded)){const source=currentSource(item,snapshot)??(guarded?originals.get(item.job.id):null);paintImage(ctx,item,source,bounds,scale,{guarded});}
 }
 function draw(ctx,bounds,scale=1,snapshot){rawDraw(ctx,bounds,scale);if(pageOnly){const source=snapshot?.background??memory.prepared(entry,effects);if(source)source.draw(ctx,bounds,scale);return;}
  if(alphaScene&&!cleanRaw())return;const pieces=nativeTiles(entry.bitmap.width,entry.bitmap.height,bounds).map(rect=>guards.get(tileId(rect)));if(pieces.every(Boolean)){paintScene(ctx,bounds,scale,snapshot,true);for(const guard of pieces)ctx.drawImage(guard.canvas,guard.rect.x,guard.rect.y);return;}for(const guard of pieces){if(!guard)continue;const rect=guard.rect;ctx.save();ctx.beginPath();ctx.rect(rect.x,rect.y,rect.width,rect.height);ctx.clip();paintScene(ctx,bounds,scale,snapshot,true);ctx.drawImage(guard.canvas,rect.x,rect.y);ctx.restore();}
 }
 const target={owner:entry.id,width:entry.bitmap.width,height:entry.bitmap.height,effectsKey:key,native:true,get revision(){return revision;},get composition(){return{guarded:!pageOnly,grid:pageOnly?'rendered-page':'embedded-native',protectedPixels:[...guardCounts.values()].reduce((n,v)=>n+v.protectedPixels,0),occludedPixels:[...guardCounts.values()].reduce((n,v)=>n+v.occludedPixels,0),textPixels:[...guardCounts.values()].reduce((n,v)=>n+v.textPixels,0),partial:[...guardCounts.values()].some(v=>v.occludedPixels>0)};},
  prepare(bounds,scale=1){if(closed)return false;let ready=prepareRaw(bounds)&&!pendingScopes();if(pageOnly){const source=memory.prepared(entry,effects);if(!source){void launch('page',()=>memory.prepare(entry,effects));return false;}return source.prepare(bounds,scale);}
   for(const item of relevant(bounds)){const source=request(item);if(!source||source.prepare?.(item.bounds,scale*Math.max(Math.hypot(item.matrix[0],item.matrix[1]),Math.hypot(item.matrix[2],item.matrix[3])))===false)ready=false;}return prepareGuard(bounds)&&ready;
  },
  async ready(bounds=full,scale=1){if(closed)throw cancelled();if(pendingScopes())throw pendingError();await Promise.all(relevant(bounds,true).map(rawFor));if(pageOnly){await memory.prepare(entry,effects);await memory.prepared(entry,effects)?.ready(bounds,scale);return;}for(const item of relevant(bounds)){const source=original?await rawFor(item):await ensure(item);await source.ready?.(item.bounds,scale);}if(alphaScene&&!cleanRaw())throw Object.assign(Error('Clean PDF background is not ready; final composition cannot be exported.'),{code:'PDF_BACKGROUND_PENDING'});for(const rect of nativeTiles(target.width,target.height,bounds))await guardFor(rect);},draw,
  fork(snapshot){const captured=snapshot?.sources instanceof Map;if(closed&&!captured)throw cancelled();if(!captured&&pendingScopes())throw pendingError();if(alphaScene)cleanRaw();const sources=new Map(captured?[...snapshot.sources].map(([id,source])=>[id,source.fork()]):[]);let background=captured?snapshot.background?.fork()??null:pageOnly?memory.prepared(entry,effects)?.fork():null,released=false;entry.raw.retain?.();leases++;
   async function sourceFor(item){if(!sources.has(item.job.id)){const raw=original?await rawFor(item):await ensure(item);sources.set(item.job.id,raw.fork());}return sources.get(item.job.id);}
   async function paintRead(ctx,bounds,guarded){if(guarded&&alphaScene)cleanRaw().draw(ctx,bounds,1);else rawDraw(ctx,bounds,1);
    const active=new Set(relevant(bounds).map(item=>item.job.id));for(const item of relevant(bounds,guarded)){const source=active.has(item.job.id)?await sourceFor(item):await rawFor(item);if(original||!active.has(item.job.id)){paintImage(ctx,item,source,bounds,1,{guarded});continue;}const b=imageBounds(bounds,item.matrix),left=Math.max(0,Math.floor(b.left)-4),top=Math.max(0,Math.floor(b.top)-4),right=Math.min(item.job.width,Math.ceil(b.right)+4),bottom=Math.min(item.job.height,Math.ceil(b.bottom)+4);if(right<=left||bottom<=top)continue;const rect={x:left,y:top,width:right-left,height:bottom-top},pixels=await source.readPixels(rect),part=pdfRgbCanvas(pixels);try{(await rawFor(item)).applyAlpha?.(part.getContext('2d'),rect);const display={draw(context){context.drawImage(part,left,top);}};paintImage(ctx,item,display,bounds,1,{guarded});}finally{part.width=part.height=0;}}
   }
   const lease={owner:entry.id,width:target.width,height:target.height,native:true,get revision(){return revision;},prepare:(bounds,scale)=>!released&&target.prepare(bounds,scale),draw:(ctx,bounds,scale)=>{if(!released)draw(ctx,bounds,scale,{sources,background});},
    async readPixels(rect){if(released)throw cancelled();if(![rect.x,rect.y,rect.width,rect.height].every(Number.isSafeInteger)||rect.x<0||rect.y<0||rect.width<1||rect.height<1||rect.x+rect.width>target.width||rect.y+rect.height>target.height)throw new RangeError('Invalid PDF page window.');const canvas=new OffscreenCanvas(rect.width,rect.height),ctx=canvas.getContext('2d',{willReadFrequently:true}),bounds={left:rect.x,top:rect.y,right:rect.x+rect.width,bottom:rect.y+rect.height};try{ctx.translate(-rect.x,-rect.y);await Promise.all(relevant(bounds,true).map(rawFor));if(pageOnly){if(!background){await memory.prepare(entry,effects);background=memory.prepared(entry,effects)?.fork();}if(!background)throw Error('Native page effects unavailable.');return await background.readPixels(rect);}
      if(alphaScene&&!cleanRaw())throw Object.assign(Error('Clean PDF background is not ready; final composition cannot be exported.'),{code:'PDF_BACKGROUND_PENDING'});await paintRead(ctx,bounds,true);{for(const piece of nativeTiles(target.width,target.height,bounds)){const guard=await guardFor(piece);ctx.drawImage(guard.canvas,piece.x,piece.y);}}
      if(released)throw cancelled();const rgba=ctx.getImageData(0,0,rect.width,rect.height).data,data=new Uint8Array(rect.width*rect.height*3);for(let a=0,b=0;a<rgba.length;a+=4,b+=3)data.set(rgba.subarray(a,a+3),b);return{width:rect.width,height:rect.height,format:'rgb8',data};
     }finally{canvas.width=canvas.height=0;}},fork:()=>released?null:target.fork({sources,background}),close(){if(released)return;released=true;background?.close();for(const source of sources.values())source.close();entry.raw.release?.();leases--;cleanup();}};return lease;
  },async readPixels(rect){const lease=target.fork();try{return await lease.readPixels(rect);}finally{lease.close();}},close(){closed=true;cleanup();}
 };return target;
}
