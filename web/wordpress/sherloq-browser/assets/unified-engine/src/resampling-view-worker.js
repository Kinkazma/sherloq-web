import "../../runtime-context.js?v=0.14.5";
import {serializeEngineError} from './errors.js';
import {resamplingFourierView} from './resampling-fourier.js';
self.onmessage=async({data})=>{try{
 const result={data:{magnitude:data.values,minimumMagnitude:data.low,maximumMagnitude:data.high,geometry:{outputSide:data.width}}};
 // Partial row groups are independent; the renderer traverses the supplied rows.
 await resamplingFourierView(result,data.params,{},undefined,data.rows);
 postMessage({values:result.data.values,pixels:result.pixels.data},[result.data.values.buffer,result.pixels.data.buffer]);
 }catch(error){postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}};
