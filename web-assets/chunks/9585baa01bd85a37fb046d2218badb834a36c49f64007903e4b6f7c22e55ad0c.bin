import "../../runtime-context.js?v=0.14.5";
import {requireValue} from './errors.js';import {RowWorkers} from './row-workers.js';
export class AdjustWorkers extends RowWorkers{
 constructor(count,options){super(count,new URL('./adjust-worker.js',import.meta.url),(data,input)=>{
  const pixels=input.image.width*input.rows;requireValue(data.bytes instanceof Uint8Array&&data.bytes.length===pixels*3&&Number.isFinite(data.localMs)&&data.localMs>=0&&Number.isFinite(data.histogramMs)&&data.histogramMs>=0,'Invalid adjustment worker output.');
  if(input.params.equalize>=2)requireValue(data.histogram instanceof Int32Array&&data.histogram.length===16384&&data.histogram.every(x=>x>=0)&&data.histogram.reduce((a,b)=>a+b,0)===input.pw*input.rows,'Incomplete global CLAHE worker histogram.');
 },options);}
}
