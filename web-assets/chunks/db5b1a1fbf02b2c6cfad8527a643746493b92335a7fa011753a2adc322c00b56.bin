import "../../runtime-context.js?v=0.30.0";
import {installTransformStripWorker} from './transform-strip-worker.js';
import {noisesnifferStreamMath,noisesnifferStreamHeapBytes} from './noisesniffer-stream-math.js';
installTransformStripWorker(async j=>{if(j.op==='precomputed')return {heapBytes:noisesnifferStreamHeapBytes()};const math=await noisesnifferStreamMath(),result=j.op==='blocks'?math.blocks(j.rgb,j.width,j.height,j.w,j.extrema):j.op==='base'?math.base(j.rgb,j.width,j.height,j.w,j.extrema):j.op==='dct'?math.dct(j.rgb,j.width,j.height,j.w):math.mean8(j.rgb,j.width,j.height,j.dftWidth,j.dftHeight,j.blockHeight);return {...result,heapBytes:noisesnifferStreamHeapBytes()};},{label:'noisesniffer-strip'});
