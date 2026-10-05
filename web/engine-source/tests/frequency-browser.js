import {createWorkerEngine} from '../src/worker-client.js';
const read=async name=>new Uint8Array(await(await fetch('/fixtures/'+name)).arrayBuffer());
const json=async name=>JSON.parse(new TextDecoder().decode(await read(name)));
const hash=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b)),x=>x.toString(16).padStart(2,'0')).join('');
const assert=(v,m)=>{if(!v)throw new Error(m);};
export async function frequencyBrowserTest(){
 const engine=createWorkerEngine({computeProfile:'maximum'}),report={schema:1,status:'passed',images:0,backends:{},cases:[],qualification:null};
 try{
  for(const filename of ['frequency-reference.json','frequency-large-reference.json']){for(const f of (await json(filename)).cases){
   const bytes=await read(f.file);await engine.load({id:'i',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}});
   for(const e of f.expected){const task={id:'f',imageId:'i',operation:'detail.frequency',params:e.params},r=await engine.run(task),frames=[r.pixels,r.data.high,r.data.magnitude,r.data.phase];for(let i=0;i<4;i++){assert(await hash(frames[i].data)===e.sha256[i],f.name+' '+JSON.stringify(e.params)+' '+i);report.images++;}assert(r.data.zeroPercent===e.zeroPercent,'Zero decisions');report.backends[r.provenance.backend]=(report.backends[r.provenance.backend]??0)+1;if(r.metrics.gpu)report.qualification=r.metrics.gpu.qualification;
    if(e===f.expected[0]){r.data.high.data.fill(0);r.data.mask.data.fill(0);const again=await engine.run(task);assert(again.metrics.cache.analysis,'Result cached');assert(await hash(again.data.high.data)===e.sha256[1],'Transferred data cannot mutate cached result');const cpu=await engine.run({...task,backend:'cpu'});assert(cpu.provenance.backend==='cpu','CPU override');assert(await hash(cpu.pixels.data)===e.sha256[0],'CPU override parity');}
   }await engine.unload('i');const state=await engine.capabilities();assert(state.memory.retainedBytes===0&&state.memory.cacheBytes===0&&state.memory.activeReservationBytes===0,'Unload CPU/GPU memory');report.cases.push(f.name);console.log('Frequency qualified',f.name);
  }}
  const f=(await json('frequency-large-reference.json')).cases[2],bytes=await read(f.file);await engine.load({id:'i',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}});const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),10);let cancelled=false;try{await engine.run({id:'abort',imageId:'i',operation:'detail.frequency',params:{split:50,smooth:100}},{signal:controller.signal});}catch(e){cancelled=e.code==='CANCELLED'&&e.imagesCleared;}finally{clearTimeout(timer);}assert(cancelled,'Hard frequency cancellation');await engine.load({id:'i',bytes,pixels:{width:f.width,height:f.height,format:'rgb8',data:bytes}});await engine.run({id:'recover',imageId:'i',operation:'detail.frequency',params:{smooth:0}});await engine.unload('i');report.cancellation='Worker termination and reload verified';return report;
 }finally{engine.dispose();}
}
