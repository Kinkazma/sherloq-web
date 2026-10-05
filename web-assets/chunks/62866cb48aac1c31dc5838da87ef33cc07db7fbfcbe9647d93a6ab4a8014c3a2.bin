import "../../runtime-context.js?v=0.14.5";
// NumPy 1.26 contiguous float64 pairwise reduction, preserving its eight lanes.
export function numpySum(a,start=0,n=a.length){
 if(n<8){let sum=-0;for(let i=0;i<n;i++)sum+=a[start+i];return sum;}
 if(n<=128){const r=Array.from(a.subarray(start,start+8));let i=8;for(;i<n-n%8;i+=8)for(let j=0;j<8;j++)r[j]+=a[start+i+j];let sum=((r[0]+r[1])+(r[2]+r[3]))+((r[4]+r[5])+(r[6]+r[7]));for(;i<n;i++)sum+=a[start+i];return sum;}
 let cut=Math.floor(n/2);cut-=cut%8;return numpySum(a,start,cut)+numpySum(a,start+cut,n-cut);
}
// NumPy's buffered reduce iterator presents at most 8192 float64 elements to
// each inner pairwise sum, then accumulates the partials in encounter order.
export function numpyBufferedSum(a){let sum=0;for(let start=0;start<a.length;start+=8192)sum+=numpySum(a,start,Math.min(8192,a.length-start));return sum;}
