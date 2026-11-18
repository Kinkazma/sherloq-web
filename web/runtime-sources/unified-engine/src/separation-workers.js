import "../../runtime-context.js?v=0.33.2";
import {requireValue} from './errors.js';import {RowWorkers} from './row-workers.js';
export class SeparationWorkers extends RowWorkers{
 constructor(count,options){super(count,new URL('./separation-worker.js',import.meta.url),(data,input)=>{
  if(input.image.data instanceof Uint16Array){const pixels=input.image.width*input.rows;requireValue(data.bytes instanceof Uint16Array&&data.bytes.length===pixels*3&&Number.isFinite(data.kernelMs)&&data.kernelMs>=0&&Number.isFinite(data.postprocessMs)&&data.postprocessMs>=0,'Invalid native16 separation worker result.');if(input.params.denoised){requireValue(data.histograms===null,'Denoised native16 worker must not publish a residual histogram.');return;}requireValue(data.histograms instanceof Float64Array&&data.histograms.length===3*65536&&data.histograms.every(x=>Number.isSafeInteger(x)&&x>=0),'Invalid native16 separation histogram.');for(let c=0;c<3;c++)requireValue(data.histograms.subarray(c*65536,(c+1)*65536).reduce((a,b)=>a+b,0)===pixels,'Incomplete native16 separation histogram.');return;}
  const pixels=input.image.width*input.rows;requireValue(data.bytes instanceof Uint8Array&&data.bytes.length===pixels*3&&Number.isFinite(data.kernelMs)&&data.kernelMs>=0&&Number.isFinite(data.postprocessMs)&&data.postprocessMs>=0,'Invalid separation worker result.');
  if(!input.params.denoised&&input.params.levels===0){requireValue(data.histograms instanceof Float64Array&&data.histograms.length===768&&data.histograms.every(x=>Number.isSafeInteger(x)&&x>=0),'Invalid separation histogram.');for(let c=0;c<3;c++)requireValue(data.histograms.subarray(c*256,(c+1)*256).reduce((a,b)=>a+b,0)===pixels,'Incomplete separation histogram.');}
 },options);}
}
