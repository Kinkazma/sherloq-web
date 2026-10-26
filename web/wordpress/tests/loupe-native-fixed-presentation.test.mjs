import test from 'node:test';
import assert from 'node:assert/strict';
import {createLoupeImageCache} from '../sherloq-browser/assets/pdf-native-effects.js';
import {effectDefaults} from '../sherloq-browser/assets/loupe-effects-settings.js';

const rgb=(x,y)=>[(x*17+y*31)%256,(x*73+y*13)%256,(x*29+y*7)%256];
function harness({refuseLarge=false,failSecondWrite=false}={}){
 const workers=[],canvases=[];
 class Canvas{
  constructor(width,height){this.listeners=new Map();this.lost=false;this._width=width;this._height=height;this.pixels=new Uint8ClampedArray(width*height*4);this.writes=0;this.context={isContextLost:()=>this.lost,
   getImageData:(x,y,width,height)=>{if(refuseLarge&&this.width>128)throw Object.assign(Error('Backing store refused'),{code:'CANVAS_LIMIT'});const data=new Uint8ClampedArray(width*height*4);for(let row=0;row<height;row++)data.set(this.pixels.subarray(((y+row)*this.width+x)*4,((y+row)*this.width+x+width)*4),row*width*4);return{width,height,data};},
   createImageData:(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)}),
   putImageData:(image,x,y)=>{if(failSecondWrite&&this.width>128&&++this.writes===2)throw Object.assign(Error('Native backing store lost'),{code:'CANVAS_LOST'});const width=image.width,height=image.height;for(let row=0;row<height;row++)this.pixels.set(image.data.subarray(row*width*4,(row+1)*width*4),((row+y)*this.width+x)*4);},
   clearRect:(x,y,width,height)=>{for(let row=0;row<height;row++)this.pixels.fill(0,((row+y)*this.width+x)*4,((row+y)*this.width+x+width)*4);},
   drawImage:(source,...args)=>{let sx=0,sy=0,sw=source.width,sh=source.height,dx,dy,dw=sw,dh=sh;if(args.length===2)[dx,dy]=args;else if(args.length===8)[sx,sy,sw,sh,dx,dy,dw,dh]=args;else assert.fail('Unexpected drawImage shape');assert.equal(sw,dw);assert.equal(sh,dh);for(let row=0;row<sh;row++){const from=((sy+row)*source.width+sx)*4,to=((dy+row)*this.width+dx)*4;this.pixels.set(source.pixels.subarray(from,from+sw*4),to);}},
   save(){},restore(){},translate(){}
  };canvases.push(this);}
  get width(){return this._width;}set width(value){this._width=value;this.pixels=new Uint8ClampedArray(this.width*this.height*4);}
  get height(){return this._height;}set height(value){this._height=value;this.pixels=new Uint8ClampedArray(this.width*this.height*4);}
  getContext(){return this.context;}
  addEventListener(type,callback){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(callback);}
  removeEventListener(type,callback){this.listeners.get(type)?.delete(callback);}
  emit(type){for(const callback of [...this.listeners.get(type)??[]])callback({type,preventDefault(){assert.fail('2D context handlers must not prevent browser restoration');}});}
  lose(){this.lost=true;this.pixels.fill(0);this.emit('contextlost');}
  restore(){this.lost=false;this.emit('contextrestored');}
 }
 class Worker{
  constructor(){this.messages=[];workers.push(this);}
  emit(data){queueMicrotask(()=>this.onmessage?.({data}));}
  postMessage(m){this.messages.push(m);if(m.action==='build')this.emit({ticket:m.ticket,resultId:m.ticket,metrics:{}});if(m.action==='read'){const r=m.rect,data=new Uint8Array(r.width*r.height*3);for(let y=0;y<r.height;y++)for(let x=0;x<r.width;x++)data.set(rgb(r.x+x,r.y+y),(y*r.width+x)*3);this.emit({ticket:m.ticket,pixels:{width:r.width,height:r.height,format:'rgb8',data}});}if(m.action==='release')this.emit({ticket:m.ticket,released:true});if(m.action==='dispose')this.emit({action:'disposed'});}
  terminate(){}
 }
 return{workers,canvases,Canvas,Worker};
}
async function withSurface(options,body){const previousWorker=globalThis.Worker,previousCanvas=globalThis.OffscreenCanvas,h=harness(options);globalThis.Worker=h.Worker;globalThis.OffscreenCanvas=h.Canvas;const cache=createLoupeImageCache({memoryBudgetBytes:32*1024**2,presentationCacheBytes:options?.target??1024*1024}),input={width:385,height:259,background:false,readPixels(){assert.fail('Native output reads must not read the input again.');}};let surface;try{surface=await cache.acquire(input,structuredClone(effectDefaults));await body({surface,h,input,cache});}finally{surface?.close();await cache.dispose();assert.equal(surface?.metrics.presentationFixedBytes,0);globalThis.Worker=previousWorker;globalThis.OffscreenCanvas=previousCanvas;}}
const whole={left:0,top:0,right:385,bottom:259};
function assertNative(canvas,width=385,height=259){assert.equal(canvas.width,width);assert.equal(canvas.height,height);for(let y=0;y<height;y++)for(let x=0;x<width;x++)assert.deepEqual([...canvas.pixels.subarray((y*width+x)*4,(y*width+x+1)*4)],[...rgb(x,y),255]);}

