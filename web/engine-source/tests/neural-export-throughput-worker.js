import {Budget} from '../src/cache.js';
import {createSegmentedBytes} from '../src/segmented-bytes.js';
import {createSHA256} from '../vendor/hash-wasm/hashes.js';
let activeAbort,cancelReceived;
const assert=(v,m)=>{if(!v)throw Error(m);};
self.onmessage=async({data})=>{
 if(data.kind==='cancel'){cancelReceived=performance.now();activeAbort?.abort();return;}
 const {reference,strategies,save}=data,budget=new Budget(2*1024**3),stores={},records=[],cancellation=[];
 let current;
 try{
  const sourceStarted=performance.now();
  for(const[key,spec]of Object.entries(reference.records[0].outputs)){
   const store=stores[key]=await createSegmentedBytes(spec.bytes,{budget,storage:'memory'}),hash=await createSHA256(),release=budget.reserve(4*1024**2);
   try{for(let at=0;at<spec.bytes;at+=4*1024**2){const n=Math.min(4*1024**2,spec.bytes-at),res=await fetch('/.build/neural-segmented/d2prl-large/'+spec.file,{headers:{Range:`bytes=${at}-${at+n-1}`}});assert(res.status===206,'Bounded reference read');const bytes=new Uint8Array(await res.arrayBuffer());assert(bytes.length===n,'Reference read size');hash.update(bytes);await store.write(bytes,at);}}finally{release();}
   assert(hash.digest('hex')===spec.sha256,'Complete actual D2PRL output identity');
  }
  const sourceLoadMs=performance.now()-sourceStarted,n=reference.width*reference.height,arrays=['map','mask','target','source','analyzed','candidates'].map(key=>{const elementBytes=['map','target','source'].includes(key)?4:1;return{key,descr:elementBytes===4?'<f4':'|u1',shape:[reference.height,reference.width],count:n,elementBytes,read:(bytes,first)=>stores[key].readInto(bytes,first*elementBytes)};}),metadata={pixelSha256:reference.pixelSha256,minimum:500,scope:'Previously qualified full D2PRL CPU source planes; export-only comparison, no new inference'},provenance={operation:'ai.clones.d2prl',originalSha256:reference.original.sha256,layout:'segmented'},sourceBytes=budget.total();
  self.postMessage({progress:true,phase:'sources-ready',sourceLoadMs,sourceBytes});
  let expectedSha;
  for(const strategy of strategies){
   const {streamScientificNpz}=await import(strategy.url);let last=-1,lastArray=null;const started=performance.now();
   current=await streamScientificNpz(arrays,metadata,provenance,{storage:'temporary'},{budget,onProgress:e=>{const part=Math.floor(e.fraction*4);if(part!==last||e.array!==lastArray){last=part;lastArray=e.array;self.postMessage({progress:true,strategy:strategy.name,...e});}}});
   const milliseconds=performance.now()-started;expectedSha??=current.sha256;assert(current.sha256===expectedSha,'NPZ bytes differ between scheduling strategies');
   const record={strategy:strategy.name,milliseconds,sha256:current.sha256,byteLength:current.byteLength,metrics:current.metrics,memory:budget.snapshot()};
   if(save&&strategy.name==='cooperative'){
    const release=budget.reserve(1024**2),buffer=new Uint8Array(1024**2),begin=performance.now();let pages=0;
    try{for(let offset=0;offset<current.byteLength;offset+=buffer.length){const bytes=buffer.subarray(0,Math.min(buffer.length,current.byteLength-offset));await current.store.readInto(bytes,offset);assert((await fetch('/save-export/'+offset,{method:'POST',body:bytes})).ok,'Saved NPZ page');pages++;}}finally{release();}
    record.saveMs=performance.now()-begin;record.pages=pages;
   }
   await current.store.dispose();await current.session?.dispose();current=null;assert(budget.total()===sourceBytes,'Export release preserved source only');records.push(record);self.postMessage({progress:true,phase:'strategy-complete',record});
  }
  if(strategies.some(s=>s.name==='cooperative')){
   const {streamScientificNpz}=await import(strategies.find(s=>s.name==='cooperative').url);
   for(const phase of ['scientific-npz','scientific-npz-hash']){
    activeAbort=new AbortController();cancelReceived=null;let requested=false,code;
    try{current=await streamScientificNpz(arrays,metadata,provenance,{storage:'temporary'},{budget,signal:activeAbort.signal,onProgress:e=>{if(!requested&&e.phase===phase){requested=true;self.postMessage({requestCancel:true,phase});}}});}catch(e){code=e.code;}
    assert(code==='CANCELLED'&&cancelReceived!==null,'Queued control message cancellation during '+phase);const afterMs=performance.now()-cancelReceived;assert(budget.total()===sourceBytes,'Cancelled export leaked its storage');cancellation.push({phase,afterReceivedMs:afterMs,sourceBytesPreserved:budget.total()});activeAbort=null;
   }
  }
  await Promise.all(Object.values(stores).map(s=>s.dispose()));assert(budget.total()===0,'All stores released');
  self.postMessage({ok:true,report:{schema:1,status:'passed',scope:'Export-only comparison of six full96MP D2PRL CPU planes already qualified bit-for-bit. Same arrays, metadata, ZIP bytes,2GiB budget and forced OPFS output. Does not rerun neural inference or measure source-to-analysis speed.',sourceLoadMs,sourceIdentities:reference.records[0].outputs,records,cancellation,memory:budget.snapshot()}});
 }catch(e){self.postMessage({ok:false,error:String(e.stack??e)});}finally{await current?.store.dispose();await current?.session?.dispose();await Promise.all(Object.values(stores).map(s=>s.dispose()));}
};
