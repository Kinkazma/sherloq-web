import "../../runtime-context.js?v=0.15.1";
import {installTransformStripWorker} from './transform-strip-worker.js';
import {noisesnifferStreamMath,noisesnifferStreamHeapBytes} from './noisesniffer-stream-math.js';
installTransformStripWorker(async j=>{const math=await noisesnifferStreamMath(),result=j.op==='blocks'?math.blocks(j.rgb,j.width,j.height,j.w,j.extrema):math.mean8(j.rgb,j.width,j.height,j.dftWidth,j.dftHeight,j.blockHeight);return {...result,heapBytes:noisesnifferStreamHeapBytes()};},{label:'noisesniffer-strip'});
