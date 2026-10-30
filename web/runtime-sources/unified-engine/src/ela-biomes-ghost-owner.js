import "../../runtime-context.js?v=0.30.0";
import {allocateTypedArray} from './allocation.js';
import {ownGpuArrays} from './gpu-owned-arrays.js';
import {retireCompositeOwners} from './composite-owner-release.js';

// Register the composite before the first allocation. A refused second
// allocation or physical backing ACK must retain the first buffer and its fee.
export async function createBiomesGhostArrays(cells,budget,registry,{allocate=allocateTypedArray}={}){
 const values={curves:null,valid:null},backings=[],free=budget.reserve(cells*(71*8+1));
 const result=ownGpuArrays(values,free,backings,budget,{},registry);registry.add(result);
 try{
  for(const [name,Type,length]of [['curves',Float64Array,cells*71],['valid',Uint8Array,cells]]){
   const data=allocate(Type,length,{label:'scoped-global-ghost-'+name});values[name]=data;
   const owner={buffer:data.buffer,bytes:data.byteLength,release:null};backings.push(owner);
   owner.release=budget.registerBacking?.('array-buffer',data.byteLength,{owner:'ela',label:'scoped-global-ghost-'+name,identity:data.buffer});
  }
  return result;
 }catch(primary){await retireCompositeOwners([()=>result.release()],{primary});throw primary;}
}

export async function createGhostCellArray(Type,length,budget,registry,{label,operation,allocate=allocateTypedArray}={}){
 const values={data:null},backings=[],free=budget.reserve(length*Type.BYTES_PER_ELEMENT);
 const result=ownGpuArrays(values,free,backings,budget,{},registry);registry.add(result);
 try{
  const data=allocate(Type,length,{label,operation});values.data=data;
  const owner={buffer:data.buffer,bytes:data.byteLength,release:null};backings.push(owner);
  owner.release=budget.registerBacking?.('array-buffer',data.byteLength,{owner:'ela',label,operation,identity:data.buffer});
  return result;
 }catch(primary){await retireCompositeOwners([()=>result.release()],{primary});throw primary;}
}