test('one lazy native backing replaces per-tile canvases and all moving per-lease joins',async()=>withSurface({},async({surface,h})=>{
 assert.equal(surface.metrics.presentationFixedBytes,0);assert.equal(h.canvases.length,0);
 await surface.ready(whole);assert.equal(surface.metrics.presentationFixedAllocations,1);assert.equal(surface.metrics.presentationFixedBytes,385*259*4);assert.equal(surface.metrics.presentationTileBytes,0);assert.equal(surface.metrics.presentationCompositeBytes,0);assert.equal(h.canvases.length,1);assertNative(h.canvases[0]);
 const reads=surface.nativeReads,copies=surface.metrics.presentationFixedTileCopies,plans=surface.metrics.presentationTilePlanQueries,drawn=[];const context={drawImage:(canvas,...args)=>drawn.push({canvas,args})};const fork=surface.fork();try{for(let i=0;i<40;i++){const bounds={left:i,top:i%17,right:Math.min(385,i+240),bottom:Math.min(259,i%17+190)};surface.draw(context,bounds,.5+i/100);fork.draw(context,bounds,2+i/10);}assert.equal(surface.nativeReads,reads);assert.equal(surface.metrics.presentationFixedTileCopies,copies);assert.equal(surface.metrics.presentationTilePlanQueries,plans,'A complete fixed source needs no native tile enumeration on movement');assert.equal(surface.metrics.presentationFixedComplete,true);assert.equal(surface.metrics.presentationFixedCompleteHits,80);assert.equal(surface.metrics.presentationJoinAllocations,0);assert.equal(surface.metrics.presentationJoinTileCopies,0);assert.equal(surface.metrics.presentationCompositeBytes,0);assert.equal(h.canvases.length,1);assert.equal(drawn.length,80);assert.ok(drawn.every(item=>item.canvas===h.canvases[0]));assertNative(h.canvases[0]);}finally{fork.close();}
}));

test('native fixed presentation receives each newly demanded tile once and preserves odd tails',async()=>withSurface({},async({surface,h})=>{
 await surface.ready({left:10,top:10,right:100,bottom:100});assert.equal(surface.metrics.presentationFixedTileCopies,1);assert.equal(surface.metrics.presentationFixedComplete,false);const plans=surface.metrics.presentationTilePlanQueries;surface.draw({drawImage(){}},{left:12,top:12,right:98,bottom:98});assert.equal(surface.metrics.presentationTilePlanQueries,plans,'A covered window of a partly populated native backing needs no object plan');const first=h.canvases[0];await surface.ready(whole);assert.equal(surface.metrics.presentationFixedCopyPixels,385*259);assert.equal(surface.metrics.presentationFixedTileCopies,12);assert.equal(h.canvases[0],first);assert.equal(surface.metrics.presentationJoinAllocations,0);assertNative(first);
}));

test('native fixed presentation applies the existing local alpha hook once per tile before placing it',async()=>withSurface({},async({surface,h,input})=>{
 let alphaCalls=0;input.applyAlpha=(context,rect)=>{alphaCalls++;const image=context.getImageData(0,0,rect.width,rect.height);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)image.data[(y*rect.width+x)*4+3]=(rect.x+x+rect.y+y)%3===0?0:127;context.putImageData(image,0,0);};
 await surface.ready(whole);assert.equal(alphaCalls,12);assert.equal(surface.metrics.presentationTileBytes,0);assert.equal(surface.metrics.presentationFixedBytes,385*259*4);const backing=h.canvases.find(canvas=>canvas.width===385&&canvas.height===259);assert.ok(backing);for(let y=0;y<259;y++)for(let x=0;x<385;x++)assert.equal(backing.pixels[(y*385+x)*4+3],(x+y)%3===0?0:127);assert.ok(h.canvases.filter(canvas=>canvas!==backing).every(canvas=>canvas.width===0&&canvas.height===0),'Local alpha staging canvases are released immediately');
}));

