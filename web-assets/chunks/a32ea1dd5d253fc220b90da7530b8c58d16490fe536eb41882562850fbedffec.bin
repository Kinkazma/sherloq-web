import "../../runtime-context.js?v=0.33.2";
import {EngineError,requireValue,checkAbort} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {createReadCooperation} from './read-cooperation.js';
import {displayGeometry} from './display-sampling.js';
import {createSegmentedBytes} from './segmented-bytes.js';
import {roundEven} from './pixel-utils.js';

const LITTLE_ENDIAN=new Uint8Array(new Uint16Array([1]).buffer)[0]===1;
const bytesOf=view=>new Uint8Array(view.buffer,view.byteOffset,view.byteLength);
function freezeRecord(value){if(value===undefined||value===null)return null;const copy=structuredClone(value),seen=new WeakSet();const freeze=item=>{if(item&&typeof item==='object'&&!seen.has(item)&&!ArrayBuffer.isView(item)){seen.add(item);for(const part of Object.values(item))freeze(part);Object.freeze(item);}return item;};return freeze(copy);}
function geometry(width,height){requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0&&Number.isSafeInteger(width*height*6),'Invalid RGB16 dimensions.');}
function swapWords(bytes){for(let i=0;i<bytes.length;i+=2){const value=bytes[i];bytes[i]=bytes[i+1];bytes[i+1]=value;}}
const srgbColor=color=>typeof color?.primaries==='string'&&color.primaries.toLowerCase()==='srgb'&&typeof color?.transfer==='string'&&['srgb','iec61966-2-1'].includes(color.transfer.toLowerCase());

/** Exact unsigned RGB16 samples stored as little-endian bytes. Native reads
 * never tone-map, quantize or change a colour profile. Display conversion is
 * a separate, declared consumer and cannot be inferred from the word RGB. */
