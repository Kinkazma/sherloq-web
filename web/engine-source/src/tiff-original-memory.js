import {EngineError,requireValue} from './errors.js';
import {importedWasmMemoryDescriptor} from './wasm-memory-limit.js';
const MiB=1024**2,PAGE=65536,ceilPage=n=>Math.ceil(n/PAGE)*PAGE;
export const TIFF_STREAM_MODULE_MAXIMUM_BYTES=2**32,TIFF_STREAM_GROWTH_MAXIMUM_BYTES=2**32-PAGE,TIFF_STREAM_INITIAL_BYTES=16*MiB,TIFF_STREAM_SINGLE_ALLOCATION_MAXIMUM_BYTES=0x7fffffff;
export const TIFF_STREAM_READ_CACHE_BYTES=256*1024,TIFF_STREAM_IO_HEADROOM_BYTES=8*MiB;
const list=x=>x===undefined?[]:Array.isArray(x)?x:[x];
export function tiffOriginalMemoryPlan(header,{moduleMaximumBytes=TIFF_STREAM_MODULE_MAXIMUM_BYTES}={}){
 const width=header?.sourceWidth,height=header?.sourceHeight,tiled=header?.tileWidth!==undefined||header?.tileHeight!==undefined,entries=header?.directories?.[0]?.entries??[],value=tag=>entries.find(e=>e.tag===tag)?.value;
 requireValue(Number.isSafeInteger(width)&&width>0&&Number.isSafeInteger(height)&&height>0,'Original TIFF dimensions required.');
 const blockWidth=tiled?header.tileWidth:width,blockHeight=tiled?header.tileHeight:Math.min(height,value(278)??height),pixels=blockWidth*blockHeight,bandBytes=tiled?width*Math.min(height,blockHeight)*3:0;
 requireValue(Number.isSafeInteger(blockWidth)&&blockWidth>0&&Number.isSafeInteger(blockHeight)&&blockHeight>0&&Number.isSafeInteger(24*pixels+16*MiB)&&Number.isSafeInteger(bandBytes),'Original TIFF block/band extent exceeds safe addressing.');
 requireValue(Number.isSafeInteger(moduleMaximumBytes)&&moduleMaximumBytes>=TIFF_STREAM_INITIAL_BYTES&&moduleMaximumBytes<=2**32&&moduleMaximumBytes%PAGE===0,'Invalid Original TIFF module import extent.');
 const samples=header.samples??1,planeSamples=(header.planarConfig??1)===2?1:samples,decodedBlockBytes=Math.ceil(blockWidth*(header.depth??8)*planeSamples/8)*blockHeight;
 requireValue(Number.isSafeInteger(decodedBlockBytes)&&decodedBlockBytes>=0,'Original TIFF decoded sample extent exceeds safe addressing.');
 let encodedBlockBytes=0;for(const n of list(value(tiled?325:279))){requireValue(Number.isSafeInteger(n)&&n>=0,'Original TIFF encoded block extent exceeds safe addressing.');encodedBlockBytes=Math.max(encodedBlockBytes,n);}
 const rasterBytes=4*pixels,rgbBlockBytes=3*pixels,largestKnownAllocationBytes=Math.max(rasterBytes,decodedBlockBytes,encodedBlockBytes),minimumHeapBytes=Math.max(TIFF_STREAM_INITIAL_BYTES,ceilPage(2*largestKnownAllocationBytes));
 const plannedMaximumBytes=Math.max(TIFF_STREAM_INITIAL_BYTES,Math.ceil((16*MiB+24*pixels)/(16*MiB))*16*MiB,minimumHeapBytes),moduleGrowthMaximumBytes=Math.min(moduleMaximumBytes,TIFF_STREAM_GROWTH_MAXIMUM_BYTES),heapMaximumBytes=Math.min(plannedMaximumBytes,moduleGrowthMaximumBytes);
 if(largestKnownAllocationBytes>TIFF_STREAM_SINGLE_ALLOCATION_MAXIMUM_BYTES||heapMaximumBytes<minimumHeapBytes)throw new EngineError('MEMORY_LIMIT','The original TIFF block exceeds its native wasm32 allocation extent.',{details:{boundary:'original-tiff-wasm32',blockWidth,blockHeight,largestKnownAllocationBytes,minimumHeapBytes,moduleGrowthMaximumBytes}});
 return{blockWidth,blockHeight,blockPixels:pixels,tiled,bandBytes,rasterBytes,rgbBlockBytes,decodedBlockBytes,encodedBlockBytes,largestKnownAllocationBytes,minimumHeapBytes,plannedMaximumBytes,heapMaximumBytes,moduleMaximumBytes,moduleGrowthMaximumBytes,readCacheBytes:TIFF_STREAM_READ_CACHE_BYTES,ioHeadroomBytes:TIFF_STREAM_IO_HEADROOM_BYTES,workingBytes:heapMaximumBytes+bandBytes+TIFF_STREAM_IO_HEADROOM_BYTES};
}
export function selectTiffOriginalBacking(plan,{budget,outputBytes}={}){
 requireValue(budget?.reserve&&typeof budget.total==='function'&&Number.isSafeInteger(budget.limit)&&Number.isSafeInteger(outputBytes)&&outputBytes>=0,'Actual central Budget and RGB8 output extent required.');
 const requiredBytes=outputBytes+plan.workingBytes+(plan.strategy?2*MiB:0);let primary;
 try{budget.room?.(requiredBytes);}catch(error){if(error?.code!=='MEMORY_LIMIT')throw error;primary=error;}
 const availableBytes=Math.max(0,budget.limit-budget.total()),storage=!primary&&requiredBytes<=availableBytes?'memory':'temporary';return{storage,requiredBytes,availableBytes,outputBytes,codecHeapPreferredBytes:plan.heapMaximumBytes,bandBytes:plan.bandBytes,ioHeadroomBytes:plan.ioHeadroomBytes??null,scope:'Normal cache reclamation and actual budget; no output bytes are reserved by this planning result'};
}
export function admitTiffOriginalHeap(plan,{budget}={}){
 requireValue(budget?.reserve&&typeof budget.total==='function'&&Number.isSafeInteger(budget.limit),'Original TIFF requires the actual central Budget.');
 let primary;try{budget.room?.(plan.workingBytes);}catch(error){if(error?.code!=='MEMORY_LIMIT')throw error;primary=error;}
 const availableBytes=Math.max(0,budget.limit-budget.total()),heapMaximumBytes=Math.floor(Math.min(plan.heapMaximumBytes,Math.max(0,availableBytes-plan.bandBytes-plan.ioHeadroomBytes))/PAGE)*PAGE;
 if(heapMaximumBytes<plan.minimumHeapBytes)throw primary??new EngineError('MEMORY_LIMIT','Original TIFF native working set exceeds the currently available budget.',{details:{requestedBytes:plan.minimumHeapBytes+plan.bandBytes+plan.ioHeadroomBytes,availableBytes,budgetBytes:budget.limit}});
 const reservedWorkingBytes=heapMaximumBytes+plan.bandBytes,lease=budget.reserve(reservedWorkingBytes),descriptor=importedWasmMemoryDescriptor({initialBytes:TIFF_STREAM_INITIAL_BYTES,memoryBudgetBytes:heapMaximumBytes,moduleMaximumBytes:plan.moduleMaximumBytes});let released=false,active;
 const a={...plan,heapMaximumBytes,descriptor,reservedWorkingBytes,singleAllocationMaximumBytes:Math.min(Math.floor(heapMaximumBytes/2),TIFF_STREAM_SINGLE_ALLOCATION_MAXIMUM_BYTES),constrainedByBudget:heapMaximumBytes<plan.heapMaximumBytes,
  release(){if(released)return;if(active)return active;const mark=value=>{if(value===0||value===false)throw value;released=true;};const answer=lease();if(answer&&typeof answer.then==='function'){active=Promise.resolve(answer).then(mark).finally(()=>{active=null;});return active;}mark(answer);},
  snapshot(){return{...plan,heapMaximumBytes,reservedWorkingBytes,singleAllocationMaximumBytes:a.singleAllocationMaximumBytes,constrainedByBudget:a.constrainedByBudget,released,ioPolicy:'Read-cache/source-verification/temporary IO charge their real central owners; headroom is not reserved a second time'}}};return a;
}
export function unsignedTiffPointer(value,heapBytes,byteLength,{alignment=1,allowZero=false}={}){
 const pointer=value>>>0;requireValue(Number.isInteger(value)&&value>=-(2**31)&&value<=2**32-1&&Number.isSafeInteger(heapBytes)&&heapBytes>=0&&Number.isSafeInteger(byteLength)&&byteLength>=0&&Number.isSafeInteger(alignment)&&alignment>0&&pointer%alignment===0&&(allowZero||pointer>0||byteLength===0)&&pointer<=heapBytes-byteLength,'TIFF returned an invalid unsigned wasm32 byte range.');return pointer;
}
export function tiffEncodedReadRange(target,length,offset,heapBytes,sourceBytes){
 requireValue(Number.isSafeInteger(length)&&length>=0&&length<=TIFF_STREAM_SINGLE_ALLOCATION_MAXIMUM_BYTES&&Number.isSafeInteger(sourceBytes)&&sourceBytes>=0&&Number.isSafeInteger(offset)&&offset>=0&&offset<=sourceBytes-length,'TIFF encoded read exceeds the unchanged original source.');return{target:unsignedTiffPointer(target,heapBytes,length,{allowZero:true}),length,offset};
}

// Retire native dependency first. A failed codec close may still borrow the
// unchanged encoded source and output IO; those parents remain owned on NACK.
export function createTiffImportRetirement(owners){
 const pending=owners.filter(owner=>typeof owner?.dispose==='function');let closed=false,active;
 const group={snapshot:()=>({closed,pendingOwners:pending.length}),dispose(){if(closed)return Promise.resolve();if(active)return active;active=(async()=>{while(pending.length){const value=await pending[0].dispose();if(value===false||value===0)throw value;pending.shift();}closed=true;})().finally(()=>{active=null;});return active;}};return group;
}
