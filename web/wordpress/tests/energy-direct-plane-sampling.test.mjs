import test from 'node:test';import assert from 'node:assert/strict';
import {sampleEnergyField} from '../sherloq-browser/assets/energy-native-fields.js';
import {EngineError} from '../sherloq-browser/assets/unified-engine/src/errors.js';
import {numericPlaneSamplePlan} from '../sherloq-browser/assets/unified-engine/src/numeric-plane-sampling.js';
import {createEngine} from '../sherloq-browser/assets/unified-engine/src/index.js';
function fixture({scope=false,offset=null}={}){
 const Type=scope?Int32Array:Float32Array,format=scope?'int32':'float32',source={id:'native-plane',revision:3,width:7,height:5,format},values=Type.from({length:35},(_,i)=>i-7),width=offset?3:7,height=offset?3:5,name=scope?'energy_scope':'energy_high_score',surface={...source,width,height},analysis={data:{width,height},planeSurfaces:{[name]:surface}},audit={direct:0,windows:0};
 const engine={capabilities:()=>({memory:{policyAvailableBytes:1024**3,knownHeapCapacityBytes:32*1024**2}}),async samplePlane(request){audit.direct++;numericPlaneSamplePlan(source,request);const data=new Type(request.width*request.height);for(let y=0;y<request.height;y++)for(let x=0;x<request.width;x++){const sx=request.centers?Math.floor((x+.5)*7/request.width):x*request.step,sy=request.centers?Math.floor((y+.5)*5/request.height):y*request.step;data[y*request.width+x]=values[sy*7+sx];}return {surfaceId:source.id,revision:3,plane:{width:request.width,height:request.height,format,data},metrics:{sourceReadBytes:request.height*7*4}};},async readPlane({rect}){audit.windows++;const data=new Type(rect.width*rect.height);for(let y=0;y<rect.height;y++)for(let x=0;x<rect.width;x++)data[y*rect.width+x]=values[(rect.y+y+(offset?.[1]??0))*7+rect.x+x+(offset?.[0]??0)];return {plane:{width:rect.width,height:rect.height,data}};}};
 return {Type,name,analysis,engine,audit,values};
}
for(const scope of [false,true])for(const centers of [false,true])test('direct '+(scope?'scope':'scores')+' preserves '+(centers?'centres':'integer grid')+' and avoids bounding-window copies',async()=>{
 const f=fixture({scope}),grid={width:4,height:3,centers,...(!centers?{step:2}:{})},observed=[];
 const direct=await sampleEnergyField(f.analysis,f.name,grid,{engine:f.engine,onSampling:x=>observed.push(x)});assert.equal(f.audit.direct,1);assert.equal(f.audit.windows,0);assert.equal(observed[0].method,'direct-numeric-plane');
 delete f.engine.samplePlane;const legacy=await sampleEnergyField(f.analysis,f.name,grid,{engine:f.engine});assert.deepEqual(direct,legacy);
});
test('low or unknown working headroom keeps the same legacy grid without invoking the accelerator',async()=>{
 for(const memory of [{policyAvailableBytes:0,knownHeapCapacityBytes:0},{}]){const f=fixture();f.engine.capabilities=()=>({memory});const p=await sampleEnergyField(f.analysis,f.name,{width:4,height:3,step:2},{engine:f.engine});assert.equal(f.audit.direct,0);assert(f.audit.windows>0);assert.deepEqual([...p],[0,2,4,6,14,16,18,20,28,30,32,34].map(i=>i-7));}
});
test('a context facade with local dimensions falls back to its own correctly offset reader',async()=>{
 const f=fixture({offset:[2,1]});const p=await sampleEnergyField(f.analysis,f.name,{width:2,height:2,centers:true},{engine:f.engine});assert.equal(f.audit.direct,1);assert(f.audit.windows>0);assert.deepEqual([...p],[2,4,16,18]);
});
test('a tagged pre-read admission refusal can decline; source, IO, frozen and falsy failures stay primary',async()=>{
 const safe=new EngineError('MEMORY_LIMIT','Optional admission',{details:{samplePlane:{phase:'admission',fallbackSafe:true}}}),f=fixture();f.engine.samplePlane=async()=>{throw safe;};assert.equal((await sampleEnergyField(f.analysis,f.name,{width:2,height:2,centers:true},{engine:f.engine})).length,4);assert(f.audit.windows>0);
 const errors=[new EngineError('NOT_FOUND','Retired source'),new EngineError('STORAGE_IO','Source IO'),new EngineError('MEMORY_LIMIT','After reading'),Object.freeze(new EngineError('MEMORY_LIMIT','Frozen primary',{details:{samplePlane:{phase:'admission',fallbackSafe:true}}})),0,null];
 for(const primary of errors){const h=fixture();h.engine.samplePlane=async()=>{throw primary;};await assert.rejects(sampleEnergyField(h.analysis,h.name,{width:2,height:2,centers:true},{engine:h.engine}),error=>error===primary);assert.equal(h.audit.windows,0);}
});
test('wrong source identity or output geometry never becomes a legacy retry',async()=>{
 const f=fixture();f.engine.samplePlane=async request=>({surfaceId:'other-source',revision:3,plane:{width:request.width,height:request.height,format:'float32',data:new Float32Array(4)}});await assert.rejects(sampleEnergyField(f.analysis,f.name,{width:2,height:2,centers:true},{engine:f.engine}),{code:'INVALID_INPUT'});assert.equal(f.audit.windows,0);
});
test('the optional eight-million-point accelerator never reduces a larger admitted legacy preview grid',async()=>{
 const analysis={data:{width:1,height:1},planeSurfaces:{energy_scope:{id:'one',revision:1,width:1,height:1,format:'int32'}}};let calls=0;
 const engine={capabilities:()=>({memory:{policyAvailableBytes:1024**3,knownHeapCapacityBytes:32*1024**2}}),samplePlane(){calls++;throw Error('Must decline before this call');},readPlane:async()=>({plane:{width:1,height:1,data:Int32Array.of(17)}})};
 const p=await sampleEnergyField(analysis,'energy_scope',{width:4096,height:4096,centers:true},{engine});assert.equal(calls,0);assert.equal(p.length,4096*4096);assert.equal(p[0],17);assert.equal(p.at(-1),17);
});

