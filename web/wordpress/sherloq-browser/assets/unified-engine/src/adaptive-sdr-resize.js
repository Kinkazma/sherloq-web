import "../../runtime-context.js?v=0.14.5";
import {requireValue,createCooperator,checkAbort} from './errors.js';
// Public proxy SDR reconstruction: Lanczos3 in linear light. Auto uses exact
// area coverage for large reductions. Only the current band and its rows live.
const linear=Float64Array.from({length:256},(_,i)=>{const v=i/255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
const encode=v=>Math.round(Math.max(0,Math.min(255,255*(v<=.0031308?v*12.92:1.055*v**(1/2.4)-.055))));
export function reducedShape(width,height,maximumPixels){
 requireValue(Number.isSafeInteger(maximumPixels)&&maximumPixels>0,'Invalid export reduction limit.');const scale=Math.min(1,Math.sqrt(maximumPixels/(width*height)));
 return{width:Math.max(1,Math.floor(width*scale)),height:Math.max(1,Math.floor(height*scale))};
}
export function exportDimensions(shape,request={}){
 const resize=request.resize;if(!resize)return request.adaptive?reducedShape(shape.width,shape.height,(request.maximumMegapixels??24)*1e6):{width:shape.width,height:shape.height};
 requireValue(resize&&typeof resize==='object','Invalid export dimensions.');let {width,height}=resize;
 requireValue(width!==undefined||height!==undefined,'An export width or height is required.');
 if(width===undefined)width=Math.max(1,Math.round(height*shape.width/shape.height));
 if(height===undefined)height=Math.max(1,Math.round(width*shape.height/shape.width));
 requireValue([width,height].every(n=>Number.isInteger(n)&&n>0&&n<=65500),'Export dimensions must be within 1–65500 pixels.');
 requireValue(Math.abs(width*shape.height-height*shape.width)<=Math.max(shape.width,shape.height),'Export dimensions must preserve the aspect ratio.');
 requireValue(['auto','lanczos3','area','nearest'].includes(resize.algorithm??'auto'),'Invalid export resampling algorithm.');return{width,height};
}
export function resizeAlgorithm(source,target,algorithm='auto'){
 if(source.format!=='rgb8')return 'nearest';
 return algorithm==='auto'?(Math.min(source.width/target.width,source.height/target.height)>=4?'area':'lanczos3'):algorithm;
}
const sinc=x=>Math.abs(x)<1e-12?1:Math.sin(Math.PI*x)/(Math.PI*x);
function weights(position,scale,limit,algorithm){
 if(algorithm==='nearest')return [[Math.min(limit-1,Math.floor((position+.5)*scale)),1]];
 const area=algorithm==='area',factor=Math.max(1,scale),center=(position+.5)*scale-.5;
 const start=area?Math.floor(position*scale):Math.ceil(center-3*factor),end=area?Math.ceil((position+1)*scale)-1:Math.floor(center+3*factor),values=new Map();let total=0;
 for(let i=start;i<=end;i++){
  const x=(i-center)/factor,w=area?Math.max(0,Math.min(i+1,(position+1)*scale)-Math.max(i,position*scale)):Math.abs(x)<3?sinc(x)*sinc(x/3):0;
  if(!w)continue;const index=Math.max(0,Math.min(limit-1,i));values.set(index,(values.get(index)??0)+w);total+=w;
 }
 return [...values].map(([i,w])=>[i,w/total]);
}
export function createResizedSdrSurface(surface,shape,budget,algorithm='auto'){
 const original=surface.descriptor,sw=original.width,sh=original.height,sx=sw/shape.width,sy=sh/shape.height;
 requireValue(['rgb8','mask8','rgb-flags8'].includes(original.format),'Resizing requires an RGB or mask raster.');
 algorithm=resizeAlgorithm(original,shape,algorithm);const channels=original.format==='mask8'?1:3;
 return{descriptor:{...original,width:shape.width,height:shape.height},resampling:algorithm,async readWindow(rect,{signal}={}){
  requireValue([rect.x,rect.y,rect.width,rect.height].every(Number.isInteger)&&rect.x>=0&&rect.y>=0&&rect.width>0&&rect.height>0&&rect.x+rect.width<=shape.width&&rect.y+rect.height<=shape.height,'Invalid resized window.');
  const supportX=Math.ceil(6*Math.max(1,sx)+2),supportY=Math.ceil(6*Math.max(1,sy)+2),length=rect.width*channels;
  const free=budget.reserve(length*rect.height+length*8*(supportY+1)+rect.width*supportX*64+sw*channels);let published=false;
  try{
   const cooperate=createCooperator(signal),data=new Uint8Array(length*rect.height),sum=new Float64Array(length),rows=new Map(),columns=Array.from({length:rect.width},(_,x)=>weights(rect.x+x,sx,sw,algorithm));
   for(let yy=0;yy<rect.height;yy++){
    await cooperate();sum.fill(0);const vertical=weights(rect.y+yy,sy,sh,algorithm),needed=new Set(vertical.map(([y])=>y));
    for(const y of rows.keys())if(!needed.has(y))rows.delete(y);
    for(const [y,wy]of vertical){
     let horizontal=rows.get(y);
     if(!horizontal){
      await cooperate();const part=await surface.readWindow({x:0,y,width:sw,height:1},{signal});
      try{horizontal=new Float64Array(length);const rgb=part.pixels.data;
       for(let x=0;x<rect.width;x++)for(const [xx,wx]of columns[x])for(let c=0;c<channels;c++)horizontal[x*channels+c]+=(algorithm==='nearest'?rgb[xx*channels+c]:linear[rgb[xx*channels+c]])*wx;
      }finally{part.release();}rows.set(y,horizontal);
     }
     for(let i=0;i<length;i++)sum[i]+=horizontal[i]*wy;
    }
    for(let i=0;i<length;i++)data[yy*length+i]=algorithm==='nearest'?Math.round(sum[i]):encode(sum[i]);
   }
   checkAbort(signal);published=true;return{pixels:{width:rect.width,height:rect.height,format:original.format,data},release:free};
  }finally{if(!published)free();}
 }};
}
export const createReducedSdrSurface=(surface,shape,budget)=>createResizedSdrSurface(surface,shape,budget,'area');
