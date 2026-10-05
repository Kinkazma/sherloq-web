import {DenseWriteBatch} from '../src/dense-write-batch.js';
import {EngineError} from '../src/errors.js';
const target=Number(new URL(self.location.href).searchParams.get('phase'));let phase=0,failed=false;
self.addEventListener('message',({data})=>{if(data.task)phase=data.task[0];});
const write=DenseWriteBatch.prototype.write;
DenseWriteBatch.prototype.write=function(...args){const value=write.apply(this,args);if(!failed&&phase===target){failed=true;throw new EngineError('MEMORY_ALLOCATION','Injected refusal after private command write',{cause:new RangeError('Injected allocation'),details:{allocationKind:'array-buffer',requestedBytes:4096}});}return value;};
import '../src/dense-field-kernel-worker.js';
