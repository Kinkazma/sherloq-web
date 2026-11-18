import "../../runtime-context.js?v=0.33.2";
import {requireValue} from './errors.js';
// The caller owns the decoder and its workspace. No second decode, image clone,
// encoded copy or full-size auxiliary raster is created for this presentation.
// The 1MP RGB output plus two source rows fit the parent's 4MiB transfer owner.
export async function managedOpeningPreview({width:sw,height:sh,readRows,transform,maximumPixels=1024**2,maximumDimension=2048}={}){
 requireValue([sw,sh,maximumPixels,maximumDimension].every(n=>Number.isSafeInteger(n)&&n>0)&&Number.isSafeInteger(sw*sh)&&typeof readRows==='function','Invalid managed opening preview grid.');
 const factor=Math.min(1,maximumDimension/sw,maximumDimension/sh,Math.sqrt(maximumPixels/(sw*sh))),width=Math.max(1,Math.floor(sw*factor)),height=Math.max(1,Math.floor(sh*factor));
 const rows=async(y,count)=>{const bytes=await readRows(y,count);requireValue(bytes instanceof Uint8Array&&bytes.length===sw*count*3,'Invalid managed opening RGB rows.');transform?.(bytes);return bytes;};
 if(width===sw&&height===sh)return{width,height,format:'rgb8',data:await rows(0,sh)};
 const data=new Uint8Array(width*height*3),x0=new Uint32Array(width),x1=new Uint32Array(width),weights=new Float64Array(width);
 for(let x=0;x<width;x++){const sx=Math.max(0,Math.min(sw-1,(x+.5)*sw/width-.5));x0[x]=Math.floor(sx)*3;x1[x]=Math.min(sw-1,Math.floor(sx)+1)*3;weights[x]=sx-Math.floor(sx);}
 for(let y=0;y<height;y++){
  const sy=Math.max(0,Math.min(sh-1,(y+.5)*sh/height-.5)),top=Math.floor(sy),count=top+1<sh?2:1,source=await rows(top,count),fy=sy-top,bottom=count===2?sw*3:0;
  for(let x=0;x<width;x++)for(let c=0;c<3;c++){const a=x0[x]+c,b=x1[x]+c,fx=weights[x],v0=source[a]+(source[b]-source[a])*fx,v1=source[bottom+a]+(source[bottom+b]-source[bottom+a])*fx;data[(y*width+x)*3+c]=Math.round(v0+(v1-v0)*fy);}
 }
 return{width,height,format:'rgb8',data};
}
