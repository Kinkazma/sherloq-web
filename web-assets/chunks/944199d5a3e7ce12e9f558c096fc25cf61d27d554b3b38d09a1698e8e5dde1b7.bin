import "../../runtime-context.js?v=0.33.2";
import {requireValue} from './errors.js';
import {RowWorkers} from './row-workers.js';

// Parent producer admits each Source loan, transfer/output staging and one
// existing separation arithmetic heap per actor. No second pool or worker
// budget is manufactured by this operation-specific transport adapter.
export class Native16AdjustWorkers extends RowWorkers{
 constructor(count,options={}){
  super(count,new URL('./native16-adjust-worker.js',import.meta.url),(data,input)=>{
   const samples=input.image.width*input.rows*3;
   requireValue(data.bytes instanceof Uint16Array&&data.bytes.length===samples&&Number.isFinite(data.kernelMs)&&data.kernelMs>=0,'Invalid native16 adjustment worker result.');
  },{...options,resourceOwner:options.resourceOwner??'native16-adjust'});
 }
}
