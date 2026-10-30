import "../../runtime-context.js?v=0.30.0";
import {neuralWindowAck} from './neural-window-job-owner.js';
import {checkAbort,requireValue} from './errors.js';
const f=Math.fround,MiB=1024**2,tensor=(data,dims)=>({type:'float32',data,dims});
/** Existing native SDDH patch/offset/sample/aggregation recipe. Full features
 * remain in the already prepaid caller array; only actual key patches enter
 * the original-weight ONNX operators, so no full-map transpose enters Wasm. */
export async function describeAlikedPreparedKeys(features,keys,c,{budget,pool,owner,signal,onProgress,consume}={}){
 const w=c.preparedWidth,h=c.preparedHeight,n=w*h,k=keys.length/2;
 requireValue(features instanceof Float32Array&&features.length===128*n&&keys instanceof Float32Array&&Number.isInteger(k)&&k<=512,'Fine native SDDH input geometry changed.');
 owner.credit(budget.reserve(32*MiB+32768*k));const patches=new Float32Array(k*128*9),wh=Float32Array.of(w-1,h-1);
 for(let i=0;i<k;i++){const px=f(f(f(keys[i*2]/2)+.5)*(w-1)),py=f(f(f(keys[i*2+1]/2)+.5)*(h-1)),x=Math.max(0,Math.min(w-4,Math.trunc(Math.trunc(px)-.5))),y=Math.max(0,Math.min(h-4,Math.trunc(Math.trunc(py)-.5)));for(let channel=0;channel<128;channel++)for(let yy=0;yy<3;yy++)for(let xx=0;xx<3;xx++)patches[(i*128+channel)*9+yy*3+xx]=features[channel*n+(y+yy)*w+x+xx];}
 checkAbort(signal);const offsets=await pool.run('aliked/describe-offset',{patch:tensor(patches,[k,128,3,3]),keypoints:tensor(keys,[k,2]),wh:tensor(wh,[2])},{backend:'cpu',cpuRequired:true,signal,onProgress,workspaceBytes:32*MiB+k*32768,outputBytes:k*16*4*4});const releaseOffsets=owner.own(()=>neuralWindowAck(()=>offsets.release()),'fine native SDDH offsets');checkAbort(signal);
 const positions=offsets.result.positions?.data,offset=offsets.result.offset?.data;requireValue(positions instanceof Float32Array&&positions.length===k*16*2&&offset instanceof Float32Array,'Fine native SDDH offsets changed.');const sampled=new Float32Array(k*128*16);
 for(let i=0;i<k;i++)for(let pos=0;pos<16;pos++){const at=(i*16+pos)*2,x=f(f(f(positions[at]+1)/2)*(w-1)),y=f(f(f(positions[at+1]+1)/2)*(h-1)),ix=Math.floor(x),iy=Math.floor(y),dx=f(x-ix),dy=f(y-iy),weights=[f(f(1-dx)*f(1-dy)),f(dx*f(1-dy)),f(f(1-dx)*dy),f(dx*dy)],coords=[[ix,iy],[ix+1,iy],[ix,iy+1],[ix+1,iy+1]];
  for(let channel=0;channel<128;channel++){let value=0;for(let j=0;j<4;j++){const [xx,yy]=coords[j];const v=xx>=0&&xx<w&&yy>=0&&yy<h?features[channel*n+yy*w+xx]:0;value=f(value+f(v*weights[j]));}sampled[(i*128+channel)*16+pos]=value;}
 }
 const described=await pool.run('aliked/describe',{x:tensor(sampled,[k,128,16,1])},{backend:'cpu',cpuRequired:true,signal,onProgress,workspaceBytes:32*MiB+sampled.byteLength*4,outputBytes:k*128*4});const releaseDescribed=owner.own(()=>neuralWindowAck(()=>described.release()),'fine native SDDH descriptors');checkAbort(signal);requireValue(described.result.descriptors?.data instanceof Float32Array&&described.result.descriptors.data.length===k*128,'Fine native SDDH descriptor shape changed.');const result=await consume({descriptors:described.result.descriptors.data,offset});checkAbort(signal);await releaseDescribed();await releaseOffsets();return result;
}
