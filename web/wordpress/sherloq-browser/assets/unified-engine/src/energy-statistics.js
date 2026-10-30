import "../../runtime-context.js?v=0.30.0";
const f=Math.fround;

// NumPy's float32 reduction order: eight independent lanes up to128 values,
// then the same recursive split. Direct loads avoid allocating an eight-lane
// object and invoking a getter for every leaf. The generic reference stays in
// energy-prepare.js for callers with a streamed getter.
export function energyArrayPairwise(values,start,n,mean,variance=false){
 const term=i=>{const value=values[i];if(!variance)return value;const d=f(value-mean);return f(d*d);};
 if(n<8){let total=-0;for(let i=0;i<n;i++)total=f(total+term(start+i));return total;}
 if(n>128){let cut=Math.floor(n/2);cut-=cut%8;return f(energyArrayPairwise(values,start,cut,mean,variance)+energyArrayPairwise(values,start+cut,n-cut,mean,variance));}
 let a=term(start),b=term(start+1),c=term(start+2),d=term(start+3),e=term(start+4),g=term(start+5),h=term(start+6),j=term(start+7),i=8;
 for(;i<n-n%8;i+=8){const at=start+i;a=f(a+term(at));b=f(b+term(at+1));c=f(c+term(at+2));d=f(d+term(at+3));e=f(e+term(at+4));g=f(g+term(at+5));h=f(h+term(at+6));j=f(j+term(at+7));}
 let total=f(f(f(a+b)+f(c+d))+f(f(e+g)+f(h+j)));for(;i<n;i++)total=f(total+term(start+i));return total;
}
