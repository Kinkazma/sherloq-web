import {createTemporarySession} from '../src/temporary-storage.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {createRgbSurface} from '../src/rgb-surface.js';import {streamedImageHashes} from '../src/digest-stream.js';import {Budget} from '../src/cache.js';import {imageCodec} from '../src/codecs.js';
self.onmessage=async()=>{try{
 const reference=(await(await fetch('/tests/data/digest-stream-native.json')).json()).cases[0],image=await imageCodec.decode(new Uint8Array(await(await fetch('/tests/data/'+reference.file)).arrayBuffer())),results=[];
 for(const backend of ['opfs','indexeddb']){const budget=new Budget(128*1024**2),resident=budget.reserve(image.data.length+imageCodec.memoryBytes()),session=await createTemporarySession({budget,backend});let surface;
  try{const store=await createSegmentedBytes(image.data.length,{budget,storage:'temporary',temporarySession:session});await store.write(image.data);await store.flush();surface=createRgbSurface(store,{width:image.width,height:image.height,budget});const result=await streamedImageHashes(surface,{account:n=>budget.reserve(n)});
   for(const [name,values]of Object.entries(reference.hashes))if(result.hashes[name].some((v,i)=>v!==values[i]))throw Error(backend+'/'+name+' differs');results.push({backend,nativeHashes:6,dimensions:[image.width,image.height],...result.metrics});
  }finally{await surface?.dispose();await session.dispose();resident();}if(budget.total())throw Error('Temporary hash budget leak');
 }
 self.postMessage({results});
 }catch(error){self.postMessage({error:error.message});}};
