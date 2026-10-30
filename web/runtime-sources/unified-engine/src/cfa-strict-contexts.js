import "../../runtime-context.js?v=0.30.0";
import {EngineError,requireValue,checkAbort,controlCheckpoint} from './errors.js';
import {planCfaNativeCells} from './cfa-native-cell-plan.js';
import {cfaPostprocess} from './cfa-postprocess.js';

export function cfaStrictParameters({variant='Original',block=32,tile=512}={}) {
 requireValue(['Original','JPEG 95','Sans JPEG'].includes(variant),'Unavailable CFA variant.');
 requireValue(Number.isSafeInteger(block)&&block>=8&&block%2===0,'CFA block must be even and at least eight.');
 requireValue(Number.isSafeInteger(tile)&&tile>=0,'Invalid CFA tile size.');
 return Object.freeze({variant,block,tile});
}
/** Native cells anchored to the real calculation window; technical read cuts never create a grid. */
export async function planCfaStrictContexts(view,params,options={}) {
 return planCfaNativeCells(view,cfaStrictParameters(params),options);
}

/** Preserve every raw native channel. Only the temporary input to the native
 * global postprocessor is permuted into Original's decoded 2x2 CFA phase. */
export function copyCfaNativeContext(target,native,fragment,totalCells) {
 const n=fragment.count,d=native?.data,indices=fragment.cellOffsets;
 requireValue(!indices||Array.isArray(indices)&&indices.length===n&&indices.every(i=>Number.isSafeInteger(i)&&i>=0&&i<totalCells),'Invalid CFA native cell destinations.');
 const destination=i=>indices?indices[i]:fragment.offset+i;
 requireValue(d?.probabilities instanceof Float32Array&&d.probabilities.length===16*n&&d.grids instanceof Float32Array&&d.grids.length===4*n&&d.local_grid instanceof Uint8Array&&d.local_grid.length===n&&d.suspicion instanceof Float32Array&&d.suspicion.length===n&&JSON.stringify(d.gridShape)===JSON.stringify(fragment.gridShape),'CFA native context returned another grid.');
 for(let channel=0;channel<16;channel++)for(let i=0;i<n;i++) {
  const value=d.probabilities[channel*n+i];requireValue(Number.isFinite(value),'Nonfinite CFA probability.');
  target.probabilities[channel*totalCells+destination(i)]=value;
 }
 for(let k=0;k<4;k++)for(let i=0;i<n;i++){const value=d.grids[k*n+i];requireValue(Number.isFinite(value),'Nonfinite native CFA grid.');target.native_grids[k*totalCells+destination(i)]=value;}
 for(let i=0;i<n;i++)requireValue(d.local_grid[i]<4&&Number.isFinite(d.suspicion[i]),'Invalid native CFA class or suspicion.');
 for(let i=0;i<n;i++){target.native_local_grid[destination(i)]=d.local_grid[i];target.native_suspicion[destination(i)]=d.suspicion[i];}
}
export function postprocessCfaStrictContexts(probabilities,fragments,cells) {
 requireValue(probabilities instanceof Float32Array&&probabilities.length===16*cells,'Invalid packed CFA probabilities.');
 if(!cells)return{grids:new Float32Array(),means:new Float32Array(4),best:null,local:new Uint8Array(),suspicion:new Float32Array()};
 const aligned=new Float32Array(probabilities.length),seen=new Uint8Array(cells);let counted=0;
 for(const f of fragments) {
  requireValue(Number.isSafeInteger(f.offset)&&f.offset>=0&&Number.isSafeInteger(f.count)&&f.count>=0&&Number.isInteger(f.phase)&&f.phase>=0&&f.phase<4&&(!f.cellOffsets||Array.isArray(f.cellOffsets)&&f.cellOffsets.length===f.count),'Invalid CFA context population or phase.');
  for(let i=0;i<f.count;i++){const at=f.cellOffsets?f.cellOffsets[i]:f.offset+i;requireValue(Number.isSafeInteger(at)&&at>=0&&at<cells&&!seen[at],'CFA native cell is missing, duplicated or outside its population.');seen[at]=1;counted++;for(let row=0;row<4;row++)for(let c=0;c<4;c++)aligned[(row*4+c)*cells+at]=probabilities[((row^f.phase)*4+c)*cells+at];}
 }
 if(counted!==cells)throw new EngineError('INVALID_RESULT','CFA contexts do not cover their packed native cells.');
 return cfaPostprocess(aligned,cells);
}
