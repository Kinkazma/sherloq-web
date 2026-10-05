import {createWorkerEngine} from '../src/worker-client.js';
export async function zeroMemoryTest(){
 const width=4096,height=2048,data=new Uint8Array(width*height*3);data.fill(127);const e=createWorkerEngine({computeProfile:'maximum',memoryBudgetBytes:2*1024**3,cpuKernel:'single'});
 try{const start=performance.now();await e.load({id:'large',bytes:new Uint8Array([1]),pixels:{width,height,format:'rgb8',data},provenance:{source:'Synthetic uniform RGB8 memory fixture; no encoded original'}});const r=await e.run({id:'z',imageId:'large',operation:'jpeg.zero',params:{missing:false}}),rpcPipelineMs=performance.now()-start;
 if(r.data.width!==width||r.data.height!==height||r.data.metadata.main_grid!==-1||!r.data.luminance.every(x=>x===127)||!r.data.votes.every(x=>x===-1)||!r.data.mask_f.every(x=>x===0)||!r.data.mask_f_reg.every(x=>x===0))throw new Error('Large uniform ZERO invariant failed');
 if(r.metrics.memory.codecHeapCapacityBytes<=512*1024**2)throw new Error('Memory test did not cross the old WASM ceiling');await e.unload('large');const released=(await e.capabilities()).memory;if(released.retainedBytes||released.cacheBytes||released.activeReservationBytes)throw new Error('ZERO arrays retained after unload');return {schema:1,status:'passed',width,height,rpcPipelineMs,memory:r.metrics.memory,released,limits:['Analytical uniform-image invariants, not a new native 8 MP parity corpus','Accounted bytes and WASM heap capacity are not process RSS; worker disposal releases the runtime']};
 }finally{e.dispose();}
}
