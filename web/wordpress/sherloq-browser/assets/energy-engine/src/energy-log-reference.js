import "../../runtime-context.js?v=0.14.5";
export function referenceLogFunction(reference,bytes){
 const words=new Uint32Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/4),first=reference.minimumBits,last=reference.maximumBits,buckets=new Uint32Array(((last-first)>>>16)+2),float=new Float32Array(1),bits=new Uint32Array(float.buffer);
 let at=0;for(let bucket=0;bucket<buckets.length;bucket++){const key=first+bucket*65536;while(at<words.length&&words[at]<key)at+=2;buckets[bucket]=at;}
 return value=>{float[0]=value;const x=float[0],key=bits[0];if(key<first||key>last)throw Error('Outside qualified positive log domain');const bucket=(key-first)>>>16;let lo=buckets[bucket],hi=buckets[bucket+1];while(lo<hi){const mid=lo+((hi-lo)>>>2)*2;if(words[mid]<key)lo=mid+2;else hi=mid;}if(lo<buckets[bucket+1]&&words[lo]===key){bits[0]=words[lo+1];return float[0];}return Math.fround(Math.log(x));};
}
