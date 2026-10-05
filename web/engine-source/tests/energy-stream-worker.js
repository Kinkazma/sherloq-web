import {Budget} from '../src/cache.js';
import {createBlobSource} from '../src/blob-source.js';
import {inspectTiffSource} from '../src/tiff-header-source.js';
import {loadSegmentedTiff,disposeSegmentedImage} from '../src/image-sources.js';
import {segmentedEnergyPlane} from '../src/energy-stream.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
const assert=(ok,message)=>{if(!ok)throw Error(message);};
async function sha(store){const hash=await createSHA256();await store.visit(bytes=>hash.update(bytes),{blockBytes:256*1024});return hash.digest('hex');}
self.onmessage=async()=>{let image;try{
 const ref=await(await fetch('/tests/data/energy-stream-native.json')).json(),blob=await(await fetch('/'+ref.file)).blob(),budget=new Budget(48*1024**2),source=createBlobSource(blob,{budget});let header;
 try{header=(await inspectTiffSource(source,{account:n=>budget.reserve(n)})).header;}finally{source.dispose();}
 image=await loadSegmentedTiff(blob,{header,budget});const results=[];
 for(const expected of ref.cases){const plane=await segmentedEnergyPlane(image,expected.quality,{budget});try{assert(plane.metrics.energyStorage==='temporary','Energy plane not external');assert(await sha(plane.store)===expected.sha256,'Native full energy plane differs');results.push({quality:expected.quality,sha256:expected.sha256,metrics:plane.metrics});}finally{await plane.dispose();}}
 const baseline=image.session.snapshot().openFiles,controller=new AbortController();let error;
 try{await segmentedEnergyPlane(image,99,{budget,signal:controller.signal,onProgress:e=>{if(e.phase==='jpeg-render'&&e.fraction>.1)controller.abort();}});}catch(e){error=e;}
 assert(error?.code==='CANCELLED'&&budget.active===0,'Energy cancellation failed');assert(image.session.snapshot().openFiles===baseline,'Partial energy file leaked');
 const retry=await segmentedEnergyPlane(image,99,{budget});try{assert(retry.metrics.recompressions===0&&await sha(retry.store)===ref.cases[1].sha256,'Energy retry failed encoded reuse/native equality');}finally{await retry.dispose();}
 await disposeSegmentedImage(image);image=null;assert(budget.total()===0,'Energy memory leak');self.postMessage({status:'passed',dimensions:[ref.width,ref.height],results,cancelledPlaneRemoved:true,retryNativeAndEncodedReuse:true,memory:budget.snapshot()});
 }catch(e){if(image)await disposeSegmentedImage(image);image=null;self.postMessage({error:e.message});}};
