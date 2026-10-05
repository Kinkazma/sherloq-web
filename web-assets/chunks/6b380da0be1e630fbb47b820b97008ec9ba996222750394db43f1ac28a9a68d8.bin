import {requireValue} from './errors.js';import {RowWorkers} from './row-workers.js';
export class SeparationWorkers extends RowWorkers{
 constructor(count){super(count,new URL('./separation-worker.js',import.meta.url),(data,input)=>{
  const pixels=input.image.width*input.rows;requireValue(data.bytes instanceof Uint8Array&&data.bytes.length===pixels*3&&Number.isFinite(data.kernelMs)&&data.kernelMs>=0&&Number.isFinite(data.postprocessMs)&&data.postprocessMs>=0,'Invalid separation worker result.');
  if(!input.params.denoised&&input.params.levels===0){requireValue(data.histograms instanceof Float64Array&&data.histograms.length===768&&data.histograms.every(x=>Number.isSafeInteger(x)&&x>=0),'Invalid separation histogram.');for(let c=0;c<3;c++)requireValue(data.histograms.subarray(c*256,(c+1)*256).reduce((a,b)=>a+b,0)===pixels,'Incomplete separation histogram.');}
 });}
}
