import "../../runtime-context.js?v=0.33.2";
import {requireValue} from './errors.js';

// Presentation observations only. Never feed this sample back into PCA.
export const PCA_CLOUD_MAX_POINTS=131072;
export function createPcaCloudSample(total,{maxPoints=PCA_CLOUD_MAX_POINTS,budget,inputDepth=8}={}){
 requireValue(Number.isSafeInteger(total)&&total>0&&Number.isInteger(maxPoints)&&maxPoints>0&&maxPoints<=PCA_CLOUD_MAX_POINTS,'Invalid PCA cloud population.');
 requireValue(inputDepth===8||inputDepth===16,'Invalid PCA cloud sample depth.');
 const stride=Math.max(1,Math.ceil(total/maxPoints)),count=Math.ceil(total/stride);
 let released=false,release;
 if(budget){budget.retain(count*3*(inputDepth===16?3:1));release=()=>{if(!released){released=true;budget.retained-=count*3*(inputDepth===16?3:1);}};}
 let rgb,rgb16;
 try{rgb=new Uint8Array(count*3);if(inputDepth===16)rgb16=new Uint16Array(count*3);}catch(error){release?.();throw error;}
 return {data:{rgb,count,total,stride,sampling:'original-observation-ordinal-stride',inputDomain:inputDepth===16?'working-rgb16':'sdr-rgb8',...(inputDepth===16?{rgb16,inputDepth:16,colorDomain:'canonical-sdr-rgb8'}:{})},release,
  add(bytes,offset){
   requireValue((inputDepth===16?bytes instanceof Uint16Array:bytes instanceof Uint8Array)&&bytes.length%3===0&&Number.isSafeInteger(offset)&&offset>=0&&offset+bytes.length/3<=total,'Invalid PCA cloud block.');
   for(let ordinal=Math.ceil(offset/stride)*stride;ordinal<offset+bytes.length/3;ordinal+=stride){const source=(ordinal-offset)*3,target=ordinal/stride*3;const values=inputDepth===16?rgb16:rgb;values[target]=bytes[source];values[target+1]=bytes[source+1];values[target+2]=bytes[source+2];}
  }
 };
}

// A small retained sample follows the result surface's acknowledged lifetime.
// Regional PCA transfers this owner from its packed surface to the final one.
const owners=new WeakMap();
export function attachPcaCloudOwner(surface,owner){
 if(!owner)return;
 requireValue(!owners.has(surface),'PCA cloud owner already attached.');
 owners.set(surface,owner);const dispose=surface.dispose.bind(surface);
 surface.dispose=async()=>{const ack=await dispose();requireValue(ack!==false&&ack!==0,'PCA surface retirement was not acknowledged.');const held=owners.get(surface);held?.release?.();owners.delete(surface);return ack;};
}
export function detachPcaCloudOwner(surface){const owner=owners.get(surface);owners.delete(surface);return owner;}
