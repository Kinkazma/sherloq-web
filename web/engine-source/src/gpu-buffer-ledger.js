import {EngineError} from './errors.js';

/** Worker-local WebGPU buffer accounting. This cannot measure driver-private memory. */
export function installGpuBufferLedger(scope=globalThis){
 const Device=scope.GPUDevice,Buffer=scope.GPUBuffer;
 if(!Device?.prototype||!Buffer?.prototype)return null;
 const marker=Symbol.for('sherloq.gpuBufferLedger');
 if(Device.prototype[marker])return Device.prototype[marker];
 const buffers=new WeakMap(),devices=new Map();
 let maximumBytes=Infinity,liveBytes=0,pendingBytes=0,peakBytes=0,livePeakBytes=0,createdBuffers=0,destroyedBuffers=0,textureAllocations=0,lastFailure=null;
 const createBuffer=Device.prototype.createBuffer,destroyBuffer=Buffer.prototype.destroy,destroyDevice=Device.prototype.destroy,createTexture=Device.prototype.createTexture;
 const charged=()=>liveBytes+pendingBytes;
 const failure=(requestedBytes)=>lastFailure=new EngineError('GPU_OUT_OF_MEMORY','WebGPU buffer allocation exceeds admitted memory',{details:{allocationKind:'gpu',requestedBytes,liveBytes,pendingBytes,maximumBytes,admissionScope:'worker'}});
 function state(device){let value=devices.get(device);if(!value){value={records:new Set(),pending:new Set(),settling:null,dead:false};devices.set(device,value);}return value;}
 function complete(record){if(record.status!=='pending')return;record.status='retired';pendingBytes-=record.bytes;record.state.pending.delete(record);record.state.records.delete(record);}
 function finishPending(device,s){
  if(s.settling||!s.pending.size)return;
  // Every pending record here has been destroyed. A queue fence delays refunds
  // until earlier submitted uses complete; a destroyed buffer cannot be used in
  // a later valid submission. New retirements get a separate fence.
  const batch=[...s.pending];
  s.settling=Promise.resolve().then(()=>device.queue.onSubmittedWorkDone()).then(()=>{for(const record of batch)complete(record);},()=>{
   // A rejected fence provides no completion proof: keep bytes charged until
   // worker/device disposal. The runtime error path recycles the worker.
  }).finally(()=>{s.settling=null;if(s.pending.size&&batch.some(r=>r.status==='retired'))finishPending(device,s);});
 }
 Device.prototype.createBuffer=function(descriptor){
  const bytes=Number(descriptor?.size);
  if(!Number.isSafeInteger(bytes)||bytes<0)return createBuffer.call(this,descriptor);
  if(charged()+bytes>maximumBytes)throw failure(bytes);
  const buffer=createBuffer.call(this,descriptor),s=state(this),record={bytes:buffer.size,device:this,state:s,status:'live'};
  buffers.set(buffer,record);s.records.add(record);liveBytes+=record.bytes;createdBuffers++;peakBytes=Math.max(peakBytes,charged());livePeakBytes=Math.max(livePeakBytes,liveBytes);return buffer;
 };
 Buffer.prototype.destroy=function(){
  const record=buffers.get(this);const result=destroyBuffer.call(this);
  if(record?.status==='live'){record.status='pending';liveBytes-=record.bytes;pendingBytes+=record.bytes;destroyedBuffers++;record.state.pending.add(record);finishPending(record.device,record.state);}return result;
 };
 Device.prototype.destroy=function(){
  const result=destroyDevice.call(this),s=devices.get(this);
  if(s){s.dead=true;for(const record of s.records)if(record.status==='live'){record.status='pending';liveBytes-=record.bytes;pendingBytes+=record.bytes;s.pending.add(record);}finishPending(this,s);}return result;
 };
 if(createTexture)Device.prototype.createTexture=function(...args){const texture=createTexture.apply(this,args);textureAllocations++;return texture;};
 const ledger={
  setMaximumBytes(value){if(!Number.isSafeInteger(value)||value<0)throw new EngineError('MEMORY_LIMIT','Missing admitted WebGPU buffer memory bound',{details:{allocationKind:'gpu',maximumBytes:value}});lastFailure=null;maximumBytes=value;if(charged()>maximumBytes)throw failure(0);},
  failure(){return lastFailure;},
  snapshot(){return {maximumBytes:Number.isFinite(maximumBytes)?maximumBytes:null,bufferBytes:charged(),liveBufferBytes:liveBytes,pendingBufferBytes:pendingBytes,peakBufferBytes:peakBytes,peakLiveBufferBytes:livePeakBytes,createdBuffers,destroyedBuffers,textureAllocations,coverage:'GPUBuffer allocations observed through WebGPU; excludes driver-private memory and texture storage',unmeasuredTextureStorage:textureAllocations>0,driverPrivateBytes:null};},
  async settle(){for(const [device,s]of devices){finishPending(device,s);if(s.settling)await s.settling;}return this.snapshot();}
 };
 Object.defineProperty(Device.prototype,marker,{value:ledger});return ledger;
}
