import {byteRange,byteLength,byteView} from './memory-range.js';
import {EngineError,requireValue} from './errors.js';

export const DENSE_WRITE_BATCH_BYTES=2*1024**2;
export const denseWriteBatchBytes=pageBytes=>Math.max(DENSE_WRITE_BATCH_BYTES,2*pageBytes);
// Only the current useful command is buffered. Completed field planes remain
// single-owned. A dead kernel therefore cannot expose half a propagation step.
export class DenseWriteBatch {
 constructor(capacity=DENSE_WRITE_BATCH_BYTES){this.capacity=capacity;this.buffer=null;this.records=[];this.pages=new Map();this.used=0;}
 begin(buffer){requireValue(buffer instanceof ArrayBuffer&&buffer.byteLength===this.capacity,'Invalid dense write batch backing.');this.buffer=buffer;this.records=[];this.pages.clear();this.used=0;}
 write(store,source,offset){
  source=byteRange(source);const length=byteLength(source);
  if(this.used+length>this.capacity)throw new EngineError('MEMORY_LIMIT','Dense command write batch exceeded its bounded workspace.',{details:{requestedBytes:this.used+length,budgetBytes:this.capacity,label:'dense-write-batch',boundedCommand:true}});
  new Uint8Array(this.buffer,this.used,length).set(byteView(source));const record={store,offset,length,start:this.used};this.used+=length;this.records.push(record);
  let pages=this.pages.get(store);if(!pages)this.pages.set(store,pages=new Map());
  for(let page=Math.floor(offset/4096);page<=Math.floor((offset+length-1)/4096);page++){let entries=pages.get(page);if(!entries)pages.set(page,entries=[]);entries.push(record);}
 }
 overlay(store,target,offset){
  const pages=this.pages.get(store);if(!pages)return;
  target=byteRange(target);const length=byteLength(target),first=Math.floor(offset/4096),last=Math.floor((offset+length-1)/4096);
  let records=pages.get(first)??[];
  if(first!==last){const seen=new Set();records=[];for(let page=first;page<=last;page++)for(const record of pages.get(page)??[])if(!seen.has(record)){seen.add(record);records.push(record);}records.sort((a,b)=>a.start-b.start);}
  // Repeated writes are ordered even when a read spans several pages.
  for(const record of records){const begin=Math.max(offset,record.offset),end=Math.min(offset+length,record.offset+record.length);if(end>begin)byteView(target,begin-offset,end-begin).set(new Uint8Array(this.buffer,record.start+begin-record.offset,end-begin));}
 }
 publication(){return {buffer:this.buffer,records:this.records,bytes:this.used};}
}
export async function commitDenseWriteBatch(batch,stores){
 requireValue(batch?.buffer instanceof ArrayBuffer&&Number.isSafeInteger(batch.bytes)&&batch.bytes>=0&&batch.bytes<=batch.buffer.byteLength&&Array.isArray(batch.records),'Invalid dense command publication.');
 // Validate the complete publication before writing any part. Reapplying the
 // same writes after a storage refusal is idempotent; no successor is admitted
 // until every write succeeds.
 for(const r of batch.records)requireValue([3,4,17,18].includes(r.store)&&[r.offset,r.length,r.start].every(v=>Number.isSafeInteger(v)&&v>=0)&&r.offset+r.length<=stores[r.store].byteLength&&r.start+r.length<=batch.bytes,'Invalid dense command write range.');
 for(const r of batch.records)await stores[r.store].write(new Uint8Array(batch.buffer,r.start,r.length),r.offset);
}
