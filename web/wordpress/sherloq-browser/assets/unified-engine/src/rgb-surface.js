import "../../runtime-context.js?v=0.14.5";
import {sampleStoredPixels} from './display-sampling.js';
// Exact full-resolution window reads over un-oriented RGB8 or mask8 storage.
// Presentation tiles are consumers; these coordinates never rescale analysis.
import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
function createByteSurface(store,{width:sw,height:sh,orientation=1,budget,ownsStore=true,channels,format,range,semantics}={}){
 requireValue(Number.isSafeInteger(sw)&&Number.isSafeInteger(sh)&&sw>0&&sh>0&&Number.isSafeInteger(sw*sh*channels)&&store.byteLength===sw*sh*channels,'Invalid byte surface dimensions.');
 requireValue(Number.isInteger(orientation)&&orientation>=1&&orientation<=8&&budget,'Invalid byte surface options.');
 const metadata=format==='rgb8'?{}:{range:Object.freeze(range.slice()),semantics,...(format==='rgb-flags8'?{channelOrder:'RGB'}:{})};
 const width=orientation>=5?sh:sw,height=orientation>=5?sw:sh,id=crypto.randomUUID();let disposed=false,disposing;
 const yieldReads=createCooperator();
 const alive=()=>{if(disposed)throw new EngineError('DISPOSED','Pixel surface disposed.');};
 function source(x,y){switch(orientation){case 2:return [sw-1-x,y];case 3:return [sw-1-x,sh-1-y];case 4:return [x,sh-1-y];case 5:return [y,x];case 6:return [y,sh-1-x];case 7:return [sw-1-y,sh-1-x];case 8:return [sw-1-y,x];default:return [x,y];}}
 function windowGeometry({x=0,y=0,width:w=width,height:h=height}={}){
  alive();requireValue([x,y,w,h].every(Number.isSafeInteger)&&x>=0&&y>=0&&w>0&&h>0&&x<=width-w&&y<=height-h,'Pixel window is outside the full-resolution surface.');
  const corners=[source(x,y),source(x+w-1,y),source(x,y+h-1),source(x+w-1,y+h-1)],x0=Math.min(...corners.map(p=>p[0])),x1=Math.max(...corners.map(p=>p[0])),y0=Math.min(...corners.map(p=>p[1])),y1=Math.max(...corners.map(p=>p[1]));
  return {x,y,w,h,x0,x1,y0,y1,rowBytes:(x1-x0+1)*channels};
 }
 async function fill(g,out,{signal,reserve=bytes=>budget.reserve(bytes),scratch,owner='surface',operation}={}){
  const {x,y,w,h,x0,x1,y0,y1,rowBytes}=g;let rowOwner;const cooperate=async()=>{checkAbort(signal);await yieldReads();checkAbort(signal);};
  requireValue(typeof reserve==='function','A pixel window reservation allocator is required.');
  try{
   if(orientation===1&&x0===0&&x1===sw-1){
    // Whole rows need no intermediate row. Bounded reads retain the same output
    // extent; no new full-window allocation is hidden behind readWindowInto.
    for(let offset=0;offset<out.length;offset+=4*1024**2){await cooperate();alive();await store.readInto(out.subarray(offset,Math.min(out.length,offset+4*1024**2)),y0*sw*channels+offset,{reserve});checkAbort(signal);}
   }else{
    if(scratch!==undefined)requireValue(scratch instanceof Uint8Array&&scratch.byteLength>=rowBytes&&(scratch.buffer!==out.buffer||scratch.byteOffset+rowBytes<=out.byteOffset||out.byteOffset+out.byteLength<=scratch.byteOffset),'Pixel row scratch is too small or overlaps its destination.');
    const row=scratch?scratch.subarray(0,rowBytes):(rowOwner=allocateOwnedTypedArray(Uint8Array,rowBytes,{budget,reserve,owner,operation,label:'pixel-window-row'})).data;
    for(let sy=y0;sy<=y1;sy++){if((sy-y0)%32===0)await cooperate();alive();await store.readInto(row,(sy*sw+x0)*channels,{reserve});checkAbort(signal);
     if(orientation===1||orientation===4){const dy=orientation===1?sy:sh-1-sy;out.set(row,(dy-y)*w*channels);continue;}
     for(let sx=x0;sx<=x1;sx++){let dx=sx,dy=sy;switch(orientation){case 2:dx=sw-1-sx;break;case 3:dx=sw-1-sx;dy=sh-1-sy;break;case 4:dy=sh-1-sy;break;case 5:dx=sy;dy=sx;break;case 6:dx=sh-1-sy;dy=sx;break;case 7:dx=sh-1-sy;dy=sw-1-sx;break;case 8:dx=sy;dy=sw-1-sx;break;}const a=(sx-x0)*channels,b=((dy-y)*w+dx-x)*channels;for(let c=0;c<channels;c++)out[b+c]=row[a+c];}
    }
   }
   return {surfaceId:id,revision:1,origin:[x,y],pixels:{width:w,height:h,format,...metadata,data:out},release(){}};
  }finally{rowOwner?.release();}
 }
 return {
  descriptor:Object.freeze({id,revision:1,width,height,format,...metadata,sourceWidth:sw,sourceHeight:sh,orientation,coordinates:'full-resolution',storage:store.storage??'blob'}),
  readSampledWindow(tile,options={}){alive();return sampleStoredPixels(store,{width:sw,height:sh,format,orientation},tile,{budget,...options,alive});},
  async readWindow(rect={},options={}){
   checkAbort(options.signal);const g=windowGeometry(rect),output=allocateOwnedTypedArray(Uint8Array,g.w*g.h*channels,{budget,...options,label:'pixel-window'});
   try{const result=await fill(g,output.data,options);result.release=output.release;return result;}catch(error){output.release();throw error;}
  },
  async readWindowInto(rect,target,options={}){
   checkAbort(options.signal);const g=windowGeometry(rect);requireValue(target instanceof Uint8Array&&target.byteLength>=g.w*g.h*channels,'Pixel window destination is too small.');
   return fill(g,target.subarray(0,g.w*g.h*channels),options);
  },
  dispose(){if(disposing)return disposing;disposed=true;disposing=Promise.resolve(ownsStore?store.dispose():undefined);return disposing;}
 };
}

export function createRgbSurface(store,options={}){return createByteSurface(store,{...options,channels:3,format:'rgb8'});}
export function createMaskSurface(store,options={}){
 requireValue(Array.isArray(options.range)&&options.range.length===2&&options.range.every(Number.isInteger)&&options.range[0]>=0&&options.range[0]<=options.range[1]&&options.range[1]<=255&&typeof options.semantics==='string','Explicit byte-mask range and semantics required.');
 return createByteSurface(store,{...options,channels:1,format:'mask8'});
}
export function createFlagSurface(store,options={}){
 return createByteSurface(store,{...options,channels:3,format:'rgb-flags8',range:[0,2],semantics:'Per RGB channel:0=no candidate,1=hot,2=dead; global border excluded.'});
}
