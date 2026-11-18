import {EngineError,requireValue,checkAbort} from './errors.js';
import {nativeGpuAsync,nativeGpuSync} from './gpu-native-boundary.js';
import {retireCompositeOwners} from './composite-owner-release.js';
import {withRetirementOwner} from './owner-retirement-error.js';

// Same transfer/gain tables and primary matrices as the libavif CPU owner.
// Packed integer inputs preserve their source depth; no browser colour
// conversion or 8-bit intermediate precedes the HDR reconstruction.
export function gainMapShader({baseDepth,gainDepth,outputDepth=8,gamutMapping=false,outputMode='encoded'}={}){
 requireValue([8,10,12,16].includes(baseDepth)&&[0,8,10,12,16].includes(gainDepth)&&[8,16].includes(outputDepth)&&['encoded','linear-float32'].includes(outputMode),'Invalid gain-map shader precision.');
 const get=(name,depth)=>depth>8?`let word=${name}[index>>1u];return (word>>((index&1u)*16u))&65535u;`:depth?`let word=${name}[index>>2u];return (word>>((index&3u)*8u))&255u;`:'return 0u;';
 return `
 @group(0) @binding(0) var<storage,read> base:array<u32>;
 @group(0) @binding(1) var<storage,read> gain:array<u32>;
 @group(0) @binding(2) var<storage,read> model:array<f32>;
 @group(0) @binding(3) var<storage,read_write> output:array<u32>;
 @group(0) @binding(4) var<uniform> shape:vec4<u32>;
 fn baseValue(index:u32)->u32{${get('base',baseDepth)}}
 fn gainValue(index:u32)->u32{${get('gain',gainDepth)}}
 fn matrix(v:vec3<f32>,offset:u32)->vec3<f32>{return vec3<f32>(
  model[offset]*v.x+model[offset+1u]*v.y+model[offset+2u]*v.z,
  model[offset+3u]*v.x+model[offset+4u]*v.y+model[offset+5u]*v.z,
  model[offset+6u]*v.x+model[offset+7u]*v.y+model[offset+8u]*v.z);}
 fn curve(offset:u32,value:f32)->f32{let x=clamp(value,0.0,1.0)*65535.0;let i=u32(x);return model[offset+i]+(model[offset+min(i+1u,65535u)]-model[offset+i])*(x-f32(i));}
 fn inv24(value:f32,at:u32)->f32{let x=clamp(value*model[at+18u]/model[at+19u],0.0,1.0);if(x<64.0/65535.0){return pow(x,1.0/2.4);}return curve(at+32u,x);}
 fn tone(v:vec3<f32>,at:u32)->vec3<f32>{
  let perceptual=vec3<f32>(inv24(v.x,at),inv24(v.y,at),inv24(v.z,at));
  let y=dot(perceptual,vec3<f32>(0.2627,0.6780,0.0593));if(!(y>0.0)){return vec3<f32>(0.0);}
  let mapped=curve(at+32u+131072u,y);let factor=mapped/(1.1*y);
  let cb=(perceptual.z-y)/1.8814*factor;let cr=(perceptual.x-y)/1.4746*factor;let yt=mapped-max(0.1*cr,0.0);
  let gamma=at+32u+65536u;return vec3<f32>(curve(gamma,yt+1.4746*cr),curve(gamma,yt-0.16455*cb-0.57135*cr),curve(gamma,yt+1.8814*cb));
 }
 fn gamutLimit(y:f32,v:f32)->f32{if(v<0.0){return y/(y-v);}if(v>1.0){return(1.0-y)/(v-y);}return 1.0;}
 fn gamut(v:vec3<f32>)->vec3<f32>{let y=clamp(dot(v,vec3<f32>(0.2126,0.7152,0.0722)),0.0,1.0);let scale=min(1.0,min(gamutLimit(y,v.x),min(gamutLimit(y,v.y),gamutLimit(y,v.z))));return vec3<f32>(y)+(v-vec3<f32>(y))*scale;}
 fn encode(v:f32)->u32{
  let x=clamp(v,0.0,1.0)*65535.0;let i=u32(x);let at=u32(model[31]);
  let value=model[at+i]+(model[at+min(i+1u,65535u)]-model[at+i])*(x-f32(i));
  return u32(clamp(floor(value*65535.0+0.5),0.0,65535.0));
 }
 @compute @workgroup_size(256) fn main(@builtin(global_invocation_id) invocation:vec3<u32>){
  let pixel=invocation.x;if(pixel>=shape.x){return;}let i=pixel*3u;
  let stride=u32(model[3]);let atBase=u32(model[29]);
  let v=vec3<f32>(model[atBase+baseValue(i)],model[atBase+stride+baseValue(i+1u)],model[atBase+2u*stride+baseValue(i+2u)]);
  let linear=matrix(v,5u);let count=u32(model[1])+1u;let at=u32(model[30]);
  let factor=vec3<f32>(model[at+gainValue(i)],model[at+count+gainValue(i+1u)],model[at+2u*count+gainValue(i+2u)]);
  let mapped=(linear+vec3<f32>(model[23],model[24],model[25]))*factor-vec3<f32>(model[26],model[27],model[28]);
  ${outputMode==='linear-float32'?'output[i]=bitcast<u32>(mapped.x);output[i+1u]=bitcast<u32>(mapped.y);output[i+2u]=bitcast<u32>(mapped.z);':`  var sdr=matrix(mapped,14u);if(model[4]>0.0){let at=u32(model[31])+65536u;sdr=matrix(tone(matrix(mapped,at),at),at+9u);}
  ${gamutMapping?'sdr=gamut(sdr);':''}
  let r=encode(sdr.x);let g=encode(sdr.y);let b=encode(sdr.z);
  ${outputDepth===16?'output[pixel*2u]=r|(g<<16u);output[pixel*2u+1u]=b;':'output[pixel]=u32(floor(f32(r)/257.0+0.5))|(u32(floor(f32(g)/257.0+0.5))<<8u)|(u32(floor(f32(b)/257.0+0.5))<<16u)|4278190080u;'}`}

 }`;
}
const align=n=>(n+3)&~3;
/** The decode-header lease funds this complete bounded GPU owner. The source
 * codec can prepare its next RGB band while a submitted band runs on GPU. */
