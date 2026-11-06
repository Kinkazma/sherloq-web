import {EngineError,requireValue} from './errors.js';

// Restrict a defined, unshared wasm32 memory without changing instructions.
// Reject unsupported layouts explicitly; never turn a maximum into a minimum.
export function boundWasmMemory(bytes,maximumBytes){
  requireValue(bytes instanceof Uint8Array&&bytes.length>=8&&bytes[0]===0&&bytes[1]===97&&bytes[2]===115&&bytes[3]===109&&bytes[4]===1&&bytes[5]===0&&bytes[6]===0&&bytes[7]===0,'Invalid WebAssembly module.');
  requireValue(Number.isSafeInteger(maximumBytes)&&maximumBytes>=65536&&maximumBytes<=2**32&&maximumBytes%65536===0,'Memory maximum must be wasm32 pages.');
  const read=offset=>{let value=0,factor=1,i=offset;for(let n=0;n<5;n++){requireValue(i<bytes.length,'Truncated WebAssembly integer.');const b=bytes[i++];value+=(b&127)*factor;if(!(b&128)){requireValue(value<=0xffffffff,'Invalid WebAssembly integer.');return [value,i];}factor*=128;}throw new EngineError('INVALID_INPUT','Invalid WebAssembly integer.');};
  const encode=value=>{const out=[];do{let b=value%128;value=Math.floor(value/128);out.push(b+(value?128:0));}while(value);return out;};
  for(let offset=8;offset<bytes.length;){
    const section=offset,id=bytes[offset++],[length,start]=read(offset),end=start+length;
    requireValue(end<=bytes.length,'Truncated WebAssembly section.');
    if(id===5){
      const [count,next]=read(start);requireValue(count===1,'Expected exactly one defined memory.');
      const flags=bytes[next];requireValue(flags===1,'Expected bounded unshared wasm32 memory.');
      const [minimum,at]=read(next+1),[maximum,after]=read(at);requireValue(after===end,'Unexpected memory section.');
      const limit=Math.min(maximum,maximumBytes/65536);
      if(minimum>limit)throw new EngineError('MEMORY_LIMIT','WASM minimum exceeds shared memory admission.');
      const payload=[1,1,...encode(minimum),...encode(limit)],header=[5,...encode(payload.length),...payload];
      const result=new Uint8Array(section+header.length+bytes.length-end);result.set(bytes.subarray(0,section));result.set(header,section);result.set(bytes.subarray(end),section+header.length);return result;
    }
    offset=end;
  }
  throw new EngineError('INVALID_INPUT','Module has no supported defined memory.');
}