export function createRgb16Surface(store,{width:sw,height:sh,orientation=1,budget,ownsStore=true,sourceDepth=16,color=null,provenance=null,displayTransform}={}){
 geometry(sw,sh);requireValue(store?.byteLength===sw*sh*6&&typeof store.readInto==='function'&&budget,'Invalid RGB16 store.');
 requireValue(Number.isInteger(orientation)&&orientation>=1&&orientation<=8&&Number.isInteger(sourceDepth)&&sourceDepth>=1&&sourceDepth<=16&&typeof ownsStore==='boolean','Invalid RGB16 surface options.');
 requireValue(displayTransform===undefined||typeof displayTransform==='function','Invalid RGB16 presentation converter.');
 color=freezeRecord(color);provenance=freezeRecord(provenance);const width=orientation>=5?sh:sw,height=orientation>=5?sw:sh,id=crypto.randomUUID(),reads=createReadCooperation(),pending=new Set();let disposed=false,disposing;
 const descriptor=Object.freeze({id,revision:1,width,height,format:'rgb16',depth:16,sourceDepth,channels:3,channelOrder:'RGB',range:Object.freeze([0,65535]),byteOrder:'little-endian',sourceWidth:sw,sourceHeight:sh,orientation,coordinates:'full-resolution',storage:store.storage??'segmented',color,provenance});
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','RGB16 surface disposed.');};
 const track=task=>{pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;};
 function source(x,y){switch(orientation){case 2:return[sw-1-x,y];case 3:return[sw-1-x,sh-1-y];case 4:return[x,sh-1-y];case 5:return[y,x];case 6:return[y,sh-1-x];case 7:return[sw-1-y,sh-1-x];case 8:return[sw-1-y,x];default:return[x,y];}}
 function windowGeometry({x=0,y=0,width:w=width,height:h=height}={}){
  alive();requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x<=width-w&&y<=height-h,'RGB16 window is outside the full-resolution surface.');
  const corners=[source(x,y),source(x+w-1,y),source(x,y+h-1),source(x+w-1,y+h-1)],x0=Math.min(...corners.map(p=>p[0])),x1=Math.max(...corners.map(p=>p[0])),y0=Math.min(...corners.map(p=>p[1])),y1=Math.max(...corners.map(p=>p[1]));return{x,y,w,h,x0,x1,y0,y1,rowSamples:(x1-x0+1)*3};
 }
 function pixels(data,w,h){return{width:w,height:h,format:'rgb16',space:'RGB',channels:3,depth:16,sourceDepth,range:[0,65535],color,data};}
 async function fill(g,out,{signal,reserve=bytes=>budget.reserve(bytes),scratch,operation}={}){
  const read=reads.begin(signal);let rowOwner;
  try{
   if(orientation===1&&g.x0===0&&g.x1===sw-1){const bytes=bytesOf(out);for(let offset=0;offset<bytes.length;offset+=4*1024**2){await read.checkpoint();alive();await read.wait(()=>store.readInto(bytes.subarray(offset,Math.min(bytes.length,offset+4*1024**2)),g.y0*sw*6+offset,{reserve,signal}));checkAbort(signal);alive();}if(!LITTLE_ENDIAN)swapWords(bytes);}
   else{
    if(scratch!==undefined)requireValue(scratch instanceof Uint16Array&&scratch.length>=g.rowSamples&&(scratch.buffer!==out.buffer||scratch.byteOffset+g.rowSamples*2<=out.byteOffset||out.byteOffset+out.byteLength<=scratch.byteOffset),'Invalid RGB16 row scratch.');
    const row=scratch?scratch.subarray(0,g.rowSamples):(rowOwner=allocateOwnedTypedArray(Uint16Array,g.rowSamples,{budget,reserve,owner:'rgb16-surface',operation,label:'rgb16-window-row'})).data;
    for(let sy=g.y0;sy<=g.y1;sy++){
     if((sy-g.y0)%32===0)await read.checkpoint();alive();await read.wait(()=>store.readInto(bytesOf(row),(sy*sw+g.x0)*6,{reserve,signal}));checkAbort(signal);alive();if(!LITTLE_ENDIAN)swapWords(bytesOf(row));
     if(orientation===1||orientation===4){const dy=orientation===1?sy:sh-1-sy;out.set(row,(dy-g.y)*g.w*3);continue;}
     for(let sx=g.x0;sx<=g.x1;sx++){let dx=sx,dy=sy;switch(orientation){case 2:dx=sw-1-sx;break;case 3:dx=sw-1-sx;dy=sh-1-sy;break;case 5:dx=sy;dy=sx;break;case 6:dx=sh-1-sy;dy=sx;break;case 7:dx=sh-1-sy;dy=sw-1-sx;break;case 8:dx=sy;dy=sw-1-sx;break;}const from=(sx-g.x0)*3,to=((dy-g.y)*g.w+dx-g.x)*3;out[to]=row[from];out[to+1]=row[from+1];out[to+2]=row[from+2];}
    }
   }
   return{surfaceId:id,revision:1,origin:[g.x,g.y],pixels:pixels(out,g.w,g.h),release(){}};
  }finally{read.finish();rowOwner?.release();}
 }
 const surface={
  descriptor,
  readWindow(rect={},options={}){return track((async()=>{checkAbort(options.signal);const g=windowGeometry(rect),output=allocateOwnedTypedArray(Uint16Array,g.w*g.h*3,{...options,budget,owner:'rgb16-surface',label:'rgb16-window'});try{const result=await fill(g,output.data,options);result.release=output.release;return result;}catch(error){output.release();throw error;}})());},
  readWindowInto(rect,target,options={}){return track((async()=>{checkAbort(options.signal);const g=windowGeometry(rect);requireValue(target instanceof Uint16Array&&target.length>=g.w*g.h*3,'RGB16 destination is too small.');return fill(g,target.subarray(0,g.w*g.h*3),options);})());},
  readNativeSampledWindow(tile,options={}){return track((async()=>{
   alive();checkAbort(options.signal);const g=displayGeometry(descriptor,tile),a=source(g.x,g.y),b=source(g.x+(g.width-1)*g.step,g.y+(g.height-1)*g.step),left=Math.min(a[0],b[0]),span=Math.abs(a[0]-b[0])+1;
   const output=allocateOwnedTypedArray(Uint16Array,g.width*g.height*3,{...options,budget,owner:'rgb16-surface',label:'rgb16-native-sample'}),read=reads.begin(options.signal);let scratch,sourceBytes=0;
   try{
    scratch=allocateOwnedTypedArray(Uint16Array,span*3,{...options,budget,owner:'rgb16-surface',label:'rgb16-sampled-row'});const transposed=orientation>=5,rows=transposed?g.width:g.height,cols=transposed?g.height:g.width;
    for(let row=0;row<rows;row++){await read.checkpoint();alive();const first=source(g.x+(transposed?row*g.step:0),g.y+(transposed?0:row*g.step));await read.wait(()=>store.readInto(bytesOf(scratch.data),(first[1]*sw+left)*6,options));checkAbort(options.signal);alive();sourceBytes+=scratch.data.byteLength;if(!LITTLE_ENDIAN)swapWords(bytesOf(scratch.data));const direction=transposed?(orientation===5||orientation===6?1:-1):(orientation===1||orientation===4?1:-1);for(let col=0;col<cols;col++){const from=(first[0]-left+direction*col*g.step)*3,to=(transposed?col*g.width+row:row*g.width+col)*3;output.data[to]=scratch.data[from];output.data[to+1]=scratch.data[from+1];output.data[to+2]=scratch.data[from+2];}}
    return{pixels:pixels(output.data,g.width,g.height),release:output.release,metrics:{sourceBytes,nativePrecision:16}};
   }catch(error){output.release();throw error;}finally{scratch?.release();read.finish();}
  })());},
  readSampledWindow(tile,options={}){return track((async()=>{
   alive();const convert=options.displayTransform??displayTransform;if(!convert&&!srgbColor(color))throw new EngineError('COLOR_TRANSFORM_REQUIRED','RGB16 presentation requires an explicit profile and transfer conversion.');
   let native,output;try{native=await surface.readNativeSampledWindow(tile,options);output=allocateOwnedTypedArray(Uint8Array,native.pixels.data.length,{...options,budget,owner:'rgb16-display',label:'rgb16-sdr-display'});if(convert)await convert(native.pixels,output.data,{...options,budget});else for(let i=0;i<output.data.length;i++)output.data[i]=roundEven(native.pixels.data[i]/257);alive();checkAbort(options.signal);return{pixels:{width:native.pixels.width,height:native.pixels.height,format:'rgb8',data:output.data},release:output.release,metrics:{...native.metrics,presentationPrecision:8,conversion:convert?'explicit-profile-transfer-converter':'explicit-srgb16-to-srgb8-round-even',nativeSourceSurfaceId:id}};}catch(error){output?.release();throw error;}finally{native?.release();}
  })());},
  dispose(){if(disposing)return disposing;disposed=true;const task=(async()=>{await Promise.allSettled([...pending]);if(ownsStore)await store.dispose();})();disposing=task;void task.catch(()=>{if(disposing===task)disposing=null;});return task;}
 };
 return surface;
}

