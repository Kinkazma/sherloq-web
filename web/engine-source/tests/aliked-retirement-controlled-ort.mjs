// Controlled session/device only. The REAL neural-graph-worker imports this
// test module; no ORT runtime, real model or GPU device is ever constructed.
const fail=new URL(import.meta.url).searchParams.get('fail'),calls={session:0,queue:0,destroy:0,lost:0};
const device={queue:{async onSubmittedWorkDone(){calls.queue++;if(fail==='queue'&&calls.queue===1)throw 0;if(calls.queue>(fail==='queue'?2:1))throw Error('Completed queue ACK repeated');}},destroy(){calls.destroy++;if(fail==='destroy'&&calls.destroy===1)throw 0;if(calls.destroy>(fail==='destroy'?2:1))throw Error('Completed destroy repeated');},lost:{then(resolve,reject){calls.lost++;if(fail==='lost'&&calls.lost===1){reject(0);return;}if(calls.lost>(fail==='lost'?2:1)){reject(Error('Completed lost ACK repeated'));return;}resolve({reason:'destroyed'});}}};
export const env={wasm:{},webgpu:{device}};
export class Tensor{constructor(type,data,dims){Object.assign(this,{type,data,dims});}dispose(){}}
export const InferenceSession={async create(){return{async run(){return{value:new Tensor('float32',Float32Array.of(.5),[1])};},async release(){if(++calls.session!==1)throw Error('Acknowledged current session release repeated');}};}};
