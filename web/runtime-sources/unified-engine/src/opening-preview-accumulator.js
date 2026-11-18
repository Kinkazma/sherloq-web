import "../../runtime-context.js?v=0.33.2";
import {requireValue} from './errors.js';
export const OPENING_PREVIEW_ACCUMULATOR_BYTES=16*1024**2;
export function openingPreviewAccumulatorPlan({width:sw,height:sh,maximumPixels=1024**2,maximumDimension=2048}={}){
 requireValue([sw,sh,maximumPixels,maximumDimension].every(n=>Number.isSafeInteger(n)&&n>0)&&Number.isSafeInteger(sw*sh),'Invalid opening accumulator grid.');
 const scale=Math.min(1,maximumDimension/sw,maximumDimension/sh,Math.sqrt(maximumPixels/(sw*sh))),width=Math.max(1,Math.floor(sw*scale)),height=Math.max(1,Math.floor(sh*scale)),n=width*height;
 const exact=width===sw&&height===sh;
 return{width,height,exact,workspaceBytes:n*(exact?4:13)+16*(width+height),rasterBytes:3*n};
}
// Consume the already color-managed RGB8 rectangles before their buffers move
// to Original. The sole raster is <=1MP; the float sums/masks have an explicit
// 16MiB codec reservation. No encoded reads, clones or extra decode are used.
export function createOpeningPreviewAccumulator(options={}){
 const {width:sw,height:sh}=options,{width,height,exact}=openingPreviewAccumulatorPlan(options),n=width*height;
 let x0=new Uint32Array(width),x1=new Uint32Array(width),fx=new Float64Array(width),y0=new Uint32Array(height),y1=new Uint32Array(height),fy=new Float64Array(height);
 const axis=(size,out,a,b,f)=>{for(let i=0;i<out;i++){const at=Math.max(0,Math.min(size-1,(i+.5)*size/out-.5));a[i]=Math.floor(at);b[i]=Math.min(size-1,a[i]+1);f[i]=at-a[i];}};axis(sw,width,x0,x1,fx);axis(sh,height,y0,y1,fy);
 let sums=exact?new Uint8Array(n*3):new Float32Array(n*3),coverage=new Uint8Array(n),complete=0,closed=false;
 const lower=(array,v)=>{let l=0,h=array.length;while(l<h){const m=(l+h)>>>1;if(array[m]<v)l=m+1;else h=m;}return l;};
 return{
  get complete(){return complete===n;},get bytes(){return closed?0:sums.byteLength+coverage.byteLength+x0.byteLength+x1.byteLength+fx.byteLength+y0.byteLength+y1.byteLength+fy.byteLength;},
  // The merged support of the existing bilinear preview. Rows with zero
  // weight are omitted, including the upper row at exact pixel centres.
  *sourceRowSpans(){
   requireValue(!closed,'Opening preview is closed.');
   let start=y0[0],end=start+1;
   for(let index=0;index<height;index++){
    const top=y0[index],bottom=(fy[index]===0?top:y1[index])+1;
    if(top>end){yield [start,end];start=top;end=bottom;}
    else end=Math.max(end,bottom);
   }
   yield [start,end];
  },
  add({bytes,x=0,y,width:bw=sw,rows,pass,passes}={}){
   requireValue(!closed&&bytes instanceof Uint8Array&&[x,y,bw,rows].every(Number.isSafeInteger)&&x>=0&&y>=0&&bw>0&&rows>0&&x+bw<=sw&&y+rows<=sh&&bytes.length===bw*rows*3,'Invalid opening RGB rectangle.');
   if(pass!==undefined){requireValue(Number.isSafeInteger(pass)&&Number.isSafeInteger(passes)&&passes>0&&pass>=0&&pass<passes,'Invalid opening interlace pass.');if(pass!==passes-1)return;}
   if(exact){for(let row=0;row<rows;row++)for(let col=0;col<bw;col++){const at=(y+row)*sw+x+col;if(coverage[at]===15)continue;const from=(row*bw+col)*3,to=at*3;sums[to]=bytes[from];sums[to+1]=bytes[from+1];sums[to+2]=bytes[from+2];coverage[at]=15;complete++;}return;}
   const left=lower(x1,x),right=lower(x0,x+bw),top=lower(y1,y),bottom=lower(y0,y+rows);
   for(let oy=top;oy<bottom;oy++)for(let ox=left;ox<right;ox++){
    const at=oy*width+ox,previous=coverage[at];if(previous===15)continue;let mask=previous;
    for(let sample=0;sample<4;sample++){
     const bit=1<<sample;if(mask&bit)continue;
     const sx=sample&1?x1[ox]:x0[ox],sy=sample&2?y1[oy]:y0[oy],weight=(sample&1?fx[ox]:1-fx[ox])*(sample&2?fy[oy]:1-fy[oy]);
     if(weight===0){mask|=bit;continue;}if(sx<x||sx>=x+bw||sy<y||sy>=y+rows)continue;
     const from=((sy-y)*bw+sx-x)*3,to=at*3;for(let c=0;c<3;c++)sums[to+c]+=bytes[from+c]*weight;mask|=bit;
    }
    coverage[at]=mask;if(mask===15)complete++;
   }
  },
  finish(){requireValue(!closed&&complete===n,'Opening preview is incomplete.');const data=exact?sums:new Uint8Array(n*3);if(!exact)for(let i=0;i<data.length;i++)data[i]=Math.round(sums[i]);closed=true;sums=coverage=x0=x1=fx=y0=y1=fy=null;return{width,height,format:'rgb8',data};},
  dispose(){closed=true;sums=coverage=x0=x1=fx=y0=y1=fy=null;}
 };
}
