import "../../runtime-context.js?v=0.25.0";
import {requireValue,checkAbort,controlCheckpoint} from './errors.js';
const raw=a=>new Uint8Array(a.buffer,a.byteOffset,a.byteLength),words=a=>new Uint32Array(a.buffer,a.byteOffset,a.length);
function bank(layout,side){requireValue(layout?.schema==='sherloq.efficient-loftr-context-bank-layout/26'&&!layout.closed&&(side===0||side===1)&&layout.banks[side]?.side===side,'Live native local context dictionary required.');return layout.banks[side];}
function reserve(budget,bytes){requireValue(Number.isSafeInteger(bytes)&&bytes>=0&&typeof budget?.reserve==='function','Exact coarse/fine byte admission required.');return budget.reserve(bytes);}

/** Literal source Transpose[0,2,3,1] then Reshape, independently in every
 * native context. Only uint32 payload addresses change; no FP32 operation or
 * normalization is repeated. The result is the ONE common coarse-score bank.
 */
export async function joinEfficientLoFtrContextCoarseFeatures(layout,side,maps,{budget,signal}={}){
 const b=bank(layout,side);requireValue(maps instanceof Map&&maps.size===b.contexts.length,'One final native NCHW feature map per context required.');checkAbort(signal);const release=reserve(budget,b.coarseCells*256*4+512*b.contexts.length);let returned=false;
 try{const data=new Float32Array(b.coarseCells*256),out=words(data),ranges=[];
  for(const c of b.contexts){const t=maps.get(c.id),cells=c.coarse.width*c.coarse.height;requireValue(t?.type==='float32'&&t.data instanceof Float32Array&&JSON.stringify(t.dims)===JSON.stringify([1,256,c.coarse.height,c.coarse.width])&&t.data.length===cells*256,'Local final coarse feature grid differs '+c.id);const input=words(t.data);
   for(let cell=0;cell<cells;cell++){for(let channel=0;channel<256;channel++)out[(c.coarseOffset+cell)*256+channel]=input[channel*cells+cell];if(cell%512===0)await controlCheckpoint(signal);}ranges.push({contextId:c.id,offset:c.coarseOffset,cells,nativeNCHW:t.dims});
  }
  checkAbort(signal);bank(layout,side);let released=false;returned=true;return{type:'float32',data,dims:[1,b.coarseCells,256],side,ranges,qualified:false,operation:'native Transpose/Reshape word permutation only',release(){if(!released){released=true;release();}}};
 }finally{if(!returned)release();}
}

/** Div was evaluated by the common native coarse-score graph. Return each
 * unchanged local sequence and its actual native H/W scalars to the existing
 * local FPN graph; no local score, softmax or normalization is computed.
 */
export async function splitEfficientLoFtrNormalizedCoarse(layout,side,tensor,{budget,signal}={}){
 const b=bank(layout,side);requireValue(tensor?.type==='float32'&&tensor.data instanceof Float32Array&&JSON.stringify(tensor.dims)===JSON.stringify([1,b.coarseCells,256])&&tensor.data.length===b.coarseCells*256,'Complete native Div-normalized coarse bank required.');checkAbort(signal);const release=reserve(budget,tensor.data.byteLength+528*b.contexts.length);let returned=false;
 try{const contexts=new Map();for(const c of b.contexts){const cells=c.coarse.width*c.coarse.height,data=new Float32Array(cells*256),start=c.coarseOffset*256*4;raw(data).set(raw(tensor.data).subarray(start,start+data.byteLength));contexts.set(c.id,{context:c,sequence:{type:'float32',dims:[1,cells,256],data},height:{type:'int64',dims:[],data:BigInt64Array.of(BigInt(c.coarse.height))},width:{type:'int64',dims:[],data:BigInt64Array.of(BigInt(c.coarse.width))}});if(c.index%16===0)await controlCheckpoint(signal);}
  checkAbort(signal);bank(layout,side);let released=false;returned=true;return{contexts,side,qualified:false,operation:'unchanged native Div sequence copy before native local FPN',release(){if(!released){released=true;release();}}};
 }finally{if(!returned)release();}
}

/** Actual local native Where/gather outputs ONLY. Every common selected row
 * must be supplied exactly once and is copied to its original ordinal before
 * ONE native Loop512 sees the patches. There is no missing-row fill, patch
 * manufacture, per-context fine matcher or confidence/feature calculation.
 */
export async function joinEfficientLoFtrContextFinePatches(rows,side,patches,{budget,signal}={}){
 requireValue((side===0||side===1)&&Number.isSafeInteger(rows?.count)&&rows.count>=0&&rows.count<=0xffffffff&&rows.banks?.length===2&&rows.banks[side].side===side&&patches instanceof Map,'Native selected-row dictionary and local gather outputs required.');checkAbort(signal);const selected=rows.banks[side].contexts,count=rows.count,size=side===0?64:100,rowWords=size*64;
 requireValue(patches.size===selected.length,'Every selected native context gather must be present.');const release=reserve(budget,count*rowWords*4+count+512*selected.length);let returned=false;
 try{const seen=new Uint8Array(count);let total=0;
  for(const g of selected){const t=patches.get(g.context.id),n=g.localIndices.length;requireValue(g.localIndices instanceof BigInt64Array&&g.ordinals instanceof Uint32Array&&g.ordinals.length===n&&t?.type==='float32'&&t.data instanceof Float32Array&&JSON.stringify(t.dims)===JSON.stringify([n,size,64])&&t.data.length===n*rowWords,'Actual local native fine gather grid differs '+g.context.id);
   for(const ordinal of g.ordinals){requireValue(ordinal<count&&!seen[ordinal],'Native selected fine row missing, duplicate or out of range.');seen[ordinal]=1;total++;}if(total%256===0)await controlCheckpoint(signal);
  }
  requireValue(total===count&&seen.every(v=>v===1),'A native fine row is absent; no zero-fill fallback is allowed.');const data=new Float32Array(count*rowWords),out=raw(data);
  for(const g of selected){const input=raw(patches.get(g.context.id).data);for(let local=0;local<g.ordinals.length;local++){const start=local*rowWords*4;out.set(input.subarray(start,start+rowWords*4),g.ordinals[local]*rowWords*4);if(local%64===0)await controlCheckpoint(signal);}}
  checkAbort(signal);let released=false;returned=true;return{type:'float32',data,dims:[count,size,64],side,qualified:false,operation:'native gather rows copied into unchanged common selected order',release(){if(!released){released=true;release();}}};
 }finally{if(!returned)release();}
}
