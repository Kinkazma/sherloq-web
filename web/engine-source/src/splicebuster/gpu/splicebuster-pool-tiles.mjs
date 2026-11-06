import {planPoolRectangle} from './splicebuster-pool-gpu.mjs';
const fail=(code,message,details)=>Object.assign(new Error(message),{code,details});

/** Exact local-window partition. Pooling remains the same global domain;
 * every rectangle reads its ky-1/kx-1 raw-feature halo and is written at its
 * original pooled coordinates. No per-tile model or normalization is fitted.
 */
export function planPoolTiles(shape,{ky=16,kx=16,limits={},maximumGpuBytes=Infinity,
 maximumHostWorkingBytes=Infinity,maxRowsPerTile=Infinity,maxColsPerTile=Infinity}={}){
 const [rows,cols,features]=shape,outRows=rows-ky+1,outCols=cols-kx+1;
 const fits=(h,w)=>{
  try{
   const p=planPoolRectangle({rows:h+ky-1,cols:w+kx-1,features,ky,kx},limits,maximumGpuBytes);
   // Conservative allowance for a packed input rectangle, a returned sums
   // array, and normalized local output. Original/result bank is separate.
   p.hostWorkingBytes=p.inputBytes+p.weightBytes+p.outputBytes*2+p.hostParameterBytes;
   return p.hostWorkingBytes<=maximumHostWorkingBytes?p:null;
  }catch(e){if(e.code==='GPU_LIMIT')return null;throw e;}
 };
 const largest=(max,fn)=>{let lo=1,hi=Math.floor(max),best=0;while(lo<=hi){const mid=Math.floor((lo+hi)/2);if(fn(mid)){best=mid;lo=mid+1;}else hi=mid-1;}return best;};
 if(outRows<1||outCols<1)throw fail('INVALID_INPUT','Raw field is smaller than pooling support');
 const tileCols=largest(Math.min(outCols,maxColsPerTile),w=>fits(1,w));
 const tileRows=tileCols?largest(Math.min(outRows,maxRowsPerTile),h=>fits(h,tileCols)):0;
 if(!tileRows)throw fail('GPU_LIMIT','Even one exact pooling window exceeds the supplied working-set limits',{maximumGpuBytes,maximumHostWorkingBytes});
 const maximum=fits(tileRows,tileCols);
 return {shape:[outRows,outCols,features],tileRows,tileCols,maximum,
  tileCount:Math.ceil(outRows/tileRows)*Math.ceil(outCols/tileCols),
  *rectangles(){for(let top=0;top<outRows;top+=tileRows)for(let left=0;left<outCols;left+=tileCols){
   const outputRows=Math.min(tileRows,outRows-top),outputCols=Math.min(tileCols,outCols-left);
   yield {top,left,outputRows,outputCols,rawRows:outputRows+ky-1,rawCols:outputCols+kx-1,
    plan:fits(outputRows,outputCols)};
  }}};
}

/** Convenience for a contiguous immutable raw field. A full-width stripe
 * borrows views; column partitions pack only their bounded halo rectangle.
 * Ownership/copies are explicit so the caller can reserve before allocating.
 */
export function rawRectanglePlan(raw,rect){
 const [rows,cols,features]=raw.shape;
 if(rect.top<0||rect.left<0||rect.top+rect.rawRows>rows||rect.left+rect.rawCols>cols)throw fail('INVALID_INPUT','Raw rectangle exceeds field');
 const borrowed=rect.left===0&&rect.rawCols===cols;
 return {borrowed,inputBytes:rect.rawRows*rect.rawCols*features*4,weightBytes:rect.rawRows*rect.rawCols*4,
  allocationBytes:borrowed?0:rect.rawRows*rect.rawCols*(features+1)*4};
}

export function readRawRectangle(raw,rect,{spam,weights}={}){
 const plan=rawRectanglePlan(raw,rect),[,cols,features]=raw.shape;
 if(plan.borrowed){const start=rect.top*cols,cells=rect.rawRows*cols;
  return {spam:raw.spam.subarray(start*features,(start+cells)*features),weights:raw.weights.subarray(start,start+cells),shape:[rect.rawRows,rect.rawCols,features],borrowed:true};}
 spam??=new Float32Array(plan.inputBytes/4);weights??=new Float32Array(plan.weightBytes/4);
 if(spam.byteLength!==plan.inputBytes||weights.byteLength!==plan.weightBytes)throw fail('INVALID_INPUT','Rectangle destination has wrong extent');
 for(let y=0;y<rect.rawRows;y++){
  const from=(rect.top+y)*cols+rect.left,to=y*rect.rawCols;
  spam.set(raw.spam.subarray(from*features,(from+rect.rawCols)*features),to*features);
  weights.set(raw.weights.subarray(from,from+rect.rawCols),to);
 }
 return {spam,weights,shape:[rect.rawRows,rect.rawCols,features],borrowed:false};
}

/** Reserve this amount before creating an owned transferable rectangle.
 * In contrast with readRawRectangle, this never returns source-backing views.
 */
export function rawRectangleTransferPlan(raw,rect){
 const p=rawRectanglePlan(raw,rect);return {...p,borrowed:false,allocationBytes:p.inputBytes+p.weightBytes};
}
export function copyRawRectangleForTransfer(raw,rect,{spam,weights}={}){
 const p=rawRectangleTransferPlan(raw,rect),[,cols,features]=raw.shape;
 spam??=new Float32Array(p.inputBytes/4);weights??=new Float32Array(p.weightBytes/4);
 if(spam.byteLength!==p.inputBytes||weights.byteLength!==p.weightBytes)throw fail('INVALID_INPUT','Transfer rectangle destination has wrong extent');
 if(spam.buffer===raw.spam.buffer||weights.buffer===raw.weights.buffer)throw fail('INVALID_INPUT','Transfer rectangle must not alias source backing');
 for(let y=0;y<rect.rawRows;y++){
  const from=(rect.top+y)*cols+rect.left,to=y*rect.rawCols;
  spam.set(raw.spam.subarray(from*features,(from+rect.rawCols)*features),to*features);
  weights.set(raw.weights.subarray(from,from+rect.rawCols),to);
 }
 return {spam,weights,shape:[rect.rawRows,rect.rawCols,features],borrowed:false};
}

export function writePooledRectangle(destination,local,rect){
 const [,cols,features]=destination.shape;
 if(local.shape[0]!==rect.outputRows||local.shape[1]!==rect.outputCols||local.shape[2]!==features)throw fail('INVALID_INPUT','Pooled rectangle geometry mismatch');
 for(let y=0;y<rect.outputRows;y++){
  const to=(rect.top+y)*cols+rect.left,from=y*rect.outputCols;
  destination.spam.set(local.spam.subarray(from*features,(from+rect.outputCols)*features),to*features);
  destination.weights.set(local.weights.subarray(from,from+rect.outputCols),to);
 }
}
