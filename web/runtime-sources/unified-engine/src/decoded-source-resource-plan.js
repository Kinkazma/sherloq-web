import "../../runtime-context.js?v=0.33.2";
import {nativeMagickResource} from './native-magick-resources.js';
import {EngineError,requireValue} from './errors.js';
const MiB=1024**2,page=65536,aligned=bytes=>Math.floor(bytes/page)*page;
const wasm32=4*1024*MiB;
export function decodedSourceResourcePlan({budget,blob,integrity,header,selection,decoderReadMemory}){
 const pixels=(header.sourceWidth??header.width)*(header.sourceHeight??header.height),
  sourceChannels=(selection.sourceModel==='CMYK'?4:selection.sourceModel==='GRAY'?1:3)+(selection.alpha?1:0),
  quantumBytes=selection.quantumDepth===32?8:4,typedBytes=pixels*sourceChannels*(quantumBytes===8?4:2),
  cacheBytes=pixels*5*quantumBytes,resource=nativeMagickResource(selection.quantumDepth);
 requireValue(Number.isSafeInteger(cacheBytes)&&cacheBytes>0,'Invalid native image extent.');
 const available=budget.limit-budget.total(),runtimeBytes=2*resource.wasmBytes+8*MiB;
 // A small, already admitted encoded array is faster. Large encoded inputs
 // remain on the same filesystem interface using their verified File windows.
 const encodedInputMode=2*blob.size<=Math.min(32*MiB,Math.max(0,available/8))?'owned-array':'seekable';
 const inputBytes=2*(encodedInputMode==='owned-array'?blob.size:Math.min(blob.size,integrity.chunkBytes));
 const bandBytes=Math.max(Math.min(cacheBytes,8*MiB),header.sourceWidth*5*8),
  cacheTransferBytes=Math.min(8*MiB,Math.max(MiB,cacheBytes)),transport=Math.max(bandBytes,cacheTransferBytes),
  metadataHeadroomBytes=4*MiB;
 const fixed=runtimeBytes+inputBytes+2*transport+2*integrity.states.byteLength+16384;
 // Keep the decoded bank in RAM when there is room. Core's own cache uses
 // its heap first when it fits, then the common resident/temporary cache.
 const nonCacheHeap=Math.max(64*MiB,32*MiB+4*bandBytes+Math.min(blob.size,64*MiB),
  decoderReadMemory?32*MiB+decoderReadMemory.nativeReadScratchBytes:0);
 const maxHeap=Math.min(wasm32,aligned(available-fixed-metadataHeadroomBytes));
 const bankRoom=aligned(maxHeap-typedBytes);
 const estimatedCacheBytes=pixels*sourceChannels*quantumBytes,
  localHeap=Math.ceil((nonCacheHeap+estimatedCacheBytes*1.35)/page)*page,
  useLocalCache=localHeap<=bankRoom;
 // A cache that cannot be held in the Wasm heap belongs to the parent
 // store. Reserving those same bytes in both owners would push it to disk
 // and can also evict the native bank. Leave that allowance at the parent.
 const codecHeapBytes=useLocalCache?localHeap:Math.min(Math.ceil(nonCacheHeap/page)*page,maxHeap);
 if(codecHeapBytes<32*MiB)throw new EngineError('MEMORY_LIMIT','The native decoder and its input windows exceed the available memory.');
 const cacheMemoryBytes=useLocalCache?Math.min(cacheBytes+page,codecHeapBytes-nonCacheHeap):1;
 return{maximumMemoryBytes:codecHeapBytes,codecHeapBytes,runtimeBytes,encodedInputMode,bandBytes,cacheTransferBytes,cacheMemoryBytes,
  cacheResidentBytes:available,cacheLogicalBytes:cacheBytes,metadataHeadroomBytes};
}

