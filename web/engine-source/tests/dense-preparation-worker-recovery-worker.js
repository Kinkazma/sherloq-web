import {Budget} from '../src/cache.js';
import {createTemporarySession} from '../src/temporary-storage.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createRgbSurface} from '../src/rgb-surface.js';
import {preparePagedSift} from '../src/dense-paged-sift.js';
import {preparePagedEligibility} from '../src/dense-paged-regions.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';

// Real native work, two refused useful allocations in distinct workers, and
// actual detached inputs. No production probes or alternate numeric kernels.
self.onmessage=async()=>{
 const width=256,height=192,n=width*height,reports=[];
 try{
  for(const kind of ['sift','texture'])for(const inject of [false,true]){
   const budget=new Budget(512*1024**2),session=await createTemporarySession({backend:'auto',budget});let surface,prepared,submitted=0,created=0;
   try{
    const pixels=await createSegmentedBytes(n*3,{budget,storage:'temporary',temporarySession:session});await pixels.write(Uint8Array.from({length:n*3},(_,i)=>(i*37+(i/3|0)%17*23)%256));surface=createRgbSurface(pixels,{width,height,budget});
    const workerFactory=()=>{const fail=inject&&[1,3].includes(++created),worker=new Worker('/tests/dense-'+kind+'-allocation-fault-worker.js'+(fail?'?fail':''),{type:'module'}),post=worker.postMessage.bind(worker);worker.postMessage=(message,...args)=>{submitted++;return post(message,...args);};return worker;};
    const options={budget,storage:'memory',patch:8,maxWorkers:4,workerFactory};
    prepared=await (kind==='sift'?preparePagedSift({surface,session},options):preparePagedEligibility({surface,session},{...options,method:0,texture:2}));
    const hashes={};for(const key of kind==='sift'?['hist','norms','turns','diverse','boundSamples']:['mask']){const hash=await createSHA256();await prepared[key].visit(bytes=>hash.update(bytes));hashes[key]=hash.digest('hex');}
    const execution=prepared.metrics.execution??prepared.metrics.texture.execution;reports.push({kind,inject,submitted,hashes,workerRecoveries:execution.resourceRecoveries,completed:execution.completed,workers:execution.peakComputing,backend:session.backend});
    if(execution.resourceRecoveries!==(inject?2:0))throw Error('Worker allocation recovery count differs '+JSON.stringify(reports.at(-1)));
   }finally{await prepared?.dispose();await surface?.dispose();await session.dispose();if(budget.total())throw Error('Preparation budget leaked '+budget.total());}
  }
  for(const kind of ['sift','texture']){const [plain,recovered]=reports.filter(row=>row.kind===kind);if(JSON.stringify(plain.hashes)!==JSON.stringify(recovered.hashes)||recovered.submitted!==plain.submitted+2||recovered.completed!==plain.completed)throw Error('Useful work or bytes differ '+kind);}
  self.postMessage({result:reports});
 }catch(error){self.postMessage({error:{code:error.code,message:error.message,stack:error.stack}});}
};
