import "../../runtime-context.js?v=0.33.3";
import {serializeEngineError,requireValue} from './errors.js';
import {allocateTypedArray} from './allocation.js';
import {adjustNative16PrefixRows} from './native16-adjust-prefix.js';

self.onmessage=async({data})=>{
 try{
  const {image,params,start,rows,nativeOriginX=0,nativeWidth=image?.width}=data;
  requireValue(image?.data instanceof Uint16Array&&[image.width,image.height,start,rows].every(Number.isSafeInteger)&&image.width>0&&image.height>0&&start>=0&&rows>0&&start+rows<=image.height&&Number.isSafeInteger(image.width*rows*3),'Invalid native16 adjustment worker window.');
  // This target is financed by the parent's admitted output/transfer staging.
  // Passing it explicitly keeps the worker free of a fake independent Budget.
  const began=performance.now(),bytes=allocateTypedArray(Uint16Array,image.width*rows*3,{label:'native16-adjust-row-worker-output'});
  const result=await adjustNative16PrefixRows(image,params,start,rows,{target:bytes,nativeOriginX,nativeWidth});
  self.postMessage({bytes:result.data,kernelMs:performance.now()-began},[result.data.buffer]);
 }catch(error){self.postMessage({error:serializeEngineError(error,'WORKER_FAILED')});}
};
