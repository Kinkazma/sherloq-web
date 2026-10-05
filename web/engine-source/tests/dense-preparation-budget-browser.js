import {Budget} from '../src/cache.js';
import {createIndexedDbSession} from '../src/indexeddb-storage.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {denseDescriptorHeapBound} from '../src/dense-math.js';
import {preparePagedZernike} from '../src/dense-paged-zernike.js';
import {preparePagedSift} from '../src/dense-paged-sift.js';
import {preparePagedEligibility} from '../src/dense-paged-regions.js';

// Development regression only: actual native workers and the browser's actual
// IndexedDB backend must complete at the exact declared preparation allowance.
export async function qualifyPreparationBudgets(){
 const MiB=1024**2,width=32,height=32,area=width*height,patch=3,ioBytes=area*3+width*3+2*MiB,records=[];
 for(const kind of ['zernike','sift','texture'])for(const mode of ['temporary','auto-tight','auto-funded']){
  const workspace=kind==='zernike'?denseDescriptorHeapBound(width,height,0,patch,false)+area*52+128*128*48:kind==='sift'?16*MiB+area*112:48*MiB+area*64;
  const dataBytes=kind==='zernike'?area*48:kind==='sift'?area*64+(width-3*patch)*(height-3*patch)*18:area,largestBank=kind==='zernike'?area*48:kind==='sift'?area*32:area;
  const controlBytes=kind==='texture'?128*128+128+1:0;
  const budget=new Budget(workspace+ioBytes+controlBytes+(mode==='temporary'?0:area*3+dataBytes)+(mode==='auto-funded'?2*largestBank:0)),session=await createIndexedDbSession({budget}),store=await createSegmentedBytes(area*3,{budget,storage:mode==='temporary'?'temporary':'memory',...(mode==='temporary'?{temporarySession:session}:{})});let image,result;
  try{
   const staging=budget.reserve(area*3);try{await store.write(Uint8Array.from({length:area*3},(_,i)=>(i*31+(i/19|0)*17)&255));}finally{staging();}
   image={surface:createRgbSurface(store,{width,height,budget}),session};
   const options={budget,storage:mode==='temporary'?'temporary':'auto',temporarySession:session,maxWorkers:4,patch};
   result=await (kind==='zernike'?preparePagedZernike(image,options):kind==='sift'?preparePagedSift(image,options):preparePagedEligibility(image,{...options,method:0,texture:2}));
   const outputs=kind==='zernike'?['first']:kind==='sift'?['hist','norms','turns','diverse','boundSamples']:['mask'],hashes={};
   for(const key of outputs){const plane=result[key],release=budget.reserve(plane.byteLength);try{const values=new Uint8Array(plane.byteLength);await plane.readInto(values);hashes[key]=[...new Uint8Array(await crypto.subtle.digest('SHA-256',values))].map(x=>x.toString(16).padStart(2,'0')).join('');}finally{release();}}
   const storageKind=result[kind==='zernike'?'first':kind==='sift'?'hist':'mask'].storage;
   const record={kind,mode,storageKind,budgetBytes:budget.limit,peakAccountedBytes:budget.peak,hashes,storage:session.snapshot(),execution:result.metrics.execution??result.metrics.texture?.execution};
   if(budget.peak>budget.limit||mode!=='auto-funded'&&!record.storage.reads.transactions)throw Error('Budget or actual IndexedDB read regression');
   if(storageKind!==(mode==='auto-funded'?'memory':'temporary'))throw Error('Automatic preparation storage did not account for the exact migration surplus: '+JSON.stringify({kind,mode,storageKind,budgetBytes:budget.limit,preparation:result.metrics.preparation}));
   await result.dispose();result=null;await image.surface.dispose();image=null;await session.dispose();record.remainingBudgetBytes=budget.total();if(record.remainingBudgetBytes)throw Error('Preparation leaked its I/O reservation');records.push(record);
  }finally{await result?.dispose();await image?.surface.dispose();await session.dispose();}
 }
 for(const kind of ['zernike','sift','texture']){const rows=records.filter(record=>record.kind===kind),hashes=JSON.stringify(rows[0].hashes);if(rows.some(row=>JSON.stringify(row.hashes)!==hashes))throw Error('Preparation storage choice changed native output');}
 return records;
}
