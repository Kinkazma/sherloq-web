import "../../runtime-context.js?v=0.14.5";
import{EngineError,requireValue,checkAbort,controlCheckpoint}from'./errors.js';import{rgbRowSource,validateRgbRows}from'./rgb-row-source.js';import{createSHA256}from'../vendor/hash-wasm/hashes.js';
// The common engine owns this immutable surface for the entire queued analysis.
// Its memo is a canonical oriented RGB hash, never the original encoded-file hash.
export function createNeuralInput(surface,{budget}){
 const d=surface.descriptor;requireValue(d.format==='rgb8','Neural input requires qualified RGB8');const input=rgbRowSource(surface);let digest;
 return{width:input.width,height:input.height,region:bounds=>rgbRowSource(surface,bounds),async sha256({signal,onProgress}={}){
  checkAbort(signal);if(digest)return digest;const release=budget.reserve(1024**2);
  try{const rowBytes=input.width*3,rows=Math.min(input.height,Math.max(1,Math.floor(4*1024**2/rowBytes)),Math.floor((budget.limit-budget.retained-budget.active-Math.max(d.sourceWidth??d.width,d.sourceHeight??d.height)*3)/rowBytes));if(rows<1)throw new EngineError('MEMORY_LIMIT','One neural input hash row does not fit');
   const hash=await createSHA256();for(let y=0;y<input.height;y+=rows){await controlCheckpoint(signal);const count=Math.min(rows,input.height-y),view=await input.readRows(y,count,{signal});try{hash.update(validateRgbRows(view,input.width,count));}finally{view.release();}onProgress?.({phase:'pixel-sha256',completed:y+count,total:input.height});}
   checkAbort(signal);digest=hash.digest('hex');return digest;
  }finally{release();}
 }};
}