test('the real direct Engine API and UI adapter preserve every sampled Energy field without a transport wrapper',async()=>{
 const engine=createEngine({memoryBudgetBytes:256*1024**2,cpuKernel:'single'});let output;
 try{
  await engine.load({id:'original',bytes:Uint8Array.of(1),pixels:{width:96,height:96,format:'rgb8',data:Uint8Array.from({length:96*96*3},(_,i)=>i*71%256)}});
  output=await engine.run({id:'energy',imageId:'original',operation:'ela.energy',params:{quality:75,block:16},resultLayout:'surface',backend:'cpu'});
  const legacy={readPlane:(request,hooks)=>engine.readPlane(request,hooks)};
  for(const name of ['energy_scope','energy_low_score','energy_high_score']){
   const events=[],grid={width:13,height:11,centers:true,maxWindowRows:96};
   const actual=await sampleEnergyField(output,name,grid,{engine,onSampling:x=>events.push(x)}),expected=await sampleEnergyField(output,name,grid,{engine:legacy});
   assert.deepEqual(actual,expected);assert.equal(events[0].method,'direct-numeric-plane');assert(events[0].sourceBytes<96*96*4,'only selected native rows are read');
  }
  for(const id of new Set(Object.values(output.planeSurfaces).map(s=>s.id)))await engine.releaseSurface(id);output=null;await engine.unload('original');assert.equal(engine.capabilities().memory.activeReservationBytes,0);
 }finally{if(output)for(const id of new Set(Object.values(output.planeSurfaces).map(s=>s.id)))await engine.releaseSurface(id);await engine.dispose();}
});
