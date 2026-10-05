import {readPrnuDatabase} from '../src/prnu-hdf5.js';
const check=(ok,message)=>{if(!ok)throw new Error(message);};
async function rejects(action,code){let caught;try{await action();}catch(error){caught=error;}check(caught?.code===code,'Expected '+code+', got '+caught?.code);return caught;}
export async function prnuLifecycle(create,read){
 const ref=JSON.parse(new TextDecoder().decode(await read('prnu-reference.json'))),engine=create(),query=await read(ref.query.file),db=await read('prnu-snapshot.h5');
 const task={id:'match',imageId:'q',operation:'noise.prnu',params:{databaseId:'db'}};
 try{
  await engine.load({id:'q',bytes:query});const imported=await engine.loadPrnuDatabase({id:'db',bytes:db});check(imported.trainingMembershipVerified,'Native manifest available');db.fill(0);
  const initial=await engine.run(task);check(initial.data.scores[0].score===ref.databases[0].scores[0][1],'Public exact score');
  const json=JSON.parse(new TextDecoder().decode((await engine.exportResult(initial,{format:'json'})).bytes));check(json.provenance.references[0].kind==='prnu-database'&&json.provenance.references[0].originalSha256===imported.sha256,'Database provenance in JSON');
  const csv=new TextDecoder().decode((await engine.exportResult(initial,{format:'csv'})).bytes);check(csv.includes('ncc,experimental_threshold')&&csv.includes('camera_alpha'),'NCC CSV export');
  initial.data.scores[0].score=-1;initial.provenance.references[0].id='mutated';const cached=await engine.run(task);check(cached.metrics.cache.result&&cached.data.scores[0].score===ref.databases[0].scores[0][1],'Cache result ownership');
  await rejects(()=>engine.run({...task,params:{}}),'INVALID_INPUT');await rejects(()=>engine.run({...task,params:{databaseId:'q'}}),'INVALID_INPUT');
  await rejects(()=>engine.run({...task,imageId:'db'}),'INVALID_INPUT');await rejects(()=>engine.run({id:'pair',imageId:'q',operation:'comparison.image',params:{referenceImageId:'db'}}),'INVALID_INPUT');
  await rejects(()=>engine.imagePixels('db'),'INVALID_INPUT');await rejects(()=>engine.run({...task,backend:'webgpu'}),'UNSUPPORTED_BACKEND');
  await engine.run({id:'unrelated',imageId:'q',operation:'inspection.histogram'});const before=(await engine.capabilities()).memory.cacheBytes;await engine.unload('db');const after=(await engine.capabilities()).memory.cacheBytes;check(after>0&&after<before,'Unloading DB invalidates only dependent caches');
  await rejects(()=>engine.run(task),'NOT_FOUND');await engine.loadPrnuDatabase({id:'db',bytes:await read('prnu-database-legacy.h5')});const legacy=await engine.run(task);check(!legacy.metrics.cache.result&&legacy.metrics.cache.stages.residual&&legacy.data.legacy&&!legacy.data.trainingMembershipVerified,'Reused DB id recomputes scores and reuses image residual; legacy explicit');
  await engine.unload('db');await engine.loadPrnuDatabase({id:'db',bytes:await read('prnu-snapshot.h5')});
  await engine.unload('q');await engine.load({id:'q',bytes:await read(ref.training[0].file)});await rejects(()=>engine.run(task),'INVALID_INPUT');await engine.unload('q');await engine.load({id:'q',bytes:query});
  const files=[];for(const item of ref.training)files.push({name:item.name,blob:new Blob([await read(item.file)])});
  files.push({name:'camera_alpha_heldout.jpg',blob:new Blob([query])},{name:'camera_alpha_broken.jpg',blob:new Blob([Uint8Array.of(1,2,3)])},{name:'ignored.png',blob:new Blob([Uint8Array.of(1)])});
  const created=await engine.buildPrnuDatabase({id:'new',queryImageId:'q',files});check(created.cameras.length===2&&created.cameras[0].nUsed===3&&created.cameras[0].nImages===5&&created.cameras[0].skippedImages.length===2,'Snapshot grouping/query exclusion/unreadable JPEG accounting');
  await rejects(()=>engine.buildPrnuDatabase({id:'new',queryImageId:'q',files}),'INVALID_INPUT');
  const exported=await engine.exportPrnuDatabase('new'),snapshot=await readPrnuDatabase(exported.bytes,{maxWorkingBytes:512*1024**2});
  for(const f of ref.fingerprints){const camera=snapshot.cameras.find(x=>x.name===f.camera),bytes=await read(f.file),expected=new Float64Array(bytes.buffer,bytes.byteOffset,bytes.byteLength/8);check(camera.fingerprint.values.length===expected.length&&camera.fingerprint.values.every((x,i)=>Object.is(x,expected[i])),'Streaming snapshot fingerprint bits');}
  const generated=await engine.run({...task,params:{databaseId:'new'}});check(generated.data.scores[0].score===ref.databases[0].scores[0][1],'New HDF5 snapshot ranking');
  const beforeFailure=(await engine.capabilities()).memory;
  const only=[{name:'one.jpg',blob:new Blob([query])},{name:'two.jpg',blob:files[0].blob}];await rejects(()=>engine.buildPrnuDatabase({id:'failed',queryImageId:'q',singleCamera:'Camera',files:only}),'INVALID_INPUT');
  await rejects(()=>engine.original('failed'),'NOT_FOUND');check((await engine.capabilities()).memory.activeReservationBytes===beforeFailure.activeReservationBytes,'Failed build leaves only the existing databases’ migration window, with no task reservation or partial source');
  for(const id of ['q','db','new'])await engine.unload(id);const memory=(await engine.capabilities()).memory;check(memory.retainedBytes===0&&memory.cacheBytes===0&&memory.activeReservationBytes===0,'All PRNU sources and caches released');
  return {status:'passed',originalSha256:imported.sha256,newSnapshotBytes:exported.bytes.length,memory,checks:'Exact public scores, source/result ownership, wrong-kind rejection, dual-source invalidation, imported training exclusion, ordered streaming Blob build, corrupt JPEG accounting, no overwrite/partial snapshot, JSON/CSV/HDF5 and release'};
 }finally{await engine.dispose();}
}
