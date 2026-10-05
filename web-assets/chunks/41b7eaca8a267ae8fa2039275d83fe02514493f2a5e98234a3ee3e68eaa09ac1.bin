import "../../runtime-context.js?v=0.14.5";
import {EngineError} from './errors.js';

// Native page tables retain this small stable object, never a publication's
// SAB descriptor. Replacement is legal only behind the field input barrier.
export function createRebindableByteReader(reader,id){
 let current=reader;
 const live=()=>{if(!current)throw new EngineError('BUSY','Immutable input is suspended for migration.');return current;};
 return {
  byteLength:reader.byteLength,portableStoreId:id,
  get chunkBytes(){return current?.chunkBytes;},get storage(){return current?.storage??'temporary';},get shared(){return current?.shared??false;},get cacheStoreId(){return current?.cacheStoreId;},
  readInto(...args){return live().readInto(...args);},
  exportReadOnly(options){return live().exportReadOnly?.(options);},
  exportSharedReadOnly(){return live().exportSharedReadOnly?.();},
  pinIoWorkspace(){return live().pinIoWorkspace?.();},
  async detach(){const previous=current;current=null;await previous?.dispose?.();},
  attach(value){if(current)throw new EngineError('BUSY','Immutable input still has a reader.');if(value.byteLength!==this.byteLength)throw new EngineError('INVALID_INPUT','Rebound input length changed.');current=value;},
  async dispose(){await this.detach();},
 };
}
