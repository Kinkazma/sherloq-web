/* Private worker boundary. Original GRIP-UNINA terms are in LICENSE.txt. */
import {prepareRaw as rawCpu,poolRows as poolCpu} from './cpu-features.mjs';

export const prepareRaw=options=>rawCpu(options);
export const poolRows=({raw,options={}})=>poolCpu(raw,options);

/** GPU output is C-order [50 numerators, pooled valid weight] per cell.
 * This final CPU division and the public grid coordinates match poolRows.
 */
export function normalize({sums,outRows,outCols,features=50,rawRowStart=0,
  stride=8,ksize=128,saturationProb=.85}) {
  if(!Number.isSafeInteger(outRows)||outRows<1||!Number.isSafeInteger(outCols)||outCols<1
    ||features!==50||!Number.isSafeInteger(rawRowStart)||rawRowStart<0
    ||(stride!==4&&stride!==8)||(ksize!==64&&ksize!==128)
    ||!Number.isFinite(saturationProb)||saturationProb<0||saturationProb>1)
    throw new RangeError('Invalid GPU pooling normalization geometry');
  const cells=outRows*outCols;
  if(!Number.isSafeInteger(cells)||!Number.isSafeInteger(cells*51)
    ||!(sums instanceof Float32Array)||sums.length!==cells*51)
    throw new RangeError('Invalid interleaved GPU pooling sums');
  const spam=new Float32Array(cells*50),weights=new Float32Array(cells),valid=new Uint8Array(cells);
  const range0=new Float64Array(outRows),range1=new Float64Array(outCols),k=ksize/stride;
  for(let i=0;i<cells;i++) {
    const at=i*51,w=sums[at+50],denominator=Math.max(w,1e-20);
    weights[i]=w;valid[i]=w>=saturationProb;
    for(let f=0;f<50;f++)spam[i*50+f]=Math.fround(sums[at+f]/denominator);
  }
  for(let y=0;y<outRows;y++)range0[y]=(rawRowStart+y)*stride+4+(stride-1)/2+(k-1)*stride/2;
  for(let x=0;x<outCols;x++)range1[x]=x*stride+4+(stride-1)/2+(k-1)*stride/2;
  return {spam,weights,valid,range0,range1,shape:[outRows,outCols,50]};
}
