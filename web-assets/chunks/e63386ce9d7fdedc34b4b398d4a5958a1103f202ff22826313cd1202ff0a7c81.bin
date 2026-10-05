import {Budget} from '../../src/cache.js';
import {ResourceRecoveryController,runWithResourceRecovery} from '../../src/resource-recovery.js';
import {normalizeResourceError,isRecoverableNetworkError,requireValue} from '../../src/errors.js';
import {createParameterStore} from './parameter-store.js';
const PAGE=65536;
// This child allowance is already admitted by the parent's single lease.
// It covers one bank, the bounded hasher workspace, and a response chunk as
// large as this particular file; ORT's own copy stays inside its separate heap.
export const roleModelWorkspaceBytes=bytes=>Math.ceil(Math.max(16*1024**2,bytes)/PAGE)*PAGE+1024**2+Math.max(256*1024,bytes);
export async function loadRoleModel({modelUrl,modelBytes,modelSha256,onBacking=()=>{},onRecovery,fetchAsset}={}){
 const budget=new Budget(roleModelWorkspaceBytes(modelBytes));let sequence=0;
 const original=budget.registerBacking.bind(budget);
 budget.registerBacking=(kind,bytes,options)=>{const local=original(kind,bytes,options),id=++sequence;onBacking({id,action:'allocate',kind,bytes,label:options?.label});let alive=true;
  return Object.assign(()=>{if(!alive)return;alive=false;local();onBacking({id,action:'release',kind,bytes});},{pin:()=>local.pin(),setReclaimable:value=>local.setReclaimable(value),materialize:value=>local.materialize(value)});
 };
 const operation=(label,work)=>{
  const controller=new ResourceRecoveryController(),fail=controller.fail.bind(controller);
  // Allocation recovery belongs to the parent shared budget. Network failures
  // can retry this chunk locally without throwing away the verified prefix.
  controller.fail=(error,context)=>isRecoverableNetworkError(error)?fail(error,context):{retry:false,error:normalizeResourceError(error)};
  return runWithResourceRecovery(work,{controller,operation:label,onRecovery});
 };
 const store=createParameterStore({budget,assetBaseUrl:modelUrl,operation,...(fetchAsset?{fetchAsset}:{})});let value;
 try{value=await store.acquire({file:modelUrl,bytes:modelBytes,sha256:modelSha256,dtype:'uint8'});let live=true;
  return{get data(){requireValue(live,'Released role model');return value.data;},get byteOffset(){requireValue(live,'Released role model');return value.byteOffset;},byteLength:modelBytes,stats:store.snapshot(),release(){if(!live)return;live=false;value.release();value=null;store.dispose();}};
 }catch(error){value?.release();store.dispose();throw error;}
}