/** Decode bands/rectangles are stored losslessly without a full-frame copy.
 * Coverage is checked as row intervals (and independently for every explicit
 * interlace pass), so repeated or missing writes cannot publish a source. */
export async function createRgb16Bank({width,height,budget,storage='auto',temporarySession,getTemporarySession,signal,chunkBytes,owner='rgb16-source',...options}={}){
 geometry(width,height);checkAbort(signal);const store=await createSegmentedBytes(width*height*6,{budget,storage,temporarySession,getTemporarySession,signal,chunkBytes,owner,label:'native-rgb16-bank'}),coverage=new Map(),pending=new Set();let nextRow=0,covered=0,currentPass=0,passCount=1,passDeclared=false,writing=false,sealing=false,sealed=null,disposed=false,disposing;
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','RGB16 decode bank disposed.');};
 const track=task=>{pending.add(task);task.then(()=>pending.delete(task),()=>pending.delete(task));return task;};
 const clearCoverage=(reset=true)=>{for(const entry of coverage.values())entry.release();coverage.clear();if(reset){nextRow=0;covered=0;}};
 const mergedIntervals=(intervals,left,right)=>{const out=[];let inserted=false;for(const [a,b]of intervals){requireValue(b<=left||a>=right,'Overlapping RGB16 decode rectangles.');if(b<left)out.push([a,b]);else if(a>right){if(!inserted){out.push([left,right]);inserted=true;}out.push([a,b]);}else{left=Math.min(left,a);right=Math.max(right,b);}}if(!inserted)out.push([left,right]);return out;};
 function writeBand({x=0,y,width:bandWidth=width,rows,height:bandHeight,data,pass,passes},hooks={}){return track((async()=>{
  alive();checkAbort(hooks.signal??signal);rows??=bandHeight;requireValue(!sealed&&!sealing&&!writing&&[x,y,bandWidth,rows].every(Number.isSafeInteger)&&x>=0&&y>=0&&bandWidth>0&&rows>0&&x<=width-bandWidth&&y<=height-rows&&data instanceof Uint8Array&&data.byteLength===bandWidth*rows*6,'Invalid RGB16 little-endian decode rectangle.');
  const explicit=pass!==undefined||passes!==undefined;requireValue(!explicit||Number.isSafeInteger(pass)&&Number.isSafeInteger(passes)&&pass>=0&&passes>0&&pass<passes,'Invalid RGB16 interlace pass.');
  if(explicit){if(!passDeclared){requireValue(pass===0,'RGB16 decoding must start with pass0.');passCount=passes;passDeclared=true;}requireValue(passes===passCount&&(pass===currentPass||pass===currentPass+1&&covered===width*height),'RGB16 interlace passes are incomplete or unordered.');if(pass!==currentPass){clearCoverage();currentPass=pass;}}
  else requireValue(!passDeclared||passCount===1,'Explicit pass metadata is required for interlaced replacement writes.');
  const changes=[];writing=true;
  try{
   for(let row=y;row<y+rows;row++){const before=coverage.get(row),intervals=mergedIntervals(before?.intervals??[],x,x+bandWidth),release=budget.reserve(intervals.length*64);changes.push({row,before,intervals,release});}
   if(x===0&&bandWidth===width)await store.write(data,y*width*6,{...hooks,signal:hooks.signal??signal});else for(let row=0;row<rows;row++){checkAbort(hooks.signal??signal);alive();await store.write(data.subarray(row*bandWidth*6,(row+1)*bandWidth*6),((y+row)*width+x)*6,{...hooks,signal:hooks.signal??signal});}
   checkAbort(hooks.signal??signal);alive();for(const change of changes){coverage.set(change.row,{intervals:change.intervals,release:change.release});change.before?.release();change.committed=true;}covered+=bandWidth*rows;while(nextRow<height){const row=coverage.get(nextRow)?.intervals;if(row?.length!==1||row[0][0]!==0||row[0][1]!==width)break;nextRow++;}
  }finally{for(const change of changes)if(!change.committed)change.release();writing=false;}
 })());}
 const bank={
  store,get rowsWritten(){return nextRow;},get pixelsWritten(){return covered;},get pass(){return currentPass;},get surface(){alive();if(!sealed)throw new EngineError('NOT_READY','RGB16 decode bank is incomplete.');return sealed;},writeBand,writeRect:writeBand,
  seal(hooks={}){return track((async()=>{alive();checkAbort(hooks.signal??signal);if(sealed)return sealed;requireValue(!writing&&!sealing&&covered===width*height&&currentPass===passCount-1,'RGB16 decode bank or interlace pass is incomplete.');sealing=true;try{await store.flush();alive();checkAbort(hooks.signal??signal);sealed=createRgb16Surface(store,{...options,width,height,budget,ownsStore:true});clearCoverage(false);return sealed;}finally{sealing=false;}})());},
  dispose(){if(disposing)return disposing;disposed=true;const task=(async()=>{await Promise.allSettled([...pending]);try{await(sealed?sealed.dispose():store.dispose());}finally{clearCoverage();}})();disposing=task;void task.catch(()=>{if(disposing===task)disposing=null;});return task;}
 };return bank;
}

export function native16Descriptor(surface){const d=surface?.descriptor;requireValue(d?.format==='rgb16'&&d.depth===16,'An RGB16 native surface is required.');return Object.freeze({schema:'sherloq.native-pixel-capability/1',surfaceId:d.id,revision:d.revision,width:d.width,height:d.height,format:'rgb16',space:'RGB',channels:Object.freeze(['R','G','B']),depth:16,sourceDepth:d.sourceDepth,range:Object.freeze([0,65535]),byteOrder:'little-endian',color:d.color,provenance:d.provenance});}
