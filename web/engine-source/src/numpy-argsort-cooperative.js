import {checkAbort,createCooperator} from './errors.js';
import {allocateTypedArray} from './allocation.js';
// Same NumPy1.26.4 aquicksort_/aheapsort_ graph as numpy-argsort.js.
// Upstream by CharlesR.Harris, BSD-3-Clause in vendor/numpy-sort/.
// Checkpoints do not reorder comparisons, swaps or unstable ties.
export async function numpyArgsortCooperative(values,{signal,cooperate=createCooperator(signal)}={}){
 checkAbort(signal);const a=allocateTypedArray(Uint32Array,values.length,{label:'cooperative-NumPy-order'});for(let i=0;i<a.length;i++){a[i]=i;if((i&16383)===0)await cooperate();}
 const less=(x,y)=>x<y||(!Number.isNaN(x)&&Number.isNaN(y)),swap=(i,j)=>{const t=a[i];a[i]=a[j];a[j]=t;};let steps=0,segments=0;
 async function heap(lo,n){const base=lo-1;
  function sift(i,n,tmp){for(let j=i*2;j<=n;j*=2){if(j<n&&less(values[a[base+j]],values[a[base+j+1]]))j++;if(!less(values[tmp],values[a[base+j]]))break;a[base+i]=a[base+j];i=j;}a[base+i]=tmp;}
  for(let l=n>>1;l>0;l--){sift(l,n,a[base+l]);if((l&2047)===0)await cooperate();}
  while(n>1){const tmp=a[base+n];a[base+n]=a[base+1];sift(1,--n,tmp);if((n&2047)===0)await cooperate();}
 }
 let lo=0,hi=a.length-1,depth=(a.length?Math.floor(Math.log2(a.length)):0)*2;const stack=[];
 for(;;){if((++segments&511)===0)await cooperate();
  if(depth<0)await heap(lo,hi-lo+1);
  else{while(hi-lo>15){const mid=lo+((hi-lo)>>1);if(less(values[a[mid]],values[a[lo]]))swap(mid,lo);if(less(values[a[hi]],values[a[mid]]))swap(hi,mid);if(less(values[a[mid]],values[a[lo]]))swap(mid,lo);
    const pivot=values[a[mid]];let i=lo,j=hi-1;swap(mid,j);
    for(;;){do{i++;if((++steps&16383)===0)await cooperate();}while(less(values[a[i]],pivot));do{j--;if((++steps&16383)===0)await cooperate();}while(less(pivot,values[a[j]]));if(i>=j)break;swap(i,j);}
    swap(i,hi-1);--depth;if(i-lo<hi-i){stack.push([i+1,hi,depth]);hi=i-1;}else{stack.push([lo,i-1,depth]);lo=i+1;}
   }
   for(let i=lo+1;i<=hi;i++){const vi=a[i],v=values[vi];let j=i;while(j>lo&&less(v,values[a[j-1]])){a[j]=a[j-1];j--;}a[j]=vi;}
  }
  if(!stack.length)break;[lo,hi,depth]=stack.pop();
 }
 checkAbort(signal);return a;
}
