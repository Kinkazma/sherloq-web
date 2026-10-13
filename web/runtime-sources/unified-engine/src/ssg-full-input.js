import "../../runtime-context.js?v=0.17.2";
import {requireValue,checkAbort,createCooperator,serializeEngineError} from './errors.js';
import {allocateOwnedTypedArray} from './allocation.js';
import {validateRgbRows} from './rgb-row-source.js';
export const SSG_FULL_DEFAULTS=Object.freeze({algorithm:'SSG',normalizationLongEdge:3000,minimumDistance:100,ratio:.6,absolute:.1,spatialK:3,salienceSigma:.001,roiRadius:50,maskThreshold:.4,minimumArea:.0001,ssimRadius:3,ssimOpening:4,rngSeed:1,regions:[],excluded:[],compare:false,reflections:false,limit:0});
export function ssgFullParams(input={}){
 const p={...SSG_FULL_DEFAULTS,...input};requireValue(p.algorithm==='SSG','SSG method required.');
 for(const k of ['normalizationLongEdge','spatialK','roiRadius','ssimOpening','rngSeed','limit'])requireValue(Number.isSafeInteger(p[k])&&p[k]>=0,'Invalid SSG '+k+'.');
 requireValue(p.spatialK>0&&p.normalizationLongEdge<=32768&&p.roiRadius<=512&&p.ssimOpening<=64,'Invalid SSG spatial geometry.');
 for(const k of ['minimumDistance','ratio','absolute','salienceSigma','maskThreshold','minimumArea','ssimRadius'])requireValue(Number.isFinite(p[k])&&p[k]>=0,'Invalid SSG '+k+'.');
 requireValue(p.ratio>0&&p.ratio<=1&&p.salienceSigma>0&&p.maskThreshold<=1&&p.minimumArea<=1&&p.ssimRadius>0,'Invalid SSG thresholds.');
 for(const k of ['compare','reflections'])requireValue(typeof p[k]==='boolean','Invalid SSG switch.');
 for(const k of ['regions','excluded'])requireValue(Array.isArray(p[k])&&p[k].every(poly=>Array.isArray(poly)&&poly.length>=3&&poly.every(v=>v?.length===2&&v.every(Number.isFinite))),'Invalid SSG polygons.');
 requireValue(!p.compare||p.regions.length===2,'SSG comparison requires two regions.');return p;
}
export function ssgInside(x,y,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j],cross=(x-a[0])*(b[1]-a[1])-(y-a[1])*(b[0]-a[0]);if(Math.abs(cross)<1e-8&&x>=Math.min(a[0],b[0])&&x<=Math.max(a[0],b[0])&&y>=Math.min(a[1],b[1])&&y<=Math.max(a[1],b[1]))return true;if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
const reflect=(i,n)=>{while(i<0||i>=n)i=i<0?-i-1:2*n-i-1;return i;};
const cubic=x=>{x=Math.abs(x);return x<=1?1.5*x**3-2.5*x**2+1:x<=2?-.5*x**3+2.5*x**2-4*x+2:0;};
const typedArrayPrototype=Object.getPrototypeOf(Uint8Array.prototype),typedBuffer=Object.getOwnPropertyDescriptor(typedArrayPrototype,'buffer').get,typedLength=Object.getOwnPropertyDescriptor(typedArrayPrototype,'length').get;
export function ssgResizeCoefficients(source,target){const scale=target/source,filter=Math.min(1,scale),radius=2/filter,out=[];for(let i=0;i<target;i++){const center=(i+.5)/scale-.5,ids=[],weights=[];let total=0;for(let j=Math.ceil(center-radius);j<=Math.floor(center+radius);j++){const w=cubic((center-j)*filter)*filter;if(w){ids.push(reflect(j,source));weights.push(w);total+=w;}}out.push({ids,weights:weights.map(w=>w/total)});}return out;}
export async function prepareSsgImage(image,p,{budget,signal}={}){
 requireValue(image?.format==='rgb8'&&image.width>0&&image.height>0&&(image.data instanceof Uint8Array||typeof image.readRows==='function'),'SSG requires RGB8 source.');checkAbort(signal);
 const scale=p.normalizationLongEdge?Math.max(1,p.normalizationLongEdge/Math.max(image.width,image.height)):1,width=Math.ceil(image.width*scale),height=Math.ceil(image.height*scale);let source,sourceOwner,rgbOwner,grayOwner;
 try{
  rgbOwner=allocateOwnedTypedArray(Uint8Array,width*height*3,{budget,owner:'ssg',label:'SSG normalized RGB'});grayOwner=allocateOwnedTypedArray(Float64Array,width*height,{budget,owner:'ssg',label:'SSG normalized double grayscale'});
  if(image.data)source=image.data;
  else{sourceOwner=allocateOwnedTypedArray(Uint8Array,image.width*image.height*3,{budget,owner:'ssg',label:'SSG source read'});source=sourceOwner.data;for(let y=0;y<image.height;y+=64){checkAbort(signal);const count=Math.min(64,image.height-y);let rows,primaryError;try{rows=await image.readRows(y,count,{signal});source.set(validateRgbRows(rows,image.width,count),y*image.width*3);}catch(error){primaryError=error;throw error;}finally{try{rows?.release();}catch(cleanup){if(primaryError)primaryError.details={...primaryError.details,cleanupErrors:[...(primaryError.details?.cleanupErrors??[]),serializeEngineError(cleanup)]};else throw cleanup;}}}}
  const cooperate=createCooperator(signal);
  if(width===image.width&&height===image.height&&source instanceof Uint8Array&&ArrayBuffer.isView(source)&&typedBuffer.call(source) instanceof ArrayBuffer&&typedLength.call(source)>=width*height*3){
   for(let y=0;y<height;y++){await cooperate();for(let x=0;x<width;x++){
    const at=y*width+x,index=at*3;
    rgbOwner.data[index]=source[index];rgbOwner.data[index+1]=source[index+1];rgbOwner.data[index+2]=source[index+2];
    grayOwner.data[at]=Math.round(.298936021293775*source[index]+.587043074451121*source[index+1]+.114020904255103*source[index+2]);
   }}
  }else{
  const xs=ssgResizeCoefficients(image.width,width),ys=ssgResizeCoefficients(image.height,height);
  for(let y=0;y<height;y++){await cooperate();for(let x=0;x<width;x++){
   const xx=xs[x],yy=ys[y];let r=0,g=0,b=0,gray=0;
   for(let j=0;j<yy.ids.length;j++)for(let i=0;i<xx.ids.length;i++){const index=(yy.ids[j]*image.width+xx.ids[i])*3,w=yy.weights[j]*xx.weights[i];r+=source[index]*w;g+=source[index+1]*w;b+=source[index+2]*w;gray+=Math.round(.298936021293775*source[index]+.587043074451121*source[index+1]+.114020904255103*source[index+2])*w;}
   const at=y*width+x;grayOwner.data[at]=gray;
   rgbOwner.data[at*3]=Math.max(0,Math.min(255,Math.round(r)));
   rgbOwner.data[at*3+1]=Math.max(0,Math.min(255,Math.round(g)));
   rgbOwner.data[at*3+2]=Math.max(0,Math.min(255,Math.round(b)));
  }}
  }
  return {rgb:rgbOwner.data,gray:grayOwner.data,width,height,scaleX:width/image.width,scaleY:height/image.height,originalWidth:image.width,originalHeight:image.height,release(){rgbOwner.release();grayOwner.release();}};
 }catch(error){rgbOwner?.release();grayOwner?.release();throw error;}finally{sourceOwner?.release();}
}
