import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue} from './errors.js';
import {wasmAllocationFailure} from './allocation.js';

// Worker-local. The broker owns the admitted heap capacity, while this phase
// retains the exact raw descriptor banks for all GPU iterations of one job.
export function densePmReverseHeapBound(firstBytes,secondBytes,count,axesBytes=0,activeCount=null){requireValue(Number.isSafeInteger(axesBytes)&&axesBytes>=0&&(activeCount===null||Number.isSafeInteger(activeCount)&&activeCount>=2&&activeCount<=count),'Invalid dense reverse axis/active capacity');const stateBytes=activeCount===null?count*17:count*5+activeCount*20;return Math.ceil((firstBytes+secondBytes+stateBytes+axesBytes+32*1024**2)/65536)*65536;}
export async function createDensePmReverse(first,second,mask,width,height,{dimensions=12,minimum=5,radius=600,compare=false,axes=null,gap=[0,0],reuseSymmetricScores=false,nativeDistanceInvariant=false,activeIndices=null,create}={}){
 const count=width*height,packed=activeIndices!==null,slots=packed&&activeIndices instanceof Int32Array?activeIndices.length:count;
 requireValue(first instanceof Float32Array&&second instanceof Float32Array&&mask instanceof Uint8Array&&[12,128].includes(dimensions)&&first.length===slots*dimensions&&second.length===first.length&&mask.length===count,'Invalid native reverse banks');
 if(packed){
  requireValue(activeIndices instanceof Int32Array&&Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0&&Number.isSafeInteger(count)&&count<0x7fffffff&&slots>=2&&slots<=count&&[minimum,radius].every(Number.isFinite)&&minimum>=0&&radius>=minimum&&Number.isFinite(Math.fround(radius))&&typeof compare==='boolean','Invalid active native reverse shape/settings');
  let admitted=0;for(let i=0;i<count;i++){requireValue(mask[i]<=3,'Invalid active native reverse membership');if(mask[i])admitted++;}requireValue(admitted===slots,'Active reverse indices must cover exactly the admitted mask');
  for(let i=0;i<slots;i++)requireValue(activeIndices[i]>=0&&activeIndices[i]<count&&(!i||activeIndices[i]>activeIndices[i-1])&&mask[activeIndices[i]]>0,'Active reverse indices must retain ascending native field indices');
 }
 requireValue(axes===null||Array.isArray(axes)&&axes.length===2&&axes.every((axis,i)=>axis instanceof Float32Array&&axis.length===[width,height][i]&&axis.every(Number.isFinite)),'Invalid native dense coordinate axes');
 requireValue((Array.isArray(gap)||gap instanceof Float32Array)&&gap.length===2&&Array.from(gap).every(v=>Number.isFinite(v)&&Number.isFinite(Math.fround(v))),'Invalid native dense comparison gap');
 requireValue(typeof reuseSymmetricScores==='boolean'&&typeof nativeDistanceInvariant==='boolean'&&(!reuseSymmetricScores||(first===second&&nativeDistanceInvariant)),'Symmetric dense reverse requires identical banks and producer-qualified native target distances');
 const gapx=Math.fround(gap[0]),gapy=Math.fround(gap[1]),metric=axes!==null||gapx!==0||gapy!==0;
 const bound=densePmReverseHeapBound(reuseSymmetricScores?0:first.byteLength,reuseSymmetricScores||second===first?0:second.byteLength,count,axes?(width+height)*4:0,packed?slots:null);
 if(bound>=2**31)throw new EngineError('MEMORY_LIMIT','Dense native reverse exceeds its WASM allowance');
 create??=(await import('../vendor/dense-pm/dense-pm-reverse.js')).default;
 let m=await create({print:()=>{}}),pointers=[],closed=false;
 const alloc=bytes=>{const value=m._malloc(bytes);if(!value)throw wasmAllocationFailure(m,'Dense reverse allocation refused',bytes);pointers.push(value);return value;};
 try{
  const a=reuseSymmetricScores?0:alloc(first.byteLength),b=reuseSymmetricScores?0:first===second?a:alloc(second.byteLength),allowed=alloc(mask.byteLength),indices=packed?alloc(slots*4):0,nativeMap=packed?alloc(count*4):0,state=alloc(slots*16),xmap=axes?alloc(width*4):0,ymap=axes?alloc(height*4):0;if(a)m.HEAPF32.set(first,a/4);if(b!==a)m.HEAPF32.set(second,b/4);m.HEAPU8.set(mask,allowed);if(axes){m.HEAPF32.set(axes[0],xmap/4);m.HEAPF32.set(axes[1],ymap/4);}
  if(packed){requireValue(['_dense_reverse_active_map','_dense_reverse_active_validate','_dense_reverse_state_active_range'].every(name=>typeof m[name]==='function'),'Native active reverse exports are unavailable');m.HEAP32.set(activeIndices,indices/4);requireValue(m._dense_reverse_active_map(allowed,indices,count,slots,nativeMap)===1,'Native active reverse index construction failed');}
  requireValue(m.HEAPU8.byteLength<=bound,'Native reverse heap exceeds admission');
  return {
   metric,packed,activeCount:packed?slots:null,symmetricScoreReuse:reuseSymmetricScores,heapBound:bound,
   get heapBytes(){return m?.HEAPU8.byteLength??0;},
   apply(values){if(closed)throw new EngineError('DISPOSED','Dense reverse has retired');requireValue(values instanceof Uint32Array&&values.length===slots*4,'Invalid native reverse field');m.HEAPU32.set(values,state/4);if(packed){requireValue(m._dense_reverse_active_validate(nativeMap,count,slots,state)===1,'Active reverse targets must remain admitted native field indices');requireValue(m._dense_reverse_state_active_range(a,b,allowed,indices,nativeMap,width,height,slots,dimensions,+compare,minimum,radius,gapx,gapy,xmap,ymap,state,+reuseSymmetricScores,0,slots)===1,'Native active reverse phase failed');}else if(reuseSymmetricScores){requireValue(typeof m._dense_reverse_state_symmetric_range==='function','Native symmetric reverse export is unavailable');m._dense_reverse_state_symmetric_range(allowed,width,height,dimensions,+compare,minimum,radius,gapx,gapy,xmap,ymap,state,0,count);}else if(metric){requireValue(typeof m._dense_reverse_state_metric_range==='function','Native dense metric reverse export is unavailable');m._dense_reverse_state_metric_range(a,b,allowed,width,height,dimensions,+compare,minimum,radius,gapx,gapy,xmap,ymap,state,0,count);}else m._dense_reverse_state_range(a,b,allowed,width,height,dimensions,+compare,minimum,radius,state,0,count);values.set(m.HEAPU32.subarray(state/4,state/4+values.length));return values;},
   dispose(){if(closed)return;while(pointers.length){m._free(pointers.at(-1));pointers.pop();}m=null;closed=true;}
  };
 }catch(error){while(pointers.length){m._free(pointers.at(-1));pointers.pop();}m=null;throw error;}
}