export async function createAvifGainMapGpu({model,baseDepth,gainDepth,maximumPixels,maximumMemoryBytes,outputDepth=8,gamutMapping=false,outputMode='encoded',signal,gpu=globalThis.navigator?.gpu}={}){
 checkAbort(signal);if(!gpu)return null;
 requireValue(model instanceof Float32Array&&model.length>65536&&Number.isSafeInteger(maximumPixels)&&maximumPixels>0&&Number.isSafeInteger(maximumMemoryBytes)&&maximumMemoryBytes>0,'Admitted gain-map tables, band grid and GPU budget required.');
 const inputBytes=align(maximumPixels*3*(baseDepth>8?2:1)),gainBytes=gainDepth?align(maximumPixels*3*(gainDepth>8?2:1)):4,outputBytes=maximumPixels*(outputMode==='linear-float32'?12:outputDepth===16?8:4),requiredBytes=inputBytes+gainBytes+2*outputBytes+align(model.byteLength)+16+(outputMode==='linear-float32'?outputBytes:0);
 if(requiredBytes>maximumMemoryBytes)throw new EngineError('MEMORY_LIMIT','The gain-map GPU bands exceed their admitted workspace.');
 const adapter=await nativeGpuAsync(()=>gpu.requestAdapter({powerPreference:'high-performance'}),{signal});checkAbort(signal);if(!adapter)return null;
 if(Math.max(inputBytes,gainBytes,outputBytes,model.byteLength)>adapter.limits.maxStorageBufferBindingSize||Math.max(inputBytes,gainBytes,outputBytes)>adapter.limits.maxBufferSize)return null;
 const device=await nativeGpuAsync(()=>adapter.requestDevice(),{signal}),buffers=[],retired=new Set();let disposed=false,retiring=false,disposing,deviceRetired=false,pending=Promise.resolve(),submissions=0,kernelMs=0,mapMs=0;
 const make=(size,usage)=>{const b=nativeGpuSync(()=>device.createBuffer({size:Math.max(4,align(size)),usage}),{signal});buffers.push(b);return b;};
 const finish=options=>retireCompositeOwners([...buffers.map(b=>()=>{if(!retired.has(b)){b.destroy();retired.add(b);}}),()=>{if(!deviceRetired){device.destroy();deviceRetired=true;}}],options);
 try{
  device.pushErrorScope('validation');const module=device.createShaderModule({code:gainMapShader({baseDepth,gainDepth,outputDepth,gamutMapping,outputMode})}),pipeline=await nativeGpuAsync(()=>device.createComputePipelineAsync({layout:'auto',compute:{module,entryPoint:'main'}}),{signal});
  const invalid=await device.popErrorScope();if(invalid)throw new EngineError('GPU_FAILED',invalid.message);checkAbort(signal);
  const base=make(inputBytes,128|8),gain=make(gainBytes,128|8),tables=make(model.byteLength,128|8),output=make(outputBytes,128|4),readback=make(outputBytes,1|8),shape=make(16,64|8);
  device.pushErrorScope('validation');device.queue.writeBuffer(tables,0,model);
  // An automatic WGSL layout omits a statically unused gain binding when the
  // image has no gain map. Supplying it creates an invalid bind group without
  // throwing a JavaScript exception, then silently leaves the output empty.
  const bindings=device.createBindGroup({layout:pipeline.getBindGroupLayout(0),entries:[base,gain,tables,output,shape].map((buffer,binding)=>({binding,resource:{buffer}})).filter(entry=>gainDepth||entry.binding!==1)});
  const bindingError=await device.popErrorScope();if(bindingError)throw new EngineError('GPU_FAILED',bindingError.message);checkAbort(signal);
  return{
   requiredBytes,
   run(baseBytes,gainBytes,pixels,{signal:currentSignal=signal}={}){
    const work=async()=>{
     checkAbort(currentSignal);if(disposed||retiring)throw new EngineError('DISPOSED','Gain-map GPU owner closed.');
     requireValue(Number.isSafeInteger(pixels)&&pixels>0&&pixels<=maximumPixels&&baseBytes instanceof Uint8Array&&baseBytes.length===pixels*3*(baseDepth>8?2:1)&&(!gainDepth||gainBytes instanceof Uint8Array&&gainBytes.length===pixels*3*(gainDepth>8?2:1)),'Invalid native gain-map GPU band.');
     const padded=bytes=>{if(bytes.byteLength%4===0)return bytes;const output=new Uint8Array(align(bytes.length));output.set(bytes);return output;};
     const started=performance.now();device.pushErrorScope('validation');device.queue.writeBuffer(base,0,padded(baseBytes));if(gainDepth)device.queue.writeBuffer(gain,0,padded(gainBytes));device.queue.writeBuffer(shape,0,Uint32Array.of(pixels,0,0,0));
     const count=pixels*(outputMode==='linear-float32'?12:outputDepth===16?8:4),command=device.createCommandEncoder(),pass=command.beginComputePass();pass.setPipeline(pipeline);pass.setBindGroup(0,bindings);pass.dispatchWorkgroups(Math.ceil(pixels/256));pass.end();command.copyBufferToBuffer(output,0,readback,0,count);device.queue.submit([command.finish()]);const validation=device.popErrorScope();kernelMs+=performance.now()-started;
     const mapStarted=performance.now(),cancelMap=()=>{try{readback.unmap();}catch{}};currentSignal?.addEventListener('abort',cancelMap,{once:true});
     try{checkAbort(currentSignal);await nativeGpuAsync(()=>readback.mapAsync(1,0,count),{signal:currentSignal});mapMs+=performance.now()-mapStarted;const invalid=await validation;if(invalid)throw new EngineError('GPU_FAILED',invalid.message);checkAbort(currentSignal);if(outputMode==='linear-float32'){const result=new Float32Array(readback.getMappedRange(0,count)).slice();if(result.some(value=>!Number.isFinite(value)))throw new EngineError('COLOR_DOMAIN_UNSUPPORTED','The actual GPU HDR reconstruction is outside finite Float32.');submissions++;return result;}const packed=new Uint32Array(readback.getMappedRange(0,count)),result=outputDepth===16?new Uint16Array(pixels*3):new Uint8Array(pixels*3);
      for(let i=0,j=0;i<pixels;i++,j+=3){const word=packed[outputDepth===16?i*2:i];if(outputDepth===16){result[j]=word&65535;result[j+1]=word>>>16;result[j+2]=packed[i*2+1]&65535;}else{result[j]=word&255;result[j+1]=(word>>>8)&255;result[j+2]=(word>>>16)&255;}}submissions++;return result;
     }finally{currentSignal?.removeEventListener('abort',cancelMap);readback.unmap();}
    };
    const task=pending.then(work);pending=task.catch(()=>{});return task;
   },
   metrics(){return{backend:'webgpu',submissions,kernelSubmitMs:kernelMs,readbackMs:mapMs,workspaceBytes:requiredBytes,inputPrecision:baseDepth,outputPrecision:outputMode==='linear-float32'?32:outputDepth,outputSampleType:outputMode==='linear-float32'?'float32':'unsigned-integer'};},
   dispose(){if(disposed)return Promise.resolve();if(disposing)return disposing;retiring=true;const task=(async()=>{await pending;await finish();disposed=true;})();disposing=task;void task.finally(()=>{if(disposing===task)disposing=null;}).catch(()=>{});return task;}
  };
 }catch(error){try{await finish();}catch(cleanup){const cleanupOwner={dispose(){if(disposed)return Promise.resolve();if(disposing)return disposing;retiring=true;const task=Promise.resolve().then(()=>finish()).then(()=>{disposed=true;});disposing=task;void task.finally(()=>{if(disposing===task)disposing=null;}).catch(()=>{});return task;}};throw withRetirementOwner(error,cleanupOwner,cleanup);}throw error;}
}
