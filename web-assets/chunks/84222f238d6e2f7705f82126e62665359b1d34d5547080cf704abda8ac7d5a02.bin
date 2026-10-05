import "../../runtime-context.js?v=0.14.5";
import {requireValue,checkAbort} from './errors.js';

// Full selection and field are unchanged; only display pairs are sampled.
// Every source has one target, so the only duplicate is a reciprocal link.
export function sampleDenseLinks(targets, squared, selected, limit, {signal}={}) {
  const n=targets.length;
  requireValue(targets instanceof Int32Array&&squared instanceof Float32Array&&squared.length===n&&selected instanceof Uint8Array&&selected.length===n&&Number.isSafeInteger(limit)&&limit>=1, 'Invalid dense link sampling input.');
  const accepted=i=>{
    if(!selected[i])return false;
    const other=targets[i];
    return other>=0&&other<n&&!(selected[other]&&targets[other]===i&&
      (squared[other]<squared[i]||(squared[other]===squared[i]&&other<i)));
  };
  let total=0;
  for(let i=0;i<n;i++){if((i&65535)===0)checkAbort(signal);if(accepted(i))total++;}
  const count=Math.min(limit,total), rows=new Int32Array(count);
  const step=count>1?(total-1)/(count-1):0;
  let rank=0,written=0,wanted=0;
  for(let i=0;i<n&&written<count;i++){
    if((i&65535)===0)checkAbort(signal);
    if(!accepted(i))continue;
    if(rank===wanted){rows[written++]=i;wanted=written===count-1?total-1:Math.floor(written*step);}
    rank++;
  }
  checkAbort(signal);return {rows,total};
}

// Crop aligned source/target descriptor grids to the larger support. No
// interpolation: parity makes both offsets integer pixel centers.
export function alignDenseSupports(source,target,patch,targetPatch) {
  requireValue(Number.isInteger(patch)&&Number.isInteger(targetPatch)&&patch>=3&&targetPatch>=3&&patch<=32&&targetPatch<=32&&(patch-targetPatch)%2===0, 'Paired SIFT bins need equal parity and sizes 3..32.');
  const support=Math.max(patch,targetPatch),shift=1.5*support;
  const width=source.width-3*(support-patch),height=source.height-3*(support-patch);
  requireValue(source.dimensions===128&&target.dimensions===128&&width>0&&height>0&&target.width-3*(support-targetPatch)===width&&target.height-3*(support-targetPatch)===height, 'Paired SIFT grid mismatch.');
  const crop=(field,values,bin)=>{
    requireValue(values instanceof Float32Array&&values.length===field.width*field.height*128, 'Invalid SIFT descriptors.');
    const offset=1.5*(support-bin);
    if(!offset)return values;
    const out=new Float32Array(width*height*128);
    for(let y=0;y<height;y++){
      const first=((y+offset)*field.width+offset)*128;
      out.set(values.subarray(first,first+width*128),y*width*128);
    }
    return out;
  };
  return {width,height,dimensions:128,shift,first:crop(source,source.first,patch),second:crop(target,target.second,targetPatch)};
}
