import "../../runtime-context.js?v=0.14.5";
import {serializeEngineError} from './errors.js';
import {noisesnifferStreamMath} from './noisesniffer-stream-math.js';
self.onmessage=async({data:j})=>{try{const math=await noisesnifferStreamMath(),result=j.op==='blocks'?math.blocks(j.rgb,j.width,j.height,j.w,j.extrema):math.mean8(j.rgb,j.width,j.height,j.dftWidth,j.dftHeight,j.blockHeight);self.postMessage({result},Object.values(result).filter(ArrayBuffer.isView).map(v=>v.buffer));}catch(error){self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}};
