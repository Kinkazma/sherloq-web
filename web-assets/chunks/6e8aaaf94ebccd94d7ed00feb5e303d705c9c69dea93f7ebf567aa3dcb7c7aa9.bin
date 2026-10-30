import {createPagedD2prlTensor,isPagedD2prlTensor} from './paged-feature-tensor.js';
import {createPagedD2prlDescriptorBanks} from './descriptor-paged-banks.js';
import {requireValue,checkAbort,EngineError} from '../../src/errors.js';
/** Per-source capsule. The model adopts this synchronous actor before it may
 * create any tensor/store. Storage is borrowed from the actual source owner;
 * disposal never closes that shared source session. No numerical work here. */
export function createPagedDescriptorTransport({budget,temporarySession,getTemporarySession,storage='auto',onOwner}={}){
 requireValue(budget?.reserve&&typeof onOwner==='function'&&['memory','temporary','auto'].includes(storage),'Pre-owned Native descriptor transport and storage policy required');
 const held=new Set(),life=new AbortController();let closed=false,closing;
 const alive=()=>{checkAbort(life.signal);if(closed)throw new EngineError('DISPOSED','Descriptor source transport closed');};
 const prune=()=>{for(const value of held)if(value.snapshot().retired)held.delete(value);};
 const adopt=value=>{held.add(value);return value;};
 const options={budget,temporarySession,getTemporarySession,storage,signal:life.signal};
 const owner={
  value(value){alive();return isPagedD2prlTensor(value)?value:value.data;},
  outputFactory(shape,dtype){alive();prune();return adopt(createPagedD2prlTensor(shape,{...options,dtype,label:'native-descriptor-intermediate'}));},
  createBanks(side){alive();prune();return adopt(createPagedD2prlDescriptorBanks(side,options));},
  snapshot(){prune();return{closed,pendingOwners:held.size,storage};},
  dispose(){if(closing)return closing;closed=true;life.abort();closing=(async()=>{let failed=false,primary;for(const value of [...held])try{const ack=await value.dispose();if(ack===0||ack===false)throw ack;held.delete(value);}catch(error){if(!failed){failed=true;primary=error;}}if(failed)throw primary;})();void closing.catch(()=>{closing=null;});return closing;}
 };onOwner(owner);return owner;
}
