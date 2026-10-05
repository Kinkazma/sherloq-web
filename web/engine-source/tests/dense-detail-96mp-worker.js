import {Budget} from '../src/cache.js';
import {loadSegmentedJpeg,disposeSegmentedImage} from '../src/image-sources.js';
import {createPagedDetailSampler,clearPagedDetailCache} from '../src/dense-paged-detail.js';
import {corroborateDenseDetail} from '../src/dense-detail.js';
import {streamScientificNpz} from '../src/scientific-npz-stream.js';
self.onmessage=async()=>{
 const budget=new Budget(256*1024**2),started=performance.now();let image,sampler,archive;
 try{
  const reference=await(await fetch('/.build/dense-detail-96mp/oracle.json')).json(),expected=new Uint8Array(await(await fetch('/.build/dense-detail-96mp/samples.f32')).arrayBuffer());
  image=await loadSegmentedJpeg(await(await fetch('/.build/dense-96mp/copy-6000.jpg')).blob(),{budget});
  if(image.sha256!==reference.sourceSha256||image.surface.descriptor.width!==12000||image.surface.descriptor.height!==8000)throw Error('Original source differs');
  let reads=0;const surface=image.surface,read=surface.readWindow;surface.readWindow=function(...args){reads++;return read.apply(this,args);};
  sampler=await createPagedDetailSampler(image,{budget});const x=Float32Array.from(reference.x),y=Float32Array.from(reference.y),samples=await sampler.sample(x,y,32,81);
  if(!new Uint8Array(samples.buffer).every((v,i)=>v===expected[i]))throw Error('Full-source detail samples differ from native');
  const before=reads,again=await sampler.sample(x,y,32,81);if(reads!==before||!again.every((v,i)=>v===samples[i]))throw Error('Detail cache changed samples or reread source');
  const points=Float32Array.from(reference.points),scores=[];
  for(const c of reference.cases){const actual=await corroborateDenseDetail(sampler.detail,sampler,points,c.model);if(Object.keys(c.expected).some(k=>actual[k]!==c.expected[k]))throw Error('Native detail score differs: '+JSON.stringify({name:c.name,actual,expected:c.expected}));scores.push({name:c.name,...actual});}
  sampler.dispose();sampler=null;clearPagedDetailCache(image,budget);
  archive=await streamScientificNpz([{key:'detail_samples',descr:'<f4',shape:[32,81],count:samples.length,elementBytes:4,read(bytes,first){bytes.set(new Uint8Array(samples.buffer,first*4,bytes.length));}}],{scores},{sourceSha256:image.sha256},{storage:'temporary'},{budget});
  const result={sourceSha256:image.sha256,shape:[8000,12000,3],scope:'Supplemental detail sampler and model corroboration on a full decoded96MP source; not a second global matcher',samples:samples.length,allSamplesNativeExact:true,scores,sourceWindowReads:reads,cachedSampleReads:0,nativeSeconds:reference.nativeSeconds,export:{byteLength:archive.byteLength,sha256:archive.sha256}};
  await disposeSegmentedImage(image);image=null;const bytes=new Uint8Array(archive.byteLength);await archive.store.readInto(bytes);await archive.store.dispose();await archive.session?.dispose();archive=null;
  result.memory=budget.snapshot();if(budget.total())throw Error('Budget leak');result.elapsedMs=performance.now()-started;self.postMessage({result,bytes},[bytes.buffer]);
 }catch(e){self.postMessage({error:{message:e.message,stack:e.stack,code:e.code}});}
 finally{sampler?.dispose();if(image){clearPagedDetailCache(image,budget);await disposeSegmentedImage(image);}await archive?.store.dispose();await archive?.session?.dispose();}
};
