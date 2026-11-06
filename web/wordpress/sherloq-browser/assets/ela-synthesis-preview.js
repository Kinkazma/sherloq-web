import {EngineError,checkAbort} from './unified-engine/src/errors.js';

// Proportional nearest-native-pixel sampling over bounded native windows.
// Pointwise presentation is already part of the surface; no source resize,
// recompression or repeated global analysis participates in this preview.
export async function sampleElaSynthesisSurface({engine,surface,width,height,maximumReadBytes=4*1024**2,signal}={}){
 const sw=surface?.width,sh=surface?.height;
 if(![sw,sh,width,height,maximumReadBytes].every(Number.isSafeInteger)||width<1||height<1||width>sw||height>sh||maximumReadBytes<3)throw new EngineError('INVALID_INPUT','Invalid bounded synthesis preview geometry.');
 const data=new Uint8Array(width*height*3),coordinate=(i,n,s)=>Math.min(n-1,Math.floor((i+.5)*n/s)),xs=Array.from({length:width},(_,x)=>coordinate(x,sw,width)),ys=Array.from({length:height},(_,y)=>coordinate(y,sh,height)),maximumPixels=Math.floor(maximumReadBytes/3);let reads=0,readBytes=0;
 for(let x0=0;x0<width;){
  checkAbort(signal);let x1=x0+1;while(x1<width&&xs[x1]-xs[x0]+1<=maximumPixels)x1++;
  const nativeWidth=xs[x1-1]-xs[x0]+1,maximumRows=Math.max(1,Math.floor(maximumPixels/nativeWidth));
  for(let y0=0;y0<height;){
   checkAbort(signal);let y1=y0+1;while(y1<height&&ys[y1]-ys[y0]+1<=maximumRows)y1++;
   const rect={x:xs[x0],y:ys[y0],width:nativeWidth,height:ys[y1-1]-ys[y0]+1},answer=await engine.readPixels({surfaceId:surface.id,revision:surface.revision,rect},{signal}),pixels=answer.pixels;
   checkAbort(signal);if(pixels?.format!=='rgb8'||pixels.width!==rect.width||pixels.height!==rect.height||!(pixels.data instanceof Uint8Array)||pixels.data.length!==rect.width*rect.height*3)throw new EngineError('INVALID_INPUT','Synthesis preview window changed dimensions or format.');
   reads++;readBytes+=pixels.data.byteLength;
   for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const from=((ys[y]-rect.y)*rect.width+xs[x]-rect.x)*3,to=(y*width+x)*3;data[to]=pixels.data[from];data[to+1]=pixels.data[from+1];data[to+2]=pixels.data[from+2];}
   y0=y1;
  }
  x0=x1;
 }
 return{pixels:{width,height,format:'rgb8',data,logicalWidth:sw,logicalHeight:sh,preview:true},metrics:{sourceReads:reads,sourceReadBytes:readBytes,recompressions:0,nativeAnalysisCalls:0,sampling:{method:'nearest-native-pixel-center',nativeWidth:sw,nativeHeight:sh}}};
}
