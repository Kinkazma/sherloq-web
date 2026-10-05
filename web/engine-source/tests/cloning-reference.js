import {cloningNormFunction} from '../src/cloning-math.js';
import {cloningGeometry,cloningAngleStd} from '../src/cloning-post.js';
export function ensure(ok,message){if(!ok)throw Error(message);}
export function cloningFixture(reference,payload,file,Type=Uint8Array){
  const item=reference.files[file];ensure(item,'Missing reference '+file);
  return new Type(payload.buffer,payload.byteOffset+item.offset,item.bytes/Type.BYTES_PER_ELEMENT);
}
export function exactCloning(actual,expected,label){ensure(actual.length===expected.length,label+' length');for(let i=0;i<actual.length;i++)ensure(actual[i]===expected[i],label+' value '+i);}
export function compareCloning(result,item,read,algorithm='ORB'){
  for(const [key,value]of Object.entries(item.stats))ensure(result.data.stats[key]===value,'Native statistic '+key);
  ensure(result.data.algorithm===algorithm,'Explicit '+algorithm);
  exactCloning(result.data.points,read(item.prefix+'-points.f64',Float64Array),'Keypoints');
  exactCloning(result.data.matches,read(item.prefix+'-filtered.f64',Float64Array),'Filtered ordered matches');
  exactCloning(result.data.groupLengths,read(item.prefix+'-lengths.u32',Uint32Array),'Group lengths');
  exactCloning(result.data.groupIndices,read(item.prefix+'-groups.u32',Uint32Array),'Group indices');
  exactCloning(result.pixels.data,read(item.prefix+'.rgb'),'RGB visualization');
  ensure(result.metrics.memory.activeReservationBytes===0,'Released job reservations');
  ensure(result.metrics.memory.peakAccountedBytes<=result.metrics.memory.budgetBytes,'Accounted budget');
}
export async function verifyCloningPrimitives(reference,read){
  const norm=await cloningNormFunction(),values=read('norm-primitives.f64',Float64Array);
  for(let i=0;i<values.length;i+=3)ensure(norm(values[i],values[i+1])===values[i+2],'Native scalar norm '+i);
  for(const row of reference.primitives.stats)ensure(cloningAngleStd(read(row.file,Float32Array))===row.std,'Native float32 std '+row.file);
  for(const row of reference.primitives.geometry)for(const pairCache of ['off','on']){const result=await cloningGeometry(Float64Array.from(row.points),Float64Array.from(row.matches),row.distance,norm,{pairCache});exactCloning(result.matches,row.filtered,'Boundary matches');exactCloning(result.lengths,row.lengths,'Boundary lengths');exactCloning(result.groups,row.groups,'Boundary groups');}
  return {norms:values.length/3,standardDeviations:reference.primitives.stats.length,boundaries:reference.primitives.geometry.length};
}
