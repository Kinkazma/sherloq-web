import "../../runtime-context.js?v=0.30.0";
import {inspectJpegBlob} from './jpeg.js';
import {inspectPngSource} from './png-header-source.js';
import {inspectTiffSource} from './tiff-header-source.js';
import {EngineError,requireValue,checkAbort} from './errors.js';

// The original encoded owner is independent of its decoded pixel layout.
// Reuse the same bounded structural parsers, preserving original byte offsets.
export async function inspectStructureSource(source,{signal,account,onProgress}={}){
 requireValue(typeof account==='function','Structure metadata admission required.');checkAbort(signal);onProgress?.(0);checkAbort(signal);
 const part=await source.read(0,Math.min(8,source.byteLength),{signal});let kind;
 try{const b=part.bytes;if(b[0]===255&&b[1]===216)kind='jpeg';else if(b.length===8&&[137,80,78,71,13,10,26,10].every((v,i)=>b[i]===v))kind='png';else if(b[0]===73&&b[1]===73||b[0]===77&&b[1]===77)kind='tiff';}finally{part.release();}
 let header;
 if(kind==='jpeg'){
  // JPEG's admitted prefix also owns its materialized parser records.
  const admitted={byteLength:source.byteLength,async read(offset,length,hooks){const done=account(length*32);try{const p=await source.read(offset,length,hooks);return{bytes:p.bytes,release(){p.release();done();}};}catch(e){done();throw e;}}};
  header={format:'jpeg',...await inspectJpegBlob(admitted,{signal})};
 }else if(kind==='png'||kind==='tiff')header=(await(kind==='png'?inspectPngSource:inspectTiffSource)(source,{signal,account})).header;
 else throw new EngineError('UNSUPPORTED_FORMAT','Structural metadata supports original JPEG, PNG and TIFF containers.');
 checkAbort(signal);onProgress?.(1);checkAbort(signal);return header;
}
