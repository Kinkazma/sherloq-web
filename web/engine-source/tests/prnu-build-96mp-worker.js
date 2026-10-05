import {createWorkerEngine} from '../src/worker-client.js';
self.onmessage=async()=>{
 const start=performance.now(),engine=createWorkerEngine({memoryBudgetBytes:256*1024**2,resourceHints:{hardwareConcurrency:8}}),proof={family:'PRNU training',budgetBytes:256*1024**2};let last=0,phase;
 const onProgress=p=>{if(p.phase!==phase||performance.now()-last>10000){phase=p.phase;last=performance.now();self.postMessage({progress:{...p,elapsedMs:performance.now()-start}});}};
 try{
  await engine.loadBlob({id:'query',blob:await(await fetch('/fixtures/synthetic.jpg')).blob(),layout:'segmented'});
  const files=[];for(const [name,url]of [['copy.jpg','/.build/dense-96mp/copy-6000.jpg'],['original.jpg','/.build/pixels-96mp/source.jpg']])files.push({name,blob:await(await fetch(url)).blob()});
  proof.database=await engine.buildPrnuDatabase({id:'built',queryImageId:'query',singleCamera:'development-camera',files,fingerprintStorage:'temporary',outputLayout:'pages'},{onProgress});
  const c=proof.database.cameras[0];if(c.width!==11998||c.height!==7998||c.nUsed!==2||!proof.database.trainingMembershipVerified)throw Error('Training dimensions/metadata');
  proof.export=await engine.createPrnuDatabaseExport('built');await engine.unload('built');await engine.unload('query');
  const d=proof.export;for(let offset=0;offset<d.byteLength;){const p=await engine.readExport({exportId:d.id,revision:1,offset,length:Math.min(4*1024**2,d.byteLength-offset)});if(!(await fetch('/output?name=built.h5&offset='+offset,{method:'POST',body:p.bytes})).ok)throw Error('HDF5 delivery');offset=p.nextOffset;}
  await engine.releaseExport(d.id);proof.memory=(await engine.capabilities()).memory;if(proof.memory.retainedBytes||proof.memory.cacheBytes||proof.memory.activeReservationBytes)throw Error('Final budget');proof.elapsedMs=performance.now()-start;self.postMessage({result:proof});
 }catch(e){self.postMessage({error:{message:e.message,code:e.code,stack:e.stack},partial:proof});}finally{await engine.dispose();}
};