test('refused native backing dimensions fall back to exact bounded tiles and retained joins',async()=>withSurface({refuseLarge:true},async({surface,h})=>{
 await surface.ready(whole);assert.equal(surface.metrics.presentationFixedBytes,0);assert.equal(surface.metrics.presentationFixedFallback,'CANVAS_LIMIT');assert.equal(surface.metrics.presentationFixedAllocations,0);const context={drawImage:(canvas)=>assertNative(canvas)};surface.draw(context,whole);assert.equal(surface.metrics.presentationJoinAllocations,1);assert.equal(surface.metrics.presentationJoinTileCopies,12);assert.equal(h.canvases[0].width,0);assert.equal(h.canvases[0].height,0);
}));

test('a failed fixed tile copy invalidates earlier atlas metadata and reloads exact output rather than showing holes',async()=>withSurface({failSecondWrite:true},async({surface,h})=>{
 await surface.ready(whole);assert.equal(surface.metrics.presentationFixedBytes,0);assert.equal(surface.metrics.presentationFixedFallback,'CANVAS_LOST');assert.equal(surface.metrics.presentationFixedAllocations,1);assert.ok(surface.nativeReads>12,'The invalidated first tile must be recovered from the native output store');surface.draw({drawImage:canvas=>assertNative(canvas)},whole);assert.equal(surface.metrics.presentationJoinAllocations,1);assert.equal(h.canvases[0].width,0);assert.equal(h.canvases[0].height,0);
}));

test('a source beyond the presentation target never allocates a full canvas or reduces its native dimensions',async()=>withSurface({target:65536},async({surface,h})=>{
 await surface.ready({left:10,top:10,right:100,bottom:100});assert.equal(surface.metrics.presentationFixedBytes,0);assert.equal(surface.metrics.presentationFixedFallback,'PRESENTATION_TARGET');assert.equal(surface.metrics.presentationTileBytes,65536);assert.ok(h.canvases.every(canvas=>canvas.width<=128&&canvas.height<=128));assert.equal(surface.width,385);assert.equal(surface.height,259);
}));

test('covered windows of an incomplete fixed canvas use presence cells without plans and retain exact circle admission',async()=>withSurface({},async({surface,h})=>{
 await surface.ready({left:5,top:5,right:100,bottom:100});const plans=surface.metrics.presentationTilePlanQueries,reads=surface.nativeReads;
 for(let i=0;i<40;i++){const b={left:10+i/10,top:12,right:110,bottom:112,circle:{x:60,y:60,radius:60}};assert.equal(surface.prepare(b,1),true);surface.draw({drawImage(){}},b,1);}
 assert.equal(surface.metrics.presentationTilePlanQueries,plans);assert.equal(surface.nativeReads,reads);assert.equal(surface.metrics.presentationFixedComplete,false);assert.equal(surface.metrics.presentationCoveredWindowHits,80);
 const missing={left:120,top:10,right:150,bottom:100};assert.equal(surface.prepare(missing),false);await surface.ready(missing);assert.equal(surface.prepare(missing),true);assert.ok(surface.nativeReads>reads);
 assert.throws(()=>surface.prepare({left:0,top:0,right:100,bottom:100,circle:{x:1,y:1,radius:-1}}),/Invalid native loupe/);
}));
test('interaction changes only idle background scheduling and never merges an old wide demand into the next detail demand',async()=>withSurface({},async({surface,h,input})=>{
 input.background=true;await surface.ready({left:0,top:0,right:100,bottom:100});await Promise.resolve();const worker=h.workers[0];assert.equal(worker.messages.filter(m=>m.action==='priority').at(-1).background,true);
 surface.setInteractive(true);surface.prepare({left:260,top:140,right:280,bottom:160});await Promise.resolve();let priority=worker.messages.filter(m=>m.action==='priority').at(-1);assert.equal(priority.background,false);assert.ok(priority.regions.every(r=>r.x===256&&r.y===128));
 const reads=surface.nativeReads;await surface.ready({left:260,top:140,right:280,bottom:160});surface.setInteractive(false);await Promise.resolve();priority=worker.messages.filter(m=>m.action==='priority').at(-1);assert.equal(priority.background,true);assert.ok(surface.nativeReads>=reads);assert.equal(surface.metrics.presentationInteractionActive,false);
}));


