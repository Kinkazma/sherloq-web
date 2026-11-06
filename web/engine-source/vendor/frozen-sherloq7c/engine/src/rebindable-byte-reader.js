import {acknowledgeDenseRetirement} from './dense-owner-retirement.js';
import {EngineError} from './errors.js';

// Native page tables retain this small stable object, never a publication's
// SAB descriptor. Replacement is legal only behind the field input barrier.
export function createRebindableByteReader(reader,id){
 let current=reader,closing=false,detaching;
 const live=()=>{if(!current||closing)throw new EngineError('BUSY','Immutable input is suspended for migration.');return current;};
 return {
  byteLength:reader.byteLength,portableStoreId:id,
  get chunkBytes(){return current?.chunkBytes;},get storage(){return current?.storage??'temporary';},get shared(){return current?.shared??false;},get cacheStoreId(){return current?.cacheStoreId;},
  readInto(...args){return live().readInto(...args);},
  exportReadOnly(options){return live().exportReadOnly?.(options);},
  exportSharedReadOnly(){return live().exportSharedReadOnly?.();},
  pinIoWorkspace(){return live().pinIoWorkspace?.();},
  detach(){closing=true;if(detaching)return detaching;const previous=current,task=Promise.resolve().then(async()=>{await acknowledgeDenseRetirement(()=>previous?.dispose?.());if(current===previous)current=null;closing=false;});detaching=task;void task.finally(()=>{if(detaching===task)detaching=null;}).catch(()=>{});return task;},
  attach(value){if(current||detaching)throw new EngineError('BUSY','Immutable input still has a reader.');if(value.byteLength!==this.byteLength)throw new EngineError('INVALID_INPUT','Rebound input length changed.');current=value;closing=false;},
  async dispose(){await this.detach();},
 };
}
