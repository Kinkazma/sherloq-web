import "../../runtime-context.js?v=0.30.0";
// Private lossless addressing/dispatch hypothesis. All i/j values and random
// identities are native field indices before compaction, including SIFT shift.
export function buildActiveDensePlan(mask,width,height){
 if(!(mask instanceof Uint8Array)||!Number.isSafeInteger(width)||width<1||!Number.isSafeInteger(height)||height<1||mask.length!==width*height||!mask.every(v=>v<=3))throw Error('Invalid active field');
 const n=width*height,waves=width+2*height-2,blocks=Math.ceil(waves/4),groups=Math.ceil(height/4);let count=0,count0=0,count1=0;
 for(const v of mask){if(v)count++;if(v&1)count0++;if(v&2)count1++;}
 if(count>=0x3fffffff)throw Error('Encoded active field index exceeds31bit allowance');
 const indices=new Int32Array(count),flags=new Uint32Array(n),pool0=new Uint32Array(count0),pool1=new Uint32Array(count1),forward=new Uint8Array(blocks*groups),backward=new Uint8Array(blocks*groups);let slot=0,p0=0,p1=0;
 for(let i=0;i<n;i++)if(mask[i]){
  indices[slot]=i;flags[i]=((slot+1)*4)|mask[i];slot++;if(mask[i]&1)pool0[p0++]=i;if(mask[i]&2)pool1[p1++]=i;
  const x=i%width,y=Math.floor(i/width),u=x+2*y;forward[Math.floor(u/4)*groups+Math.floor(y/4)]=1;
  backward[Math.floor((waves-1-u)/4)*groups+Math.floor((height-1-y)/4)]=1;
 }
 const direction=bitmap=>{let activeTiles=0;for(const v of bitmap)activeTiles+=v;const offsets=new Uint32Array(blocks+1),rows=new Uint32Array(activeTiles);let next=0;for(let block=0;block<blocks;block++){offsets[block]=next;for(let group=0;group<groups;group++)if(bitmap[block*groups+group])rows[next++]=group;}offsets[blocks]=next;return{offsets,rows,activeTiles};};
 return{indices,flags,pool0,pool1,width,height,n,count,waves,blocks,groups,forward:direction(forward),backward:direction(backward)};
}
export function packActiveDenseBank(source,dimensions,indices){
 if(!(source instanceof Float32Array)||![12,128].includes(dimensions)||!(indices instanceof Int32Array))throw Error('Invalid active descriptor bank');const output=new Float32Array(indices.length*dimensions);for(let slot=0;slot<indices.length;slot++){const i=indices[slot];if(i<0||(i+1)*dimensions>source.length)throw Error('Active descriptor index exceeds native bank');output.set(source.subarray(i*dimensions,(i+1)*dimensions),slot*dimensions);}return output;
}

export function validActiveDenseIndices(input){if(input.activeIndices===undefined)return true;const {activeIndices:ids,mask}=input;if(!(ids instanceof Int32Array)||ids.length<2||ids.length>=0x3fffffff)return false;let slot=0;for(let i=0;i<mask.length;i++)if(mask[i]&&ids[slot++]!==i)return false;return slot===ids.length;}
