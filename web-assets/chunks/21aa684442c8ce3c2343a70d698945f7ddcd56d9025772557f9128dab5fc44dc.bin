import "../../runtime-context.js?v=0.14.5";
import {m3ImageShape} from './m3-image-shape.js';
import {checkAbort} from './errors.js';
// Materialization is admitted by the existing oriented surface reader. It does
// not reinterpret JPEG tiles as independent images or change detector scale.
export async function withM3Pixels(records,{signal,onProgress}={},compute){
 const leases=[];try{
  const unique=[...new Set(records)];let completed=0;
  for(const record of unique){checkAbort(signal);if(record.segmented&&!record.pixels){const descriptor=record.surface.descriptor;m3ImageShape(descriptor.width,descriptor.height);const lease=await record.surface.readWindow({x:0,y:0,width:descriptor.width,height:descriptor.height},{signal});leases.push([record,lease]);record.pixels=lease.pixels;}completed++;onProgress?.({phase:'source-access',fraction:completed/unique.length});}
  checkAbort(signal);return await compute();
 }finally{for(const [record,lease] of leases){delete record.pixels;lease.release();}}
}
