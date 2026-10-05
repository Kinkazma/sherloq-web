import "../../runtime-context.js?v=0.14.5";
import {numpySum} from './numpy-sum.js';
import {requireValue,controlCheckpoint,checkAbort} from './errors.js';
const BLOCK=8192;
export const PRNU_NCC_WORKSPACE_BYTES=BLOCK*3*8;
function shape(first,second){const width=Math.min(first.width,second.width),height=Math.min(first.height,second.height);requireValue(Number.isSafeInteger(width)&&Number.isSafeInteger(height)&&width>0&&height>0,'PRNU fingerprints cannot be empty.');return {width,n:width*height};}
function copy(fp,width,start,out){for(let i=0;i<out.length;){const at=start+i,y=Math.floor(at/width),x=at%width,count=Math.min(out.length-i,width-x);out.set(fp.values.subarray(y*fp.width+x,y*fp.width+x+count),i);i+=count;}}
async function read(fp,width,start,out,signal){
 if(fp.values){copy(fp,width,start,out);return;}
 requireValue(fp.store?.readInto,'A PRNU array or segmented float64 store is required.');
 const bytes=new Uint8Array(out.buffer,out.byteOffset,out.byteLength);
 if(width===fp.width){await fp.store.readInto(bytes,start*8);return;}
 for(let i=0;i<out.length;){checkAbort(signal);const at=start+i,y=Math.floor(at/width),x=at%width,count=Math.min(out.length-i,width-x);await fp.store.readInto(bytes.subarray(i*8,(i+count)*8),(y*fp.width+x)*8);i+=count;}
}
function accumulate(a,b,c,ma,mb){for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;c[i]=x*y;a[i]=x*x;b[i]=y*y;}return [numpySum(a),numpySum(b),numpySum(c)];}
function score(aa,bb,ab){const denominator=Math.sqrt(aa*bb);return denominator>1e-10?ab/denominator:0;}
// Preserve NumPy's 8192-element buffered reduction boundaries even when a crop
// crosses physical storage rows. Never replace it by per-tile statistics.
export function prnuNcc(first,second){
 const {width,n}=shape(first,second),size=Math.min(BLOCK,n),a=new Float64Array(size),b=new Float64Array(size),c=new Float64Array(size);let ma=0,mb=0,aa=0,bb=0,ab=0;
 for(let at=0;at<n;at+=BLOCK){const count=Math.min(BLOCK,n-at),av=a.subarray(0,count),bv=b.subarray(0,count);copy(first,width,at,av);copy(second,width,at,bv);ma+=numpySum(av);mb+=numpySum(bv);}ma/=n;mb/=n;
 for(let at=0;at<n;at+=BLOCK){const count=Math.min(BLOCK,n-at),av=a.subarray(0,count),bv=b.subarray(0,count),cv=c.subarray(0,count);copy(first,width,at,av);copy(second,width,at,bv);const sums=accumulate(av,bv,cv,ma,mb);aa+=sums[0];bb+=sums[1];ab+=sums[2];}return score(aa,bb,ab);
}
export async function prnuNccStored(first,second,{signal,admit=()=>()=>{},onProgress}={}){
 const {width,n}=shape(first,second),size=Math.min(BLOCK,n),release=admit(size*24);
 try{const a=new Float64Array(size),b=new Float64Array(size),c=new Float64Array(size);let ma=0,mb=0,aa=0,bb=0,ab=0;
  for(let pass=0;pass<2;pass++){
   for(let at=0;at<n;at+=BLOCK){await controlCheckpoint(signal);const count=Math.min(BLOCK,n-at),av=a.subarray(0,count),bv=b.subarray(0,count),cv=c.subarray(0,count);await read(first,width,at,av,signal);await read(second,width,at,bv,signal);if(pass===0){ma+=numpySum(av);mb+=numpySum(bv);}else{const sums=accumulate(av,bv,cv,ma,mb);aa+=sums[0];bb+=sums[1];ab+=sums[2];}onProgress?.((pass*n+at+count)/(2*n));}
   if(pass===0){ma/=n;mb/=n;}
  }checkAbort(signal);return score(aa,bb,ab);
 }finally{release();}
}
