import {copyTypedArray} from './allocation.js';
/** ORT CPU outputs own their JS storage. Borrowed/subarray/shared outputs and
 * aliases of feeds keep the copy boundary; independent full buffers can move. */
export function neuralOutputTransfer(outputs,feeds,outputBytes){
 const protectedBuffers=new Set(Object.values(feeds).filter(t=>t.location==='cpu'||t.location==='cpu-pinned').map(t=>t.data.buffer));
 const result={},transfers=new Set();let bytes=0,copiedOutputBytes=0;
 for(const [name,tensor] of Object.entries(outputs)){
  const data=tensor.data;bytes+=data.byteLength;
  if(bytes>outputBytes)throw Error('Model output exceeds admitted size');
  const movable=tensor.location==='cpu'&&data.buffer instanceof ArrayBuffer&&data.byteOffset===0&&data.byteLength===data.buffer.byteLength&&!protectedBuffers.has(data.buffer);
  const values=movable?data:copyTypedArray(data,{label:'neural-output-transfer'});if(!movable)copiedOutputBytes+=values.byteLength;
  result[name]={data:values,dims:[...tensor.dims],type:tensor.type};transfers.add(values.buffer);
 }
 return {result,transfers:[...transfers],copiedOutputBytes};
}
