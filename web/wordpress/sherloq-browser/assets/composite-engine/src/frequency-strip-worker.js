import "../../runtime-context.js?v=0.14.5";
import {frequencyStreamMath} from './frequency-stream-math.js';
self.onmessage=async({data})=>{try{const math=await frequencyStreamMath();let values;
 if(data.op==='axis')values=math.axis(data.values,data.length,data.lines,data.globalCount,data.mode);
 else if(data.op==='mask-horizontal')values=math.maskHorizontal(data.width,data.height,data.top,data.rows,data.split,data.smooth);
 else if(data.op==='mask-vertical')values=math.maskVertical(data.values,data.width,data.height,data.columns,data.smooth);
 else throw Error('Unknown frequency strip operation');self.postMessage({result:{values}},[values.buffer]);
 }catch(error){self.postMessage({error:{code:error.code??'WORKER_FAILED',message:error.message}});}};
