import "../../../runtime-context.js?v=0.31.0";
/* Display only: raw Splicebuster f64 statistics are never modified. */
import {requireValue,checkAbort,createCooperator} from '../errors.js';
import {allocateOwnedTypedArray} from '../allocation.js';
import {getExecutionScheduler} from '../execution-scheduler.js';
import {resultDescription,readNumeric,resourceScope,cleanupScope,pinInto} from './splicebuster-result-io.mjs';

const clamp=v=>Math.max(0,Math.min(1,v));
function nearest(axis,value,step){
 if(!axis.length||value<axis[0]-(axis.length>1?axis[1]-axis[0]:step)/2||value>axis.at(-1)+(axis.length>1?axis.at(-1)-axis.at(-2):step)/2)return -1;
 let lo=0,hi=axis.length-1;while(lo<hi){const mid=(lo+hi)>>1;if(axis[mid]<value)lo=mid+1;else hi=mid;}
 return lo>0&&value-axis[lo-1]<=axis[lo]-value?lo-1:lo;
}
// Explicit display palette, not a probability. No per-pixel JS allocations.
const HEAT=(()=>{const out=new Uint8Array(768),stops=[[0,0,128],[0,180,255],[255,245,0],[210,0,0]];for(let i=0;i<256;i++){const v=i/255*3,k=Math.min(2,Math.floor(v)),f=v-k;for(let c=0;c<3;c++)out[i*3+c]=Math.round(stops[k][c]*(1-f)+stops[k+1][c]*f);}return out;})();

/** Native-image RGB window. Grid cells use nearest native centres; the outer
 * half-cell boundary is explicit. Pixels outside that domain remain neutral
 * (or original when sourceSurface is supplied). This never resizes analysis.
 * view='map' uses global extrema; view='valid' shows training eligibility.
 * Returned RGB has an independent shared-budget owner and synchronous release.
 */
export async function renderWindow(result,rect={},options={}){
 const {budget,signal,onProgress,onCleanupError,sourceSurface,view='map',opacity=1,palette='heat'}=options;
 requireValue(budget&&['map','valid'].includes(view)&&['heat','gray'].includes(palette)&&Number.isFinite(opacity)&&opacity>=0&&opacity<=1,'Invalid Splicebuster display options.');
 const {d,width:nativeWidth,height:nativeHeight,rows,cols}=resultDescription(result);
 const {x=0,y=0,width=nativeWidth,height=nativeHeight}=rect??{},pixels=width*height;
 requireValue([x,y,width,height].every(Number.isSafeInteger)&&x>=0&&y>=0&&width>0&&height>0&&x<=nativeWidth-width&&y<=nativeHeight-height&&Number.isSafeInteger(pixels*3),'Invalid native Splicebuster display window.');
 const minimum=options.minimum??d.metadata?.minimum,maximum=options.maximum??d.metadata?.maximum;
 if(view==='map'&&rows)requireValue(Number.isFinite(minimum)&&Number.isFinite(maximum)&&maximum>=minimum,'Global finite Splicebuster display extrema required.');
 const descriptor=sourceSurface?.descriptor;
 if(sourceSurface)requireValue(descriptor?.width===nativeWidth&&descriptor?.height===nativeHeight&&descriptor?.format==='rgb8'&&(typeof sourceSurface.readWindowInto==='function'||typeof sourceSurface.readWindow==='function'),'Overlay source must be the same native RGB geometry.');
 requireValue(sourceSurface||opacity===1,'An original source surface is required for an opacity overlay.');
 const step=d.metadata?.stride??d.metadata?.params?.stride??8;
 requireValue(Number.isFinite(step)&&step>0,'Invalid native display spacing.');
 const scope=resourceScope(),cooperate=createCooperator(signal);let failed=false;
 try{
  const pin=await pinInto(result,scope);checkAbort(signal);
  const output=allocateOwnedTypedArray(Uint8Array,pixels*3,{budget,owner:'splicebuster',label:'splicebuster-render-window'}),outEntry=scope.own(output);
  const xOwner=allocateOwnedTypedArray(Int32Array,width,{budget,owner:'splicebuster',label:'splicebuster-render-columns'}),xEntry=scope.own(xOwner);
  let first=cols,last=-1;for(let xx=0;xx<width;xx++){const index=nearest(d.range1,x+xx,step);xOwner.data[xx]=index;if(index>=0){first=Math.min(first,index);last=Math.max(last,index);}}
  const rowLength=Math.max(0,last-first+1),Type=view==='map'?Float64Array:Uint8Array;
  const row=allocateOwnedTypedArray(Type,rowLength,{budget,owner:'splicebuster',label:'splicebuster-render-grid-row'}),rowEntry=scope.own(row);
  const lease=await getExecutionScheduler(budget).acquire({cpu:1,signal,label:'splicebuster/render'}),leaseEntry=scope.own(lease);
  let previous=-1;
  for(let yy=0;yy<height;yy++){
   await cooperate();checkAbort(signal);const line=output.data.subarray(yy*width*3,(yy+1)*width*3);
   if(sourceSurface){
    const sourceRect={x,y:y+yy,width,height:1};
    if(sourceSurface.readWindowInto)await sourceSurface.readWindowInto(sourceRect,line,{signal,owner:'splicebuster'});
    else{const source=await sourceSurface.readWindow(sourceRect,{signal,owner:'splicebuster'});try{requireValue(source.pixels?.format==='rgb8'&&source.pixels.data?.length===line.length,'Invalid overlay source row.');line.set(source.pixels.data);}finally{await source.release();}}
   }else line.fill(96);
   const ry=nearest(d.range0,y+yy,step);
   if(ry>=0&&rowLength){
    if(ry!==previous){await readNumeric(view==='map'?d.map:d.valid,row.data,ry*cols+first,{signal});previous=ry;}
    for(let xx=0;xx<width;xx++){
     const rx=xOwner.data[xx];if(rx<0)continue;const value=row.data[rx-first];let gray,atPalette=-1;
     if(view==='valid'){requireValue(value===0||value===1,'Invalid binary Splicebuster training mask.');gray=value*255;}
     else{if(Number.isNaN(value))continue;requireValue(Number.isFinite(value),'Non-finite Splicebuster score cannot be displayed.');const t=maximum>minimum?clamp((value-minimum)/(maximum-minimum)):0;if(palette==='gray')gray=255*t;else atPalette=Math.round(t*255)*3;}
     const at=xx*3;for(let c=0;c<3;c++){const color=atPalette<0?gray:HEAT[atPalette+c];line[at+c]=Math.round(line[at+c]*(1-opacity)+color*opacity);}
    }
   }
   if(yy%32===0)await onProgress?.({phase:'render',completed:yy+1,total:height});
  }
  checkAbort(signal);await scope.retire(leaseEntry);await scope.retire(rowEntry);await scope.retire(xEntry);await scope.retire(pin);checkAbort(signal);
  const owned=scope.take(outEntry);
  return {width,height,origin:[x,y],format:'rgb8',data:owned.data,view,display:{sampling:'nearest-native-grid-centre',outside:'original-or-neutral',minimum:view==='map'?minimum:null,maximum:view==='map'?maximum:null},release:()=>owned.release()};
 }catch(error){failed=true;throw error;}finally{await cleanupScope(scope,failed,onCleanupError);}
}
