import "../../runtime-context.js?v=0.25.0";
import {EngineError,serializeEngineError} from './errors.js';

function failure(message,errors,receipt){
 return new EngineError('NEURAL_CLEANUP_FAILED',message,{cause:errors[0]?.error,details:{cleanupReceipt:receipt,cleanupErrors:errors.map(({stage,error})=>({stage,...serializeEngineError(error,'NEURAL_CLEANUP_FAILED')}))}});
}
/** GPU ownership ends only after submitted work, resource retirement and the
 * device-lost notification. The caller owns the bounded hard-stop watchdog. */
export async function disposeGpuDeviceGracefully(device,actions=[]){
 const errors=[],receipt={queueSettled:false,resourceActions:0,deviceDestroyed:false,deviceLost:false};
 const attempt=async(stage,action)=>{try{await action();return true;}catch(error){errors.push({stage,error});return false;}};
 let lost;await attempt('device-lost-observer',()=>{lost=device?.lost;if(!lost||typeof lost.then!=='function')throw new EngineError('INVALID_INPUT','A GPU device lost promise is required for cooperative disposal.');});
 receipt.queueSettled=await attempt('gpu-queue',()=>{if(typeof device?.queue?.onSubmittedWorkDone!=='function')throw new EngineError('INVALID_INPUT','The GPU queue completion API is unavailable.');return device.queue.onSubmittedWorkDone();});
 for(let i=0;i<actions.length;i++)if(await attempt('gpu-resource-'+i,actions[i]))receipt.resourceActions++;
 receipt.deviceDestroyed=await attempt('gpu-device-destroy',()=>device.destroy());
 if(lost)receipt.deviceLost=await attempt('gpu-device-lost',()=>lost);
 if(errors.length)throw failure('GPU resource cleanup did not complete successfully.',errors,receipt);return receipt;
}

/** All independent owners are attempted even if one release fails. A failure
 * produces no success acknowledgement; the pool then retains its failure and
 * performs the separately identified forced retirement. */
export async function disposeNeuralWorkerResources({reusable,session,sessionCache,gpuDevice,nativeGpu}={}){
 const receipt={schema:'sherloq.neural-worker-cleanup/1',reusableInputs:0,currentSessionReleased:false,cachedSessionsReleased:false,gpu:null,nativeGpu:null},errors=[];
 const attempt=async(stage,action)=>{try{return await action();}catch(error){errors.push({stage,error});}};
 const tensors=new Set([...(reusable?.values()??[])].map(item=>item.tensor));reusable?.clear();
 for(const tensor of tensors)await attempt('reusable-input',async()=>{await tensor?.dispose();receipt.reusableInputs++;});
 if(session)await attempt('current-session',async()=>{await session.release();receipt.currentSessionReleased=true;});
 if(sessionCache)await attempt('cached-sessions',async()=>{await sessionCache.clear();receipt.cachedSessionsReleased=true;});
 if(nativeGpu)await attempt('native-gpu',async()=>{if(typeof nativeGpu.disposeGracefully!=='function')throw new EngineError('INVALID_INPUT','Native GPU cooperative disposal is unavailable.');receipt.nativeGpu=await nativeGpu.disposeGracefully();});
 if(gpuDevice)await attempt('ort-gpu',async()=>{receipt.gpu=await disposeGpuDeviceGracefully(gpuDevice);});
 if(errors.length)throw failure('Neural worker resource cleanup did not complete successfully.',errors,receipt);return receipt;
}

/** Only the opt-in ALIKED pool: no reusable tensors or cached model sessions.
 * Keep the idle current session/device and completion flags until their ACK.
 * A refused dependency stops retirement before the next destructive action. */
export async function disposeAlikedIdleWorkerRetryable({reusable,session,sessionCache,gpuDevice,nativeGpu}={},state){
 if(!state||typeof state!=='object'||reusable?.size!==0||sessionCache?.snapshot?.().sessions!==0||nativeGpu||!gpuDevice)throw new EngineError('INVALID_INPUT','Retryable ALIKED retirement requires its uncached idle GPU owners.');
 if(state.device&&state.device!==gpuDevice)throw new EngineError('INVALID_INPUT','Retryable ALIKED device owner changed.');state.device=gpuDevice;
 const receipt=state.receipt??=( {schema:'sherloq.neural-worker-cleanup/1',reusableInputs:0,currentSessionReleased:false,cachedSessionsReleased:true,gpu:{queueSettled:false,resourceActions:0,deviceDestroyed:false,deviceLost:false},nativeGpu:null} );
 if(session&&!receipt.currentSessionReleased){await session.release();receipt.currentSessionReleased=true;}
 if(!state.lost){const lost=gpuDevice.lost;if(!lost||typeof lost.then!=='function')throw new EngineError('INVALID_INPUT','GPU device lost acknowledgement required.');state.lost=lost;}
 if(!receipt.gpu.queueSettled){if(typeof gpuDevice.queue?.onSubmittedWorkDone!=='function')throw new EngineError('INVALID_INPUT','GPU queue completion API required.');await gpuDevice.queue.onSubmittedWorkDone();receipt.gpu.queueSettled=true;}
 if(!receipt.gpu.deviceDestroyed){gpuDevice.destroy();receipt.gpu.deviceDestroyed=true;}
 if(!receipt.gpu.deviceLost){await state.lost;receipt.gpu.deviceLost=true;}
 return receipt;
}
