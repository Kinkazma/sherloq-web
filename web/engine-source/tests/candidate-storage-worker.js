import {Budget} from '../src/cache.js';import {createTemporarySession} from '../src/temporary-storage.js';import {createSegmentedBytes} from '../src/segmented-bytes.js';import {sortCandidates} from '../src/candidate-sort.js';import {createCandidateTable} from '../src/candidate-table.js';
const assert=(v,m)=>{if(!v)throw Error(m);};
onmessage=async({data:{backend}})=>{
 const budget=new Budget(8*1024**2),count=100003,width=65000,height=65000;let session,store,table,stage='session';
 try{
  session=await createTemporarySession({budget,backend,maximumBytes:32*1024**2});postMessage({sessionId:session.id,backend:session.backend});
  const records=new Uint32Array(count*6),expect=new Map();
  for(let i=0;i<count;i++){const x=i%width,y=Math.floor(i/width)*1543+i%7*7000,c=i%3,fields=[x,y,c,1+i%2,i%255,255-i%255];records.set(fields,i*6);expect.set((y*width+x)*3+2-c,fields);}
  // Test fixture/oracle is outside the engine budget. Runtime staging and
  // retained arrays are counted separately; no process-RSS claim is made.
  async function input(){const value=await createSegmentedBytes(records.byteLength,{budget,temporarySession:session,storage:'temporary'});const release=budget.reserve(512*1024);try{const bytes=new Uint8Array(records.buffer);for(let at=0;at<bytes.length;at+=512*1024)await value.write(bytes.subarray(at,Math.min(bytes.length,at+512*1024)),at);}finally{release();}return value;}
  stage='sort';store=await input();const sorted=await sortCandidates(store,{width,height,budget,temporarySession:session,forceExternal:true});store=sorted.store;assert(sorted.metrics.path==='external-radix','External path');table=createCandidateTable(store,{budget,params:{radius:2,threshold:32,spread:64}});let previous=-1,seen=0;
  stage='verify';for(let offset=0;offset<count;offset+=4096){const page=await table.readRows({offset,length:4096});try{for(let i=0;i<page.data.length;i+=6){const key=(page.data[i+1]*width+page.data[i])*3+2-page.data[i+2],reference=expect.get(key);assert(key>previous&&reference,'Order/key');for(let c=0;c<6;c++)assert(page.data[i+c]===reference[c],'Candidate value');previous=key;seen++;}}finally{page.release();}}
  assert(seen===count&&previous>2**32,'Complete rows and non-truncated key');const metrics={...sorted.metrics,peakAccountedBytes:budget.peak,storage:session.snapshot()};await table.dispose();table=null;store=null;assert(session.snapshot().reservedBytes===0&&budget.active===0,'Sorted table cleanup');
  stage='cancel';store=await input();const controller=new AbortController();let cancelled;
  try{await sortCandidates(store,{width,height,budget,temporarySession:session,forceExternal:true,signal:controller.signal,onProgress:()=>controller.abort()});}catch(e){cancelled=e.code;}
  assert(cancelled==='CANCELLED','External cancellation');await store.dispose();store=null;assert(session.snapshot().reservedBytes===0&&budget.active===0,'Cancellation cleanup');
  stage='injected-write-failure';store=await input();let writes=0;const failing={backend:session.backend,async create(...args){const value=await session.create(...args);return {...value,write(...args){if(++writes===5)throw Object.assign(Error('Injected storage quota'),{code:'STORAGE_QUOTA'});return value.write(...args);}};}};let failed;
  try{await sortCandidates(store,{width,height,budget,temporarySession:failing,forceExternal:true});}catch(e){failed=e.code;}
  assert(failed==='STORAGE_QUOTA'&&writes===5,'Injected write failure');await store.dispose();store=null;assert(session.snapshot().reservedBytes===0&&budget.active===0,'Write failure cleanup');
  stage='close';const id=session.id,actual=session.backend;await session.dispose();session=null;assert(budget.total()===0,'Final budget');postMessage({done:true,result:{status:'passed',sessionId:id,backend:actual,count,largestKey:previous,metrics,cancellation:true,injectedWriteFailure:true,accountedBytesAfterCleanup:0}});
 }catch(e){postMessage({done:true,error:{code:e.code??'TEST_FAILED',message:stage+': '+e.message}});}finally{await table?.dispose();await store?.dispose();await session?.dispose();}
};
