import {createPagedD2prlTensor,isPagedD2prlTensor} from './paged-feature-tensor.js';
import {allocateOwnedTypedArray} from '../../src/allocation.js';
import {requireValue,checkAbort,EngineError} from '../../src/errors.js';

/** Same existing Native helpers, one complete channel at a time. Spatial
 * coordinates and every arithmetic expression stay in the original helper;
 * this facade only bounds transport and writes the complete lossless result.
 * The old implementation already calls resize/BatchNorm one channel at a time.
 */
export function createPagedFeatureMath({math,budget,tensorFactory,temporarySession,getTemporarySession,storage='temporary'}={}){
 requireValue(math?.run&&budget?.reserve,'Original feature helper and shared budget required');
 tensorFactory??=((shape,dtype)=>createPagedD2prlTensor(shape,{dtype,budget,temporarySession,getTemporarySession,storage}));
 const held=new Set(),life=new AbortController(),failures=[];let busy=false,closed=false,active,closing;
 const signalFor=signal=>AbortSignal.any([life.signal,...(signal?[signal]:[])]);
 const alive=signal=>{checkAbort(signal);checkAbort(life.signal);if(closed)throw new EngineError('DISPOSED','Paged feature helper closed');};
 const adopt=value=>{requireValue(value&&(typeof value.release==='function'||typeof value.dispose==='function'),'Owned feature transport required');held.add(value);return value;};
 async function retire(owners=[...held]){let failed=false,primary;for(const owner of owners)if(held.has(owner))try{const ack=await(typeof owner.release==='function'?owner.release():owner.dispose());if(ack===0||ack===false)throw ack;held.delete(owner);}catch(error){failures.push({message:String(error?.message??error),code:error?.code??null});if(!failed){failed=true;primary=error;}}if(failed)throw primary;}
 const note=(primary,cleanup)=>{if(primary&&typeof primary==='object'&&Object.isExtensible(primary))try{primary.details={...primary.details,pagedFeatureCleanup:cleanup};}catch{}};
 return{
  run(operation,args,{signal:external,resourceOperation}={}){
   alive(external);requireValue(!busy,'Paged feature helper busy');busy=true;const signal=signalFor(external);
   const work=(async()=>{let complete=false,failed=false,primary,output;
    try{
     await retire();alive(signal);
     requireValue(['affine','reflect','resize','magnitude','half'].includes(operation),'Original feature operation required');
     const input=args.input,shape=isPagedD2prlTensor(input)?input.shape:args.inputShape??[1,args.channels,args.height,args.width];
     requireValue(Array.isArray(shape)&&shape.length===4&&shape[0]===1&&shape.every(v=>Number.isSafeInteger(v)&&v>0),'Complete CHW feature shape required');
     const [,channels,height,width]=shape,plane=height*width;
     requireValue(height<=2404&&width<=2404&&plane*4<=64*1024**2&&(isPagedD2prlTensor(input)?input.dtype==='float32':input instanceof Float32Array&&input.length===channels*plane),'Exact bounded Float32 channel required');
     const outputShape=[...shape];if(operation==='reflect'){outputShape[2]+=2*(args.pad??7);outputShape[3]+=2*(args.pad??7);}if(operation==='resize'){outputShape[2]=args.outHeight;outputShape[3]=args.outWidth;}
     const outputPlane=outputShape[2]*outputShape[3],outputType=operation==='half'?'float16':'float32';
     output=adopt(tensorFactory(outputShape,outputType));requireValue(isPagedD2prlTensor(output),'A synchronous pre-owned paged tensor factory is required');await output.initialize({signal});alive(signal);
     const channel=async(value,c)=>isPagedD2prlTensor(value)?adopt(await value.readFlat(c*plane,plane,{signal})):{data:value.subarray(c*plane,(c+1)*plane),release(){}};
     for(let c=0;c<channels;c++){
      alive(signal);const transient=[],source=await channel(input,c);if(held.has(source))transient.push(source);
      const nativeArgs={...args,input:source.data,channels:1,height,width};delete nativeArgs.inputShape;
      if(operation==='magnitude'){
       const imag=args.imag;requireValue(isPagedD2prlTensor(imag)?imag.dtype==='float32'&&JSON.stringify(imag.shape)===JSON.stringify(shape):imag instanceof Float32Array&&imag.length===channels*plane,'Exact imaginary channel grid required');
       const other=await channel(imag,c);if(held.has(other))transient.push(other);nativeArgs.imag=other.data;
      }
      if(operation==='affine'){
       requireValue(args.params instanceof Float32Array&&args.params.length===4*channels,'Complete original BatchNorm parameters required');const params=adopt(allocateOwnedTypedArray(Float32Array,4,{budget,owner:'d2prl',label:'paged-feature-affine-parameters'}));transient.push(params);for(let k=0;k<4;k++)params.data[k]=args.params[k*channels+c];nativeArgs.params=params.data;
      }
      const result=adopt(await math.run(operation,nativeArgs,{signal,resourceOperation}));transient.push(result);alive(signal);
      requireValue(result.data instanceof (outputType==='float16'?Uint16Array:Float32Array)&&result.data.length===outputPlane,'Original helper output extent changed');await output.writeFlat(c*outputPlane,result.data,{signal});alive(signal);await retire(transient);
     }
     await output.seal({signal});alive(signal);held.delete(output);complete=true;return output;
    }catch(error){failed=true;primary=error;throw error;}finally{
     if(!complete)try{await retire();}catch(cleanup){if(!failed)throw cleanup;note(primary,cleanup);}busy=false;
    }
   })();active=work;void work.finally(()=>{if(active===work)active=null;}).catch(()=>{});return work;
  },
  snapshot(){return{busy,closed,pendingRetirements:held.size,cleanupFailures:[...failures]};},
  dispose(){if(closing)return closing;closed=true;life.abort();closing=(async()=>{await active?.catch(()=>{});await retire();})().finally(()=>{closing=null;});return closing;}
 };
}