test('2D atlas loss invalidates coverage persistently even if its context restores before the next prepare',async()=>withSurface({},async({surface,h})=>{
 await surface.ready(whole);const beforeRevision=surface.presentationRevision,reads=surface.nativeReads,atlas=h.canvases[0],builds=h.workers[0].messages.filter(m=>m.action==='build').length;
 const changes=[];const fork=surface.fork(error=>changes.push(error));try{atlas.lose();atlas.restore();await Promise.resolve();assert.equal(surface.presentationRevision,beforeRevision+1);assert.equal(surface.metrics.presentationFixedComplete,false);assert.equal(surface.metrics.presentationFixedBytes,0);assert.equal(surface.metrics.presentationContextLosses,1);assert.equal(surface.metrics.presentationInvalidatedTiles,12);assert.equal(surface.prepare(whole),false);assert.equal(fork.prepare(whole),false);assert.ok(changes.length>0);await surface.ready(whole);assertNative(h.canvases.at(-1));assert.equal(surface.metrics.presentationFixedComplete,true);assert.equal(surface.nativeReads,reads+12);assert.equal(h.workers[0].messages.filter(m=>m.action==='build').length,builds);assert.equal(surface.metrics.presentationFixedAllocations,2);const revision=surface.presentationRevision;atlas.emit('contextlost');assert.equal(surface.presentationRevision,revision,'Retired canvas listeners cannot invalidate the replacement');}finally{fork.close();}
}));
test('a lost atlas is detected by isContextLost before its asynchronous event is delivered',async()=>withSurface({},async({surface,h})=>{
 await surface.ready(whole);const atlas=h.canvases[0],revision=surface.presentationRevision;atlas.lost=true;atlas.pixels.fill(0);assert.equal(surface.prepare(whole),false);assert.equal(surface.presentationRevision,revision+1);assert.equal(surface.metrics.presentationFixedComplete,false);await surface.ready(whole);assertNative(h.canvases.at(-1));
}));
test('loss of an exact tile fallback retires joined pixels and reconstructs only retained native results',async()=>withSurface({target:65536},async({surface,h})=>{
 await surface.ready(whole);surface.draw({drawImage:canvas=>assertNative(canvas)},whole);const tile=h.canvases.find(canvas=>canvas.width===128&&canvas.height===128),composite=h.canvases.find(canvas=>canvas.width===385&&canvas.height===259),reads=surface.nativeReads;tile.lose();tile.restore();assert.equal(composite.width,0);assert.equal(surface.metrics.presentationCompositeBytes,0);assert.equal(surface.prepare(whole),false);await surface.ready(whole);surface.draw({drawImage:canvas=>assertNative(canvas)},whole);assert.equal(surface.nativeReads,reads+12);assert.equal(h.workers[0].messages.filter(m=>m.action==='build').length,1);assert.equal(surface.metrics.presentationContextLosses,1);
}));
test('loss of a fallback join cannot retain its unchanged geometry key over an empty backing',async()=>withSurface({target:65536},async({surface,h})=>{
 await surface.ready(whole);surface.draw({drawImage:canvas=>assertNative(canvas)},whole);const composite=h.canvases.at(-1);composite.lose();composite.restore();assert.equal(surface.prepare(whole),false);await surface.ready(whole);surface.draw({drawImage:canvas=>assertNative(canvas)},whole);assert.notEqual(h.canvases.at(-1),composite);assert.equal(surface.metrics.presentationContextLosses,1);
}));
test('a restored presentation context invalidates stale pixels even when no loss event reached the client',async()=>withSurface({},async({surface,h})=>{
 await surface.ready(whole);const atlas=h.canvases[0],revision=surface.presentationRevision;atlas.pixels.fill(0);atlas.emit('contextrestored');assert.equal(surface.presentationRevision,revision+1);assert.equal(surface.prepare(whole),false);await surface.ready(whole);assertNative(h.canvases.at(-1));assert.equal(h.workers[0].messages.filter(m=>m.action==='build').length,1);
}));
