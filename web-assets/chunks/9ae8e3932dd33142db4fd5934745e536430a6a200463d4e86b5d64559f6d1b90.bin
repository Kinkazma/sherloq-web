import "../../runtime-context.js?v=0.14.5";
// Port of NumPy 1.26.4 aquicksort_/aheapsort_, by Charles R. Harris.
// Upstream source and BSD-3-Clause license: vendor/numpy-sort/.
// Preserve the native reference's unstable tie order; JS stable sort differs.
export function numpyArgsort(values){
 const a=Uint32Array.from({length:values.length},(_,i)=>i);
 const less=(x,y)=>x<y||(!Number.isNaN(x)&&Number.isNaN(y));
 const swap=(i,j)=>{const t=a[i];a[i]=a[j];a[j]=t;};
 function heap(lo,n){
  const base=lo-1;
  function sift(i,n,tmp){for(let j=i*2;j<=n;j*=2){if(j<n&&less(values[a[base+j]],values[a[base+j+1]]))j++;if(!less(values[tmp],values[a[base+j]]))break;a[base+i]=a[base+j];i=j;}a[base+i]=tmp;}
  for(let l=n>>1;l>0;l--)sift(l,n,a[base+l]);
  while(n>1){const tmp=a[base+n];a[base+n]=a[base+1];sift(1,--n,tmp);}
 }
 let lo=0,hi=a.length-1,depth=(a.length?Math.floor(Math.log2(a.length)):0)*2;const stack=[];
 for(;;){
  if(depth<0)heap(lo,hi-lo+1);
  else{
   while(hi-lo>15){
    const mid=lo+((hi-lo)>>1);
    if(less(values[a[mid]],values[a[lo]]))swap(mid,lo);
    if(less(values[a[hi]],values[a[mid]]))swap(hi,mid);
    if(less(values[a[mid]],values[a[lo]]))swap(mid,lo);
    const pivot=values[a[mid]];let i=lo,j=hi-1;swap(mid,j);
    for(;;){do{i++;}while(less(values[a[i]],pivot));do{j--;}while(less(pivot,values[a[j]]));if(i>=j)break;swap(i,j);}
    swap(i,hi-1);--depth;
    if(i-lo<hi-i){stack.push([i+1,hi,depth]);hi=i-1;}else{stack.push([lo,i-1,depth]);lo=i+1;}
   }
   for(let i=lo+1;i<=hi;i++){const vi=a[i],v=values[vi];let j=i;while(j>lo&&less(v,values[a[j-1]])){a[j]=a[j-1];j--;}a[j]=vi;}
  }
  if(!stack.length)break;[lo,hi,depth]=stack.pop();
 }
 return a;
}
