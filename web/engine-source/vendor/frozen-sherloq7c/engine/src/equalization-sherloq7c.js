import {EngineError,requireValue,checkAbort,createCooperator} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {sherloq7cResultRecords} from './sherloq7c-adapter.js';

// A spatial program for a fixed complete presentation. Its input identity is
// the presentation owner/revision, never merely the original file's SHA.
export async function prepareSherloq7cEqualization(source,plan,{budget,signal,onProgress,contains=()=>true,sherloqRuntime}={}){
 const {width,height}=source.descriptor,cooperate=createCooperator(signal),started=performance.now();
 let input,core,result,ownCore=false,closed=false,handedOff=false,format=source.descriptor.format??'rgb8';
 const native16=format==='rgb16',depth=native16?16:8;
 requireValue(['rgb8','rgb16'].includes(format),'Sherloq equalization requires an RGB8 or native RGB16 presentation.');
 try{
  // An after-the-fact result mask cannot qualify excluded graph observations.
  for(let y=0;y<height;y++){for(let x=0;x<width;x++)if(!contains(x,y))throw new EngineError('SOURCE_SCOPE_UNSUPPORTED','Sherloq equalization needs a separately qualified graph domain for excluded observations.');if((y&31)===0)await cooperate();}
  input=allocateOwnedTypedArray(Uint16Array,width*height*3,{budget,owner:'sherloq-proxy16',label:'dynamic-presentation-rgb16'});
  for(let y=0;y<height;y+=32){await cooperate();const rows=Math.min(32,height-y),part=await source.readWindow({x:0,y,width,height:rows},{signal});
   try{requireValue(native16?part.pixels.data instanceof Uint16Array:part.pixels.data instanceof Uint8Array,'Presentation depth changed during Sherloq preparation.');
    if(native16)input.data.set(part.pixels.data,y*width*3);else for(let i=0;i<part.pixels.data.length;i++)input.data[y*width*3+i]=part.pixels.data[i]*257;
   }finally{await part.release();}onProgress?.({phase:'sherloq-proxy16',fraction:(y+rows)/height});
  }
  if(sherloqRuntime)core=sherloqRuntime;else{const{createSherloq7C}=await import('./sherloq7c.js');core=createSherloq7C({budget});ownCore=true;}
  const settings=plan.state.sherloq7c,identity=source.descriptor.id?'proxy:'+source.descriptor.id+':'+source.descriptor.revision:'proxy-owned:'+crypto.randomUUID();
  result=await core.run({width,height,data:input.data,format:'rgb16',bitDepth:16,id:identity,immutable:true,dynamicProxy:true,sourceBitDepth:depth,proxyRevision:source.descriptor.revision??null},{revelation:plan.value/100,micro:settings.micro/100,precision:settings.precision},{signal,onProgress,backend:settings.backend});checkAbort(signal);
  if(ownCore){await core.dispose();ownCore=false;}
  input.release();input=null;
  const metrics={...result.metrics,sourceBitDepth:depth,workingBitDepth:16,dynamicProxy:true,sourceRole:'computed-presentation',sourceFormat:format,sourceRevision:source.descriptor.revision??null,sourceOwner:source.descriptor.id??null,promotion:native16?'none':'u8*257; normalized samples unchanged',original16Recovered:false,elapsedMs:performance.now()-started};
  return{method:'sherloq7c',value:plan.value,metrics,
   map(data,x,y,w,h,{xAt=i=>x+i,yAt=i=>y+i}={}){requireValue(!closed&&!!result,'Sherloq equalization program released.');for(let yy=0;yy<h;yy++)for(let xx=0;xx<w;xx++){const px=xAt(xx),py=yAt(yy);requireValue(Number.isSafeInteger(px)&&Number.isSafeInteger(py)&&px>=0&&py>=0&&px<width&&py<height,'Sherloq mapping coordinates exceed the fixed presentation.');const from=(py*width+px)*3,to=(yy*w+xx)*3;data[to]=result.pixels[from];data[to+1]=result.pixels[from+1];data[to+2]=result.pixels[from+2];}return data;},
   pixels(){requireValue(!closed&&!!result,'Sherloq equalization program released.');return result.pixels;},
   async takeRecords({threshold=255,invert=false}={}){requireValue(!closed&&!!result&&!handedOff,'Sherloq native output already transferred.');
    if(threshold<255||invert)for(let i=0;i<result.pixels.length;i++){const v=result.pixels[i],n=threshold<255?(v>threshold?255:0):v,n16=threshold<255?(v>threshold?65535:0):result.pixels16[i];result.pixels[i]=invert?255-n:n;result.pixels16[i]=invert?65535-n16:n16;if((i&65535)===0)await cooperate();}
    checkAbort(signal);if(threshold<255||invert)result.metrics.presentationFinish={threshold,invert,scalarStage:'before-finish'};const records=sherloq7cResultRecords(result,budget);records.planeRecords={sherloq7c_intensity:records.planeRecords.intensity,sherloq7c_rgb16:records.planeRecords.rgb16};handedOff=true;result=null;return records;
   },
   async dispose(){if(closed)return;closed=true;await result?.release();result=null;input?.release();input=null;if(ownCore)await core.dispose();}
  };
 }catch(error){input?.release();await result?.release();if(ownCore)try{await core?.dispose();}catch(cleanup){if(error&&typeof error==='object'&&Object.isExtensible(error))error.cleanupError=cleanup;}throw error;}
}
