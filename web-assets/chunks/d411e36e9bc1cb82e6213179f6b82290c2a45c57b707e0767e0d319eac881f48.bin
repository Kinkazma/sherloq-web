import "../../runtime-context.js?v=0.14.5";
import {requireValue} from './errors.js';

// Only the explicit input window travels back. Scientific outputs keep their
// own ownership and are never borrowed as the next tile's writable input.
export function siftReplyWithInput(job,result){
 const transfer=[...new Set(Object.values(result).filter(ArrayBuffer.isView).map(value=>value.buffer))];
 if(!job.reusableInput)return {message:result,transfer};
 const {id,capacityBytes}=job.reusableInput,buffer=job.input?.buffer;
 requireValue(Number.isSafeInteger(id)&&id>0&&buffer instanceof ArrayBuffer&&buffer.byteLength===capacityBytes,'Invalid reusable SIFT input return.');
 if(!transfer.includes(buffer))transfer.push(buffer);
 return {message:{...result,returnedInput:{id,buffer}},transfer};
}
