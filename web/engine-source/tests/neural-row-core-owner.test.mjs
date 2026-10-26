import test,{mock} from 'node:test';
import assert from 'node:assert/strict';

// Only the neural adapter is controlled: it attaches the source-owned hash
// lifetime which the actual Core must retire before forgetting its Original.
// No neural model or learned output is manufactured by this contract.
let control;
mock.module('../src/segmentation-adapter.js',{namedExports:{createSegmentationAdapter:({budget})=>({
 configured(){return'controlled-zero-model';},backends(){return['cpu'];},clearImages(){},dispose(){},
 async run(task,image){
  const state=control;state.free=budget.reserve(17);let released=false;
  image.neuralInput={async dispose(){state.calls++;if(!state.allow)throw state.ack;if(!released){released=true;state.free();}}};
  throw state.primary;
 }
})}});
const {createEngine}=await import('../src/index.js');
for(const method of ['unload','dispose'])test('actual Core '+method+' retains a refused source hash owner and retries before deleting Original',async()=>{
 const ack=Object.freeze(new Error('controlled source-hash retirement refusal')),primary=Object.freeze(new Error('controlled zero-model run stop'));
 const state={ack,primary,calls:0,allow:false};control=state;
 const engine=createEngine({memoryBudgetBytes:128*1024**2,cpuKernel:'reference'}),pixels={width:2,height:2,format:'rgb8',data:Uint8Array.from({length:12},(_,i)=>i*17)};
 try{
  await engine.load({id:'source',bytes:Uint8Array.of(1),pixels});
  await assert.rejects(engine.run({id:'stopped-neural',imageId:'source',operation:'ai.clones.segmentation',backend:'cpu',params:{}}),e=>e===primary);
  const close=()=>method==='unload'?engine.unload('source'):engine.dispose();
  await assert.rejects(close(),e=>e===ack);assert.equal(state.calls,1);
  assert.ok(engine.capabilities().memory.activeReservationBytes>=17,'refused owner retains its credits');
  if(method==='unload')assert.deepEqual(engine.imagePixels('source').data,pixels.data,'Original remains readable until its dependant ACK');
  state.allow=true;await close();assert.equal(state.calls,2);assert.equal(engine.capabilities().memory.activeReservationBytes,0);assert.equal(engine.capabilities().memory.retainedBytes,0);
 }finally{state.allow=true;try{await engine.dispose();}catch{}state.free?.();}
});
