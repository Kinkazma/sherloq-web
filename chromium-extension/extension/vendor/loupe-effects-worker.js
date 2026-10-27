import {createLoupeEffectsKernel} from './loupe-effects-kernel.js';
import {OPENCV_OPERATIONS} from './unified-engine/src/opencv-operations.js';
import {magnifier} from './unified-engine/src/magnifier.js';
import {serializeEngineError} from './unified-engine/src/errors.js';
const process=createLoupeEffectsKernel({adjust:async(image,p,hooks)=>(await OPENCV_OPERATIONS['inspection.adjust'].compute(image,p,hooks)).pixels,enhance:async(image,p,hooks)=>(await magnifier(image,p,hooks)).pixels});
self.onmessage=async({data:job})=>{try{const start=performance.now(),result=await process(job);result.metrics.elapsedMs=performance.now()-start;self.postMessage({ticket:job.ticket,...result},result.frames.map(f=>f.data.buffer));}catch(error){self.postMessage({ticket:job.ticket,error:serializeEngineError(error)});}};
