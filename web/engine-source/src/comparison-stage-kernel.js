import {copyTypedArray} from './allocation.js';
import create from '../vendor/comparison-stream/comparison-stream.js';
import {EngineError,requireValue} from './errors.js';
export async function createComparisonStageKernel(options={}){
 let m=await create(options),length=0,output=0;
 return {
  call(job){requireValue(m,'Comparison stage disposed.');
   if(job.op==='create'){requireValue(m._comparison_stream_create(job.width,job.height),'Comparison dimensions or allocation failed.');length=job.width*job.height*3;return {};}
   if(job.op==='input'){
    requireValue([0,1].includes(job.index)&&job.bytes instanceof Uint8Array&&job.offset>=0&&job.offset%3===0&&job.bytes.length%3===0&&job.offset+job.bytes.length<=length,'Invalid comparison input band.');
    const at=m._comparison_stream_input(job.index)+job.offset,b=job.bytes;for(let i=0;i<b.length;i+=3){m.HEAPU8[at+i]=b[i+2];m.HEAPU8[at+i+1]=b[i+1];m.HEAPU8[at+i+2]=b[i];}return {};
   }
   if(job.op==='run'){
    if(!m._comparison_stream_run(job.mode,+job.view,+job.original))throw new EngineError('INVALID_INPUT','Global comparison stage failed.');output=m._comparison_stream_bytes();
    return {score:m._comparison_stream_score(),values:[2,3,5].includes(job.mode)?copyTypedArray(m.HEAPF64.subarray(m._comparison_stream_output()/8,(m._comparison_stream_output()+output)/8),{label:'comparison-stage-kernel-output'}):undefined,outputBytes:job.view?output:0,heapBytes:m.HEAPU8.byteLength};
   }
   if(job.op==='output'){requireValue(job.offset>=0&&job.length>=0&&job.offset+job.length<=output,'Invalid comparison output band.');const at=m._comparison_stream_output()+job.offset;return {bytes:copyTypedArray(m.HEAPU8.subarray(at,at+job.length),{label:'comparison-stage-kernel-output'})};}
   throw new EngineError('INVALID_INPUT','Unknown comparison stage operation.');
  },
  dispose(){m?._comparison_stream_release();m=null;},
 };
}
