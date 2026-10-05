import "../../runtime-context.js?v=0.14.5";
import {imageCodec} from './codecs.js';
self.onmessage=async({data})=>{try{const pixels=await imageCodec.decode(data.bytes);self.postMessage({pixels,provenance:imageCodec.provenance(data.bytes),heapBytes:imageCodec.memoryBytes()},[pixels.data.buffer]);}catch(error){self.postMessage({error:{code:error.code??'CODEC_UNAVAILABLE',message:error.message}});}};
